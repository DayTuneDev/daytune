import { supabase } from '../supabaseClient';

export interface MoodLog {
  id: string;
  user_id: string;
  mood: string;
  logged_at: string;
  time_of_day?: string;
  type?: string;
  [key: string]: any;
}

export async function getLatestMoodLog(userId: string): Promise<MoodLog | null> {
  const { data, error } = await supabase
    .from('mood_logs')
    .select('*')
    .eq('user_id', userId)
    .order('logged_at', { ascending: false })
    .limit(1);
  if (error) {
    console.error('Error fetching latest mood log:', error);
    return null;
  }
  return data && data[0] ? (data[0] as MoodLog) : null;
}
