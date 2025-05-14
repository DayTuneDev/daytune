import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

const MOODS = [
  { key: 'happy', emoji: '😃', label: 'Happy/Energized' },
  { key: 'neutral', emoji: '😐', label: 'Neutral/Meh' },
  { key: 'tired', emoji: '😴', label: 'Tired/Fatigued' },
  { key: 'sad', emoji: '😔', label: 'Sad/Down' },
  { key: 'angry', emoji: '😠', label: 'Frustrated/Angry' },
  { key: 'anxious', emoji: '😰', label: 'Anxious/Stressed' },
  { key: 'motivated', emoji: '🤩', label: 'Motivated/Pumped' },
  { key: 'confused', emoji: '😕', label: 'Confused/Stuck' },
  { key: 'calm', emoji: '🧘', label: 'Calm/Focused' },
];

export default function SpecialCheckinPage({ userId, onBack }) {
  const [specialCheckins, setSpecialCheckins] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ label: '', mood: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Fetch special check-ins on mount
  useEffect(() => {
    const fetchCheckins = async () => {
      setLoading(true);
      setError('');
      const { data, error } = await supabase
        .from('mood_logs')
        .select('*')
        .eq('user_id', userId)
        .eq('type', 'Special Check-In')
        .order('logged_at', { ascending: false });
      if (error) setError('Error loading special check-ins');
      setSpecialCheckins(data || []);
      setLoading(false);
    };
    fetchCheckins();
  }, [userId]);

  // Add a new special check-in
  const handleAdd = async () => {
    setError('');
    if (!form.label.trim() || !form.mood) {
      setError('Please enter a label and select a mood.');
      return;
    }
    setLoading(true);
    const { data, error: insertError } = await supabase
      .from('mood_logs')
      .insert([
        {
          user_id: userId,
          mood: form.mood,
          time_of_day: form.label,
          logged_at: new Date().toISOString(),
          type: 'Special Check-In',
        },
      ])
      .select();
    if (insertError) {
      setError('Error adding special check-in');
      setLoading(false);
      return;
    }
    setSpecialCheckins((prev) => [data[0], ...prev]);
    setShowAdd(false);
    setForm({ label: '', mood: '' });
    setLoading(false);
  };

  // Delete a special check-in
  const handleDelete = async (id) => {
    setError('');
    setLoading(true);
    const { error: deleteError } = await supabase
      .from('mood_logs')
      .delete()
      .eq('id', id);
    if (deleteError) {
      setError('Error deleting special check-in');
      setLoading(false);
      return;
    }
    setSpecialCheckins((prev) => prev.filter((c) => c.id !== id));
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center py-8">
      <div className="card w-full max-w-lg mx-auto text-left">
        <h2 className="text-2xl font-bold mb-4">Special Check-Ins</h2>
        <button className="mb-4 px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700 transition" onClick={onBack}>
          Back to Dashboard
        </button>
        {error && <div className="mb-4 p-2 bg-red-100 text-red-700 rounded">{error}</div>}
        <button className="mb-4 px-4 py-2 bg-green-600 text-white rounded shadow hover:bg-green-700 transition" onClick={() => setShowAdd(true)}>
          Add Special Check-In
        </button>
        {showAdd && (
          <div className="mb-6 p-4 bg-gray-100 rounded shadow">
            <div className="mb-2">
              <label className="block text-sm font-medium mb-1">Label</label>
              <input
                type="text"
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                className="w-full p-2 border rounded"
                placeholder="e.g. After workout, Before bed, etc."
              />
            </div>
            <div className="mb-2">
              <label className="block text-sm font-medium mb-1">Mood</label>
              <select
                value={form.mood}
                onChange={e => setForm(f => ({ ...f, mood: e.target.value }))}
                className="w-full p-2 border rounded"
              >
                <option value="">Select mood...</option>
                {MOODS.map(m => (
                  <option key={m.key} value={m.key}>{m.emoji} {m.label}</option>
                ))}
              </select>
            </div>
            <button className="mt-2 px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700 transition" onClick={handleAdd} disabled={loading}>
              Save
            </button>
            <button className="mt-2 ml-2 px-4 py-2 bg-gray-400 text-white rounded shadow hover:bg-gray-500 transition" onClick={() => setShowAdd(false)}>
              Cancel
            </button>
          </div>
        )}
        <div>
          {loading ? <div>Loading...</div> : specialCheckins.length === 0 ? <div>No special check-ins yet.</div> : (
            <ul className="space-y-4">
              {specialCheckins.map(c => {
                const moodObj = MOODS.find(m => m.key === c.mood);
                return (
                  <li key={c.id} className="flex items-center justify-between border rounded px-3 py-2 bg-white shadow-sm">
                    <div>
                      <div className="font-semibold">{c.time_of_day}</div>
                      <div className="text-xs text-gray-500">{new Date(c.logged_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{moodObj ? moodObj.emoji : c.mood}</span>
                      <button className="ml-2 px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition" onClick={() => handleDelete(c.id)}>
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
} 