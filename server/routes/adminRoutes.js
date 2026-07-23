import express from 'express';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bptdnmwgcnkmdeefscmh.supabase.co';

const ALL_TOOL_TYPES = [
  'bm_meta_tool', 'mini_meta_2', 'funds', 'ads', 'cards',
  'paypal', 'gateway', 'iban', 'methods', 'debug',
  'generator', 'checker', 'email', 'social', 'proxy', 'support',
];

const PLAN_DEFAULTS = {
  none:       [],
  basic:      ['funds'],
  pro:        ['funds', 'ads', 'support'],
  enterprise: ALL_TOOL_TYPES,
};

function getAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ── Ensure the avatars bucket exists ──────────────────────────────────────────
async function ensureAvatarsBucket(adminClient) {
  const { data: buckets } = await adminClient.storage.listBuckets();
  const exists = (buckets || []).some(b => b.name === 'avatars');
  if (!exists) {
    await adminClient.storage.createBucket('avatars', { public: true, fileSizeLimit: 5242880 });
  }
}

// ── GET /api/admin/users ──────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ ok: true, users: data || [] });
  } catch (err) {
    console.error('[admin/users]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/admin/tickets ────────────────────────────────────────────────────
router.get('/tickets', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ ok: true, tickets: data || [] });
  } catch (err) {
    console.error('[admin/tickets]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── PATCH /api/admin/user/:id ─────────────────────────────────────────────────
router.patch('/user/:id', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { error } = await adminClient
      .from('profiles')
      .update(req.body)
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/user PATCH]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── DELETE /api/admin/user/:id ────────────────────────────────────────────────
router.delete('/user/:id', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { error: profErr } = await adminClient.from('profiles').delete().eq('id', req.params.id);
    if (profErr) throw profErr;
    // Also delete from auth
    await adminClient.auth.admin.deleteUser(req.params.id).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/user DELETE]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── PATCH /api/admin/ticket/:id ───────────────────────────────────────────────
router.patch('/ticket/:id', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { error } = await adminClient
      .from('support_tickets')
      .update(req.body)
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/ticket PATCH]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── DELETE /api/admin/ticket/:id ──────────────────────────────────────────────
router.delete('/ticket/:id', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { error } = await adminClient.from('support_tickets').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/ticket DELETE]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/admin/upload-avatar ─────────────────────────────────────────────
router.post('/upload-avatar', upload.single('file'), async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId || !req.file) return res.status(400).json({ ok: false, error: 'userId and file are required' });

    const adminClient = getAdminClient();
    await ensureAvatarsBucket(adminClient);

    const ext  = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase();
    const path = `${userId}/avatar.${ext}`;

    const { error: upErr } = await adminClient.storage
      .from('avatars')
      .upload(path, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });
    if (upErr) throw upErr;

    const { data: urlData } = adminClient.storage.from('avatars').getPublicUrl(path);
    const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    // Update the profiles table
    const { error: dbErr } = await adminClient
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', userId);
    if (dbErr) throw dbErr;

    res.json({ ok: true, url: publicUrl });
  } catch (err) {
    console.error('[admin/upload-avatar]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/admin/settings ───────────────────────────────────────────────────
// Returns the single site_settings row, creating it with defaults if missing.
router.get('/settings', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    let { data, error } = await adminClient
      .from('site_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      const seed = { id: 1, mascot_enabled: true, mascot_size: 120, mascot_bottom: 50, mascot_right: 12 };
      const { data: inserted, error: insErr } = await adminClient
        .from('site_settings')
        .upsert(seed, { onConflict: 'id' })
        .select('*')
        .single();
      if (insErr) throw insErr;
      data = inserted;
    }
    res.json({ ok: true, settings: data });
  } catch (err) {
    console.error('[admin/settings GET]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── PATCH /api/admin/settings ─────────────────────────────────────────────────
// Whitelisted, validated updates to the single site_settings row.
router.patch('/settings', async (req, res) => {
  try {
    const patch = {};
    if (typeof req.body.mascot_enabled === 'boolean') {
      patch.mascot_enabled = req.body.mascot_enabled;
    }
    if (req.body.mascot_size !== undefined) {
      const size = Math.round(Number(req.body.mascot_size));
      if (!Number.isFinite(size) || size < 48 || size > 320) {
        return res.status(400).json({ ok: false, error: 'mascot_size must be 48–320' });
      }
      patch.mascot_size = size;
    }
    if (req.body.mascot_bottom !== undefined) {
      const v = Math.round(Number(req.body.mascot_bottom));
      if (Number.isFinite(v) && v >= 0 && v <= 500) patch.mascot_bottom = v;
    }
    if (req.body.mascot_right !== undefined) {
      const v = Math.round(Number(req.body.mascot_right));
      if (Number.isFinite(v) && v >= 0 && v <= 500) patch.mascot_right = v;
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ ok: false, error: 'No valid fields to update' });
    }
    patch.updated_at = new Date().toISOString();

    const adminClient = getAdminClient();
    // Try full patch (including position fields if columns exist)
    let { data, error } = await adminClient
      .from('site_settings')
      .upsert({ id: 1, ...patch }, { onConflict: 'id' })
      .select('*')
      .single();
    // If position columns don't exist yet, retry without them
    if (error && (patch.mascot_bottom !== undefined || patch.mascot_right !== undefined)) {
      const safePatch = { ...patch };
      delete safePatch.mascot_bottom;
      delete safePatch.mascot_right;
      if (Object.keys(safePatch).length > 0) {
        ({ data, error } = await adminClient
          .from('site_settings')
          .upsert({ id: 1, ...safePatch }, { onConflict: 'id' })
          .select('*')
          .single());
      }
    }
    if (error) throw error;
    res.json({ ok: true, settings: data });
  } catch (err) {
    console.error('[admin/settings PATCH]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/admin/create-user ───────────────────────────────────────────────
router.post('/create-user', async (req, res) => {
  try {
    const { email, password, username, role = 'admin', plan = 'basic' } = req.body;
    if (!email || !password || !username) {
      return res.status(400).json({ ok: false, error: 'email, password and username are required' });
    }

    const adminClient = getAdminClient();

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: email.trim(),
      password,
      user_metadata: { username: username.toLowerCase() },
      email_confirm: true,
    });
    if (authError) throw authError;

    const allowed = role === 'admin' ? ALL_TOOL_TYPES : (PLAN_DEFAULTS[plan] ?? []);

    await new Promise(r => setTimeout(r, 800));

    const { error: profileError } = await adminClient
      .from('profiles')
      .upsert({
        id:            authData.user.id,
        email:         authData.user.email,
        username:      username.toLowerCase(),
        role,
        plan,
        allowed_types: allowed,
      }, { onConflict: 'id' });

    if (profileError) {
      console.warn('Profile upsert warning:', profileError.message);
    }

    res.json({ ok: true, user: { id: authData.user.id, email: authData.user.email } });
  } catch (err) {
    console.error('[admin/create-user]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
