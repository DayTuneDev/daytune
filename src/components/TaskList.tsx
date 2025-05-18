import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Task } from '../types/shared';

const IMPORTANCE_COLORS: { [key: number]: string } = {
  1: 'bg-gray-100',
  2: 'bg-blue-50',
  3: 'bg-green-50',
  4: 'bg-yellow-50',
  5: 'bg-red-50',
};

const IMPORTANCE_LABELS: { [key: number]: string } = {
  1: 'Minimal',
  2: 'Low',
  3: 'Medium',
  4: 'High',
  5: 'Critical',
};

// Helper to convert UTC to local time for display
const toLocalTime = (datetime: string | Date | undefined): string => {
  if (!datetime) return '';
  const date = new Date(datetime);
  return date.toLocaleString('sv', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
};

// Helper to ensure full ISO string with seconds for datetime-local input
const toFullISOString = (dt: string | null | undefined): string | undefined => {
  if (!dt) return undefined;
  // If dt is 'YYYY-MM-DDTHH:mm', add ':00' for seconds
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dt)) {
    dt = dt + ':00';
  }
  // Always treat as local time, then convert to UTC
  const local = new Date(dt);
  return local.toISOString();
};

// Helper to get date part from datetime string
const getDatePart = (datetime: string | undefined): string => {
  if (!datetime) return '';
  return datetime.split('T')[0];
};

// Helper to get time part from datetime string
const getTimePart = (datetime: string | undefined): string => {
  if (!datetime) return '';
  const parts = datetime.split('T');
  if (parts.length < 2) return '';
  return parts[1].slice(0, 5);
};

interface TaskListProps {
  tasks: Task[];
  onTaskUpdated: () => void;
  onTaskDeleted: () => void;
  userId: string;
}

// Define a type for the editing state that matches Task but makes all fields optional except id
type SchedulingType = 'fixed' | 'flexible' | 'preferred';
type TaskStatus = 'scheduled' | 'not_able_to_schedule' | 'set_aside';

type EditingTask = {
  id: string;
  title?: string;
  start_datetime?: string;
  earliest_start_datetime?: string;
  due_datetime?: string;
  scheduling_type?: SchedulingType;
  category?: string;
  duration_minutes?: string | number;
  importance?: string | number;
  difficulty?: string | number;
  tag?: string;
  status?: TaskStatus;
};

