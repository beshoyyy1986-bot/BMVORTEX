import { createClient } from '@supabase/supabase-js';

/**
 * Shared admin authentication middleware.
 *
 * Verifies the Supabase JWT from the Authorization header and checks that
 * the caller's profile has role 'admin' or 'owner'. Extracted out of
 * adminRoutes.js so other routers (e.g. the site-wide proxy pool endpoints
 * in proxy.js) can require admin access without duplicating this logic.
 */
export async function requireAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Authorization header required' });
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return res.status(503).json({ ok: false, error: 'Admin API not configured (missing Supabase env vars)' });
  }

  try {
    const adminClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
    }
    const user = userData.user;
    const { data: profile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile || !['admin', 'owner'].includes(profile.role)) {
      return res.status(403).json({ ok: false, error: 'Admin access required' });
    }
    req.adminUser = user;
    req.adminRole = profile.role;
    return next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: err.message });
  }
}

export default requireAdmin;
