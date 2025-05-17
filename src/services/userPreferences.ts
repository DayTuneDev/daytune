import { supabase } from '../supabaseClient';

export interface UserPreferences {
  id: string;
  mood_buckets?: string[];
  notification_preferences?: any;
  sleep_start?: string;
  sleep_end?: string;
  sleep_duration?: number;
  // Add more fields as needed
}

// Fetch user preferences for a given userId
export async function getUserPreferences(userId: string): Promise<UserPreferences | null> {
  console.log('Fetching preferences for userId:', userId);
  const { data, error } = await supabase.from('user_preferences').select('*').eq('id', userId);
  if (error) {
    console.error('Error fetching user preferences:', error);
    return null;
  }
  return data && data[0] ? (data[0] as UserPreferences) : null;
}

// Set (insert or update) user preferences for a given userId
export async function setUserPreferences(userId: string, preferences: Partial<UserPreferences>): Promise<UserPreferences | null> {
  const payload = { id: userId, ...preferences };
  const { data, error } = await supabase
    .from('user_preferences')
    .upsert([payload], { onConflict: 'id' })
    .select();
  if (error) {
    console.error('Error setting user preferences:', error);
    return null;
  }
  return data && data[0] ? (data[0] as UserPreferences) : null;
}
