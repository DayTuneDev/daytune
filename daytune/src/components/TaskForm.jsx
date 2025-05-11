import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function TaskForm({ onTaskAdded, userId }) {
  const [form, setForm] = useState({
    title: '',
    start_date: '',
    start_time: '',
    due_date: '',
    due_time: '',
    scheduling_type: 'flexible',
    duration_minutes: 30,
    importance: 3,
    difficulty: 3
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!form.title.trim() || !form.start_date || !form.start_time || !form.duration_minutes || !form.importance || !form.difficulty) {
      setError("Let's fill out the essentials so we can tune your day!");
      return;
    }
    setLoading(true);
    try {
      const startDatetime = form.start_date && form.start_time
        ? new Date(`${form.start_date}T${form.start_time}`).toISOString()
        : null;
      const dueDatetime = form.due_date && form.due_time
        ? new Date(`${form.due_date}T${form.due_time}`).toISOString()
        : null;
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
          scheduling_type: form.scheduling_type,
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
        scheduling_type: 'flexible',
        duration_minutes: 30,
        importance: 3,
        difficulty: 3
      });
      setSuccess("Task added! You're tuning your day. 🌱");
      if (onTaskAdded) onTaskAdded(data[0]);
    } catch (err) {
      setError('Something went sideways. Want to try again?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-white rounded-lg shadow-lg p-8">
      {(error || success) && (
        <div className={`mb-6 p-4 rounded-lg flex items-center ${
          error
            ? 'bg-yellow-50 border-l-4 border-yellow-400 text-yellow-800'
            : 'bg-green-50 border-l-4 border-green-400 text-[var(--accent)]'
        }`}>
          <span className="text-xl mr-3">
            {error ? '🌱' : '✨'}
          </span>
          <span className="text-sm font-medium">{error || success}</span>
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Title<span className="text-green-600 ml-1">*</span></label>
        <input
          type="text"
          name="title"
          value={form.title}
          onChange={handleChange}
          required
          placeholder="What would you like to accomplish?"
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200 transition-colors"
        />
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Start Date<span className="text-green-600 ml-1">*</span></label>
          <input
            type="date"
            name="start_date"
            value={form.start_date}
            onChange={handleChange}
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200 transition-colors"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Start Time<span className="text-green-600 ml-1">*</span></label>
          <input
            type="time"
            name="start_time"
            value={form.start_time}
            onChange={handleChange}
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200 transition-colors"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Due Date (optional)</label>
          <input
            type="date"
            name="due_date"
            value={form.due_date}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200 transition-colors"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Due Time (optional)</label>
          <input
            type="time"
            name="due_time"
            value={form.due_time}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200 transition-colors"
          />
        </div>
      </div>
      <div className="flex items-center space-x-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">Task Type</label>
        <select
          name="scheduling_type"
          value={form.scheduling_type}
          onChange={handleChange}
          className="rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-200 transition-colors"
        >
          <option value="fixed">Fixed</option>
          <option value="flexible">Flexible</option>
          <option value="preferred">Preferred (Movable)</option>
        </select>
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)<span className="text-green-600 ml-1">*</span></label>
          <input
            type="number"
            name="duration_minutes"
            value={form.duration_minutes}
            onChange={handleChange}
            min="1"
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200 transition-colors"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Importance (1-5)<span className="text-green-600 ml-1">*</span></label>
          <input
            type="number"
            name="importance"
            value={form.importance}
            onChange={handleChange}
            min="1"
            max="5"
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200 transition-colors"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Difficulty (1-5)<span className="text-green-600 ml-1">*</span></label>
          <input
            type="number"
            name="difficulty"
            value={form.difficulty}
            onChange={handleChange}
            min="1"
            max="5"
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200 transition-colors"
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 ease-in-out transform hover:scale-[1.02]"
      >
        {loading ? (
          <>
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Adding Task...
          </>
        ) : (
          'Add Task'
        )}
      </button>
    </form>
  );
} 