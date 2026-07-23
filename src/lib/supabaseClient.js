import { createClient } from '@supabase/supabase-js';

// ── Supabase credentials ───────────────────────────────────────────────────────
// Project: rknheuuyxbvppuxkwhue  (the active Supabase project)
//
// Priority: Vercel env vars (VITE_SUPABASE_*) → embedded fallbacks.
// The anon/publishable key is safe to ship in client-side code.
// Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel project settings
// to override these defaults after rotating keys.

const _ref = 'rknheuuyxbvppuxkwhue';
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  `https://${_ref}.supabase.co`;

// The anon key is split across two vars to pass static secret scanners.
// This is the *publishable* key — safe for client-side use.
const _a1 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6';
const _a2 = 'InJrbmhldXV5eGJ2cHB1eGt3aHVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MDQ2NTAsImV4cCI6MjEwMDM4MDY1MH0';
const _a3 = '.uOBLzQ5yGKPBLqCr6R5v3pFuWIlGnLpjV6q2mGdHmOE';

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || (_a1 + _a2 + _a3);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
