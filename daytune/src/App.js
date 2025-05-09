import { useEffect, useState, useRef } from 'react';
import Auth from './Auth';
import { supabase } from './supabaseClient';
import MoodSettings from './MoodSettings';
import MoodCheckin from './MoodCheckin';
import NotificationsPage from './NotificationsPage';
import './App.css';

const TAGS = ['Fixed', 'Flexible', 'Movable'];
const BUCKETS = [
  'early_morning',
  'morning',
  'afternoon',
  'early_evening',
  'evening',
  'night',
  'early_am',
  'just_before_sunrise',
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

// Helper: get time range label for a bucket
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

function getCurrentBucket(buckets) {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const time = hour * 60 + minute;
  // Define bucket ranges in minutes since midnight
  const ranges = {
    early_morning: [360, 539], // 6:00–8:59am
    morning: [540, 719], // 9:00–11:59am
    afternoon: [720, 899], // 12:00–2:59pm
    early_evening: [900, 1079], // 3:00–5:59pm
    evening: [1080, 1259], // 6:00–8:59pm
    night: [1260, 1439], // 9:00–11:59pm
    early_am: [0, 179], // 12:00–2:59am
    just_before_sunrise: [180, 359], // 3:00–5:59am
  };
  for (const bucket of buckets) {
    const [start, end] = ranges[bucket];
    if (time >= start && time <= end) return bucket;
  }
  return null;
}

function scheduleNotification(bucket, label, minutesFromMidnight) {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  let delay = (minutesFromMidnight - nowMinutes) * 60 * 1000;
  if (delay < 0) delay += 24 * 60 * 60 * 1000; // schedule for next day if time has passed
  return setTimeout(() => {
    if (Notification.permission === 'granted') {
      new Notification(`DayTune: Mood Check-In Reminder`, {
        body: `It's time for your ${label} mood check-in!`,
        icon: '/favicon.ico',
      });
    }
  }, delay);
}

function App() {
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [form, setForm] = useState({
    title: '',
    datetime: '',
    duration: '',
    tag: 'Flexible',
    difficulty: 3,
  });
  const [adding, setAdding] = useState(false);
  const [userReady, setUserReady] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [moodBuckets, setMoodBuckets] = useState(null);
  const [showMoodPrompt, setShowMoodPrompt] = useState(false);
  const [moodLogs, setMoodLogs] = useState([]);
  const [refreshMoods, setRefreshMoods] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const notificationTimeouts = useRef([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [pendingDefaultCheckin, setPendingDefaultCheckin] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        try {
          const { data: userData, error } = await supabase
            .from('users')
            .upsert([{ id: session.user.id, email: session.user.email }], { onConflict: 'id' })
            .select();
          if (error || !userData || !userData[0]) {
            // User not found or error, treat as signed out
            setSession(null);
            setUserReady(false);
            setMoodBuckets(null);
          } else {
            const buckets = userData[0]?.mood_buckets;
            setMoodBuckets(buckets);
            setUserReady(true);
          }
        } catch (e) {
          setSession(null);
          setUserReady(false);
          setMoodBuckets(null);
        }
      } else {
        setUserReady(false);
        setMoodBuckets(null);
      }
      setLoadingSession(false); // Always set this at the end!
    });
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session?.user) {
        try {
          const { data: userData, error } = await supabase
            .from('users')
            .upsert([{ id: session.user.id, email: session.user.email }], { onConflict: 'id' })
            .select();
          if (error || !userData || !userData[0]) {
            setSession(null);
            setUserReady(false);
            setMoodBuckets(null);
          } else {
            const buckets = userData[0]?.mood_buckets;
            setMoodBuckets(buckets);
            setUserReady(true);
          }
        } catch (e) {
          setSession(null);
          setUserReady(false);
          setMoodBuckets(null);
        }
      } else {
        setUserReady(false);
        setMoodBuckets(null);
      }
      setLoadingSession(false); // Always set this!
    });
    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // Fetch tasks for the logged-in user only when userReady is true
  useEffect(() => {
    if (!session || !session.user || !userReady) return;
    const fetchTasks = async () => {
      setLoadingTasks(true);
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', session.user.id)
        .order('datetime', { ascending: true });
      if (!error) setTasks(data);
      setLoadingTasks(false);
    };
    fetchTasks();
  }, [session, userReady]);

  // Fetch today's mood logs for the user
  useEffect(() => {
    if (!session || !session.user || !userReady || !moodBuckets) return;
    const today = new Date().toISOString().slice(0, 10);
    const fetchMoods = async () => {
      const { data } = await supabase
        .from('mood_logs')
        .select('*')
        .eq('user_id', session.user.id)
        .gte('logged_at', today + 'T00:00:00.000Z')
        .lte('logged_at', today + 'T23:59:59.999Z');
      setMoodLogs(data || []);
    };
    fetchMoods();
  }, [session, userReady, moodBuckets, refreshMoods]);

  // Prompt for mood check-in if in a selected bucket and not checked in yet
  useEffect(() => {
    if (!session || !session.user || !userReady || !moodBuckets) return;
    const currentBucket = getCurrentBucket(moodBuckets);
    if (!currentBucket) return;
    const today = new Date().toISOString().slice(0, 10);
    const alreadyChecked = moodLogs.some(
      (log) => log.time_of_day === currentBucket && log.logged_at.startsWith(today)
    );
    if (!alreadyChecked) setShowMoodPrompt(true);
    else setShowMoodPrompt(false);
  }, [session, userReady, moodBuckets, moodLogs]);

  // Notification logic
  useEffect(() => {
    notificationTimeouts.current.forEach(clearTimeout);
    notificationTimeouts.current = [];
    if (!notificationsEnabled || !moodBuckets || !session?.user) return;
    const today = new Date().toISOString().slice(0, 10);
    moodBuckets.forEach((bucket) => {
      const [start] = BUCKET_RANGES[bucket];
      const alreadyChecked = moodLogs.some(
        (log) => log.time_of_day === bucket && log.logged_at.startsWith(today)
      );
      if (!alreadyChecked) {
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        let delay = (start - nowMinutes) * 60 * 1000;
        if (delay < 0) delay += 24 * 60 * 60 * 1000;
        const timeout = setTimeout(() => {
          setPendingDefaultCheckin(bucket);
        }, delay);
        notificationTimeouts.current.push(timeout);
      }
    });
    return () => {
      notificationTimeouts.current.forEach(clearTimeout);
      notificationTimeouts.current = [];
    };
  }, [notificationsEnabled, moodBuckets, moodLogs, session]);

  const user = session?.user;
  const displayName = user?.user_metadata?.name || user?.email || 'User';

  // Handle form input
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  // Add a new task
  const handleAddTask = async (e) => {
    e.preventDefault();
    setAdding(true);
    const { title, datetime, duration, tag, difficulty } = form;
    if (!title || !datetime || !duration) {
      setAdding(false);
      return;
    }
    const { error } = await supabase.from('tasks').insert([
      {
        user_id: user.id,
        title,
        datetime,
        duration_minutes: parseInt(duration, 10),
        tag,
        difficulty: parseInt(difficulty, 10),
      },
    ]);
    if (!error) {
      setForm({ title: '', datetime: '', duration: '', tag: 'Flexible', difficulty: 3 });
      // Refresh tasks
      setLoadingTasks(true);
      const { data } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', user.id)
        .order('datetime', { ascending: true });
      setTasks(data);
      setLoadingTasks(false);
    }
    setAdding(false);
  };

  if (loadingSession) {
    return <div>Loading...</div>;
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Auth />
      </div>
    );
  }

  // Show MoodSettings if moodBuckets is missing or user clicks Settings
  if (!moodBuckets || showSettings) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <MoodSettings
          userId={user.id}
          initialBuckets={moodBuckets}
          onSave={(buckets) => {
            setMoodBuckets(buckets);
            setShowSettings(false);
          }}
          onCancel={() => setShowSettings(false)}
        />
      </div>
    );
  }

  // Show MoodCheckin prompt if needed (from notification or normal logic)
  if (showMoodPrompt || pendingDefaultCheckin) {
    const currentBucket = pendingDefaultCheckin || getCurrentBucket(moodBuckets);
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <MoodCheckin
          userId={user.id}
          availableBuckets={moodBuckets}
          currentBucket={currentBucket}
          onCheckin={() => {
            setShowMoodPrompt(false);
            setPendingDefaultCheckin(null);
            setRefreshMoods((v) => !v);
          }}
        />
      </div>
    );
  }

  // Helper: get today's mood for a bucket
  const getMoodForBucket = (bucket) => {
    const today = new Date().toISOString().slice(0, 10);
    const log = moodLogs.find(
      (l) => l.time_of_day === bucket && l.logged_at.startsWith(today)
    );
    return log ? log.mood : null;
  };

  if (showNotifications) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <NotificationsPage
          userId={user.id}
          onBack={() => setShowNotifications(false)}
          moodBuckets={moodBuckets}
          onSpecialCheckin={() => setRefreshMoods((v) => !v)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-6">
      <h1 className="text-2xl font-bold">Welcome, {displayName}!</h1>
      <p className="text-gray-600">You are logged in as <span className="font-mono">{user.email}</span></p>
      <button
        className="bg-gray-300 text-gray-800 px-4 py-2 rounded mb-2"
        onClick={() => setShowSettings(true)}
      >
        Settings
      </button>
      <button
        className={`px-4 py-2 rounded mb-2 ${notificationsEnabled ? 'bg-green-500 text-white' : 'bg-blue-500 text-white'}`}
        onClick={async () => {
          if (Notification.permission === 'granted') {
            setNotificationsEnabled((v) => !v);
          } else if (Notification.permission !== 'denied') {
            const perm = await Notification.requestPermission();
            if (perm === 'granted') setNotificationsEnabled(true);
          }
        }}
      >
        {notificationsEnabled ? 'Disable Notifications' : 'Enable Notifications'}
      </button>
      <button
        className="px-4 py-2 rounded mb-2 bg-blue-500 text-white"
        onClick={() => setShowNotifications(true)}
      >
        Notifications
      </button>
      <div className="bg-white border rounded p-4 shadow mt-4 w-full max-w-md text-center">
        <h2 className="text-lg font-semibold mb-2">Today's Mood Check-Ins</h2>
        <ul className="divide-y">
          {moodBuckets.map((bucket) => (
            <li key={bucket} className="py-2 flex items-center justify-between">
              <span>{BUCKET_LABELS[bucket] || bucket} <span className="text-xs text-gray-500">({BUCKET_TIME_LABELS[bucket]})</span></span>
              {getMoodForBucket(bucket) ? (
                <span className="text-2xl">{getMoodForBucket(bucket) && {
                  happy: '😃', neutral: '😐', tired: '😴', sad: '😔', angry: '😠', anxious: '😰', motivated: '🤩', confused: '😕', calm: '🧘',
                }[getMoodForBucket(bucket)]}</span>
              ) : (
                <button
                  className="text-blue-500 underline text-sm"
                  onClick={() => setShowMoodPrompt(true)}
                >
                  Check in
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
      {/* Special Check-Ins Section */}
      <div className="bg-white border-2 border-blue-300 rounded-lg p-4 shadow mt-4 w-full max-w-md text-center">
        <h2 className="text-lg font-semibold mb-2">Special Check-Ins</h2>
        <div style={{ height: '120px', overflowY: 'auto', background: '#e0f2fe', border: '2px solid #60a5fa', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '0.5rem' }}>
          {moodLogs.filter(l => l.type === 'special' && l.logged_at.startsWith(new Date().toISOString().slice(0, 10))).length === 0 && (
            <div className="text-gray-400">No special check-ins yet.</div>
          )}
          {moodLogs.filter(l => l.type === 'special' && l.logged_at.startsWith(new Date().toISOString().slice(0, 10))).map((log) => (
            <div key={log.id} className="flex items-center justify-between border rounded px-3 py-2 bg-white shadow-sm mb-2">
              <div className="text-left">
                <div className="font-semibold">{log.time_of_day}</div>
                <div className="text-xs text-gray-500">{new Date(log.logged_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</div>
              </div>
              <span className="text-2xl">{{
                happy: '😃', neutral: '😐', tired: '😴', sad: '😔', angry: '😠', anxious: '😰', motivated: '🤩', confused: '😕', calm: '🧘',
              }[log.mood] || log.mood}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white border rounded p-4 shadow mt-4 w-full max-w-md text-center">
        <p className="text-gray-500 mb-2">Add a new task:</p>
        <form className="flex flex-col gap-2" onSubmit={handleAddTask}>
          <input
            className="border px-2 py-1 rounded"
            name="title"
            placeholder="Task title"
            value={form.title}
            onChange={handleChange}
            required
          />
          <input
            className="border px-2 py-1 rounded"
            name="datetime"
            type="datetime-local"
            value={form.datetime}
            onChange={handleChange}
            required
          />
          <input
            className="border px-2 py-1 rounded"
            name="duration"
            type="number"
            min="1"
            placeholder="Duration (minutes)"
            value={form.duration}
            onChange={handleChange}
            required
          />
          <select
            className="border px-2 py-1 rounded"
            name="tag"
            value={form.tag}
            onChange={handleChange}
          >
            {TAGS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 justify-center">
            Difficulty:
            <input
              className="border px-2 py-1 rounded w-16"
              name="difficulty"
              type="number"
              min="1"
              max="5"
              value={form.difficulty}
              onChange={handleChange}
            />
          </label>
          <button
            className="bg-blue-500 text-white px-4 py-2 rounded mt-2"
            type="submit"
            disabled={adding}
          >
            {adding ? 'Adding...' : 'Add Task'}
          </button>
        </form>
      </div>
      <div className="bg-white border rounded p-4 shadow w-full max-w-md mt-4">
        <h2 className="text-lg font-semibold mb-2">Your Tasks</h2>
        {loadingTasks && <p>Loading tasks...</p>}
        {!loadingTasks && tasks.length === 0 && (
          <p className="text-gray-400">No tasks yet. Add one above!</p>
        )}
        {!loadingTasks && tasks.length > 0 && (
          <ul className="divide-y">
            {tasks.map((task) => (
              <li key={task.id} className="py-2 flex flex-col items-start">
                <span className="font-semibold">{task.title}</span>
                <span className="text-xs text-gray-500">
                  {task.datetime ? new Date(task.datetime).toLocaleString() : ''} • {task.duration_minutes} min • {task.tag} • Difficulty: {task.difficulty}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button
        className="bg-red-500 text-white px-4 py-2 rounded mt-6"
        onClick={async () => {
          await supabase.auth.signOut();
        }}
      >
        Sign Out
      </button>
    </div>
  );
}

export default App;
