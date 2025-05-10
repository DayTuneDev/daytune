import { useState, useEffect, useRef } from 'react';
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

// Add BUCKET_LABELS for friendly names
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

// Add BUCKET_TIME_LABELS for tooltips
const BUCKET_TIME_LABELS = {
  early_morning: '6:00–8:59am',
  morning: '9:00–11:59am',
  afternoon: '12:00–2:59pm',
  early_evening: '3:00–5:59pm',
  evening: '6:00–8:59pm',
  night: '9:00–11:59pm',
  early_am: '12:00–2:59am',
  just_before_sunrise: '3:00–5:59am',
};

export default function NotificationsPage({ userId, onBack, moodBuckets, onSpecialCheckin, loading }) {
  const [customNotifications, setCustomNotifications] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    label: '',
    datetime: '',
    recurrence: 'none',
  });
  const [loadingSession, setLoadingSession] = useState(true);
  const [error, setError] = useState('');
  const timeoutsRef = useRef([]);
  const [showSpecialCheckin, setShowSpecialCheckin] = useState(null); // notification object or null
  const [specialMood, setSpecialMood] = useState(null);
  const [specialError, setSpecialError] = useState('');
  const [specialSuccess, setSpecialSuccess] = useState('');
  const [testMsg, setTestMsg] = useState('');
  const [toast, setToast] = useState('');
  const [missedCheckins, setMissedCheckins] = useState([]);
  const [missedIndex, setMissedIndex] = useState(0);

  // Fetch custom notifications on mount
  useEffect(() => {
    const fetchNotifications = async () => {
      setLoadingSession(true);
      setError('');
      const { data, error } = await supabase
        .from('custom_notifications')
        .select('*')
        .eq('user_id', userId)
        .order('datetime', { ascending: true });
      if (error) setError('Error loading notifications');
      setCustomNotifications(data || []);
      setLoadingSession(false);
    };
    fetchNotifications();
  }, [userId]);

  // On mount, find missed special check-ins
  useEffect(() => {
    if (!customNotifications.length) return;
    const now = new Date();
    // Find custom notifications in the past (not yet checked in for today)
    const missed = customNotifications.filter(n => {
      const dt = new Date(n.datetime);
      return dt <= now && n.active;
    });
    setMissedCheckins(missed);
    setMissedIndex(0);
  }, [customNotifications]);

  // Show modal for missed check-ins first
  useEffect(() => {
    if (missedCheckins.length > 0 && missedIndex < missedCheckins.length) {
      setShowSpecialCheckin(missedCheckins[missedIndex]);
      setSpecialMood(null);
      setSpecialError('');
      setSpecialSuccess('');
    }
  }, [missedCheckins, missedIndex]);

  // Helper: is time in the past or now
  function isPastOrNow(dt) {
    return new Date(dt) <= new Date();
  }

  // Helper: schedule browser notifications and open modal
  useEffect(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    const now = new Date();
    customNotifications.forEach((n) => {
      if (!n.active) return;
      let nextTime = new Date(n.datetime);
      if (n.recurrence === 'daily') {
        if (nextTime < now) {
          nextTime.setDate(nextTime.getDate() + 1);
        }
      } else if (n.recurrence === 'weekly') {
        // TODO: handle weekly recurrence
        return;
      }
      if (nextTime < now) return;
      const delay = nextTime - now;
      const timeout = setTimeout(() => {
        // Always show the modal in-app
        setShowSpecialCheckin(n);
        setSpecialMood(null);
        setSpecialError('');
        setSpecialSuccess('');
        // Also show the notification if possible
        try {
          const notif = new Notification('DayTune: Custom Mood Check-In', {
            body: n.label ? n.label : 'Time for your custom mood check-in!',
            icon: '/favicon.ico',
          });
          showToast('Custom notification created!');
          notif.onclick = () => {
            window.focus();
            showToast('Custom notification clicked!');
          };
        } catch (err) {
          console.error('Error showing custom notification:', err);
        }
      }, delay);
      timeoutsRef.current.push(timeout);
    });
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
    };
  }, [customNotifications]);

  // Add a new custom notification
  const handleAdd = async () => {
    setError('');
    if (!form.datetime) {
      setError('Please select a date and time.');
      return;
    }
    const { data, error: insertError } = await supabase
      .from('custom_notifications')
      .insert([
        {
          user_id: userId,
          label: form.label,
          datetime: form.datetime,
          recurrence: form.recurrence,
        },
      ])
      .select();
    if (insertError) {
      setError('Error adding notification');
      return;
    }
    setCustomNotifications((prev) => [...prev, ...(data || [])]);
    setShowAdd(false);
    setForm({ label: '', datetime: '', recurrence: 'none' });
    showToast('Custom notification scheduled! You\'ll be prompted at the set time.');
  };

  // Delete a custom notification
  const handleDelete = async (id) => {
    setError('');
    const { error: deleteError } = await supabase
      .from('custom_notifications')
      .delete()
      .eq('id', id);
    if (deleteError) {
      setError('Error deleting notification');
      return;
    }
    setCustomNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  // Special check-in submit handler
  const handleSpecialCheckin = async () => {
    setSpecialError('');
    setSpecialSuccess('');
    if (!specialMood) {
      setSpecialError('Please select a mood.');
      return;
    }
    // Prevent check-in for future times
    if (!isPastOrNow(showSpecialCheckin.datetime)) {
      setSpecialError('Cannot check in for a future time.');
      return;
    }
    const payload = {
      user_id: userId,
      mood: specialMood,
      time_of_day: showSpecialCheckin.label || showSpecialCheckin.datetime,
      logged_at: new Date().toISOString(),
      type: 'special',
    };
    const { error: insertError } = await supabase.from('mood_logs').insert([payload]);
    if (insertError) {
      setSpecialError('Error saving special check-in.');
      return;
    }
    setSpecialSuccess('Special check-in saved!');
    if (onSpecialCheckin) onSpecialCheckin();
    setTimeout(() => {
      setShowSpecialCheckin(null);
      setSpecialSuccess('');
      setMissedIndex((i) => i + 1);
    }, 1200);
  };

  // Helper to show toast
  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }

  const handleTestNotification = async () => {
    setTestMsg('');
    console.log('Current Notification permission:', Notification.permission);
    if (!('Notification' in window)) {
      setTestMsg('Notifications are not supported in this browser.');
      return;
    }
    if (Notification.permission === 'default') {
      try {
        const perm = await Notification.requestPermission();
        console.log('Permission request result:', perm);
        if (perm !== 'granted') {
          setTestMsg('Notification permission denied.');
          return;
        }
      } catch (err) {
        console.error('Error requesting notification permission:', err);
        setTestMsg('Error requesting notification permission.');
        return;
      }
    } else if (Notification.permission !== 'granted') {
      setTestMsg('Notification permission denied.');
      return;
    }
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isHttps = window.location.protocol === 'https:';
    if (!isLocalhost && !isHttps) {
      console.warn('Notifications may not work unless served over HTTPS or localhost.');
    }
    setTestMsg('Notification will pop up in 10 seconds...');
    setTimeout(() => {
      try {
        const notif = new Notification('DayTune Test Notification', {
          body: 'This is a test notification!',
          icon: '/favicon.ico',
        });
        showToast('Test notification created!');
        notif.onclick = () => {
          window.focus();
          showToast('Notification clicked!');
        };
      } catch (err) {
        console.error('Error showing notification:', err);
        setTestMsg('Error showing notification.');
      }
    }, 10000);
  };

  return (
    <div className="card w-full max-w-lg mx-auto flex flex-col gap-6 mt-12 items-center">
      <h2 className="text-2xl font-bold mb-1 text-center">Notifications</h2>
      <div className="text-xs text-gray-500 mb-2 text-center">Browser notifications will pop up at the scheduled time as long as your browser is open and you have granted notification permission.<br /><b>If the app is not open, the check-in modal will not appear.</b></div>
      <div className="flex flex-col sm:flex-row gap-3 w-full justify-center mb-2">
        <button className="bg-purple-500 text-white" onClick={handleTestNotification} disabled={loading || !userId}>
          Test Notification
        </button>
        <button className="bg-blue-100 text-blue-700" onClick={onBack} disabled={loading || !userId}>
          Back to Dashboard
        </button>
      </div>
      {testMsg && <div className="text-xs text-blue-700 mb-2">{testMsg}</div>}
      <div className="w-full mb-4">
        <h3 className="font-semibold mb-2">Default Notifications</h3>
        <p className="text-gray-600 text-sm mb-2">Reminders for mood check-ins at the start of each selected bucket.</p>
        <div className="flex flex-wrap gap-3 mt-3 mb-6">
          {moodBuckets && moodBuckets.map((bucket) => (
            <span
              key={bucket}
              className="bg-blue-50 text-[var(--primary)] px-3 py-1 rounded-full text-sm font-medium shadow-sm border border-blue-100 cursor-help transition hover:bg-blue-100 focus:bg-blue-100"
              title={`${BUCKET_LABELS[bucket] || bucket}: ${BUCKET_TIME_LABELS[bucket] || ''}`}
              aria-label={`${BUCKET_LABELS[bucket] || bucket}: ${BUCKET_TIME_LABELS[bucket] || ''}`}
              tabIndex={0}
            >
              {BUCKET_LABELS[bucket] || bucket}
            </span>
          ))}
        </div>
      </div>
      <div className="w-full mb-4">
        <h3 className="font-semibold mb-2">Custom Notifications</h3>
        <button className="mb-2 bg-green-500 text-white" onClick={() => setShowAdd((v) => !v)} disabled={loading || !userId}>
          {showAdd ? 'Cancel' : 'Add Custom Notification'}
        </button>
        {showAdd && (
          <div className="flex flex-col gap-2 mb-2 bg-blue-50 rounded-lg p-3">
            <input
              className="border px-2 py-1 rounded"
              placeholder="Label (optional)"
              value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              disabled={loading || !userId}
            />
            <input
              className="border px-2 py-1 rounded"
              type="datetime-local"
              value={form.datetime}
              onChange={e => setForm(f => ({ ...f, datetime: e.target.value }))}
              disabled={loading || !userId}
            />
            <select
              className="border px-2 py-1 rounded"
              value={form.recurrence}
              onChange={e => setForm(f => ({ ...f, recurrence: e.target.value }))}
              disabled={loading || !userId}
            >
              <option value="none">One-time</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
            <button className="bg-blue-500 text-white" onClick={handleAdd} disabled={loading || !userId}>
              Save
            </button>
            {error && <div className="text-red-500 text-xs mt-1">{error}</div>}
            <div className="text-xs text-gray-500 mt-1">You'll be prompted to check in at the time you set. To test, set a time a minute or two in the past or near future!</div>
          </div>
        )}
        {loading ? (
          <div className="text-gray-400">Loading...</div>
        ) : (
          <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
            {customNotifications.length === 0 && <div className="text-gray-400 italic py-4">No custom notifications yet. 🌱</div>}
            {customNotifications.map((n) => (
              <div key={n.id} className="flex items-center justify-between bg-white border rounded-lg px-3 py-2 shadow-sm">
                <div>
                  <div className="font-semibold">{n.label || 'Custom Check-In'}</div>
                  <div className="text-xs text-gray-500">{n.datetime} {n.recurrence !== 'none' && `(${n.recurrence})`}</div>
                </div>
                <button className="text-red-500 text-xs font-bold" onClick={() => handleDelete(n.id)}>Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="text-xs text-gray-400 text-center mt-2">Custom notifications help you tune your day your way. ✨</div>
      {/* Special Check-In Modal */}
      {showSpecialCheckin && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-6 max-w-xs w-full border border-blue-100">
            <h3 className="text-xl font-bold mb-1 text-center">Special Check-In</h3>
            <div className="text-sm text-gray-700 mb-2 text-center">{showSpecialCheckin.label || showSpecialCheckin.datetime}</div>
            <div className="flex flex-wrap gap-3 justify-center w-full">
              {MOODS.map((mood) => (
                <button
                  key={mood.key}
                  type="button"
                  className={`text-3xl px-3 py-2 rounded-full border-2 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all duration-150 ${specialMood === mood.key ? 'border-blue-500 bg-blue-50 scale-110' : 'border-gray-200 bg-white hover:bg-blue-50'}`}
                  onClick={() => setSpecialMood(mood.key)}
                  disabled={loading || !userId}
                  aria-label={mood.label}
                >
                  <span role="img" aria-label={mood.label}>{mood.emoji}</span>
                </button>
              ))}
            </div>
            <button
              className="bg-blue-500 text-white w-full py-3 rounded-full font-semibold text-lg shadow-sm hover:bg-blue-600 transition"
              onClick={handleSpecialCheckin}
              disabled={!specialMood || loading || !userId}
            >
              Submit Mood
            </button>
            {specialError && <div className="text-red-500 text-xs mt-1 text-center">{specialError}</div>}
            {specialSuccess && <div className="text-[var(--accent)] text-xs mt-1 text-center">{specialSuccess}</div>}
            <button className="text-gray-500 text-xs mt-2 underline" onClick={() => setShowSpecialCheckin(null)} disabled={loading || !userId}>Cancel</button>
          </div>
        </div>
      )}
      {toast && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-[var(--accent)] text-white px-4 py-2 rounded shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
} 