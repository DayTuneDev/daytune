import { useEffect, useState, useRef } from 'react';
import Auth from './Auth';
import { supabase } from './supabaseClient';
import MoodSettings from './MoodSettings';
import MoodCheckin from './MoodCheckin';
import NotificationsPage from './NotificationsPage';
import TaskForm from './components/TaskForm';
import TaskList from './components/TaskList';
import { scheduleTasks, handleTaskOverrun } from './services/scheduler';
import WeeklyCalendar from './components/WeeklyCalendar';
import Scheduler from './scheduling/core/Scheduler';
import TaskManager from './state/TaskManager';
import TaskPrioritizer from './scheduling/strategies/TaskPrioritizer';
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
  const ranges = BUCKET_RANGES;
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
  const [scheduledTasks, setScheduledTasks] = useState([]);
  const [impossibleTasks, setImpossibleTasks] = useState([]);
  const [scheduleSummary, setScheduleSummary] = useState(null);
  const [error, setError] = useState('');
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
  const schedulerRef = useRef(null);

  // Minimal Supabase test
  useEffect(() => {
    async function testSupabase() {
      const { data, error } = await supabase.from('tasks').select('*').limit(1);
      if (error) {
        setError('Could not connect to DayTune. Please refresh or try again later.');
      }
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
          // Don't reset session on timeout, just stop loading
        }
      }, 10000); // Increased to 10 seconds
      try {
        console.log('[Session] About to call supabase.auth.getSession()');
        const { data: { session }, error } = await supabase.auth.getSession();
        console.log('[Session] getSession resolved:', session);
        
        if (error) {
          console.error('[Session] Error getting session:', error);
          if (isMounted) {
            setSession(null);
            setUserReady(false);
          }
          return;
        }

        if (timedOut || !isMounted) return;
        
        if (!session) {
          if (isMounted) {
            setSession(null);
            setUserReady(false);
            setMoodBuckets(null);
            setNeedsOnboarding(false);
          }
          return;
        }

        setSession(session);
        
        if (session?.user) {
          try {
            console.log('[Session] About to upsert/select user');
            const { data: userData, error } = await supabase
              .from('users')
              .upsert([{ id: session.user.id, email: session.user.email }], { onConflict: 'id' })
              .select();
            
            if (error) {
              console.error('[Session] User upsert error:', error);
              if (isMounted) {
                setSession(null);
                setUserReady(false);
              }
              return;
            }

            if (!userData || !userData[0]) {
              console.error('[Session] No user data returned');
              if (isMounted) {
                setSession(null);
                setUserReady(false);
              }
              return;
            }

            const buckets = userData[0]?.mood_buckets;
            if (isMounted) {
              setMoodBuckets(buckets);
              setUserReady(true);
              setNeedsOnboarding(!buckets || buckets.length === 0);
            }
          } catch (e) {
            console.error('[Session] Exception in user upsert:', e);
            if (isMounted) {
              setSession(null);
              setUserReady(false);
            }
          }
        }
      } catch (e) {
        console.error('[Session] Exception in getSession:', e);
        if (isMounted) {
          setSession(null);
          setUserReady(false);
        }
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
      console.log('[Session] Auth state changed:', _event, session);
      if (isMounted) {
        setSession(session);
        if (!session) {
          setUserReady(false);
          setMoodBuckets(null);
          setNeedsOnboarding(false);
        }
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      listener?.subscription?.unsubscribe();
    };
  }, []);

  // Fetch tasks when session changes
  useEffect(() => {
    if (!session?.user) return;
    const fetchTasks = async () => {
      setLoadingTasks(true);
      try {
        const { data, error: fetchError } = await supabase
          .from('tasks')
          .select('*')
          .eq('user_id', session.user.id)
          .order('start_datetime', { ascending: true });
        if (fetchError) throw fetchError;
        setTasks(data || []);
        const { scheduledTasks, impossibleTasks, summary } = scheduleTasks(data || []);
        setScheduledTasks(scheduledTasks);
        setImpossibleTasks(impossibleTasks);
        setScheduleSummary(summary);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoadingTasks(false);
      }
    };
    fetchTasks();
  }, [session]);

  // Add a new task
  const handleTaskAdded = async () => {
    const { data, error: fetchError } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', session.user.id)
      .order('start_datetime', { ascending: true });
    if (fetchError) {
      setError(fetchError.message);
      return;
    }
    setTasks(data || []);
    const { scheduledTasks, impossibleTasks, summary } = scheduleTasks(data || []);
    setScheduledTasks(scheduledTasks);
    setImpossibleTasks(impossibleTasks);
    setScheduleSummary(summary);
  };
  const handleTaskUpdated = handleTaskAdded;
  const handleTaskDeleted = handleTaskAdded;

  const handleTaskOverrun = async (task, overrunMinutes) => {
    const { scheduledTasks: newScheduledTasks, impossibleTasks: newImpossibleTasks, summary } = 
      handleTaskOverrun(task, overrunMinutes, scheduledTasks);
    
    setScheduledTasks(newScheduledTasks);
    setImpossibleTasks(newImpossibleTasks);
    setScheduleSummary(summary);
  };

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

  // Scheduler setup
  useEffect(() => {
    if (!schedulerRef.current) {
      const taskManager = new TaskManager();
      schedulerRef.current = new Scheduler(taskManager);
      schedulerRef.current.registerStrategy('taskPrioritizer', new TaskPrioritizer());
    }
  }, []);

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
        .order('start_datetime', { ascending: true });
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
      datetime: task.start_datetime ? task.start_datetime.slice(0, 16) : '',
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
        .order('start_datetime', { ascending: true });
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
        .order('start_datetime', { ascending: true });
      setTasks(data);
      setLoadingTasks(false);
    }
  };

  const handleRetune = async () => {
    setLoadingTasks(true);
    try {
      // Fetch tasks as usual
      const { data, error: fetchError } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', session.user.id)
        .order('start_datetime', { ascending: true });
      if (fetchError) throw fetchError;
      setTasks(data || []);
      // No-op retune: just use the current tasks
      setScheduledTasks(data || []);
      setImpossibleTasks([]);
      setScheduleSummary(null);
    } catch (err) {
      setError(err.message);
    } finally {
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
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 flex flex-col items-center justify-center">
        {/* Top Bar */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-10 gap-4 w-full border-b border-blue-100 pb-4">
          <div className="flex items-center gap-3 mb-2 md:mb-0">
            <img src="/DayTune_logo.png" alt="DayTune Logo" className="h-9 w-9 rounded-lg shadow-sm transition-all duration-300" style={{ background: 'var(--background)' }} />
            <div>
              <h1 className="text-3xl font-bold mb-1">DayTune</h1>
              <div className="text-gray-600 mt-1">Welcome, <span className="font-semibold">{displayName}</span></div>
              <div className="text-gray-400 text-sm">You are logged in from {user?.email}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 justify-center w-full md:w-auto">
            <button className="bg-[var(--primary)] text-white px-4 py-2 rounded-full shadow-sm" onClick={() => setShowSettings(true)}>
              Settings
            </button>
            <button className={`px-4 py-2 rounded-full shadow-sm ${notificationsEnabled ? 'bg-[var(--accent)] text-white' : 'bg-[var(--primary)] text-white'}`} onClick={async () => {
              if (Notification.permission === 'granted') {
                setNotificationsEnabled((v) => !v);
              } else if (Notification.permission !== 'denied') {
                const perm = await Notification.requestPermission();
                if (perm === 'granted') setNotificationsEnabled(true);
              }
            }}>
              {notificationsEnabled ? 'Disable Notifications' : 'Enable Notifications'}
            </button>
            <button className="px-4 py-2 rounded-full shadow-sm bg-[var(--primary)] text-white" onClick={() => setShowNotifications(true)}>
              Notifications
            </button>
            <button className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-full shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500" onClick={() => supabase.auth.signOut()}>
              Sign Out
            </button>
          </div>
        </div>
        {/* Gentle microcopy at the top */}
        <div className="w-full max-w-2xl mb-6 text-left text-[var(--primary)] text-lg font-medium">Let's tune your day, {displayName.split(' ')[0] || 'friend'}! 🌱</div>
        {/* Mood Check-in Summary */}
        <div className="card w-full max-w-md mx-auto text-left">
          <h2 className="text-lg font-semibold mb-4">Today's Mood Check-Ins</h2>
          <ul className="space-y-4">
            {(moodBuckets || []).map((bucket) => (
              <li key={bucket}>
                <div className="grid grid-cols-[1fr_140px] items-center gap-4 w-full">
                  <span className="font-medium min-w-0 truncate">{BUCKET_LABELS[bucket] || bucket}</span>
                  {getMoodForBucket(bucket) ? (
                    <span className="text-2xl flex-shrink-0">{getMoodForBucket(bucket) && {
                      happy: '😃', neutral: '😐', tired: '😴', sad: '😔', angry: '😠', anxious: '😰', motivated: '🤩', confused: '😕', calm: '🧘',
                    }[getMoodForBucket(bucket)]}</span>
                  ) : (
                    <button className="bg-[var(--primary)] text-white px-6 py-1 rounded-full font-medium text-sm shadow-sm hover:bg-[var(--accent)] focus:bg-[var(--accent)] transition-all w-[120px] flex-shrink-0 justify-self-end" onClick={() => setShowMoodPrompt(true)}>
                      Check in
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
        {/* Special Check-Ins Section */}
        <div className="card w-full max-w-md mx-auto text-left border-blue-100">
          <h2 className="text-lg font-semibold mb-4">Special Check-Ins</h2>
          <div className="text-xs text-gray-500 mb-2">Special check-ins are for moments outside your usual routine. 🌱</div>
          <div style={{ height: '120px', overflowY: 'auto', background: '#e0f2fe', border: '2px solid #60a5fa', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '0.5rem' }}>
            {moodLogs.filter(l => l.type === 'special' && l.logged_at.startsWith(new Date().toISOString().slice(0, 10))).length === 0 && (
              <div className="text-[var(--accent)] italic py-6">No special check-ins yet. 🌱<br/>You can add one from the Notifications page or when prompted.</div>
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
          <div className="text-xs text-gray-400 mt-2">You can always add a special check-in from the Notifications page.</div>
        </div>
        {/* Task Management UI */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div>
            <div className="card text-left">
              <h2 className="text-xl font-semibold mb-4">Add New Task</h2>
              <div className="text-xs text-gray-500 mb-2">Add a task you'd like to tune into your day. Tasks can be flexible or fixed, important or easy—whatever fits your flow.</div>
              <TaskForm onTaskAdded={handleTaskAdded} userId={session.user.id} />
            </div>
          </div>
          <div>
            <div className="card text-left">
              <h2 className="text-xl font-semibold mb-4">Your Tasks</h2>
              <button className="mb-4 px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700 transition" onClick={handleRetune} disabled={loadingTasks}>
                {loadingTasks ? 'Retuning...' : 'Retune Schedule'}
              </button>
              <div className="text-xs text-gray-500 mb-2">Here's how your day is shaping up. Adjust as needed—DayTune is flexible!</div>
              {error && (
                <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">{error}</div>
              )}
              {loadingTasks ? (
                <div>Loading tasks...</div>
              ) : (
                <>
                  {scheduleSummary && scheduleSummary.message && (
                    <div className="mb-4 p-4 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded">
                      {scheduleSummary.message}
                    </div>
                  )}
                  <TaskList
                    tasks={scheduledTasks}
                    onTaskUpdated={handleTaskUpdated}
                    onTaskDeleted={handleTaskDeleted}
                    userId={session.user.id}
                  />
                </>
              )}
            </div>
            {impossibleTasks.length > 0 && (
              <div className="card mt-8 text-left">
                <h2 className="text-xl font-semibold mb-4">Tasks That Couldn't Be Scheduled</h2>
                <div className="text-xs text-gray-500 mb-2">These tasks couldn't fit into your current plan. You can adjust them or try again later.</div>
                <TaskList
                  tasks={impossibleTasks}
                  onTaskUpdated={handleTaskUpdated}
                  onTaskDeleted={handleTaskDeleted}
                  userId={session.user.id}
                />
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Add the weekly calendar below the main content */}
      <div className="w-full flex justify-end mb-2">
        <button className="px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700 transition" onClick={handleRetune} disabled={loadingTasks}>
          {loadingTasks ? 'Retuning...' : 'Retune Schedule'}
        </button>
      </div>
      <WeeklyCalendar tasks={scheduledTasks} />
    </div>
  );
}

export default App;
