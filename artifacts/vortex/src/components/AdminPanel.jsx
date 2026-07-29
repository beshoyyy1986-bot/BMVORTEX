import React, { useState, useEffect, useCallback } from 'react';
import PasswordInput from './PasswordInput.jsx';
import { useLang } from '../i18n.jsx';
import { supabase } from '../lib/supabaseClient.js';

const ALL_TOOL_TYPES = [
  'bm_meta_tool', 'mini_meta_2', 'funds', 'ads', 'cards',
  'paypal', 'gateway', 'iban', 'methods', 'debug',
  'generator', 'checker', 'email', 'social', 'proxy', 'support',
];

const TOOL_LABELS = {
  bm_meta_tool: 'BM Meta', mini_meta_2: 'Mini Meta 2$', funds: 'Funds',
  ads: 'Ads', cards: 'Cards', paypal: 'PayPal',
  gateway: 'Gateway', iban: 'IBAN', methods: 'Methods',
  debug: 'Debug', generator: 'CC Gen', checker: 'CC Check',
  email: 'Email', social: 'Social', proxy: 'Proxy',
  support: 'Support',
};

const PLAN_DEFAULTS = {
  none:       [],
  basic:      ['funds'],
  pro:        ['funds', 'ads', 'support'],
  enterprise: ALL_TOOL_TYPES,
};

const PLAN_COLORS = {
  enterprise: 'text-amber-400 bg-amber-400/10 border-amber-400/25',
  pro:        'text-blue-400 bg-blue-400/10 border-blue-400/25',
  basic:      'text-green-400 bg-green-400/10 border-green-400/25',
  none:       'text-slate-500 bg-slate-500/10 border-slate-500/25',
};

function addDays(date, days) {
  const d = date ? new Date(date) : new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// ── Toast notification ────────────────────────────────────────────────────────
function Toast({ message, type, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);
  const styles = {
    success: 'bg-green-500/15 border-green-500/30 text-green-300',
    error:   'bg-red-500/15 border-red-500/30 text-red-300',
    info:    'bg-blue-500/15 border-blue-500/30 text-blue-300',
  };
  return (
    <div className={`fixed top-4 right-4 z-[9999] flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-xl backdrop-blur ${styles[type] ?? styles.info}`}>
      {type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}
      {message}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon, color }) {
  const c = {
    green: 'from-green-500/10 to-green-500/5 border-green-500/20 text-green-400',
    blue:  'from-blue-500/10 to-blue-500/5 border-blue-500/20 text-blue-400',
    amber: 'from-amber-500/10 to-amber-500/5 border-amber-500/20 text-amber-400',
    red:   'from-red-500/10 to-red-500/5 border-red-500/20 text-red-400',
  }[color] ?? '';
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-4 ${c}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</span>
        <span className="text-lg opacity-60">{icon}</span>
      </div>
      <div className="text-3xl font-black text-white">{value}</div>
    </div>
  );
}

// ── API helpers ───────────────────────────────────────────────────────────────
// Reads the body as text first: a crashed serverless function replies with plain
// text, and calling r.json() on that masks the real error behind a parse failure.
async function parseResponse(r) {
  const raw = await r.text();
  let d;
  try {
    d = JSON.parse(raw);
  } catch {
    throw new Error(`Server error (HTTP ${r.status}): ${raw.slice(0, 200) || r.statusText}`);
  }
  if (!r.ok || !d.ok) throw new Error(d.error || `Request failed (HTTP ${r.status})`);
  return d;
}

// Every /api/admin route is guarded by requireAdmin on the server, which needs
// the caller's Supabase JWT. Without this header the whole panel 401s.
async function authHeaders(extra = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not signed in — please log in again.');
  return { ...extra, Authorization: `Bearer ${token}` };
}

