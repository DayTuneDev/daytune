import React, { useState } from 'react';
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

interface MoodSettingsProps {
  userId: string;
  initialBuckets?: string[];
  onSave?: (selected: string[]) => void;
  onCancel?: () => void;
  loading?: boolean;
}

export default function MoodSettings({ userId, initialBuckets, onSave, onCancel, loading }: MoodSettingsProps) {
  const [selected, setSelected] = useState<string[]>(initialBuckets || BUCKETS.map((b) => b.key));
  const [saving, setSaving] = useState<boolean>(false);

  const toggleBucket = (key: string) => {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const handleSave = async () => {
    setSaving(true);
    await supabase.from('users').update({ mood_buckets: selected }).eq('id', userId);
    setSaving(false);
    if (onSave) onSave(selected);
  };

  return (
    <div className="card w-full max-w-md mx-auto flex flex-col gap-6 mt-12">
      <h2 className="text-2xl font-bold mb-1 text-center">Mood Check-In Settings</h2>
      <p className="text-gray-600 mb-4 text-center">
        Select which times of day you want to be prompted for mood check-ins. You can always change
        this later!
      </p>
      <div className="flex flex-col gap-3">
        {BUCKETS.map((bucket) => (
          <label
            key={bucket.key}
            className="flex items-center gap-3 bg-blue-50 rounded-lg px-3 py-2 hover:bg-blue-100 transition cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selected.includes(bucket.key)}
              onChange={() => toggleBucket(bucket.key)}
              disabled={saving || loading || !userId}
              className="accent-blue-500 w-5 h-5 rounded"
              title={bucket.label}
            />
            <span className="text-gray-800 text-base">{bucket.label}</span>
          </label>
        ))}
      </div>
      <div className="flex flex-col sm:flex-row gap-6 mt-10 justify-end">
        <button
          className="bg-blue-500 text-white order-1"
          onClick={handleSave}
          disabled={saving || loading || !userId}
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
        {onCancel && (
          <button
            className="bg-blue-100 text-blue-700 order-2"
            onClick={onCancel}
            disabled={saving || loading || !userId}
          >
            Back to Dashboard
          </button>
        )}
      </div>
      <div className="text-xs text-gray-400 text-center mt-2">
        Your preferences help DayTune gently nudge you at the right times. 🌱
      </div>
    </div>
  );
} 