import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function TaskForm({ onTaskAdded, userId }) {
  const [form, setForm] = useState({
    title: '',
    start_date: '',
    start_time: '',
    due_date: '',
    due_time: '',
    is_deadline: false,
    is_fixed: false,
    duration_minutes: 30,
    importance: 3,
    difficulty: 3
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    // Validate required fields
    if (!form.title.trim() || !form.start_date || !form.start_time || !form.duration_minutes || !form.importance || !form.difficulty) {
      setError('Please fill out all required fields.');
      return;
    }
    setLoading(true);
    try {
      // Combine start_date and start_time into a single datetime string (UTC)
      const startDatetime = form.start_date && form.start_time
        ? new Date(`${form.start_date}T${form.start_time}`).toISOString()
        : null;
      // Combine due_date and due_time into a single datetime string (UTC, optional)
      const dueDatetime = form.due_date && form.due_time
        ? new Date(`${form.due_date}T${form.due_time}`).toISOString()
        : null;
      console.log('DEBUG: Submitting task with:', {
        start_date: form.start_date,
        start_time: form.start_time,
        startDatetime,
        due_date: form.due_date,
        due_time: form.due_time,
        dueDatetime,
      });
      if (!startDatetime) {
        setError('Start date and time are required.');
        setLoading(false);
        return;
      }
      const { data, error: insertError } = await supabase
        .from('tasks')
        .insert([{
          user_id: userId,
          title: form.title,
          start_date: form.start_date,
          start_time: form.start_time,
          start_datetime: startDatetime,
          due_date: form.due_date || null,
          due_time: form.due_time || null,
          due_datetime: dueDatetime,
          is_deadline: form.is_deadline,
          is_fixed: form.is_fixed,
          duration_minutes: parseInt(form.duration_minutes, 10),
          importance: parseInt(form.importance, 10),
          difficulty: parseInt(form.difficulty, 10)
        }])
        .select();
      if (insertError) throw insertError;
      setForm({
        title: '',
        start_date: '',
        start_time: '',
        due_date: '',
        due_time: '',
        is_deadline: false,
        is_fixed: false,
        duration_minutes: 30,
        importance: 3,
        difficulty: 3
      });
      if (onTaskAdded) onTaskAdded(data[0]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">Title<span className="text-red-500">*</span></label>
        <input
          type="text"
          name="title"
          value={form.title}
          onChange={handleChange}
          required
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Start Date<span className="text-red-500">*</span></label>
          <input
            type="date"
            name="start_date"
            value={form.start_date}
            onChange={handleChange}
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Start Time<span className="text-red-500">*</span></label>
          <input
            type="time"
            name="start_time"
            value={form.start_time}
            onChange={handleChange}
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Due Date (optional)</label>
          <input
            type="date"
            name="due_date"
            value={form.due_date}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Due Time (optional)</label>
          <input
            type="time"
            name="due_time"
            value={form.due_time}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
      </div>
      <div className="flex items-center space-x-4">
        <label className="flex items-center">
          <input
            type="checkbox"
            name="is_deadline"
            checked={form.is_deadline}
            onChange={handleChange}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="ml-2 text-sm text-gray-700">Is Deadline</span>
        </label>
        <label className="flex items-center">
          <input
            type="checkbox"
            name="is_fixed"
            checked={form.is_fixed}
            onChange={handleChange}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="ml-2 text-sm text-gray-700">Fixed Time</span>
        </label>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Duration (minutes)<span className="text-red-500">*</span></label>
          <input
            type="number"
            name="duration_minutes"
            value={form.duration_minutes}
            onChange={handleChange}
            min="1"
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Importance (1-5)<span className="text-red-500">*</span></label>
          <input
            type="number"
            name="importance"
            value={form.importance}
            onChange={handleChange}
            min="1"
            max="5"
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Difficulty (1-5)<span className="text-red-500">*</span></label>
          <input
            type="number"
            name="difficulty"
            value={form.difficulty}
            onChange={handleChange}
            min="1"
            max="5"
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
      </div>
      {error && (
        <div className="text-red-500 text-sm">{error}</div>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
      >
        {loading ? 'Adding...' : 'Add Task'}
      </button>
    </form>
  );
} 