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
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [showMoodPrompt, setShowMoodPrompt] = useState(false);
  const [moodLogs, setMoodLogs] = useState([]);
  const [refreshMoods, setRefreshMoods] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const notificationTimeouts = useRef([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [pendingDefaultCheckin, setPendingDefaultCheckin] = useState(null);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', datetime: '', duration: '', tag: 'Flexible', difficulty: 3 });

  // Minimal Supabase test
  useEffect(() => {
    async function testSupabase() {
      const { data, error } = await supabase.from('tasks').select('*').limit(1);
      console.log('Supabase test from useEffect:', { data, error });
    }
    testSupabase();
  }, []);

  useEffect(() => {
    let isMounted = true;
    let timeoutId;
    async function checkSession() {
      let timedOut = false;
      timeoutId = setTimeout(() => {
        timedOut = true;
        if (isMounted) {
          setLoadingSession(false);
          console.error('[Session] Timed out waiting for session check.');
        }
      }, 5000); // 5 seconds
      try {
        console.log('[Session] About to call supabase.auth.getSession()');
        const { data: { session } } = await supabase.auth.getSession();
        console.log('[Session] getSession resolved:', session);
        if (timedOut || !isMounted) return;
        setSession(session);
        if (session?.user) {
          try {
            console.log('[Session] About to upsert/select user');
            const { data: userData, error } = await supabase
              .from('users')
              .upsert([{ id: session.user.id, email: session.user.email }], { onConflict: 'id' })
              .select();
            console.log('[Session] User upsert/select resolved:', userData, error);
            if (error || !userData || !userData[0]) {
              console.error('[Session] User upsert error or no userData:', error, userData);
              await supabase.auth.signOut();
              setSession(null);
              setUserReady(false);
              setMoodBuckets(null);
              setNeedsOnboarding(false);
            } else {
              const buckets = userData[0]?.mood_buckets;
              setMoodBuckets(buckets);
              setUserReady(true);
              if (!buckets || buckets.length === 0) {
                setNeedsOnboarding(true);
              } else {
                setNeedsOnboarding(false);
              }
            }
          } catch (e) {
            console.error('[Session] Exception in user upsert:', e);
            await supabase.auth.signOut();
            setSession(null);
            setUserReady(false);
            setMoodBuckets(null);
            setNeedsOnboarding(false);
          }
        } else {
          setUserReady(false);
          setMoodBuckets(null);
          setNeedsOnboarding(false);
        }
      } catch (e) {
        console.error('[Session] Exception in getSession:', e);
        setSession(null);
        setUserReady(false);
        setMoodBuckets(null);
        setNeedsOnboarding(false);
      } finally {
        clearTimeout(timeoutId);
        if (isMounted) {
          setLoadingSession(false);
          console.log('[Session] Loading session set to false (finally)');
        }
      }
    }
    checkSession();
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      console.log('[Session] onAuthStateChange event:', _event, session);
      if (session?.user) {
        try {
          const { data: userData, error } = await supabase
            .from('users')
            .upsert([{ id: session.user.id, email: session.user.email }], { onConflict: 'id' })
            .select();
          if (error || !userData || !userData[0]) {
            console.error('[Session] User upsert error or no userData (onAuthStateChange):', error, userData);
            // Force sign out and clear session
            await supabase.auth.signOut();
            setSession(null);
            setUserReady(false);
            setMoodBuckets(null);
            setNeedsOnboarding(false);
          } else {
            const buckets = userData[0]?.mood_buckets;
            setMoodBuckets(buckets);
            setUserReady(true);
            // Onboarding logic
            if (!buckets || buckets.length === 0) {
              setNeedsOnboarding(true);
            } else {
              setNeedsOnboarding(false);
            }
          }
        } catch (e) {
          console.error('[Session] Exception in user upsert (onAuthStateChange):', e);
          // Force sign out and clear session
          await supabase.auth.signOut();
          setSession(null);
          setUserReady(false);
          setMoodBuckets(null);
          setNeedsOnboarding(false);
        }
      } else {
        setUserReady(false);
        setMoodBuckets(null);
        setNeedsOnboarding(false);
      }
      setLoadingSession(false);
      console.log('[Session] Loading session set to false (onAuthStateChange)');
    });
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      listener.subscription.unsubscribe();
    };
  }, []);

  // Fetch tasks for the logged-in user only when userReady is true
  useEffect(() => {
    if (!session || !session.user || !userReady) return;
    let intervalId;
    const fetchTasks = async () => {
      // Auto-delete tasks whose end time is more than 8 hours ago (production)
      const now = new Date();
      const { data: allTasks } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', session.user.id);
      if (allTasks && allTasks.length > 0) {
        for (const task of allTasks) {
          if (task.datetime && task.duration_minutes) {
            const end = new Date(new Date(task.datetime).getTime() + task.duration_minutes * 60000);
            if (now - end > 8 * 60 * 60 * 1000) { // 8 hours after end time
              await supabase.from('tasks').delete().eq('id', task.id);
            }
          }
        }
      }
      // Fetch remaining tasks
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
    // Poll every 30 seconds for dynamic updates
    intervalId = setInterval(fetchTasks, 30000);
    return () => clearInterval(intervalId);
  }, [session, userReady]);

  // Fetch today's mood logs for the user
  useEffect(() => {
    if (!session || !session.user || !userReady || !moodBuckets) return;
    const today = new Date().toISOString().slice(0, 10);
    const fetchMoods = async () => {
      // Auto-delete special check-ins older than 8 hours
      // const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
      const eightHoursAgo = new Date(Date.now() - 1 * 60 * 1000).toISOString();

      await supabase
        .from('mood_logs')
        .delete()
        .eq('user_id', session.user.id)
        .eq('type', 'special')
        .lt('logged_at', eightHoursAgo);
      // Fetch mood logs for today
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

  // Edit a task
  const handleEditTask = (task) => {
    setEditingTaskId(task.id);
    setEditForm({
      title: task.title,
      datetime: task.datetime ? task.datetime.slice(0, 16) : '',
      duration: task.duration_minutes,
      tag: task.tag,
      difficulty: task.difficulty,
    });
  };

  const handleEditFormChange = (e) => {
    const { name, value } = e.target;
    setEditForm((f) => ({ ...f, [name]: value }));
  };

  const handleSaveEdit = async (taskId) => {
    const { title, datetime, duration, tag, difficulty } = editForm;
    const { error } = await supabase.from('tasks').update({
      title,
      datetime,
      duration_minutes: parseInt(duration, 10),
      tag,
      difficulty: parseInt(difficulty, 10),
    }).eq('id', taskId);
    if (!error) {
      setEditingTaskId(null);
      setEditForm({ title: '', datetime: '', duration: '', tag: 'Flexible', difficulty: 3 });
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
  };

  const handleCancelEdit = () => {
    setEditingTaskId(null);
    setEditForm({ title: '', datetime: '', duration: '', tag: 'Flexible', difficulty: 3 });
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    const { error } = await supabase.from('tasks').delete().eq('id', taskId);
    if (!error) {
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
  };

  if (loadingSession) {
    return <div className="min-h-screen flex items-center justify-center"><div>Loading...</div></div>;
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Auth />
      </div>
    );
  }

  // Onboarding: Only show MoodSettings if onboarding is needed
  if (needsOnboarding) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <MoodSettings
          userId={session.user.id}
          initialBuckets={moodBuckets}
          onSave={(buckets) => {
            setMoodBuckets(buckets);
            setNeedsOnboarding(false);
          }}
          onCancel={() => {
            // Optionally, allow sign out if onboarding is cancelled
            supabase.auth.signOut();
            setSession(null);
            setNeedsOnboarding(false);
          }}
        />
      </div>
    );
  }

  // Show MoodSettings only if user explicitly clicks Settings from dashboard
  if (showSettings) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <MoodSettings
          userId={session.user.id}
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
          {(moodBuckets || []).map((bucket) => (
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
            disabled={adding || loadingSession || !session}
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
                {editingTaskId === task.id ? (
                  <form className="flex flex-col gap-2 w-full" onSubmit={e => { e.preventDefault(); handleSaveEdit(task.id); }}>
                    <input
                      className="border px-2 py-1 rounded"
                      name="title"
                      placeholder="Task title"
                      value={editForm.title}
                      onChange={handleEditFormChange}
                      required
                    />
                    <input
                      className="border px-2 py-1 rounded"
                      name="datetime"
                      type="datetime-local"
                      value={editForm.datetime}
                      onChange={handleEditFormChange}
                      required
                    />
                    <input
                      className="border px-2 py-1 rounded"
                      name="duration"
                      type="number"
                      min="1"
                      placeholder="Duration (minutes)"
                      value={editForm.duration}
                      onChange={handleEditFormChange}
                      required
                    />
                    <select
                      className="border px-2 py-1 rounded"
                      name="tag"
                      value={editForm.tag}
                      onChange={handleEditFormChange}
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
                        value={editForm.difficulty}
                        onChange={handleEditFormChange}
                      />
                    </label>
                    <div className="flex gap-2 mt-2">
                      <button className="bg-blue-500 text-white px-3 py-1 rounded" type="submit">Save</button>
                      <button className="bg-gray-300 text-gray-800 px-3 py-1 rounded" type="button" onClick={handleCancelEdit}>Cancel</button>
                    </div>
                  </form>
                ) : (
                  <>
                    <span className="font-semibold">{task.title}</span>
                    <span className="text-xs text-gray-500">
                      {task.datetime ? new Date(task.datetime).toLocaleString() : ''} • {task.duration_minutes} min • {task.tag} • Difficulty: {task.difficulty}
                    </span>
                    <div className="flex gap-2 mt-1">
                      <button className="text-blue-600 underline text-xs" onClick={() => handleEditTask(task)}>Edit</button>
                      <button className="text-red-600 underline text-xs" onClick={() => handleDeleteTask(task.id)}>Delete</button>
                    </div>
                  </>
                )}
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
