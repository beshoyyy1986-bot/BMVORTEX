/**
 * requireAdmin middleware
 * Verifies the request carries a valid Supabase JWT and the caller's profile
 * has role 'admin' or 'owner'. Returns 401/403 otherwise.
 */
import { createClient } from '@supabase/supabase-js';

const OWNER_EMAIL = 'beshoyyy1986@gmail.com';

function getAdminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function requireAdmin(req, res, next) {
  try {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ ok: false, error: 'Missing authorization token' });
    }

    const adminClient = getAdminClient();

    // Verify the JWT and get the user
    const { data: { user }, error: userErr } = await adminClient.auth.getUser(token);
    if (userErr || !user) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
    }

    // Owner email always passes
    if (user.email?.toLowerCase() === OWNER_EMAIL.toLowerCase()) {
      req.adminUser = user;
      return next();
    }

    // Otherwise check the profiles table for admin/owner role
    const { data: profile, error: profileErr } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profileErr) {
      return res.status(500).json({ ok: false, error: 'Could not verify admin role' });
    }

    if (!profile || !['admin', 'owner'].includes(profile.role)) {
      return res.status(403).json({ ok: false, error: 'Insufficient permissions' });
    }

    req.adminUser = user;
    next();
  } catch (err) {
    console.error('[requireAdmin]', err.message);
    res.status(500).json({ ok: false, error: 'Auth check failed' });
  }
}
