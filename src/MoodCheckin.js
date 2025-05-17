import { useState } from 'react';
import { supabase } from './supabaseClient.js';

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

const BUCKET_LABELS = {
  early_morning: 'Early Morning',
  morning: 'Morning',
  afternoon: 'Afternoon',
  early_evening: 'Early Evening',
  evening: 'Evening',
  night: 'Night',
  early_am: 'Early AM',
  just_before_sunrise: 'Just Before Sunrise',
};

// Add bucket ranges for time validation
const BUCKET_RANGES = {
  early_morning: [360, 539], // 6:00–8:59am
  morning: [540, 719], // 9:00–11:59am
  afternoon: [720, 899], // 12:00–2:59pm
  early_evening: [900, 1079], // 3:00–5:59pm
  evening: [1080, 1259], // 6:00–8:59pm
  night: [1260, 1439], // 9:00–11:59pm
  early_am: [0, 179], // 12:00–2:59am
  just_before_sunrise: [180, 359], // 3:00–5:59am
};

export default function MoodCheckin({
  userId,
  availableBuckets,
  onCheckin,
  currentBucket,
  loading,
}) {
  const [selectedMood, setSelectedMood] = useState(null);
  const [selectedBucket, setSelectedBucket] = useState(currentBucket || availableBuckets[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [warn, setWarn] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setWarn('');
    setError('');
    if (!selectedMood) {
      setWarn('Please select a mood before submitting.');
      return;
    }
    if (!selectedBucket) {
      setWarn('No time bucket selected.');
      return;
    }
    // Only allow check-in for the current bucket
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const [bucketStart, bucketEnd] = BUCKET_RANGES[selectedBucket] || [0, 0];
    if (nowMinutes < bucketStart) {
      setWarn('This time period has yet to come. Please check in when the time arrives later.');
      return;
    }
    if (nowMinutes > bucketEnd) {
      setWarn(
        'This time period has already passed. Please check-in your mood for current time period if you have not yet.'
      );
      return;
    }
    setSubmitting(true);
    // Only allow one check-in per bucket per day (for current bucket only)
    const today = new Date().toISOString().slice(0, 10);
    const { data: existing } = await supabase
      .from('mood_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('time_of_day', selectedBucket)
      .gte('logged_at', today + 'T00:00:00.000Z')
      .lte('logged_at', today + 'T23:59:59.999Z');
    if (existing && existing.length > 0) {
      setError('You have already checked in for this time bucket today.');
      setSubmitting(false);
      return;
    }
    const payload = {
      user_id: userId,
      mood: selectedMood,
      time_of_day: selectedBucket,
      logged_at: new Date().toISOString(),
    };
    const { error: insertError } = await supabase.from('mood_logs').insert([payload]);
    setSubmitting(false);
    if (insertError) {
      setError('Error saving mood check-in: ' + insertError.message);
    } else {
      setSelectedMood(null);
      if (onCheckin) onCheckin(selectedBucket);
    }
  };

  return (
    <div className="bg-white border rounded p-6 shadow w-full max-w-md mx-auto flex flex-col gap-4 items-center">
      <h2 className="text-xl font-bold mb-2">Mood Check-In</h2>
      <form className="flex flex-col gap-4 w-full items-center" onSubmit={handleSubmit}>
        <div className="flex flex-wrap gap-3 justify-center">
          {MOODS.map((mood) => (
            <button
              type="button"
              key={mood.key}
              className={`text-3xl px-2 py-1 rounded border-2 flex flex-col items-center relative transition-all duration-150 ${selectedMood === mood.key ? 'border-blue-600 bg-blue-100 shadow-lg scale-105' : 'border-gray-200 bg-white'}`}
              onClick={() => setSelectedMood(mood.key)}
              aria-pressed={selectedMood === mood.key}
              disabled={loading || !userId}
            >
              <span role="img" aria-label={mood.label}>
                {mood.emoji}
              </span>
              <div className="text-xs mt-1">{mood.label}</div>
              {selectedMood === mood.key && (
                <span className="absolute top-0 right-0 text-green-600 text-lg font-bold">✓</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex flex-col items-center gap-2 w-full">
          <label className="font-semibold">Time Bucket:</label>
          <select
            className="border px-2 py-1 rounded w-full"
            value={selectedBucket}
            onChange={(e) => setSelectedBucket(e.target.value)}
            disabled={!!currentBucket || loading || !userId}
          >
            {availableBuckets.map((bucket) => (
              <option key={bucket} value={bucket}>
                {BUCKET_LABELS[bucket] || bucket}
              </option>
            ))}
          </select>
        </div>
        <button
          className="bg-blue-500 text-white px-4 py-2 rounded mt-2 w-full"
          type="submit"
          disabled={submitting || !selectedMood || !selectedBucket || loading || !userId}
        >
          {submitting ? 'Submitting...' : 'Submit Mood'}
        </button>
        {warn && <div className="text-yellow-600 text-center mt-2">{warn}</div>}
        {error && (
          <div className="text-red-500 text-center mt-2">
            {error}
            {error.includes('already checked in') && (
              <button
                className="mt-4 px-4 py-2 bg-blue-500 text-white rounded"
                onClick={() => onCheckin && onCheckin(selectedBucket)}
              >
                Back to Dashboard
              </button>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
