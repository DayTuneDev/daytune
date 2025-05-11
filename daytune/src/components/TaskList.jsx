import { useState } from 'react';
import { supabase } from '../supabaseClient';

const IMPORTANCE_COLORS = {
  1: 'bg-gray-100',
  2: 'bg-blue-100',
  3: 'bg-green-100',
  4: 'bg-yellow-100',
  5: 'bg-red-100'
};

const IMPORTANCE_LABELS = {
  1: 'Minimal',
  2: 'Low',
  3: 'Medium',
  4: 'High',
  5: 'Critical'
};

// Helper to format 24-hour time to 12-hour AM/PM
function formatTimeToAMPM(timeStr) {
  if (!timeStr) return 'N/A';
  const [hour, minute] = timeStr.split(':');
  let h = parseInt(hour, 10);
  const m = minute.padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

export default function TaskList({ tasks, onTaskUpdated, onTaskDeleted, userId }) {
  const [editingTask, setEditingTask] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEdit = (task) => {
    setEditingTask({
      ...task,
      due_date: task.due_date || '',
      due_time: task.due_time || '',
      start_date: task.start_date || '',
      start_time: task.start_time || ''
    });
  };

  const handleSave = async (taskId) => {
    setLoading(true);
    setError('');

    try {
      const { error: updateError } = await supabase
        .from('tasks')
        .update({
          ...editingTask,
          duration_minutes: parseInt(editingTask.duration_minutes, 10),
          importance: parseInt(editingTask.importance, 10),
          difficulty: parseInt(editingTask.difficulty, 10)
        })
        .eq('id', taskId);

      if (updateError) throw updateError;

      setEditingTask(null);
      if (onTaskUpdated) onTaskUpdated();
    } catch (err) {
      setError('Could not update the task. Want to try again?');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (taskId) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;

    setLoading(true);
    setError('');

    try {
      const { error: deleteError } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId);

      if (deleteError) throw deleteError;

      if (onTaskDeleted) onTaskDeleted();
    } catch (err) {
      setError('Could not delete the task. Please try again, or refresh the page.');
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (date, time) => {
    if (!date) return 'No due date';
    const dateTime = new Date(`${date}T${time || '00:00'}`);
    return dateTime.toLocaleString();
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-yellow-700 bg-yellow-50 border-l-4 border-yellow-300 p-2 rounded">{error || 'Something went sideways. Want to try again?'}</div>
      )}

      <div className="grid gap-4">
        {tasks.length === 0 && (
          <div className="text-[var(--accent)] text-center py-4">No tasks yet. Ready when you are! 🌱</div>
        )}
        {tasks.map(task => (
          <div
            key={task.id}
            className={`p-4 rounded-lg shadow ${IMPORTANCE_COLORS[task.importance]}`}
          >
            {editingTask?.id === task.id ? (
              <div className="space-y-4">
                <input
                  type="text"
                  value={editingTask.title}
                  onChange={e => setEditingTask(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full p-2 border rounded"
                />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={editingTask.start_date || ''}
                      onChange={e => setEditingTask(prev => ({ ...prev, start_date: e.target.value }))}
                      className="p-2 border rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                    <input
                      type="time"
                      value={editingTask.start_time || ''}
                      onChange={e => setEditingTask(prev => ({ ...prev, start_time: e.target.value }))}
                      className="p-2 border rounded"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                    <input
                      type="date"
                      value={editingTask.due_date || ''}
                      onChange={e => setEditingTask(prev => ({ ...prev, due_date: e.target.value }))}
                      className="p-2 border rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Due Time</label>
                    <input
                      type="time"
                      value={editingTask.due_time || ''}
                      onChange={e => setEditingTask(prev => ({ ...prev, due_time: e.target.value }))}
                      className="p-2 border rounded"
                    />
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Task Type</label>
                  <select
                    value={editingTask.scheduling_type}
                    onChange={e => setEditingTask(prev => ({ ...prev, scheduling_type: e.target.value }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-200 transition-colors"
                  >
                    <option value="fixed">Fixed</option>
                    <option value="flexible">Flexible</option>
                    <option value="preferred">Preferred (Movable)</option>
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <input
                    type="number"
                    value={editingTask.duration_minutes}
                    onChange={e => setEditingTask(prev => ({ ...prev, duration_minutes: e.target.value }))}
                    placeholder="Duration (minutes)"
                    className="p-2 border rounded"
                  />
                  <input
                    type="number"
                    value={editingTask.importance}
                    onChange={e => setEditingTask(prev => ({ ...prev, importance: e.target.value }))}
                    min="1"
                    max="5"
                    placeholder="Importance (1-5)"
                    className="p-2 border rounded"
                  />
                  <input
                    type="number"
                    value={editingTask.difficulty}
                    onChange={e => setEditingTask(prev => ({ ...prev, difficulty: e.target.value }))}
                    min="1"
                    max="5"
                    placeholder="Difficulty (1-5)"
                    className="p-2 border rounded"
                  />
                </div>
                <div className="flex justify-end space-x-2">
                  <button
                    onClick={() => handleSave(task.id)}
                    disabled={loading}
                    className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
                  >
                    Save
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
                  <p>Start Date: {task.start_date || 'N/A'}</p>
                  <p>Start Time: {formatTimeToAMPM(task.start_time) || 'N/A'}</p>
                  <p>Due Date: {task.due_date || 'N/A'}</p>
                  <p>Due Time: {formatTimeToAMPM(task.due_time) || 'N/A'}</p>
                  <p>Duration: {task.duration_minutes} minutes</p>
                  <p>Importance: {IMPORTANCE_LABELS[task.importance]} ({task.importance}/5)</p>
                  <p>Difficulty: {task.difficulty}/5</p>
                  <p>Status: {task.scheduling_type === 'fixed' ? 'Fixed Time' : task.scheduling_type === 'preferred' ? 'Preferred (Movable)' : 'Flexible'}</p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
} 