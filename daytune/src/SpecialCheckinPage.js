import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { FaPlus, FaTrashAlt } from 'react-icons/fa';

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
  const [adding, setAdding] = useState(false);

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
    setAdding(true);
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
      setAdding(false);
      return;
    }
    setSpecialCheckins((prev) => [data[0], ...prev]);
    setShowAdd(false);
    setForm({ label: '', mood: '' });
    setAdding(false);
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-yellow-50 to-blue-100 flex flex-col items-center justify-center py-8">
      <div className="card w-full max-w-lg mx-auto text-left shadow-xl rounded-2xl p-6 bg-white/90">
        <div className="mb-6">
          <h2 className="text-3xl font-bold mb-2 flex items-center gap-2">Special Check-Ins <span className="text-2xl">🌱</span></h2>
          <div className="text-blue-700 text-base mb-1">Capture a win, a wobble, or a moment that matters. <span className='font-semibold'>Special Check-Ins</span> help you tune your day to your real life. <span className="ml-1">✨</span></div>
          <div className="text-gray-500 text-sm">No schedule required—just a label and a mood. DayTune celebrates your rhythm, not just your plans.</div>
        </div>
        <div className="flex gap-3 mb-6">
          <button className="px-4 py-2 bg-gray-200 text-blue-700 rounded-full shadow hover:bg-gray-300 transition" onClick={onBack}>
            Back to dashboard
          </button>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-full shadow hover:bg-blue-700 flex items-center gap-2 transition font-semibold" onClick={() => setShowAdd(true)}>
            <FaPlus className="inline-block" /> <span>Add Special Check-In</span>
          </button>
        </div>
        {showAdd && (
          <div className="mb-8 p-6 bg-blue-50 border border-blue-200 rounded-xl shadow-lg animate-fadeIn">
            <div className="text-lg font-semibold mb-2 flex items-center gap-2">New Special Check-In <span className="text-xl">🔔</span></div>
            <div className="text-gray-600 text-sm mb-3">What's this moment about? (e.g. After workout, Before bed, Big win, Needed a break…)</div>
            <input
              type="text"
              value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              className="w-full p-2 border rounded mb-3"
              placeholder="Label your moment..."
              autoFocus
            />
            <div className="mb-3">
              <div className="text-sm font-medium mb-1">Mood</div>
              <div className="flex flex-wrap gap-2">
                {MOODS.map(m => (
                  <button
                    key={m.key}
                    type="button"
                    className={`flex items-center gap-2 text-3xl px-3 py-2 rounded-full border-2 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all duration-150 ${form.mood === m.key ? 'border-blue-500 bg-blue-50 scale-110' : 'border-gray-200 bg-white hover:bg-blue-50'}`}
                    onClick={() => setForm(f => ({ ...f, mood: m.key }))}
                    aria-label={m.label}
                  >
                    <span role="img" aria-label={m.label}>{m.emoji}</span>
                    <span className="text-base font-medium ml-1">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 mt-2">
              <button className="px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700 transition font-semibold" onClick={handleAdd} disabled={adding}>
                {adding ? 'Saving...' : 'Save'}
              </button>
              <button className="px-4 py-2 bg-gray-400 text-white rounded shadow hover:bg-gray-500 transition" onClick={() => setShowAdd(false)}>
                Cancel
              </button>
            </div>
            {error && <div className="mt-2 p-2 bg-red-100 text-red-700 rounded">{error}</div>}
          </div>
        )}
        <div>
          {loading ? <div>Loading...</div> : specialCheckins.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 animate-fadeIn">
              <span className="text-5xl mb-2">🌱</span>
              <div className="text-blue-700 text-lg font-semibold mb-1">No special check-ins yet.</div>
              <div className="text-gray-500 text-sm mb-2">Start by adding a moment that matters to you. DayTune is here to celebrate your real-life rhythm!</div>
            </div>
          ) : (
            <ul className="space-y-4">
              {specialCheckins.map(c => {
                const moodObj = MOODS.find(m => m.key === c.mood);
                return (
                  <li key={c.id} className="flex items-center justify-between border rounded-xl px-4 py-3 bg-white shadow-md transition-all duration-300 animate-fadeIn">
                    <div>
                      <div className="font-semibold text-lg flex items-center gap-2">{c.time_of_day} <span className="text-xl">{moodObj ? moodObj.emoji : c.mood}</span></div>
                      <div className="text-xs text-gray-500">{new Date(c.logged_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</div>
                    </div>
                    <button
                      className="ml-2 px-2 py-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition flex items-center"
                      title="Delete this check-in"
                      onClick={() => handleDelete(c.id)}
                    >
                      <FaTrashAlt className="inline-block" />
                    </button>
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