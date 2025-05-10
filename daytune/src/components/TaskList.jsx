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

export default function TaskList({ tasks, onTaskUpdated, onTaskDeleted, userId }) {
  const [editingTask, setEditingTask] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEdit = (task) => {
    setEditingTask({
      ...task,
      due_date: task.due_date || '',
      due_time: task.due_time || ''
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
      setError(err.message);
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
      setError(err.message);
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
        <div className="text-red-500 text-sm">{error}</div>
      )}

      <div className="grid gap-4">
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
                  <input
                    type="date"
                    value={editingTask.due_date}
                    onChange={e => setEditingTask(prev => ({ ...prev, due_date: e.target.value }))}
                    className="p-2 border rounded"
                  />
                  <input
                    type="time"
                    value={editingTask.due_time}
                    onChange={e => setEditingTask(prev => ({ ...prev, due_time: e.target.value }))}
                    className="p-2 border rounded"
                  />
                </div>
                <div className="flex items-center space-x-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={editingTask.is_deadline}
                      onChange={e => setEditingTask(prev => ({ ...prev, is_deadline: e.target.checked }))}
                      className="mr-2"
                    />
                    Is Deadline
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={editingTask.is_fixed}
                      onChange={e => setEditingTask(prev => ({ ...prev, is_fixed: e.target.checked }))}
                      className="mr-2"
                    />
                    Fixed Time
                  </label>
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
                  <p>Start Time: {task.start_time || 'N/A'}</p>
                  <p>Start (UTC): {task.start_datetime || 'N/A'}</p>
                  <p>Due Date: {task.due_date || 'N/A'}</p>
                  <p>Due Time: {task.due_time || 'N/A'}</p>
                  <p>Due (UTC): {task.due_datetime || 'N/A'}</p>
                  <p>Duration: {task.duration_minutes} minutes</p>
                  <p>Importance: {IMPORTANCE_LABELS[task.importance]} ({task.importance}/5)</p>
                  <p>Difficulty: {task.difficulty}/5</p>
                  <p>Status: {task.is_deadline ? 'Deadline' : 'Regular'} • {task.is_fixed ? 'Fixed Time' : 'Flexible'}</p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
} 