import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

const BUCKETS = [
  { key: 'early_morning', label: 'Early Morning (6:00–8:59am)' },
  { key: 'morning', label: 'Morning (9:00–11:59am)' },
  { key: 'afternoon', label: 'Afternoon (12:00–2:59pm)' },
  { key: 'early_evening', label: 'Early Evening (3:00–5:59pm)' },
  { key: 'evening', label: 'Evening (6:00–8:59pm)' },
  { key: 'night', label: 'Night (9:00–11:59pm)' },
  { key: 'early_am', label: 'Early AM (12:00–2:59am)' },
  { key: 'just_before_sunrise', label: 'Just Before Sunrise (3:00–5:59am)' },
];

export default function MoodSettings({ userId, initialBuckets, onSave, onCancel, loading }) {
  const [selected, setSelected] = useState(initialBuckets || BUCKETS.map(b => b.key));
  const [saving, setSaving] = useState(false);

  const toggleBucket = (key) => {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    await supabase.from('users').update({ mood_buckets: selected }).eq('id', userId);
    setSaving(false);
    if (onSave) onSave(selected);
  };

  return (
    <div className="bg-white border rounded p-6 shadow w-full max-w-md mx-auto flex flex-col gap-4">
      <h2 className="text-xl font-bold mb-2">Mood Check-In Settings</h2>
      <p className="text-gray-600 mb-2">Select which times of day you want to be prompted for mood check-ins:</p>
      <div className="flex flex-col gap-2">
        {BUCKETS.map((bucket) => (
          <label key={bucket.key} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selected.includes(bucket.key)}
              onChange={() => toggleBucket(bucket.key)}
              disabled={saving || loading || !userId}
            />
            {bucket.label}
          </label>
        ))}
      </div>
      <div className="flex gap-4 mt-4 justify-end">
        {onCancel && (
          <button className="px-4 py-2 rounded bg-gray-200" onClick={onCancel} disabled={saving || loading || !userId}>Cancel</button>
        )}
        {onCancel && (
          <button className="px-4 py-2 rounded bg-blue-500 text-white" onClick={onCancel} disabled={saving || loading || !userId}>
            Back to Dashboard
          </button>
        )}
        <button
          className="px-4 py-2 rounded bg-blue-500 text-white"
          onClick={handleSave}
          disabled={saving || loading || !userId}
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </div>
  );
} 