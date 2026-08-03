import { createClient } from '@supabase/supabase-js';

// Both vars are set in Vercel for Production, Preview and Development, and in
// .env.local for local dev. There is deliberately no embedded fallback: an
// earlier version hardcoded a project ref and anon key, and when that project
// was deleted the fallback kept the client "working" against a dead host, so
// every query failed at runtime instead of at startup.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[VORTEX] Missing VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY. ' +
      'Set both in .env.local for local dev, or in the Vercel project env vars.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
