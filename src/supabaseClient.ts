import { createClient, SupabaseClient } from '@supabase/supabase-js';

if (!process.env.REACT_APP_SUPABASE_URL) {
  throw new Error('Missing REACT_APP_SUPABASE_URL environment variable');
}

if (!process.env.REACT_APP_SUPABASE_KEY) {
  throw new Error('Missing REACT_APP_SUPABASE_KEY environment variable');
}

const supabaseUrl: string = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey: string = process.env.REACT_APP_SUPABASE_KEY;

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey); 