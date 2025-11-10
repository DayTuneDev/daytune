import React, { useState } from 'react';
import { createTask } from '../services/taskService';
import { Task } from '../types/shared';

interface TaskFormProps {
  onTaskAdded: () => void;
  userId: string;
}

const defaultForm: Partial<Task> = {
  title: '',
  duration_minutes: 30,
  importance: 3,
  difficulty: 3,
  scheduling_type: 'flexible',
  category: 'Work',
  status: 'scheduled',
};

const TaskForm: React.FC<TaskFormProps> = ({ onTaskAdded, userId }) => {
  const [form, setForm] = useState<Partial<Task>>(defaultForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => {
      // Handle start date/time
      if (name === 'start_date') {
        const time = prev.start_datetime ? prev.start_datetime.slice(11, 16) : '00:00';
        return { 
          ...prev, 
          start_datetime: value ? `${value}T${time}` : '',
          status: 'scheduled' 
        };
      }
      if (name === 'start_time') {
        const date = prev.start_datetime ? prev.start_datetime.slice(0, 10) : '';
        return { 
          ...prev, 
          start_datetime: date ? `${date}T${value}` : '',
          status: 'scheduled' 
        };
      }
      // Handle due date/time
      if (name === 'due_date') {
        const time = prev.due_datetime ? prev.due_datetime.slice(11, 16) : '00:00';
        return { 
          ...prev, 
          due_datetime: value ? `${value}T${time}` : '',
          status: 'scheduled' 
        };
      }
      if (name === 'due_time') {
        const date = prev.due_datetime ? prev.due_datetime.slice(0, 10) : '';
        return { 
          ...prev, 
          due_datetime: date ? `${date}T${value}` : '',
          status: 'scheduled' 
        };
      }
      // Handle earliest start date/time
      if (name === 'earliest_start_date') {
        const time = prev.earliest_start_datetime
          ? prev.earliest_start_datetime.slice(11, 16)
          : '00:00';
        return { 
          ...prev, 
          earliest_start_datetime: value ? `${value}T${time}` : '',
          status: 'scheduled' 
        };
      }
      if (name === 'earliest_start_time') {
        const date = prev.earliest_start_datetime ? prev.earliest_start_datetime.slice(0, 10) : '';
        return { 
          ...prev, 
          earliest_start_datetime: date ? `${date}T${value}` : '',
          status: 'scheduled' 
        };
      }
      // Default for other fields
      return { 
        ...prev, 
        [name]: value,
        status: 'scheduled' 
      };
    });
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (
      !(form.title?.trim() || '') ||
      !form.start_datetime ||
      !form.duration_minutes ||
      !form.importance ||
      !form.difficulty
    ) {
      setError("Let's fill out the essentials so we can tune your day!");
      return;
    }
    setLoading(true);
    try {
      // Convert local date/time strings to UTC ISO strings for DB
      const startIso = form.start_datetime ? new Date(form.start_datetime).toISOString() : null;
      const dueIso = form.due_datetime ? new Date(form.due_datetime).toISOString() : null;
      const earliestIso = form.earliest_start_datetime
        ? new Date(form.earliest_start_datetime).toISOString()
        : null;
      // Log the data being sent
      const payload = {
        user_id: userId,
        title: form.title,
        start_datetime: startIso || undefined,
        due_datetime: dueIso || undefined,
        scheduling_type: form.scheduling_type,
        duration_minutes: parseInt(String(form.duration_minutes), 10),
        importance: parseInt(String(form.importance), 10),
        difficulty: parseInt(String(form.difficulty), 10),
        earliest_start_datetime: earliestIso || undefined,
        category: form.category,
        status: form.status,
      };
      console.log('Inserting task:', payload);
      const { error: insertError } = await createTask(payload);
      if (insertError) {
        console.error('Supabase insert error:', insertError);
        setError('Supabase error: ' + insertError.message);
        setLoading(false);
        return;
      }
      setForm({
        title: '',
        start_datetime: '',
        earliest_start_datetime: '',
        due_datetime: '',
        scheduling_type: 'flexible',
        category: 'Work',
        duration_minutes: 30,
        importance: 3,
        difficulty: 3,
        status: 'scheduled',
      });
      setSuccess("Task added! You're tuning your day. 🌱");
      if (onTaskAdded) onTaskAdded();
    } catch (err) {
      setError('Something went sideways. Want to try again? ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-white rounded-lg shadow-lg p-8">
      {(error || success) && (
        <div
          className={`mb-6 p-4 rounded-lg flex items-center ${
            error
              ? 'bg-yellow-50 border-l-4 border-yellow-400 text-yellow-800'
              : 'bg-green-50 border-l-4 border-green-400 text-[var(--accent)]'
          }`}
        >
          <span className="text-xl mr-3">{error ? '🌱' : '✨'}</span>
          <span className="text-sm font-medium">{error || success}</span>
        </div>
      )}
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
          Title<span className="text-green-600 ml-1">*</span>
        </label>
        <input
          id="title"
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
          <label htmlFor="start_date" className="block text-sm font-medium text-gray-700 mb-1">
            Start Date<span className="text-green-600 ml-1">*</span>
          </label>
          <input
            id="start_date"
            type="date"
            name="start_date"
            value={form.start_datetime ? form.start_datetime.slice(0, 10) : ''}
            onChange={handleChange}
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200 transition-colors"
            title="Start Date"
            placeholder="YYYY-MM-DD"
          />
        </div>
        <div>
          <label htmlFor="start_time" className="block text-sm font-medium text-gray-700 mb-1">
            Start Time<span className="text-green-600 ml-1">*</span>
          </label>
          <input
            id="start_time"
            type="time"
            name="start_time"
            value={form.start_datetime ? form.start_datetime.slice(11, 16) : ''}
            onChange={handleChange}
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200 transition-colors"
            title="Start Time"
            placeholder="HH:MM"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <label htmlFor="earliest_start_date" className="block text-sm font-medium text-gray-700 mb-1">
            Earliest Start Date (optional)
          </label>
          <input
            id="earliest_start_date"
            type="date"
            name="earliest_start_date"
            value={form.earliest_start_datetime ? form.earliest_start_datetime.slice(0, 10) : ''}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200 transition-colors"
            title="Earliest Start Date"
            placeholder="YYYY-MM-DD"
          />
        </div>
        <div>
          <label htmlFor="earliest_start_time" className="block text-sm font-medium text-gray-700 mb-1">
            Earliest Start Time (optional)
          </label>
          <input
            id="earliest_start_time"
            type="time"
            name="earliest_start_time"
            value={form.earliest_start_datetime ? form.earliest_start_datetime.slice(11, 16) : ''}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200 transition-colors"
            title="Earliest Start Time"
            placeholder="HH:MM"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select
            id="category"
            name="category"
            value={form.category}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200 transition-colors"
            title="Category"
          >
            <option value="Work">Work</option>
            <option value="Social">Social</option>
            <option value="Break">Break</option>
            <option value="Sleep">Sleep</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <label htmlFor="due_date" className="block text-sm font-medium text-gray-700 mb-1">
            Due Date (optional)
          </label>
          <input
            id="due_date"
            type="date"
            name="due_date"
            value={form.due_datetime ? form.due_datetime.slice(0, 10) : ''}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200 transition-colors"
            title="Due Date"
            placeholder="YYYY-MM-DD"
          />
        </div>
        <div>
          <label htmlFor="due_time" className="block text-sm font-medium text-gray-700 mb-1">
            Due Time (optional)
          </label>
          <input
            id="due_time"
            type="time"
            name="due_time"
            value={form.due_datetime ? form.due_datetime.slice(11, 16) : ''}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200 transition-colors"
            title="Due Time"
            placeholder="HH:MM"
          />
        </div>
      </div>
      <div className="flex items-center space-x-6">
        <label htmlFor="scheduling_type" className="block text-sm font-medium text-gray-700 mb-1">Task Type</label>
        <select
          id="scheduling_type"
          name="scheduling_type"
          value={form.scheduling_type}
          onChange={handleChange}
          className="rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-200 transition-colors"
          title="Task Type"
        >
          <option value="fixed">Fixed</option>
          <option value="flexible">Flexible</option>
          <option value="preferred">Preferred (Movable)</option>
        </select>
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div>
          <label htmlFor="duration_minutes" className="block text-sm font-medium text-gray-700 mb-1">
            Duration (minutes)<span className="text-green-600 ml-1">*</span>
          </label>
          <input
            id="duration_minutes"
            type="number"
            name="duration_minutes"
            value={form.duration_minutes}
            onChange={handleChange}
            min="1"
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200 transition-colors"
            title="Duration (minutes)"
            placeholder="Minutes"
          />
        </div>
        <div>
          <label htmlFor="importance" className="block text-sm font-medium text-gray-700 mb-1">
            Importance (1-5)<span className="text-green-600 ml-1">*</span>
          </label>
          <input
            id="importance"
            type="number"
            name="importance"
            value={form.importance}
            onChange={handleChange}
            min="1"
            max="5"
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200 transition-colors"
            title="Importance (1-5)"
            placeholder="1-5"
          />
        </div>
        <div>
          <label htmlFor="difficulty" className="block text-sm font-medium text-gray-700 mb-1">
            Difficulty (1-5)<span className="text-green-600 ml-1">*</span>
          </label>
          <input
            id="difficulty"
            type="number"
            name="difficulty"
            value={form.difficulty}
            onChange={handleChange}
            min="1"
            max="5"
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200 transition-colors"
            title="Difficulty (1-5)"
            placeholder="1-5"
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
            <svg
              className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            Adding Task...
          </>
        ) : (
          'Add Task'
        )}
      </button>
    </form>
  );
};

export default TaskForm;