const api = {
  async get(path) {
    return parseResponse(await fetch(`/api/admin${path}`, {
      headers: await authHeaders(),
    }));
  },
  async patch(path, body) {
    return parseResponse(await fetch(`/api/admin${path}`, {
      method: 'PATCH',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    }));
  },
  async del(path) {
    return parseResponse(await fetch(`/api/admin${path}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    }));
  },
  async post(path, body) {
    return parseResponse(await fetch(`/api/admin${path}`, {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    }));
  },
};

// ── User row (expanded card) ───────────────────────────────────────────────
function UserCard({ user, onUpdate, onDelete, onRefresh, showToast }) {
  const { t } = useLang();
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [localTools, setLocalTools] = useState(user.allowed_types || []);
  const [localExpiry, setLocalExpiry] = useState(
    user.subscription_expires_at ? user.subscription_expires_at.split('T')[0] : ''
  );
  const [extendDays, setExtendDays] = useState('');

  // Sync if parent updates
  useEffect(() => {
    setLocalTools(user.allowed_types || []);
    setLocalExpiry(user.subscription_expires_at ? user.subscription_expires_at.split('T')[0] : '');
  }, [user.allowed_types, user.subscription_expires_at]);

  const expired = user.subscription_expires_at && new Date(user.subscription_expires_at) < new Date();

  async function act(fn, successMsg) {
    setSaving(true);
    try {
      await fn();
      showToast(successMsg, 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const handlePlanChange = (newPlan) =>
    act(async () => {
      if (isOwner) throw new Error('Owner plan cannot be changed from the admin panel');
      const allowed = PLAN_DEFAULTS[newPlan] ?? [];
      await api.patch(`/user/${user.id}`, { plan: newPlan, allowed_types: allowed });
      onUpdate(user.id, { plan: newPlan, allowed_types: allowed });
      setLocalTools(allowed);
    }, `Plan → ${newPlan} ✓`);

  const handleSaveExpiry = () =>
    act(async () => {
      if (isOwner) throw new Error('Owner subscription cannot be changed from the admin panel');
      const val = localExpiry || null;
      const iso = val ? new Date(val).toISOString() : null;
      await api.patch(`/user/${user.id}`, { subscription_expires_at: iso });
      onUpdate(user.id, { subscription_expires_at: iso });
    }, 'Expiry saved ✓');

  const handleExtend = () =>
    act(async () => {
      if (isOwner) throw new Error('Owner subscription cannot be extended from the admin panel');
      const days = Number(extendDays);
      if (!days || days < 1) throw new Error('Enter a valid number of days');
      const newExpiry = addDays(user.subscription_expires_at, days);
      await api.patch(`/user/${user.id}`, { subscription_expires_at: newExpiry });
      onUpdate(user.id, { subscription_expires_at: newExpiry });
      setExtendDays('');
    }, `Extended by ${extendDays} days ✓`);

  const handleSaveTools = () =>
    act(async () => {
      if (isOwner) throw new Error('Owner permissions cannot be changed from the admin panel');
      await api.patch(`/user/${user.id}`, { allowed_types: localTools });
      onUpdate(user.id, { allowed_types: localTools });
    }, 'Permissions saved ✓');

  const isOwner = user.role === 'owner';

  const handleFreeze = () =>
    act(async () => {
      if (isOwner) throw new Error('Owner account cannot be frozen or unfrozen from the admin panel');
      await api.patch(`/user/${user.id}`, { is_frozen: !user.is_frozen });
      onUpdate(user.id, { is_frozen: !user.is_frozen });
    }, user.is_frozen ? 'Account unfrozen ✓' : 'Account frozen ✓');

  const handleResetSession = () =>
    act(async () => {
      await api.patch(`/user/${user.id}`, { current_session_id: null });
      onUpdate(user.id, { current_session_id: null });
    }, 'Session reset ✓');

  const handleDelete = async () => {
    if (isOwner) {
      showToast('Owner account cannot be deleted from the admin panel', 'error');
      return;
    }
    if (!confirm(`Delete ${user.email} permanently? This cannot be undone.`)) return;
    setSaving(true);
    try {
      await api.del(`/user/${user.id}`);
      onDelete(user.id);
      showToast('User deleted', 'success');
    } catch (e) {
      showToast(e.message, 'error');
      setSaving(false);
    }
  };

  const toggleTool = (type) => {
    setLocalTools(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const toolsDirty = JSON.stringify([...localTools].sort()) !==
    JSON.stringify([...(user.allowed_types || [])].sort());

  return (
    <div className={`rounded-2xl border transition-colors ${
      user.is_frozen
        ? 'border-red-500/25 bg-red-500/5'
        : 'border-white/8 bg-white/[0.03] hover:border-white/12'
    }`}>
      {/* ── Summary row ── */}
      <div className="flex flex-wrap items-center gap-3 p-4">
        {/* Avatar initials */}
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-600 text-sm font-black text-white">
          {(user.username || user.email || '?').slice(0, 2).toUpperCase()}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-[160px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-bold text-slate-100">{user.email}</span>
            {user.username && <span className="text-xs text-slate-500">@{user.username}</span>}
            {user.role === 'admin' && (
              <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-black text-amber-400">ADMIN</span>
            )}
            {user.is_frozen && (
              <span className="rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-black text-red-400">FROZEN</span>
            )}
            {user.current_session_id === 'LOCKED' && (
              <span className="rounded-full border border-rose-500/30 bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-black text-rose-300">SEC LOCK</span>
            )}
            {expired && (
              <span className="rounded-full bg-orange-500/20 px-1.5 py-0.5 text-[10px] font-black text-orange-400">EXPIRED</span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px]">
            <span className={`rounded-full border px-2 py-0.5 font-bold ${PLAN_COLORS[user.plan || 'none']}`}>
              {user.plan || 'none'}
            </span>
            {user.subscription_expires_at && (
              <span className="text-slate-500">
                expires {new Date(user.subscription_expires_at).toLocaleDateString()}
              </span>
            )}
            {user.last_seen_at && (
              <span className="text-slate-500">
                last seen {new Date(user.last_seen_at).toLocaleString()}
              </span>
            )}
            <span className="text-slate-600">
              {(user.allowed_types || []).length}/{ALL_TOOL_TYPES.length} tools
            </span>
          </div>
        </div>

        {/* Quick action buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={handleFreeze} disabled={saving}
            className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors disabled:opacity-40 ${
              user.is_frozen
                ? 'border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20'
                : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20'
            }`}>
            {user.is_frozen ? '🔓 Unfreeze' : '🧊 Freeze'}
          </button>

          {user.current_session_id === 'LOCKED' && (
            <button onClick={handleResetSession} disabled={saving}
              className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-bold text-rose-300 hover:bg-rose-500/20 disabled:opacity-40 animate-pulse">
              🔑 Unlock
            </button>
          )}

          <button onClick={handleDelete} disabled={saving}
            className="rounded-lg border border-red-500/25 bg-red-500/8 px-2.5 py-1 text-xs text-red-400 hover:bg-red-500/18 disabled:opacity-40">
            🗑
          </button>

          <button onClick={() => setExpanded(p => !p)}
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-400 hover:bg-white/10">
            {expanded ? '▲ Less' : '▼ Edit'}
          </button>
        </div>
      </div>

      {/* ── Expanded editor ── */}
      {expanded && (
        <div className="border-t border-white/8 px-4 pb-4 pt-3 space-y-4">

          {/* Plan + Expiry + Extend */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* Plan */}
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">Plan</label>
              <select value={user.plan || 'none'} onChange={e => handlePlanChange(e.target.value)} disabled={saving}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-200 outline-none focus:border-green-500/40 disabled:opacity-50">
                <option value="none">None</option>
                <option value="basic">Basic</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>

            {/* Expiry date */}
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">Expiry Date</label>
              <div className="flex gap-1.5">
                <input type="date"
                  className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500/40"
                  value={localExpiry}
                  onChange={e => setLocalExpiry(e.target.value)}
                />
                <button onClick={handleSaveExpiry} disabled={saving}
                  className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-bold text-blue-400 hover:bg-blue-500/20 disabled:opacity-40">
                  Save
                </button>
              </div>
            </div>

            {/* Extend */}
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">Extend by Days</label>
              <div className="flex gap-1.5">
                <input type="number" min={1} max={365} placeholder="e.g. 30"
                  value={extendDays}
                  onChange={e => setExtendDays(e.target.value)}
                  className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-200 outline-none focus:border-green-500/40"
                />
                <button onClick={handleExtend} disabled={saving || !extendDays}
                  className="rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs font-bold text-green-400 hover:bg-green-500/20 disabled:opacity-40">
                  + Add
                </button>
              </div>
            </div>
          </div>

          {/* Reset session */}
          <div className="flex items-center gap-2">
            <button onClick={handleResetSession} disabled={saving}
              className="rounded-xl border border-slate-500/25 bg-slate-500/8 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-500/15 disabled:opacity-40">
              ↺ Reset Active Session
            </button>
            <button onClick={() => act(
              async () => {
                await api.patch(`/user/${user.id}`, { plan: 'none', allowed_types: [], subscription_expires_at: null });
                onUpdate(user.id, { plan: 'none', allowed_types: [], subscription_expires_at: null });
                setLocalTools([]);
                setLocalExpiry('');
              }, 'Subscription cancelled ✓'
            )} disabled={saving}
              className="rounded-xl border border-orange-500/25 bg-orange-500/8 px-3 py-1.5 text-xs text-orange-400 hover:bg-orange-500/15 disabled:opacity-40">
              ✕ Cancel Subscription
            </button>
          </div>

          {/* Tool permissions */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Tool Permissions ({localTools.length}/{ALL_TOOL_TYPES.length})
              </label>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setLocalTools(ALL_TOOL_TYPES)}
                  className="rounded-lg border border-green-500/20 bg-green-500/8 px-2 py-0.5 text-[10px] text-green-400 hover:bg-green-500/15">
                  All
                </button>
                <button onClick={() => setLocalTools([])}
                  className="rounded-lg border border-slate-500/20 bg-slate-500/8 px-2 py-0.5 text-[10px] text-slate-400 hover:bg-slate-500/15">
                  None
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {ALL_TOOL_TYPES.map(type => {
                const active = localTools.includes(type);
                return (
                  <button key={type} onClick={() => toggleTool(type)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all ${
                      active
                        ? 'border-green-500/35 bg-green-500/15 text-green-400'
                        : 'border-white/8 bg-white/[0.03] text-slate-500 hover:border-white/15 hover:text-slate-400'
                    }`}>
                    {TOOL_LABELS[type] ?? type}
                  </button>
                );
              })}
            </div>
            {toolsDirty && (
              <button onClick={handleSaveTools} disabled={saving}
                className="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-500 disabled:opacity-50 transition-colors">
                {saving ? '↻ Saving…' : '💾 Save Tool Changes'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Site settings tab (mascot control) ─────────────────────────────────────────
function SiteSettingsTab({ showToast }) {
  const [settings, setSettings] = useState(null);
  const [size, setSize]         = useState(120);
  const [bottom, setBottom]     = useState(50);
  const [right, setRight]       = useState(12);
  const [enabled, setEnabled]   = useState(true);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await api.get('/settings');
        if (!alive) return;
        setSettings(d.settings);
        setEnabled(!!d.settings.mascot_enabled);
        setSize(Number(d.settings.mascot_size)   || 120);
        setBottom(Number(d.settings.mascot_bottom) ?? 50);
        setRight(Number(d.settings.mascot_right)   ?? 12);
      } catch (e) {
        showToast('Error loading settings: ' + e.message, 'error');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [showToast]);

  const dirty = settings && (
    enabled !== !!settings.mascot_enabled ||
    size    !== (Number(settings.mascot_size)   || 120) ||
    bottom  !== (Number(settings.mascot_bottom) ?? 50)  ||
    right   !== (Number(settings.mascot_right)  ?? 12)
  );

  const save = async () => {
    setSaving(true);
    try {
      const d = await api.patch('/settings', {
        mascot_enabled: enabled,
        mascot_size:    size,
        mascot_bottom:  bottom,
        mascot_right:   right,
      });
      setSettings(d.settings);
      showToast('Mascot settings saved ✓', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/20 text-xl">
            🐾
          </div>
          <div>
            <h3 className="font-bold text-slate-100">Footer Mascot</h3>
            <p className="text-xs text-slate-500">Show, hide, and resize the floating mascot for all visitors.</p>
          </div>
        </div>

        {/* Enable / disable */}
        <div className="mb-5 flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-4 py-3">
          <div>
            <p className="text-sm font-bold text-slate-200">Show mascot</p>
            <p className="text-xs text-slate-500">Pinned to the bottom corner of every page.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled(v => !v)}
            className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors ${
              enabled ? 'bg-green-500' : 'bg-slate-600'
            }`}
          >
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
            }`} />
          </button>
        </div>

        {/* Controls — only visible when enabled */}
        <div className={`flex flex-col gap-5 transition-opacity ${enabled ? '' : 'opacity-40 pointer-events-none'}`}>

          {/* Size slider */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Size</label>
              <span className="rounded-lg border border-white/10 bg-black/40 px-2 py-0.5 text-xs font-bold text-violet-300">
                {size}px
              </span>
            </div>
            <input
              type="range" min={48} max={320} step={4}
              value={size}
              onChange={e => setSize(Number(e.target.value))}
              className="w-full accent-violet-500"
            />
            <div className="mt-1 flex justify-between text-[10px] text-slate-600">
              <span>Small</span><span>Large</span>
            </div>
          </div>

          {/* Position — Bottom */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">↕ Position — Bottom</label>
              <span className="rounded-lg border border-white/10 bg-black/40 px-2 py-0.5 text-xs font-bold text-emerald-400">
                {bottom}px
              </span>
            </div>
            <input
              type="range" min={0} max={400} step={4}
              value={bottom}
              onChange={e => setBottom(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
            <div className="mt-1 flex justify-between text-[10px] text-slate-600">
              <span>Bottom edge</span><span>Higher ↑</span>
            </div>
          </div>

          {/* Position — Right */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">↔ Position — Right</label>
              <span className="rounded-lg border border-white/10 bg-black/40 px-2 py-0.5 text-xs font-bold text-emerald-400">
                {right}px
              </span>
            </div>
            <input
              type="range" min={0} max={400} step={4}
              value={right}
              onChange={e => setRight(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
            <div className="mt-1 flex justify-between text-[10px] text-slate-600">
              <span>Right edge</span><span>← Left</span>
            </div>
          </div>

        </div>

        {/* Live preview */}
        <div className="mb-5 mt-5">
          <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-slate-500">Preview</label>
          <div className="relative h-48 overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-slate-900 to-black">
            {enabled ? (
              <img
                src="/mascot.png"
                alt="Mascot preview"
                style={{
                  position: 'absolute',
                  width: Math.min(size, 140),
                  bottom: Math.min(bottom, 120),
                  right:  Math.min(right,  120),
                }}
                className="h-auto object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-600">
                Mascot hidden
              </div>
            )}
          </div>
        </div>

        <button
          onClick={save}
          disabled={saving || !dirty}
          className="w-full rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-violet-500 disabled:opacity-40 transition-colors"
        >
          {saving ? '↻ Saving…' : dirty ? '💾 Save Changes' : 'Saved'}
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
const AdminPanel = ({ onClose }) => {
  const { t } = useLang();
  const [users,      setUsers]     = useState([]);
  const [tickets,    setTickets]   = useState([]);
  const [stats,      setStats]     = useState({ users: 0, subscriptions: 0, tickets: 0, frozen: 0 });
  const [loading,    setLoading]   = useState(false);
  const [toast,      setToast]     = useState(null);
  const [activeTab,  setActiveTab] = useState('users');
  const [newAdmin,   setNewAdmin]  = useState({ email: '', password: '', plan: 'basic' });
  const [searchTerm, setSearchTerm] = useState('');
  const [creatingAdmin, setCreatingAdmin] = useState(false);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type, key: Date.now() });
  }, []);

  const buildStats = (u, t) => ({
    users:         u.length,
    subscriptions: u.filter(x => x.plan && x.plan !== 'none').length,
    tickets:       t.length,
    frozen:        u.filter(x => x.is_frozen).length,
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, ticketsRes] = await Promise.all([
        api.get('/users'),
        api.get('/tickets'),
      ]);
      const u = usersRes.users    || [];
      const tk = ticketsRes.tickets || [];
      setUsers(u);
      setTickets(tk);
      setStats(buildStats(u, tk));
    } catch (e) {
      showToast('Error loading data: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleUserUpdate = useCallback((userId, updates) => {
    setUsers(prev => {
      const next = prev.map(u => u.id === userId ? { ...u, ...updates } : u);
      setStats(s => buildStats(next, tickets));
      return next;
    });
  }, [tickets]);

  const handleUserDelete = useCallback((userId) => {
    setUsers(prev => {
      const next = prev.filter(u => u.id !== userId);
      setStats(s => buildStats(next, tickets));
      return next;
    });
  }, [tickets]);

  const handleTicketAction = async (ticketId, status) => {
    try {
      await api.patch(`/ticket/${ticketId}`, { status });
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status } : t));
      showToast(`Ticket → ${status} ✓`);
    } catch (e) { showToast(e.message, 'error'); }
  };

  const handleDeleteTicket = async (ticketId) => {
    try {
      await api.del(`/ticket/${ticketId}`);
      setTickets(prev => {
        const next = prev.filter(t => t.id !== ticketId);
        setStats(s => ({ ...s, tickets: next.length }));
        return next;
      });
      showToast('Ticket deleted ✓');
    } catch (e) { showToast(e.message, 'error'); }
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    setCreatingAdmin(true);
    try {
      await api.post('/create-user', {
        email:    newAdmin.email.trim(),
        password: newAdmin.password,
        role:     'admin',
        plan:     newAdmin.plan,
      });
      showToast('Admin created ✓');
      setNewAdmin({ email: '', password: '', plan: 'basic' });
      fetchData();
    } catch (e) { showToast(e.message, 'error'); }
    finally { setCreatingAdmin(false); }
  };

  const filteredUsers = users.filter(u =>
    !searchTerm ||
    u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.username?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const tabs = [
    { key: 'users',        label: '👥 Users',        count: users.length },
    { key: 'tickets',      label: '🎫 Tickets',       count: tickets.length },
    { key: 'create-admin', label: '➕ New Admin',     count: null },
    { key: 'site',         label: '🐾 Site',          count: null },
  ];

  return (
    <div className="min-h-screen w-full bg-[#080a0c]">
      {toast && (
        <Toast key={toast.key} message={toast.message} type={toast.type} onDone={() => setToast(null)} />
      )}

      <div className="mx-auto max-w-7xl px-4 py-6">

        {/* ── Header ── */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white">⚙️ Admin Console</h1>
            <p className="mt-0.5 text-sm text-slate-500">Vortex Control Center</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchData} disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 hover:bg-white/8 disabled:opacity-50 transition-colors">
              <span className={loading ? 'animate-spin inline-block' : ''}>↻</span>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
            <button onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/8 transition-colors">
              ✕ Close
            </button>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total Users"    value={stats.users}         icon="👥" color="blue"  />
          <StatCard label="Active Plans"   value={stats.subscriptions} icon="✅" color="green" />
          <StatCard label="Open Tickets"   value={stats.tickets}       icon="🎫" color="amber" />
          <StatCard label="Frozen"         value={stats.frozen}        icon="🧊" color="red"   />
        </div>

        {/* ── Tabs ── */}
        <div className="mb-5 flex gap-0.5 rounded-2xl border border-white/8 bg-white/[0.02] p-1">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                activeTab === tab.key
                  ? 'bg-green-500/15 text-green-300 shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}>
              {tab.label}
              {tab.count !== null && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                  activeTab === tab.key ? 'bg-green-500/25 text-green-400' : 'bg-white/8 text-slate-500'
                }`}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Users tab ── */}
        {activeTab === 'users' && (
          <div>
            <div className="mb-3">
              <input
                type="text"
                placeholder="🔍  Search by email or username…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-green-500/30 transition-colors"
              />
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent mb-3" />
                <p className="text-sm">Loading users…</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <span className="text-4xl mb-3">👥</span>
                <p className="text-sm">{searchTerm ? 'No users match your search.' : 'No users yet.'}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredUsers.map(user => (
                  <UserCard
                    key={user.id}
                    user={user}
                    onUpdate={handleUserUpdate}
                    onDelete={handleUserDelete}
                    showToast={showToast}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Tickets tab ── */}
        {activeTab === 'tickets' && (
          <div className="space-y-3">
            {loading ? (
              <div className="flex justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
              </div>
            ) : tickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <span className="text-4xl mb-3">🎫</span>
                <p className="text-sm">No tickets yet.</p>
              </div>
            ) : tickets.map(ticket => (
              <div key={ticket.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-start gap-4">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-bold text-slate-100">{ticket.subject}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        ticket.status === 'open'        ? 'bg-yellow-500/20 text-yellow-400' :
                        ticket.status === 'in_progress' ? 'bg-blue-500/20 text-blue-400'    :
                        ticket.status === 'closed'      ? 'bg-green-500/20 text-green-400'  :
                                                          'bg-slate-500/20 text-slate-400'
                      }`}>{ticket.status}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        ticket.priority === 'high'   ? 'bg-red-500/20 text-red-400'   :
                        ticket.priority === 'normal' ? 'bg-blue-500/20 text-blue-400' :
                                                       'bg-slate-500/20 text-slate-400'
                      }`}>{ticket.priority}</span>
                    </div>
                    <p className="text-xs text-slate-500 mb-2">
                      {ticket.email} · {new Date(ticket.created_at).toLocaleDateString()}
                    </p>
                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{ticket.message}</p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    {ticket.status !== 'in_progress' && (
                      <button onClick={() => handleTicketAction(ticket.id, 'in_progress')}
                        className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-400 hover:bg-blue-500/20 whitespace-nowrap">
                        🔄 In Progress
                      </button>
                    )}
                    {ticket.status !== 'closed' ? (
                      <button onClick={() => handleTicketAction(ticket.id, 'closed')}
                        className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs font-semibold text-green-400 hover:bg-green-500/20 whitespace-nowrap">
                        ✅ Close
                      </button>
                    ) : (
                      <button onClick={() => handleTicketAction(ticket.id, 'open')}
                        className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-1.5 text-xs font-semibold text-yellow-400 hover:bg-yellow-500/20 whitespace-nowrap">
                        🔓 Reopen
                      </button>
                    )}
                    <button onClick={() => handleDeleteTicket(ticket.id)}
                      className="rounded-lg border border-red-500/25 bg-red-500/8 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/15 whitespace-nowrap">
                      🗑 Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Create admin tab ── */}
        {activeTab === 'create-admin' && (
          <div className="mx-auto max-w-lg">
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-xl">
                  ➕
                </div>
                <div>
                  <h3 className="font-bold text-slate-100">Create Admin Account</h3>
                  <p className="text-xs text-slate-500">New admin gets access to all tools.</p>
                </div>
              </div>

              <form onSubmit={handleCreateAdmin} className="space-y-4">
                {[
                  { label: 'Email',            field: 'email',    type: 'email',    placeholder: 'admin@example.com' },
                  { label: 'Password (min 8)', field: 'password', type: 'password', placeholder: '••••••••' },
                ].map(({ label, field, type, placeholder }) => (
                  <div key={field}>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-400">{label}</label>
                    {type === 'password' ? (
                      <PasswordInput required placeholder={placeholder} isDark minLength={8}
                        value={newAdmin[field]}
                        onChange={e => setNewAdmin(p => ({ ...p, [field]: e.target.value }))}
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-500/40"
                      />
                    ) : (
                      <input type={type} required placeholder={placeholder}
                        value={newAdmin[field]}
                        onChange={e => setNewAdmin(p => ({ ...p, [field]: e.target.value }))}
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-500/40"
                      />
                    )}
                  </div>
                ))}

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-400">Initial Plan</label>
                  <select value={newAdmin.plan} onChange={e => setNewAdmin(p => ({ ...p, plan: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-slate-100 outline-none">
                    <option value="basic">Basic</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>

                <button type="submit" disabled={creatingAdmin}
                  className="w-full rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-amber-500 disabled:opacity-60 transition-colors">
                  {creatingAdmin ? '↻ Creating…' : '➕ Create Admin'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ── Site settings tab ── */}
        {activeTab === 'site' && (
          <SiteSettingsTab showToast={showToast} />
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
