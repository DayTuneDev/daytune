import { supabase } from '../supabaseClient';

// Fetch user preferences for a given userId
export async function getUserPreferences(userId) {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) {
    // If not found, return null (not an error if just missing)
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

// Set (insert or update) user preferences for a given userId
export async function setUserPreferences(userId, preferences) {
  const payload = { id: userId, ...preferences };
  const { data, error } = await supabase
    .from('user_preferences')
    .upsert([payload], { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return data;
} 