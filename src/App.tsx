import React, { useEffect, useState, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { Task, BlockedTime } from './types/shared';
import Auth from './Auth';
import { supabase } from './supabaseClient';
import MoodSettings from './MoodSettings';
import MoodCheckin from './MoodCheckin';
import SpecialCheckinPage from './SpecialCheckinPage';
import TaskForm from './components/TaskForm';
import TaskList from './components/TaskList';
import { getBlockedTimeBlocks } from './services/scheduler';
import FullCalendarWeekly from './components/FullCalendarWeekly';
import { getUserPreferences, setUserPreferences, UserPreferences as UserPreferencesType } from './services/userPreferences';
import UserPreferences from './components/UserPreferences';
import './App.css';
import RetunePipeline from './scheduling/RetunePipeline';

// Additional type definitions
interface MoodLog {
  id: string;
  user_id: string;
  logged_at: string;
  time_of_day: string;
  mood_score: number;
  energy_score: number;
  type: 'default' | 'special' | 'Special Check-In';
  notes?: string;
  mood?: string; // Add this for backward compatibility
}

interface ScheduleSummary {
  message: string;
  importanceBreakdown: Record<string, number> | null;
}

// Component prop types
interface MoodSettingsProps {
  userId: string;
  initialBuckets?: string[];
  onSave?: (buckets: string[]) => void;
  onCancel?: () => void;
  loading?: boolean;
}

interface UserPreferencesProps {
  initialPreferences?: Partial<UserPreferencesType>;
  loading: boolean;
  onSave: (prefs: Partial<UserPreferencesType>) => Promise<void>;
}

interface MoodCheckinProps {
  userId: string;
  availableBuckets: string[];
  onCheckin?: (bucket: string) => void;
  currentBucket?: string;
  loading?: boolean;
}

interface SpecialCheckinPageProps {
  userId: string;
  onBack: () => void;
  onCheckin: () => void;
}

interface FullCalendarWeeklyProps {
  tasks: Task[];
  blockedTimes: BlockedTime[];
  onRetune: () => Promise<void>;
}

const BUCKET_LABELS: Record<string, string> = {
  early_morning: 'Early Morning',
  morning: 'Morning',
  afternoon: 'Afternoon',
  early_evening: 'Early Evening',
  evening: 'Evening',
  night: 'Night',
  early_am: 'Early AM',
  just_before_sunrise: 'Just Before Sunrise',
};

const BUCKET_RANGES: Record<string, [number, number]> = {
  early_morning: [360, 539],
  morning: [540, 719],
  afternoon: [720, 899],
  early_evening: [900, 1079],
  evening: [1080, 1259],
  night: [1260, 1439],
  early_am: [0, 179],
  just_before_sunrise: [180, 359],
};

function getCurrentBucket(buckets: string[]): string | null {
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

// Add this helper above the App component
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
const getMoodLabelAndEmoji = (mood: string) => {
  const m = MOODS.find((x) => x.key === mood || x.emoji === mood || x.label === mood);
  return m ? `${m.emoji} ${m.label}` : mood;
};

// Helper to format bucket time ranges
const formatTime = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
};
const getBucketRange = (bucket: string) => {
  const range = BUCKET_RANGES[bucket];
  if (!range) return '';
  return `${formatTime(range[0])}–${formatTime(range[1])}`;
};

const App: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState<boolean>(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState<boolean>(false);
  const [scheduledTasks, setScheduledTasks] = useState<Task[]>([]);
  const [scheduleSummary, setScheduleSummary] = useState<ScheduleSummary | null>(null);
  const [error, setError] = useState<string>('');
  const [userReady, setUserReady] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [moodBuckets, setMoodBuckets] = useState<string[] | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean>(false);
  const [showMoodPrompt, setShowMoodPrompt] = useState<boolean>(false);
  const [moodLogs, setMoodLogs] = useState<MoodLog[]>([]);
  const [refreshMoods, setRefreshMoods] = useState<boolean>(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(false);
  const notificationTimeouts = useRef<NodeJS.Timeout[]>([]);
  const [showNotifications, setShowNotifications] = useState<boolean>(false);
  const [pendingDefaultCheckin, setPendingDefaultCheckin] = useState<string | null>(null);
  const [userPreferences, setUserPreferencesState] = useState<UserPreferencesType | null>(null);
  const [blockedTimes, setBlockedTimes] = useState<BlockedTime[]>([]);

  // Minimal Supabase test
  useEffect(() => {
    async function testSupabase() {
      const { error } = await supabase.from('tasks').select('*').limit(1);
      if (error) {
        setError('Could not connect to DayTune. Please refresh or try again later.');
      }
    }
    testSupabase();
  }, []);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;
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
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();
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

  // Load user preferences when session is ready
  useEffect(() => {
    if (!session || !session.user || !userReady) return;
    const userId = session.user.id;
    let isMounted = true;
    async function fetchPreferences() {
      try {
        const prefs = await getUserPreferences(userId);
        if (isMounted && prefs) {
          setUserPreferencesState(prefs as UserPreferencesType);
        }
      } catch (e) {
        console.error('[Preferences] Error loading user preferences:', e);
      }
    }
    fetchPreferences();
    return () => {
      isMounted = false;
    };
  }, [session, userReady]);

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
        const allTasks = (data || []) as Task[];
        setTasks(allTasks);
        setScheduledTasks(allTasks.filter((t) => t.status === 'scheduled'));
        setScheduleSummary(null);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoadingTasks(false);
      }
    };
    fetchTasks();
  }, [session, userPreferences]);

  // Add a new task
  const handleTaskAdded = async (): Promise<void> => {
    if (!session?.user) return;
    const { data, error: fetchError } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', session.user.id)
      .order('start_datetime', { ascending: true });
    if (fetchError) {
      setError(fetchError.message);
      return;
    }
    const allTasks = (data || []) as Task[];
    setTasks(allTasks);
    setScheduledTasks(allTasks.filter((task) => task.start_datetime));
    setScheduleSummary(null);
  };

  const handleTaskUpdated = async (): Promise<void> => {
    if (!session?.user) return;
    const { data, error: fetchError } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', session.user.id)
      .order('start_datetime', { ascending: true });
    if (fetchError) {
      setError(fetchError.message);
      return;
    }
    const allTasks = (data || []) as Task[];
    setTasks(allTasks);
    setScheduledTasks(allTasks.filter((task) => task.start_datetime));
    setScheduleSummary(null);
  };

  const handleTaskDeleted = handleTaskAdded;

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
  }, [session, userReady, moodBuckets, refreshMoods, userPreferences]);

  // Prompt for mood check-in if in a selected bucket and not checked in yet
  useEffect(() => {
    if (!session || !session.user || !userReady || !moodBuckets) return;
    const currentBucket = getCurrentBucket(moodBuckets);
    if (!currentBucket) return;
    const today = new Date().toISOString().slice(0, 10);
    const alreadyChecked = moodLogs.some(
      (log: any) => log.time_of_day === currentBucket && log.logged_at.startsWith(today)
    );
    if (!alreadyChecked) setShowMoodPrompt(true);
    else setShowMoodPrompt(false);
  }, [session, userReady, moodBuckets, moodLogs, userPreferences]);

  // Notification logic
  useEffect(() => {
    notificationTimeouts.current.forEach(clearTimeout);
    notificationTimeouts.current = [];
    if (!notificationsEnabled || !moodBuckets || !session?.user) return;
    const today = new Date().toISOString().slice(0, 10);
    moodBuckets.forEach((bucket) => {
      const [start] = BUCKET_RANGES[bucket];
      const alreadyChecked = moodLogs.some(
        (log: any) => log.time_of_day === bucket && log.logged_at.startsWith(today)
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
  }, [notificationsEnabled, moodBuckets, moodLogs, session, userPreferences]);

  // Compute blocked times for the current week
  useEffect(() => {
    if (!userPreferences) return;
    const startOfWeek = new Date();
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // Sunday
    let blocks: any[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(startOfWeek.getTime() + i * 24 * 60 * 60 * 1000);
      blocks = blocks.concat(getBlockedTimeBlocks(day, userPreferences));
    }
    setBlockedTimes(blocks);
  }, [userPreferences]);

  const user = session?.user;
  const displayName = user?.user_metadata?.name || user?.email || 'User';

  const handleRetune = async (): Promise<void> => {
    if (!session?.user) return;
    setLoadingTasks(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', session.user.id)
        .order('start_datetime', { ascending: true });
      if (fetchError) throw fetchError;
      const allTasks = (data || []) as Task[];
      setTasks(allTasks);
      const pipeline = new RetunePipeline({ userId: session.user.id });
      await pipeline.retune();
      const scheduledTasks = (pipeline.state.scheduledTasks || []).map((task: Task) => {
        let startDateTime: string | undefined = undefined;
        if (task.start_datetime) {
          try {
            const date = new Date(task.start_datetime);
            startDateTime = date.toISOString();
          } catch (e) {
            console.error('Invalid date:', task.start_datetime);
          }
        }
        return {
          ...task,
          start_datetime: startDateTime,
        };
      });
      const summary: ScheduleSummary = {
        message:
          scheduledTasks.length > 0
            ? 'All tasks scheduled successfully!'
            : 'No tasks scheduled. Please add tasks to your schedule.',
        importanceBreakdown: null,
      };
      setScheduledTasks(scheduledTasks);
      setScheduleSummary(summary);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingTasks(false);
    }
  };

  // Helper: get today's mood for a bucket
  const getMoodForBucket = (bucket: string): string | null => {
    const today = new Date().toISOString().slice(0, 10);
    const log = moodLogs.find((l) => l.time_of_day === bucket && l.logged_at.startsWith(today));
    return log?.mood || null;
  };

  // Update mood emoji mapping
  const getMoodEmoji = (mood: string | number | null): string => {
    const moodStr = mood?.toString() || '';
    return {
      happy: '😃',
      neutral: '😐',
      tired: '😴',
      sad: '😔',
      angry: '😠',
      anxious: '😰',
      motivated: '🤩',
      confused: '😕',
      calm: '🧘',
    }[moodStr] || moodStr;
  };

  if (loadingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Loading...</div>
      </div>
    );
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
          initialBuckets={moodBuckets || []}
          onSave={(buckets: string[]) => {
            setMoodBuckets(buckets);
            setNeedsOnboarding(false);
          }}
          onCancel={() => {
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
    const prefsLoading = userPreferences === undefined;
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col gap-8 w-full max-w-2xl">
          <MoodSettings
            userId={session.user.id}
            initialBuckets={moodBuckets || []}
            onSave={(buckets: string[]) => {
              setMoodBuckets(buckets);
              setShowSettings(false);
            }}
            onCancel={() => setShowSettings(false)}
          />
          <UserPreferences
            initialPreferences={userPreferences || undefined}
            loading={prefsLoading}
            onSave={async (prefs: Partial<UserPreferencesType>) => {
              if (!session?.user) return;
              await setUserPreferences(session.user.id, prefs);
              setUserPreferencesState(prefs as UserPreferencesType);
              setShowSettings(false);
            }}
          />
        </div>
      </div>
    );
  }

  // Show MoodCheckin prompt if needed (from notification or normal logic)
  if (showMoodPrompt || pendingDefaultCheckin) {
    const currentBucket = pendingDefaultCheckin || getCurrentBucket(moodBuckets || []);
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <MoodCheckin
          userId={session.user.id}
          availableBuckets={moodBuckets || []}
          currentBucket={currentBucket || undefined}
          onCheckin={() => {
            setShowMoodPrompt(false);
            setPendingDefaultCheckin(null);
            setRefreshMoods((v) => !v);
          }}
        />
      </div>
    );
  }

  if (showNotifications) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <SpecialCheckinPage
          userId={session.user.id}
          onBack={() => setShowNotifications(false)}
          onCheckin={() => {
            setShowNotifications(false);
            setRefreshMoods((v) => !v);
          }}
        />
      </div>
    );
  }

  // In the render section of App.js, group tasks by status for the 'Your Tasks' UI
  const scheduled = tasks.filter((t) => t.status === 'scheduled');
  const unschedulable = tasks.filter((t) => t.status === 'not_able_to_schedule');
  const setAside = tasks.filter((t) => t.status === 'set_aside');

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 flex flex-col items-center justify-center">
        {/* Top Bar */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-10 gap-4 w-full border-b border-blue-100 pb-4">
          <div className="flex items-center gap-3 mb-2 md:mb-0">
            <img
              src="/DayTune_logo.png"
              alt="DayTune Logo"
              className="h-9 w-9 rounded-lg shadow-sm transition-all duration-300"
              style={{ background: 'var(--background)' }}
            />
            <div>
              <h1 className="text-3xl font-bold mb-1">DayTune</h1>
              <div className="text-gray-600 mt-1">
                Welcome, <span className="font-semibold">{displayName}</span>
              </div>
              <div className="text-gray-400 text-sm">You are logged in from {user?.email}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 justify-center w-full md:w-auto">
            <button
              className="bg-[var(--primary)] text-white px-4 py-2 rounded-full shadow-sm"
              onClick={() => setShowSettings(true)}
            >
              Settings
            </button>
            <button
              className={`px-4 py-2 rounded-full shadow-sm ${notificationsEnabled ? 'bg-[var(--accent)] text-white' : 'bg-[var(--primary)] text-white'}`}
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
              className="px-4 py-2 rounded-full shadow-sm bg-[var(--primary)] text-white"
              onClick={() => setShowNotifications(true)}
            >
              Special Check-Ins
            </button>
            <button
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-full shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              onClick={() => supabase.auth.signOut()}
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Gentle microcopy at the top */}
        <div className="w-full max-w-2xl mb-6 text-left text-[var(--primary)] text-lg font-medium">
          Let&apos;s tune your day, {displayName.split(' ')[0] || 'friend'}! 🌱
        </div>

        {/* Mood Check-in Summary */}
        <div className="card w-full max-w-md mx-auto text-left">
          <h2 className="text-lg font-semibold mb-4">Today&apos;s Mood Check-Ins</h2>
          <ul className="space-y-4">
            {(moodBuckets || []).map((bucket) => (
              <li key={bucket}>
                <div className="grid grid-cols-[1fr_140px] items-center gap-4 w-full">
                  <span className="font-medium min-w-0 truncate">
                    {BUCKET_LABELS[bucket] || bucket}
                    <span className="text-xs text-gray-500 ml-2">({getBucketRange(bucket)})</span>
                  </span>
                  {getMoodForBucket(bucket) ? (
                    <span className="text-2xl flex-shrink-0">
                      {getMoodEmoji(getMoodForBucket(bucket))}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Special Check-Ins Section */}
        <div className="card w-full max-w-md mx-auto text-left">
          <h2 className="text-lg font-semibold mb-4">Special Check-Ins</h2>
          <div
            className="rounded-2xl bg-blue-50/60 border border-blue-100 p-3 mb-2 shadow-lg relative"
            style={{ maxHeight: '220px', minHeight: '60px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px' }}
          >
            {(moodLogs.filter((l) => l.type === 'Special Check-In').length === 0
              ? [
                  { id: 'dummy1', time_of_day: 'Test Label', logged_at: new Date().toISOString(), mood: 'happy' },
                  { id: 'dummy2', time_of_day: 'Another Check-In', logged_at: new Date().toISOString(), mood: 'tired' },
                  { id: 'dummy3', time_of_day: 'Sample', logged_at: new Date().toISOString(), mood: 'sad' },
                  { id: 'dummy4', time_of_day: 'Energy Dip', logged_at: new Date().toISOString(), mood: 'calm' },
                  { id: 'dummy5', time_of_day: 'Focus Burst', logged_at: new Date().toISOString(), mood: 'motivated' },
                  { id: 'dummy6', time_of_day: 'Evening Wind Down', logged_at: new Date().toISOString(), mood: 'neutral' },
                ]
              : moodLogs.filter((l) => l.type === 'Special Check-In')
            ).map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between bg-white rounded-xl shadow px-4 py-3"
                style={{ minHeight: '56px', marginBottom: '0', boxShadow: '0 2px 8px rgba(60,60,60,0.07)' }}
                aria-label={`Special check-in: ${log.time_of_day}, mood: ${getMoodLabelAndEmoji(log.mood ? log.mood.toString() : '')}`}
              >
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-base text-gray-900">{log.time_of_day}</span>
                  <span className="text-xs text-gray-500">{new Date(log.logged_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                </div>
                <span className="text-base font-medium ml-4 whitespace-nowrap flex items-center gap-1">
                  {getMoodLabelAndEmoji(log.mood ? log.mood.toString() : '')}
                </span>
              </div>
            ))}
            {/* Gradient at bottom to indicate scrollability */}
            <div style={{
              position: 'sticky',
              bottom: 0,
              left: 0,
              width: '100%',
              height: '24px',
              background: 'linear-gradient(to bottom, rgba(255,255,255,0) 0%, #f1f5fa 100%)',
              pointerEvents: 'none',
              zIndex: 2,
            }} />
          </div>
          <div className="text-xs text-blue-600 mt-2">
            You can always add a special check-in from the Special Check-Ins page.
          </div>
        </div>

        {/* Task Management UI */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div>
            <div className="card text-left">
              <h2 className="text-xl font-semibold mb-4">Add New Task</h2>
              <div className="text-xs text-gray-500 mb-2">
                Add a task you&apos;d like to tune into your day. Tasks can be flexible or fixed,
                important or easy—whatever fits your flow.
              </div>
              <TaskForm onTaskAdded={handleTaskAdded} userId={session.user.id} />
            </div>
          </div>
          <div>
            <div className="card text-left">
              <h2 className="text-xl font-semibold mb-4">Your Tasks</h2>
              <button
                className="mb-4 px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700 transition"
                onClick={handleRetune}
                disabled={loadingTasks}
              >
                {loadingTasks ? 'Retuning...' : 'Retune Schedule'}
              </button>
              <div className="text-xs text-gray-500 mb-2">
                Here&apos;s how your day is shaping up. Adjust as needed—DayTune is flexible!
              </div>
              {error && (
                <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
                  {error}
                </div>
              )}
              <TaskList
                tasks={tasks}
                onTaskUpdated={handleTaskUpdated}
                onTaskDeleted={handleTaskDeleted}
                userId={session.user.id}
              />
            </div>
          </div>
        </div>

        {/* Calendar View */}
        <div className="w-full mt-8">
          <div className="card">
            <h2 className="text-xl font-semibold mb-4">Your Calendar</h2>
            <FullCalendarWeekly
              tasks={tasks}
              blockedTimes={blockedTimes}
              onRetune={handleRetune}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default App; 