const TaskList: React.FC<TaskListProps> = ({ tasks, onTaskUpdated, onTaskDeleted, userId }) => {
  const [editingTask, setEditingTask] = useState<EditingTask | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Collapsible state for each section
  const [openScheduled, setOpenScheduled] = useState(true);
  const [openNotScheduled, setOpenNotScheduled] = useState(true);
  const [openSetAside, setOpenSetAside] = useState(true);

  const handleEdit = (task: Task) => {
    // Convert UTC to local time for editing
    const toInputFormat = (dt: string | undefined): string => {
      if (!dt) return '';
      const local = toLocalTime(dt);
      const [date, time] = local.split(' ');
      return date && time ? `${date}T${time.slice(0, 5)}` : '';
    };
    
    // Cast the task to EditingTask type, ensuring status and scheduling_type are properly typed
    const editingTask: EditingTask = {
      id: task.id,
      title: task.title,
      start_datetime: toInputFormat(task.start_datetime ?? undefined),
      due_datetime: toInputFormat(task.due_datetime ?? undefined),
      earliest_start_datetime: toInputFormat(task.earliest_start_datetime ?? undefined),
      scheduling_type: task.scheduling_type as SchedulingType,
      category: task.category,
      duration_minutes: task.duration_minutes,
      importance: task.importance,
      difficulty: task.difficulty,
      tag: task.tag,
      status: task.status as TaskStatus,
    };
    
    setEditingTask(editingTask);
  };

  const handleSave = async (taskId: string) => {
    if (!editingTask) return;
    
    setLoading(true);
    setError('');

    // Validation
    if (
      !editingTask.title ||
      !editingTask.start_datetime ||
      !editingTask.duration_minutes ||
      editingTask.importance === undefined ||
      editingTask.difficulty === undefined
    ) {
      setError(
        'Please fill out all required fields: Title, Start Date, Start Time, Duration, Importance, and Difficulty.'
      );
      setLoading(false);
      return;
    }

    // Convert string values to numbers for validation
    const duration = Number(editingTask.duration_minutes);
    const importance = Number(editingTask.importance);
    const difficulty = Number(editingTask.difficulty);

    if (isNaN(duration) || isNaN(importance) || isNaN(difficulty)) {
      setError('Duration, Importance, and Difficulty must be numbers.');
      setLoading(false);
      return;
    }

    // Convert local date/time strings to UTC for DB
    const startIso = toFullISOString(editingTask.start_datetime === null ? undefined : editingTask.start_datetime);
    const dueIso = toFullISOString(editingTask.due_datetime === null ? undefined : editingTask.due_datetime);
    const earliestIso = toFullISOString(editingTask.earliest_start_datetime === null ? undefined : editingTask.earliest_start_datetime);

    // Prepare payload with proper types
    const payload: Partial<Task> = {
      title: editingTask.title,
      start_datetime: startIso,
      due_datetime: dueIso,
      earliest_start_datetime: earliestIso,
      scheduling_type: editingTask.scheduling_type,
      category: editingTask.category,
      duration_minutes: duration,
      importance: importance,
      difficulty: difficulty,
      tag: editingTask.tag,
    };

    if (editingTask.status) {
      payload.status = editingTask.status;
    }

    // Remove undefined values
    Object.keys(payload).forEach(key => {
      if (payload[key as keyof typeof payload] === undefined) {
        delete payload[key as keyof typeof payload];
      }
    });

    console.log('Updating task with payload:', payload);

    try {
      const { data, error: updateError } = await supabase
        .from('tasks')
        .update(payload)
        .eq('id', taskId)
        .select();

      if (updateError) {
        setError('Supabase error: ' + updateError.message);
        setLoading(false);
        return;
      }
      if (!data || data.length === 0) {
        setError('No data returned from update.');
        setLoading(false);
        return;
      }
      setEditingTask(null);
      if (onTaskUpdated) onTaskUpdated();
    } catch (err) {
      setError('Could not update the task. Error: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (taskId: string) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;

    setLoading(true);
    setError('');

    try {
      const { error: deleteError } = await supabase.from('tasks').delete().eq('id', taskId);

      if (deleteError) throw deleteError;

      if (onTaskDeleted) onTaskDeleted();
    } catch (err) {
      setError('Could not delete the task. Please try again, or refresh the page.');
    } finally {
      setLoading(false);
    }
  };

  // Update all the onChange handlers to properly handle the EditingTask type
  const updateEditingTask = (updates: Partial<EditingTask>) => {
    setEditingTask(prev => {
      if (!prev) return null;
      return { ...prev, ...updates };
    });
  };

  // Update the date/time field handlers to use updateEditingTask correctly
  const handleDateChange = (field: keyof EditingTask, newDate: string, currentTime: string) => {
    updateEditingTask({ [field]: `${newDate}T${currentTime}` });
  };

  const handleTimeChange = (field: keyof EditingTask, currentDate: string, newTime: string) => {
    updateEditingTask({ [field]: `${currentDate}T${newTime}` });
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-yellow-700 bg-yellow-50 border-l-4 border-yellow-300 p-2 rounded">
          {error || 'Something went sideways. Want to try again?'}
        </div>
      )}

      <div className="grid gap-6">
        {tasks.length === 0 && (
          <div className="text-[var(--accent)] text-center py-4">
            No tasks yet. Ready when you are! 🌱
          </div>
        )}
        
        {/* Scheduled Tasks */}
        {tasks.filter(t => t.status === 'scheduled').length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center mb-1">
              <button
                className="mr-2 text-2xl focus:outline-none"
                aria-label={openScheduled ? 'Collapse Scheduled Tasks' : 'Expand Scheduled Tasks'}
                onClick={() => setOpenScheduled(v => !v)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#2c7d50', transition: 'color 0.2s' }}
                onMouseOver={e => (e.currentTarget.style.color = '#20613c')}
                onMouseOut={e => (e.currentTarget.style.color = '#2c7d50')}
                onFocus={e => (e.currentTarget.style.color = '#20613c')}
                onBlur={e => (e.currentTarget.style.color = '#2c7d50')}
              >
                {openScheduled ? '▼' : '▶'}
              </button>
              <h3 className="text-lg font-semibold text-green-700">Scheduled Tasks</h3>
            </div>
            {openScheduled && tasks.filter(t => t.status === 'scheduled').map((task) => (
          <div
            key={task.id}
            className={`p-4 rounded-lg shadow ${IMPORTANCE_COLORS[task.importance]}`}
          >
            {editingTask?.id === task.id ? (
              <div className="space-y-4">
                <input
                  id={`edit-title-${editingTask.id}`}
                  type="text"
                  value={editingTask.title}
                  onChange={(e) => updateEditingTask({ title: e.target.value })}
                  className="w-full p-2 border rounded"
                  title="Task Title"
                  placeholder="Enter task title"
                  aria-label="Task Title"
                />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor={`edit-start-date-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                      Start Date
                    </label>
                    <input
                      id={`edit-start-date-${editingTask.id}`}
                      type="date"
                      value={getDatePart(editingTask.start_datetime)}
                      onChange={(e) => {
                        const newDate = e.target.value;
                        const currentTime = getTimePart(editingTask.start_datetime);
                        handleDateChange('start_datetime', newDate, currentTime);
                      }}
                      className="p-2 border rounded"
                      title="Start Date"
                      aria-label="Start Date"
                      placeholder="YYYY-MM-DD"
                    />
                  </div>
                  <div>
                    <label htmlFor={`edit-start-time-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                      Start Time
                    </label>
                    <input
                      id={`edit-start-time-${editingTask.id}`}
                      type="time"
                      value={getTimePart(editingTask.start_datetime)}
                      onChange={(e) => {
                        const newTime = e.target.value;
                        const currentDate = getDatePart(editingTask.start_datetime);
                        handleTimeChange('start_datetime', currentDate, newTime);
                      }}
                      className="p-2 border rounded"
                      title="Start Time"
                      aria-label="Start Time"
                      placeholder="HH:mm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor={`edit-earliest-date-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                      Earliest Start Date (optional)
                    </label>
                    <input
                      id={`edit-earliest-date-${editingTask.id}`}
                      type="date"
                      value={getDatePart(editingTask.earliest_start_datetime)}
                      onChange={(e) => handleDateChange(
                        'earliest_start_datetime',
                        e.target.value,
                        getTimePart(editingTask.earliest_start_datetime)
                      )}
                      className="p-2 border rounded"
                      title="Earliest Start Date"
                      aria-label="Earliest Start Date"
                      placeholder="YYYY-MM-DD"
                    />
                  </div>
                  <div>
                    <label htmlFor={`edit-earliest-time-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                      Earliest Start Time (optional)
                    </label>
                    <input
                      id={`edit-earliest-time-${editingTask.id}`}
                      type="time"
                      value={getTimePart(editingTask.earliest_start_datetime)}
                      onChange={(e) => handleTimeChange(
                        'earliest_start_datetime',
                        getDatePart(editingTask.earliest_start_datetime),
                        e.target.value
                      )}
                      className="p-2 border rounded"
                      title="Earliest Start Time"
                      aria-label="Earliest Start Time"
                      placeholder="HH:mm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor={`edit-due-date-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                    <input
                      id={`edit-due-date-${editingTask.id}`}
                      type="date"
                      value={getDatePart(editingTask.due_datetime)}
                      onChange={(e) => handleDateChange(
                        'due_datetime',
                        e.target.value,
                        getTimePart(editingTask.due_datetime)
                      )}
                      className="p-2 border rounded"
                      title="Due Date"
                      aria-label="Due Date"
                      placeholder="YYYY-MM-DD"
                    />
                  </div>
                  <div>
                    <label htmlFor={`edit-due-time-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">Due Time</label>
                    <input
                      id={`edit-due-time-${editingTask.id}`}
                      type="time"
                      value={getTimePart(editingTask.due_datetime)}
                      onChange={(e) => handleTimeChange(
                        'due_datetime',
                        getDatePart(editingTask.due_datetime),
                        e.target.value
                      )}
                      className="p-2 border rounded"
                      title="Due Time"
                      aria-label="Due Time"
                      placeholder="HH:mm"
                    />
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <label htmlFor={`edit-scheduling-type-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">Task Type</label>
                  <select
                    id={`edit-scheduling-type-${editingTask.id}`}
                    value={editingTask.scheduling_type}
                    onChange={(e) => {
                      const value = e.target.value as SchedulingType;
                      updateEditingTask({ scheduling_type: value });
                    }}
                    className="rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-200 transition-colors"
                    title="Task Type"
                    aria-label="Task Type"
                  >
                    <option value="fixed">Fixed</option>
                    <option value="flexible">Flexible</option>
                    <option value="preferred">Preferred (Movable)</option>
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label htmlFor={`edit-duration-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                      Duration (minutes)
                    </label>
                    <input
                      id={`edit-duration-${editingTask.id}`}
                      type="number"
                      value={editingTask.duration_minutes}
                      onChange={(e) => updateEditingTask({ duration_minutes: e.target.value })}
                      placeholder="Duration (minutes)"
                      className="p-2 border rounded"
                      title="Duration"
                      aria-label="Duration in minutes"
                    />
                  </div>
                  <div>
                    <label htmlFor={`edit-importance-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                      Importance (1-5)
                    </label>
                    <input
                      id={`edit-importance-${editingTask.id}`}
                      type="number"
                      value={editingTask.importance}
                      onChange={(e) => updateEditingTask({ importance: e.target.value })}
                      min="1"
                      max="5"
                      placeholder="Importance (1-5)"
                      className="p-2 border rounded"
                      title="Importance"
                      aria-label="Task importance level from 1 to 5"
                    />
                  </div>
                  <div>
                    <label htmlFor={`edit-difficulty-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                      Difficulty (1-5)
                    </label>
                    <input
                      id={`edit-difficulty-${editingTask.id}`}
                      type="number"
                      value={editingTask.difficulty}
                      onChange={(e) => updateEditingTask({ difficulty: e.target.value })}
                      min="1"
                      max="5"
                      placeholder="Difficulty (1-5)"
                      className="p-2 border rounded"
                      title="Difficulty"
                      aria-label="Task difficulty level from 1 to 5"
                    />
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <label htmlFor={`edit-status-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    id={`edit-status-${editingTask.id}`}
                    value={editingTask.status}
                    onChange={(e) => {
                      const value = e.target.value as TaskStatus;
                      updateEditingTask({ status: value });
                    }}
                    className="rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-200 transition-colors"
                    title="Task Status"
                    aria-label="Task Status"
                  >
                    <option value="scheduled">Scheduled</option>
                    <option value="not_able_to_schedule">Not Able to Schedule</option>
                    <option value="set_aside">Set Aside</option>
                  </select>
                </div>
                <div className="flex justify-end space-x-2">
                  <button
                    onClick={() => handleSave(task.id)}
                    disabled={loading}
                    className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingTask(null)}
                    className="px-4 py-2 bg-gray-500 text-white rounded"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-between items-start">
                  <h3 className="text-lg font-semibold">{task.title}</h3>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEdit(task)}
                      className="text-blue-500 hover:text-blue-700"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(task.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="text-sm text-gray-600">
                  <p>
                        <strong>Start Time:</strong>{' '}
                    {task.start_datetime
                          ? new Date(task.start_datetime).toLocaleString(undefined, {
                          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                        })
                      : 'N/A'}
                  </p>
                  <p>
                        <strong>End Time:</strong>{' '}
                        {task.start_datetime && task.duration_minutes
                          ? (() => {
                              const start = new Date(task.start_datetime);
                              const end = new Date(start.getTime() + Number(task.duration_minutes) * 60000);
                              return end.toLocaleString(undefined, {
                                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                              });
                            })()
                          : 'N/A'}
                      </p>
                      <p>Duration: {task.duration_minutes} minutes</p>
                      <p>
                        Importance: {IMPORTANCE_LABELS[task.importance]} ({task.importance}/5)
                      </p>
                      <p>Difficulty: {task.difficulty}/5</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Tasks That Could Not Be Scheduled */}
        {tasks.filter(t => t.status === 'not_able_to_schedule').length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center mb-1">
              <button
                className="mr-2 text-2xl focus:outline-none"
                aria-label={openNotScheduled ? 'Collapse Could Not Be Scheduled' : 'Expand Could Not Be Scheduled'}
                onClick={() => setOpenNotScheduled(v => !v)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#2c7d50', transition: 'color 0.2s' }}
                onMouseOver={e => (e.currentTarget.style.color = '#20613c')}
                onMouseOut={e => (e.currentTarget.style.color = '#2c7d50')}
                onFocus={e => (e.currentTarget.style.color = '#20613c')}
                onBlur={e => (e.currentTarget.style.color = '#2c7d50')}
              >
                {openNotScheduled ? '▼' : '▶'}
              </button>
              <h3 className="text-lg font-semibold text-red-700">Could Not Be Scheduled</h3>
            </div>
            {openNotScheduled && tasks.filter(t => t.status === 'not_able_to_schedule').map((task) => (
              <div
                key={task.id}
                className={`p-4 rounded-lg shadow ${IMPORTANCE_COLORS[task.importance]}`}
              >
                {editingTask?.id === task.id ? (
                  <div className="space-y-4">
                    <input
                      id={`edit-title-${editingTask.id}`}
                      type="text"
                      value={editingTask.title}
                      onChange={(e) => updateEditingTask({ title: e.target.value })}
                      className="w-full p-2 border rounded"
                      title="Task Title"
                      placeholder="Enter task title"
                      aria-label="Task Title"
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor={`edit-start-date-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                          Start Date
                        </label>
                        <input
                          id={`edit-start-date-${editingTask.id}`}
                          type="date"
                          value={getDatePart(editingTask.start_datetime)}
                          onChange={(e) => {
                            const newDate = e.target.value;
                            const currentTime = getTimePart(editingTask.start_datetime);
                            handleDateChange('start_datetime', newDate, currentTime);
                          }}
                          className="p-2 border rounded"
                          title="Start Date"
                          aria-label="Start Date"
                          placeholder="YYYY-MM-DD"
                        />
                      </div>
                      <div>
                        <label htmlFor={`edit-start-time-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                          Start Time
                        </label>
                        <input
                          id={`edit-start-time-${editingTask.id}`}
                          type="time"
                          value={getTimePart(editingTask.start_datetime)}
                          onChange={(e) => {
                            const newTime = e.target.value;
                            const currentDate = getDatePart(editingTask.start_datetime);
                            handleTimeChange('start_datetime', currentDate, newTime);
                          }}
                          className="p-2 border rounded"
                          title="Start Time"
                          aria-label="Start Time"
                          placeholder="HH:mm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor={`edit-earliest-date-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                          Earliest Start Date (optional)
                        </label>
                        <input
                          id={`edit-earliest-date-${editingTask.id}`}
                          type="date"
                          value={getDatePart(editingTask.earliest_start_datetime)}
                          onChange={(e) => handleDateChange(
                            'earliest_start_datetime',
                            e.target.value,
                            getTimePart(editingTask.earliest_start_datetime)
                          )}
                          className="p-2 border rounded"
                          title="Earliest Start Date"
                          aria-label="Earliest Start Date"
                          placeholder="YYYY-MM-DD"
                        />
                      </div>
                      <div>
                        <label htmlFor={`edit-earliest-time-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                          Earliest Start Time (optional)
                        </label>
                        <input
                          id={`edit-earliest-time-${editingTask.id}`}
                          type="time"
                          value={getTimePart(editingTask.earliest_start_datetime)}
                          onChange={(e) => handleTimeChange(
                            'earliest_start_datetime',
                            getDatePart(editingTask.earliest_start_datetime),
                            e.target.value
                          )}
                          className="p-2 border rounded"
                          title="Earliest Start Time"
                          aria-label="Earliest Start Time"
                          placeholder="HH:mm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor={`edit-due-date-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                        <input
                          id={`edit-due-date-${editingTask.id}`}
                          type="date"
                          value={getDatePart(editingTask.due_datetime)}
                          onChange={(e) => handleDateChange(
                            'due_datetime',
                            e.target.value,
                            getTimePart(editingTask.due_datetime)
                          )}
                          className="p-2 border rounded"
                          title="Due Date"
                          aria-label="Due Date"
                          placeholder="YYYY-MM-DD"
                        />
                      </div>
                      <div>
                        <label htmlFor={`edit-due-time-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">Due Time</label>
                        <input
                          id={`edit-due-time-${editingTask.id}`}
                          type="time"
                          value={getTimePart(editingTask.due_datetime)}
                          onChange={(e) => handleTimeChange(
                            'due_datetime',
                            getDatePart(editingTask.due_datetime),
                            e.target.value
                          )}
                          className="p-2 border rounded"
                          title="Due Time"
                          aria-label="Due Time"
                          placeholder="HH:mm"
                        />
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <label htmlFor={`edit-scheduling-type-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">Task Type</label>
                      <select
                        id={`edit-scheduling-type-${editingTask.id}`}
                        value={editingTask.scheduling_type}
                        onChange={(e) => {
                          const value = e.target.value as SchedulingType;
                          updateEditingTask({ scheduling_type: value });
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-200 transition-colors"
                        title="Task Type"
                        aria-label="Task Type"
                      >
                        <option value="fixed">Fixed</option>
                        <option value="flexible">Flexible</option>
                        <option value="preferred">Preferred (Movable)</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label htmlFor={`edit-duration-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                          Duration (minutes)
                        </label>
                        <input
                          id={`edit-duration-${editingTask.id}`}
                          type="number"
                          value={editingTask.duration_minutes}
                          onChange={(e) => updateEditingTask({ duration_minutes: e.target.value })}
                          placeholder="Duration (minutes)"
                          className="p-2 border rounded"
                          title="Duration"
                          aria-label="Duration in minutes"
                        />
                      </div>
                      <div>
                        <label htmlFor={`edit-importance-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                          Importance (1-5)
                        </label>
                        <input
                          id={`edit-importance-${editingTask.id}`}
                          type="number"
                          value={editingTask.importance}
                          onChange={(e) => updateEditingTask({ importance: e.target.value })}
                          min="1"
                          max="5"
                          placeholder="Importance (1-5)"
                          className="p-2 border rounded"
                          title="Importance"
                          aria-label="Task importance level from 1 to 5"
                        />
                      </div>
                      <div>
                        <label htmlFor={`edit-difficulty-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                          Difficulty (1-5)
                        </label>
                        <input
                          id={`edit-difficulty-${editingTask.id}`}
                          type="number"
                          value={editingTask.difficulty}
                          onChange={(e) => updateEditingTask({ difficulty: e.target.value })}
                          min="1"
                          max="5"
                          placeholder="Difficulty (1-5)"
                          className="p-2 border rounded"
                          title="Difficulty"
                          aria-label="Task difficulty level from 1 to 5"
                        />
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <label htmlFor={`edit-status-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                      <select
                        id={`edit-status-${editingTask.id}`}
                        value={editingTask.status}
                        onChange={(e) => {
                          const value = e.target.value as TaskStatus;
                          updateEditingTask({ status: value });
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-200 transition-colors"
                        title="Task Status"
                        aria-label="Task Status"
                      >
                        <option value="scheduled">Scheduled</option>
                        <option value="not_able_to_schedule">Not Able to Schedule</option>
                        <option value="set_aside">Set Aside</option>
                      </select>
                    </div>
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={() => handleSave(task.id)}
                        disabled={loading}
                        className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
                      >
                        {loading ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditingTask(null)}
                        className="px-4 py-2 bg-gray-500 text-white rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <h3 className="text-lg font-semibold">{task.title}</h3>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(task)}
                          className="text-blue-500 hover:text-blue-700"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(task.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className="text-sm text-gray-600">
                      <p>
                        <strong>Start Time:</strong>{' '}
                    {task.start_datetime
                          ? new Date(task.start_datetime).toLocaleString(undefined, {
                          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                        })
                      : 'N/A'}
                  </p>
                  <p>
                        <strong>End Time:</strong>{' '}
                        {task.start_datetime && task.duration_minutes
                          ? (() => {
                              const start = new Date(task.start_datetime);
                              const end = new Date(start.getTime() + Number(task.duration_minutes) * 60000);
                              return end.toLocaleString(undefined, {
                          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                              });
                            })()
                      : 'N/A'}
                  </p>
                      <p>Duration: {task.duration_minutes} minutes</p>
                      <p>
                        Importance: {IMPORTANCE_LABELS[task.importance]} ({task.importance}/5)
                      </p>
                      <p>Difficulty: {task.difficulty}/5</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Set Aside Tasks */}
        {tasks.filter(t => t.status === 'set_aside').length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center mb-1">
              <button
                className="mr-2 text-2xl focus:outline-none"
                aria-label={openSetAside ? 'Collapse Set Aside' : 'Expand Set Aside'}
                onClick={() => setOpenSetAside(v => !v)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#2c7d50', transition: 'color 0.2s' }}
                onMouseOver={e => (e.currentTarget.style.color = '#20613c')}
                onMouseOut={e => (e.currentTarget.style.color = '#2c7d50')}
                onFocus={e => (e.currentTarget.style.color = '#20613c')}
                onBlur={e => (e.currentTarget.style.color = '#2c7d50')}
              >
                {openSetAside ? '▼' : '▶'}
              </button>
              <h3 className="text-lg font-semibold text-yellow-700">Set Aside</h3>
            </div>
            {openSetAside && tasks.filter(t => t.status === 'set_aside').map((task) => (
              <div
                key={task.id}
                className={`p-4 rounded-lg shadow ${IMPORTANCE_COLORS[task.importance]}`}
              >
                {editingTask?.id === task.id ? (
                  <div className="space-y-4">
                    <input
                      id={`edit-title-${editingTask.id}`}
                      type="text"
                      value={editingTask.title}
                      onChange={(e) => updateEditingTask({ title: e.target.value })}
                      className="w-full p-2 border rounded"
                      title="Task Title"
                      placeholder="Enter task title"
                      aria-label="Task Title"
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor={`edit-start-date-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                          Start Date
                        </label>
                        <input
                          id={`edit-start-date-${editingTask.id}`}
                          type="date"
                          value={getDatePart(editingTask.start_datetime)}
                          onChange={(e) => {
                            const newDate = e.target.value;
                            const currentTime = getTimePart(editingTask.start_datetime);
                            handleDateChange('start_datetime', newDate, currentTime);
                          }}
                          className="p-2 border rounded"
                          title="Start Date"
                          aria-label="Start Date"
                          placeholder="YYYY-MM-DD"
                        />
                      </div>
                      <div>
                        <label htmlFor={`edit-start-time-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                          Start Time
                        </label>
                        <input
                          id={`edit-start-time-${editingTask.id}`}
                          type="time"
                          value={getTimePart(editingTask.start_datetime)}
                          onChange={(e) => {
                            const newTime = e.target.value;
                            const currentDate = getDatePart(editingTask.start_datetime);
                            handleTimeChange('start_datetime', currentDate, newTime);
                          }}
                          className="p-2 border rounded"
                          title="Start Time"
                          aria-label="Start Time"
                          placeholder="HH:mm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor={`edit-earliest-date-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                          Earliest Start Date (optional)
                        </label>
                        <input
                          id={`edit-earliest-date-${editingTask.id}`}
                          type="date"
                          value={getDatePart(editingTask.earliest_start_datetime)}
                          onChange={(e) => handleDateChange(
                            'earliest_start_datetime',
                            e.target.value,
                            getTimePart(editingTask.earliest_start_datetime)
                          )}
                          className="p-2 border rounded"
                          title="Earliest Start Date"
                          aria-label="Earliest Start Date"
                          placeholder="YYYY-MM-DD"
                        />
                      </div>
                      <div>
                        <label htmlFor={`edit-earliest-time-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                          Earliest Start Time (optional)
                        </label>
                        <input
                          id={`edit-earliest-time-${editingTask.id}`}
                          type="time"
                          value={getTimePart(editingTask.earliest_start_datetime)}
                          onChange={(e) => handleTimeChange(
                            'earliest_start_datetime',
                            getDatePart(editingTask.earliest_start_datetime),
                            e.target.value
                          )}
                          className="p-2 border rounded"
                          title="Earliest Start Time"
                          aria-label="Earliest Start Time"
                          placeholder="HH:mm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor={`edit-due-date-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                        <input
                          id={`edit-due-date-${editingTask.id}`}
                          type="date"
                          value={getDatePart(editingTask.due_datetime)}
                          onChange={(e) => handleDateChange(
                            'due_datetime',
                            e.target.value,
                            getTimePart(editingTask.due_datetime)
                          )}
                          className="p-2 border rounded"
                          title="Due Date"
                          aria-label="Due Date"
                          placeholder="YYYY-MM-DD"
                        />
                      </div>
                      <div>
                        <label htmlFor={`edit-due-time-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">Due Time</label>
                        <input
                          id={`edit-due-time-${editingTask.id}`}
                          type="time"
                          value={getTimePart(editingTask.due_datetime)}
                          onChange={(e) => handleTimeChange(
                            'due_datetime',
                            getDatePart(editingTask.due_datetime),
                            e.target.value
                          )}
                          className="p-2 border rounded"
                          title="Due Time"
                          aria-label="Due Time"
                          placeholder="HH:mm"
                        />
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <label htmlFor={`edit-scheduling-type-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">Task Type</label>
                      <select
                        id={`edit-scheduling-type-${editingTask.id}`}
                        value={editingTask.scheduling_type}
                        onChange={(e) => {
                          const value = e.target.value as SchedulingType;
                          updateEditingTask({ scheduling_type: value });
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-200 transition-colors"
                        title="Task Type"
                        aria-label="Task Type"
                      >
                        <option value="fixed">Fixed</option>
                        <option value="flexible">Flexible</option>
                        <option value="preferred">Preferred (Movable)</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label htmlFor={`edit-duration-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                          Duration (minutes)
                        </label>
                        <input
                          id={`edit-duration-${editingTask.id}`}
                          type="number"
                          value={editingTask.duration_minutes}
                          onChange={(e) => updateEditingTask({ duration_minutes: e.target.value })}
                          placeholder="Duration (minutes)"
                          className="p-2 border rounded"
                          title="Duration"
                          aria-label="Duration in minutes"
                        />
                      </div>
                      <div>
                        <label htmlFor={`edit-importance-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                          Importance (1-5)
                        </label>
                        <input
                          id={`edit-importance-${editingTask.id}`}
                          type="number"
                          value={editingTask.importance}
                          onChange={(e) => updateEditingTask({ importance: e.target.value })}
                          min="1"
                          max="5"
                          placeholder="Importance (1-5)"
                          className="p-2 border rounded"
                          title="Importance"
                          aria-label="Task importance level from 1 to 5"
                        />
                      </div>
                      <div>
                        <label htmlFor={`edit-difficulty-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                          Difficulty (1-5)
                        </label>
                        <input
                          id={`edit-difficulty-${editingTask.id}`}
                          type="number"
                          value={editingTask.difficulty}
                          onChange={(e) => updateEditingTask({ difficulty: e.target.value })}
                          min="1"
                          max="5"
                          placeholder="Difficulty (1-5)"
                          className="p-2 border rounded"
                          title="Difficulty"
                          aria-label="Task difficulty level from 1 to 5"
                        />
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <label htmlFor={`edit-status-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                      <select
                        id={`edit-status-${editingTask.id}`}
                        value={editingTask.status}
                        onChange={(e) => {
                          const value = e.target.value as TaskStatus;
                          updateEditingTask({ status: value });
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-200 transition-colors"
                        title="Task Status"
                        aria-label="Task Status"
                      >
                        <option value="scheduled">Scheduled</option>
                        <option value="not_able_to_schedule">Not Able to Schedule</option>
                        <option value="set_aside">Set Aside</option>
                      </select>
                    </div>
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={() => handleSave(task.id)}
                        disabled={loading}
                        className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
                      >
                        {loading ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditingTask(null)}
                        className="px-4 py-2 bg-gray-500 text-white rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <h3 className="text-lg font-semibold">{task.title}</h3>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(task)}
                          className="text-blue-500 hover:text-blue-700"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(task.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className="text-sm text-gray-600">
                      <p>
                        <strong>Start Time:</strong>{' '}
                        {task.start_datetime
                          ? new Date(task.start_datetime).toLocaleString(undefined, {
                          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                        })
                      : 'N/A'}
                  </p>
                  <p>
                        <strong>End Time:</strong>{' '}
                        {task.start_datetime && task.duration_minutes
                          ? (() => {
                              const start = new Date(task.start_datetime);
                              const end = new Date(start.getTime() + Number(task.duration_minutes) * 60000);
                              return end.toLocaleString(undefined, {
                          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                              });
                            })()
                      : 'N/A'}
                  </p>
                      <p>Duration: {task.duration_minutes} minutes</p>
                      <p>
                        Importance: {IMPORTANCE_LABELS[task.importance]} ({task.importance}/5)
                      </p>
                      <p>Difficulty: {task.difficulty}/5</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Tasks with no status */}
        {tasks.filter(t => !t.status).length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-700">Other Tasks</h3>
            {tasks.filter(t => !t.status).map((task) => (
              <div
                key={task.id}
                className={`p-4 rounded-lg shadow ${IMPORTANCE_COLORS[task.importance]}`}
              >
                {editingTask?.id === task.id ? (
                  <div className="space-y-4">
                    <input
                      id={`edit-title-${editingTask.id}`}
                      type="text"
                      value={editingTask.title}
                      onChange={(e) => updateEditingTask({ title: e.target.value })}
                      className="w-full p-2 border rounded"
                      title="Task Title"
                      placeholder="Enter task title"
                      aria-label="Task Title"
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor={`edit-start-date-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                          Start Date
                        </label>
                        <input
                          id={`edit-start-date-${editingTask.id}`}
                          type="date"
                          value={getDatePart(editingTask.start_datetime)}
                          onChange={(e) => {
                            const newDate = e.target.value;
                            const currentTime = getTimePart(editingTask.start_datetime);
                            handleDateChange('start_datetime', newDate, currentTime);
                          }}
                          className="p-2 border rounded"
                          title="Start Date"
                          aria-label="Start Date"
                          placeholder="YYYY-MM-DD"
                        />
                      </div>
                      <div>
                        <label htmlFor={`edit-start-time-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                          Start Time
                        </label>
                        <input
                          id={`edit-start-time-${editingTask.id}`}
                          type="time"
                          value={getTimePart(editingTask.start_datetime)}
                          onChange={(e) => {
                            const newTime = e.target.value;
                            const currentDate = getDatePart(editingTask.start_datetime);
                            handleTimeChange('start_datetime', currentDate, newTime);
                          }}
                          className="p-2 border rounded"
                          title="Start Time"
                          aria-label="Start Time"
                          placeholder="HH:mm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor={`edit-earliest-date-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                          Earliest Start Date (optional)
                        </label>
                        <input
                          id={`edit-earliest-date-${editingTask.id}`}
                          type="date"
                          value={getDatePart(editingTask.earliest_start_datetime)}
                          onChange={(e) => handleDateChange(
                            'earliest_start_datetime',
                            e.target.value,
                            getTimePart(editingTask.earliest_start_datetime)
                          )}
                          className="p-2 border rounded"
                          title="Earliest Start Date"
                          aria-label="Earliest Start Date"
                          placeholder="YYYY-MM-DD"
                        />
                      </div>
                      <div>
                        <label htmlFor={`edit-earliest-time-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                          Earliest Start Time (optional)
                        </label>
                        <input
                          id={`edit-earliest-time-${editingTask.id}`}
                          type="time"
                          value={getTimePart(editingTask.earliest_start_datetime)}
                          onChange={(e) => handleTimeChange(
                            'earliest_start_datetime',
                            getDatePart(editingTask.earliest_start_datetime),
                            e.target.value
                          )}
                          className="p-2 border rounded"
                          title="Earliest Start Time"
                          aria-label="Earliest Start Time"
                          placeholder="HH:mm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor={`edit-due-date-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                        <input
                          id={`edit-due-date-${editingTask.id}`}
                          type="date"
                          value={getDatePart(editingTask.due_datetime)}
                          onChange={(e) => handleDateChange(
                            'due_datetime',
                            e.target.value,
                            getTimePart(editingTask.due_datetime)
                          )}
                          className="p-2 border rounded"
                          title="Due Date"
                          aria-label="Due Date"
                          placeholder="YYYY-MM-DD"
                        />
                      </div>
                      <div>
                        <label htmlFor={`edit-due-time-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">Due Time</label>
                        <input
                          id={`edit-due-time-${editingTask.id}`}
                          type="time"
                          value={getTimePart(editingTask.due_datetime)}
                          onChange={(e) => handleTimeChange(
                            'due_datetime',
                            getDatePart(editingTask.due_datetime),
                            e.target.value
                          )}
                          className="p-2 border rounded"
                          title="Due Time"
                          aria-label="Due Time"
                          placeholder="HH:mm"
                        />
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <label htmlFor={`edit-scheduling-type-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">Task Type</label>
                      <select
                        id={`edit-scheduling-type-${editingTask.id}`}
                        value={editingTask.scheduling_type}
                        onChange={(e) => {
                          const value = e.target.value as SchedulingType;
                          updateEditingTask({ scheduling_type: value });
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-200 transition-colors"
                        title="Task Type"
                        aria-label="Task Type"
                      >
                        <option value="fixed">Fixed</option>
                        <option value="flexible">Flexible</option>
                        <option value="preferred">Preferred (Movable)</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label htmlFor={`edit-duration-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                          Duration (minutes)
                        </label>
                        <input
                          id={`edit-duration-${editingTask.id}`}
                          type="number"
                          value={editingTask.duration_minutes}
                          onChange={(e) => updateEditingTask({ duration_minutes: e.target.value })}
                          placeholder="Duration (minutes)"
                          className="p-2 border rounded"
                          title="Duration"
                          aria-label="Duration in minutes"
                        />
                      </div>
                      <div>
                        <label htmlFor={`edit-importance-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                          Importance (1-5)
                        </label>
                        <input
                          id={`edit-importance-${editingTask.id}`}
                          type="number"
                          value={editingTask.importance}
                          onChange={(e) => updateEditingTask({ importance: e.target.value })}
                          min="1"
                          max="5"
                          placeholder="Importance (1-5)"
                          className="p-2 border rounded"
                          title="Importance"
                          aria-label="Task importance level from 1 to 5"
                        />
                      </div>
                      <div>
                        <label htmlFor={`edit-difficulty-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                          Difficulty (1-5)
                        </label>
                        <input
                          id={`edit-difficulty-${editingTask.id}`}
                          type="number"
                          value={editingTask.difficulty}
                          onChange={(e) => updateEditingTask({ difficulty: e.target.value })}
                          min="1"
                          max="5"
                          placeholder="Difficulty (1-5)"
                          className="p-2 border rounded"
                          title="Difficulty"
                          aria-label="Task difficulty level from 1 to 5"
                        />
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <label htmlFor={`edit-status-${editingTask.id}`} className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                      <select
                        id={`edit-status-${editingTask.id}`}
                        value={editingTask.status}
                        onChange={(e) => {
                          const value = e.target.value as TaskStatus;
                          updateEditingTask({ status: value });
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-200 transition-colors"
                        title="Task Status"
                        aria-label="Task Status"
                      >
                        <option value="scheduled">Scheduled</option>
                        <option value="not_able_to_schedule">Not Able to Schedule</option>
                        <option value="set_aside">Set Aside</option>
                      </select>
                    </div>
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={() => handleSave(task.id)}
                        disabled={loading}
                        className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
                      >
                        {loading ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditingTask(null)}
                        className="px-4 py-2 bg-gray-500 text-white rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <h3 className="text-lg font-semibold">{task.title}</h3>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(task)}
                          className="text-blue-500 hover:text-blue-700"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(task.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className="text-sm text-gray-600">
                      <p>
                        <strong>Start Time:</strong>{' '}
                        {task.start_datetime
                          ? new Date(task.start_datetime).toLocaleString(undefined, {
                          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                        })
                      : 'N/A'}
                  </p>
                      <p>
                        <strong>End Time:</strong>{' '}
                        {task.start_datetime && task.duration_minutes
                          ? (() => {
                              const start = new Date(task.start_datetime);
                              const end = new Date(start.getTime() + Number(task.duration_minutes) * 60000);
                              return end.toLocaleString(undefined, {
                                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                              });
                            })()
                          : 'N/A'}
                      </p>
                  <p>Duration: {task.duration_minutes} minutes</p>
                  <p>
                    Importance: {IMPORTANCE_LABELS[task.importance]} ({task.importance}/5)
                  </p>
                  <p>Difficulty: {task.difficulty}/5</p>
                </div>
              </div>
            )}
          </div>
        ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskList;
