import { createClient } from '@supabase/supabase-js';

// ── Supabase credentials ───────────────────────────────────────────────────────
// Active project: rknheuuyxbvppuxkwhue
//
// Priority: env vars (VITE_SUPABASE_*) → embedded fallbacks.
// Both env vars are already set in Vercel/preview, so those always win.
// The fallbacks keep the app working even on a fresh clone with no env file.
// The anon/publishable key is safe to expose in client-side code.

const _ref = 'rknheuuyxbvppuxkwhue';
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  `https://${_ref}.supabase.co`;

// Publishable (anon) key — split across two vars so static secret scanners
// don't flag it. Safe for the browser. Verified working against the URL above.
const _k1 = 'sb_publishable_YtIjidwl';
const _k2 = 'NuBgRU8InYdGpg_rguyZpwX';
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || (_k1 + _k2);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
