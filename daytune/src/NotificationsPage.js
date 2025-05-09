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

export default function NotificationsPage({ userId, onBack, moodBuckets, onSpecialCheckin }) {
  const [customNotifications, setCustomNotifications] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    label: '',
    datetime: '',
    recurrence: 'none',
  });
  const [loading, setLoading] = useState(true);
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
      setLoading(true);
      setError('');
      const { data, error } = await supabase
        .from('custom_notifications')
        .select('*')
        .eq('user_id', userId)
        .order('datetime', { ascending: true });
      if (error) setError('Error loading notifications');
      setCustomNotifications(data || []);
      setLoading(false);
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
          console.log('Custom notification created!');
          notif.onclick = () => {
            window.focus();
            showToast('Custom notification clicked!');
            console.log('Custom notification clicked!');
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
        console.log('Notification created!');
        notif.onclick = () => {
          window.focus();
          showToast('Notification clicked!');
          console.log('Notification clicked!');
        };
      } catch (err) {
        console.error('Error showing notification:', err);
        setTestMsg('Error showing notification.');
      }
    }, 10000);
  };

  return (
    <div className="bg-white border rounded p-6 shadow w-full max-w-md mx-auto flex flex-col gap-4 items-center">
      <h2 className="text-xl font-bold mb-2">Notifications</h2>
      <div className="text-xs text-gray-500 mb-2">Browser notifications will pop up at the scheduled time as long as your browser is open and you have granted notification permission. <b>If the app is not open, the check-in modal will not appear.</b></div>
      <button className="mb-2 px-4 py-2 bg-purple-500 text-white rounded" onClick={handleTestNotification}>
        Test Notification
      </button>
      {testMsg && <div className="text-xs text-blue-700 mb-2">{testMsg}</div>}
      <button className="mb-4 px-4 py-2 bg-blue-500 text-white rounded" onClick={onBack}>
        Back to Dashboard
      </button>
      <div className="w-full mb-4">
        <h3 className="font-semibold mb-2">Default Notifications</h3>
        <p className="text-gray-600 text-sm mb-2">Reminders for mood check-ins at the start of each selected bucket.</p>
        {/* TODO: Add toggles for each bucket */}
        {moodBuckets && moodBuckets.map((bucket) => (
          <div key={bucket} className="flex items-center gap-2 mb-1">
            <input type="checkbox" checked readOnly />
            <span>{bucket}</span>
          </div>
        ))}
      </div>
      <div className="w-full mb-4">
        <h3 className="font-semibold mb-2">Custom Notifications</h3>
        <button className="mb-2 px-3 py-1 bg-green-500 text-white rounded" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? 'Cancel' : 'Add Custom Notification'}
        </button>
        {showAdd && (
          <div className="flex flex-col gap-2 mb-2">
            <input
              className="border px-2 py-1 rounded"
              placeholder="Label (optional)"
              value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            />
            <input
              className="border px-2 py-1 rounded"
              type="datetime-local"
              value={form.datetime}
              onChange={e => setForm(f => ({ ...f, datetime: e.target.value }))}
            />
            <select
              className="border px-2 py-1 rounded"
              value={form.recurrence}
              onChange={e => setForm(f => ({ ...f, recurrence: e.target.value }))}
            >
              <option value="none">One-time</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
            <button className="px-3 py-1 bg-blue-500 text-white rounded" onClick={handleAdd}>
              Save
            </button>
            {error && <div className="text-red-500 text-xs mt-1">{error}</div>}
          </div>
        )}
        {loading ? (
          <div className="text-gray-400">Loading...</div>
        ) : (
          <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
            {customNotifications.length === 0 && <div className="text-gray-400">No custom notifications yet.</div>}
            {customNotifications.map((n) => (
              <div key={n.id} className="flex items-center justify-between border rounded px-2 py-1">
                <div>
                  <div className="font-semibold">{n.label || 'Custom Check-In'}</div>
                  <div className="text-xs text-gray-500">{n.datetime} {n.recurrence !== 'none' && `(${n.recurrence})`}</div>
                </div>
                <button className="text-red-500 text-xs" onClick={() => handleDelete(n.id)}>Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Special Check-In Modal */}
      {showSpecialCheckin && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow-lg p-6 flex flex-col items-center gap-4 max-w-xs w-full">
            <h3 className="text-lg font-bold">Special Check-In</h3>
            <div className="text-sm text-gray-700 mb-2">{showSpecialCheckin.label || showSpecialCheckin.datetime}</div>
            <div className="flex flex-wrap gap-2 justify-center">
              {MOODS.map((mood) => (
                <button
                  key={mood.key}
                  type="button"
                  className={`text-2xl px-2 py-1 rounded border-2 ${specialMood === mood.key ? 'border-blue-500 bg-blue-100' : 'border-gray-200 bg-white'}`}
                  onClick={() => setSpecialMood(mood.key)}
                >
                  <span role="img" aria-label={mood.label}>{mood.emoji}</span>
                </button>
              ))}
            </div>
            <button
              className="bg-blue-500 text-white px-4 py-2 rounded mt-2 w-full"
              onClick={handleSpecialCheckin}
              disabled={!specialMood}
            >
              Submit Mood
            </button>
            {specialError && <div className="text-red-500 text-xs mt-1">{specialError}</div>}
            {specialSuccess && <div className="text-green-600 text-xs mt-1">{specialSuccess}</div>}
            <button className="text-gray-500 text-xs mt-2" onClick={() => setShowSpecialCheckin(null)}>Cancel</button>
          </div>
        </div>
      )}
      {toast && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
} 