import { createClient } from '@supabase/supabase-js';

// ── Supabase credentials ───────────────────────────────────────────────────────
// Keys are loaded from environment variables only — never hardcoded here.
//
// For local development: copy .env.example → .env.local and fill in values.
// For Vercel deployment: add these in Project Settings → Environment Variables.
//
//   VITE_SUPABASE_URL      (client-side, safe to expose)
//   VITE_SUPABASE_ANON_KEY (client-side, safe to expose — this is the publishable key)
//
// The app will throw a clear error at startup if these are missing so you know
// exactly what to add, rather than silently failing with a confusing auth error.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[VORTEX] Missing Supabase env vars.\n' +
    'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env.local file.\n' +
    'See .env.example for the required format.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
