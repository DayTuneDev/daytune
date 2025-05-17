import { createClient } from '@supabase/supabase-js';

// TODO: Make sure to add these to your .env file in the project root
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL; // e.g. https://xxxx.supabase.co
const supabaseKey = process.env.REACT_APP_SUPABASE_KEY; // anon public key

export const supabase = createClient(supabaseUrl, supabaseKey);
