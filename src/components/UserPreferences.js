import { useState, useEffect } from 'react';

const defaultPrefs = {
  sleep_start: '00:00',
  sleep_end: '08:00',
  sleep_duration: 480,
  work_start: '09:00',
  work_end: '17:00',
  work_days: [1, 2, 3, 4, 5],
};

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function mergePrefs(prefs) {
  return { ...defaultPrefs, ...(prefs || {}) };
}

export default function UserPreferences({ initialPreferences, onSave, loading }) {
  const [prefs, setPrefs] = useState(mergePrefs(initialPreferences));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Sync local state with prop changes
  useEffect(() => {
    setPrefs(mergePrefs(initialPreferences));
  }, [initialPreferences]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setPrefs((prev) => ({ ...prev, [name]: value }));
  };

  const handleDaysChange = (dayIdx) => {
    setPrefs((prev) => {
      const days = prev.work_days.includes(dayIdx)
        ? prev.work_days.filter((d) => d !== dayIdx)
        : [...prev.work_days, dayIdx].sort((a, b) => a - b);
      return { ...prev, work_days: days };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(prefs);
    } catch (err) {
      setError(err.message || 'Error saving preferences');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card w-full max-w-md mx-auto flex flex-col gap-6 mt-12">
      <h2 className="text-2xl font-bold mb-1 text-center">Daily Preferences</h2>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div>
          <label className="font-semibold">Sleep Window:</label>
          <div className="flex gap-2 items-center mt-1">
            <input
              type="time"
              name="sleep_start"
              value={prefs.sleep_start}
              onChange={handleChange}
              disabled={saving || loading}
              className="border rounded px-2 py-1"
            />
            <span>to</span>
            <input
              type="time"
              name="sleep_end"
              value={prefs.sleep_end}
              onChange={handleChange}
              disabled={saving || loading}
              className="border rounded px-2 py-1"
            />
          </div>
        </div>
        <div>
          <label className="font-semibold">Work Hours:</label>
          <div className="flex gap-2 items-center mt-1">
            <input
              type="time"
              name="work_start"
              value={prefs.work_start}
              onChange={handleChange}
              disabled={saving || loading}
              className="border rounded px-2 py-1"
            />
            <span>to</span>
            <input
              type="time"
              name="work_end"
              value={prefs.work_end}
              onChange={handleChange}
              disabled={saving || loading}
              className="border rounded px-2 py-1"
            />
          </div>
        </div>
        <div>
          <label className="font-semibold">Work Days:</label>
          <div className="flex gap-2 mt-1">
            {dayLabels.map((label, idx) => (
              <label
                key={label}
                className={`flex items-center gap-1 px-2 py-1 rounded cursor-pointer border ${prefs.work_days.includes(idx) ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                <input
                  type="checkbox"
                  checked={prefs.work_days.includes(idx)}
                  onChange={() => handleDaysChange(idx)}
                  disabled={saving || loading}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
        <button
          type="submit"
          className="bg-blue-500 text-white px-4 py-2 rounded font-semibold mt-4"
          disabled={saving || loading}
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
        {error && <div className="text-red-500 text-xs mt-2">{error}</div>}
      </form>
      <div className="text-xs text-gray-400 text-center mt-2">
        Your preferences help DayTune tune your schedule. 🌙
      </div>
    </div>
  );
}
