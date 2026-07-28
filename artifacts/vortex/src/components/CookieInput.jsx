/**
 * CookieInput — Unified cookie input component
 *
 * Used by every tool that needs Facebook session cookies.
 * Accepts raw string, JSON array (Playwright/EditThisCookie), or JSON object.
 * Has a built-in "Capture via Playwright" button that calls the server.
 *
 * Props:
 *   value       {string}    — controlled value
 *   onChange    {fn}        — (newValue: string) => void
 *   isDark      {boolean}
 *   label?      {string}    — override label text
 *   disabled?   {boolean}
 *   onExtracted? {fn}       — called with { cUser, fbDtsg, lsd, accessToken, userId }
 *                             when server-side extraction succeeds
 */

import { useState } from 'react';
import PropTypes from 'prop-types';

const BASE_API = '/api/extract';

/* ─── tiny helpers ──────────────────────────────────────────────────────── */

function detectFormat(val) {
  const s = val?.trim();
  if (!s) return null;
  if (s.startsWith('[')) return 'json-array';
  if (s.startsWith('{')) return 'json-object';
  if (s.includes('='))   return 'string';
  return 'unknown';
}

const FORMAT_LABELS = {
  'json-array':  { label: 'JSON Array (Playwright)', color: 'text-emerald-400' },
  'json-object': { label: 'JSON Object',             color: 'text-blue-400' },
  'string':      { label: 'Cookie String',           color: 'text-violet-400' },
  'unknown':     { label: 'صيغة غير معروفة',         color: 'text-amber-400' },
};

/* ─── PlaywrightModal ───────────────────────────────────────────────────── */

function PlaywrightModal({ isDark, onCaptured, onClose }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [url, setUrl]           = useState('');
  const [loading, setLoading]   = useState(false);
  const [status, setStatus]     = useState('');

  const cls = {
    input:  `w-full rounded-xl border px-3 py-2 text-sm outline-none ${
      isDark
        ? 'border-slate-600/40 bg-[#1a1a1a] text-slate-100 placeholder-slate-500'
        : 'border-slate-200 bg-white text-slate-900 placeholder-slate-400'
    }`,
    label: isDark ? 'text-slate-300' : 'text-slate-600',
  };

  async function capture() {
    setLoading(true);
    setStatus('جارٍ تشغيل المتصفح…');
    try {
      const r = await fetch(`${BASE_API}/playwright-capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email:    email.trim()    || undefined,
          password: password.trim() || undefined,
          url:      url.trim()      || undefined,
        }),
      }).then((x) => x.json());

      if (!r.ok) {
        setStatus(`❌ ${r.error}`);
      } else {
        setStatus(`✅ تم التقاط ${r.cookies.length} كوكيز`);
        onCaptured(JSON.stringify(r.cookies, null, 2));
        setTimeout(onClose, 800);
      }
    } catch (e) {
      setStatus(`❌ خطأ: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4">
      <div className={`w-full max-w-md rounded-2xl border p-6 ${
        isDark ? 'border-slate-600/30 bg-[#1a1a1a] text-slate-100' : 'border-slate-200 bg-white text-slate-900'
      }`}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-black">🎭 التقاط الكوكيز بـ Playwright</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-xl leading-none">✕</button>
        </div>

        <p className={`mb-4 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          الأداة ستفتح متصفح خفي، تسجّل دخول (اختياري)، وترجع الكوكيز تلقائياً.
        </p>

        <label className={`mb-1 block text-xs font-semibold ${cls.label}`}>إيميل فيسبوك (اختياري)</label>
        <input value={email} onChange={e => setEmail(e.target.value)} type="email"
          className={`mb-3 ${cls.input}`} placeholder="example@mail.com" />

        <label className={`mb-1 block text-xs font-semibold ${cls.label}`}>كلمة المرور (اختياري)</label>
        <input value={password} onChange={e => setPassword(e.target.value)} type="password"
          className={`mb-3 ${cls.input}`} placeholder="••••••••" />

        <label className={`mb-1 block text-xs font-semibold ${cls.label}`}>الصفحة المستهدفة (اختياري)</label>
        <input value={url} onChange={e => setUrl(e.target.value)} type="url"
          className={`mb-4 ${cls.input}`} placeholder="https://www.facebook.com/ads/manager/" />

        {status && (
          <p className={`mb-3 text-sm ${status.startsWith('✅') ? 'text-emerald-400' : status.startsWith('❌') ? 'text-red-400' : 'text-blue-400'}`}>
            {status}
          </p>
        )}

        <button onClick={capture} disabled={loading}
          className="w-full rounded-xl bg-violet-600 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-60">
          {loading ? '⏳ جارٍ التشغيل…' : '🎭 التقاط الكوكيز'}
        </button>
      </div>
    </div>
  );
}

PlaywrightModal.propTypes = {
  isDark:     PropTypes.bool,
  onCaptured: PropTypes.func.isRequired,
  onClose:    PropTypes.func.isRequired,
};

/* ─── Main CookieInput ──────────────────────────────────────────────────── */

export default function CookieInput({
  value,
  onChange,
  isDark = true,
  label,
  disabled = false,
  onExtracted,
}) {
  const [showPlaywright, setShowPlaywright] = useState(false);
  const [verifying, setVerifying]           = useState(false);
  const [verifyResult, setVerifyResult]     = useState(null);

  const format = detectFormat(value);
  const formatInfo = format ? FORMAT_LABELS[format] : null;

  /* ── Verify & extract tokens from server ─── */
  async function verify() {
    if (!value?.trim()) return;
    setVerifying(true);
    setVerifyResult(null);
    try {
      const r = await fetch(`${BASE_API}/from-cookies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies: value }),
      }).then((x) => x.json());

      setVerifyResult(r);
      if (r.ok && onExtracted) {
        onExtracted({
          cUser:       r.cUser,
          fbDtsg:      r.fbDtsg,
          lsd:         r.lsd,
          accessToken: r.accessToken,
          userId:      r.userId,
          cookieHeader: r.cookieHeader,
        });
      }
    } catch (e) {
      setVerifyResult({ ok: false, error: e.message });
    } finally {
      setVerifying(false);
    }
  }

  const cls = {
    textarea: `w-full rounded-xl border px-3 py-2.5 text-xs font-mono outline-none resize-none ${
      disabled ? 'opacity-60 cursor-not-allowed' : ''
    } ${
      isDark
        ? 'border-slate-600/40 bg-[#111] text-slate-100 placeholder-slate-600'
        : 'border-slate-200 bg-slate-50 text-slate-900 placeholder-slate-400'
    }`,
    badge: `inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold`,
  };

  return (
    <div className="w-full">
      {/* ── Label row ── */}
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className={`text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
          {label || 'الكوكيز'}
        </label>

        <div className="flex items-center gap-1.5">
          {/* Format badge */}
          {formatInfo && (
            <span className={`${cls.badge} bg-white/5 ${formatInfo.color}`}>
              {formatInfo.label}
            </span>
          )}

          {/* Playwright capture button */}
          <button
            type="button"
            disabled={disabled}
            onClick={() => setShowPlaywright(true)}
            title="التقاط الكوكيز عبر متصفح خفي"
            className={`rounded-lg border px-2 py-0.5 text-[10px] font-bold transition-colors ${
              isDark
                ? 'border-violet-500/40 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20'
                : 'border-violet-500/30 bg-violet-50 text-violet-600 hover:bg-violet-100'
            }`}
          >
            🎭 Playwright
          </button>

          {/* Verify button */}
          {value?.trim() && (
            <button
              type="button"
              disabled={disabled || verifying}
              onClick={verify}
              className={`rounded-lg border px-2 py-0.5 text-[10px] font-bold transition-colors ${
                isDark
                  ? 'border-blue-500/40 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'
                  : 'border-blue-500/30 bg-blue-50 text-blue-600 hover:bg-blue-100'
              }`}
            >
              {verifying ? '⏳' : '✓ تحقق'}
            </button>
          )}
        </div>
      </div>

      {/* ── Textarea ── */}
      <textarea
        value={value}
        onChange={(e) => { onChange(e.target.value); setVerifyResult(null); }}
        disabled={disabled}
        rows={4}
        className={cls.textarea}
        placeholder={`الصيغ المقبولة:\n• String:  c_user=123; xs=abc; ...\n• JSON Array (Playwright): [{\"name\":\"c_user\",\"value\":\"123\"}, ...]\n• JSON Object: {\"c_user\": \"123\"}`}
        dir="ltr"
        spellCheck={false}
      />

      {/* ── Verify result ── */}
      {verifyResult && (
        <div className={`mt-2 rounded-xl border p-3 text-xs ${
          verifyResult.ok
            ? isDark ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                     : 'border-emerald-500/30 bg-emerald-50 text-emerald-700'
            : isDark ? 'border-red-500/30 bg-red-500/10 text-red-300'
                     : 'border-red-500/30 bg-red-50 text-red-700'
        }`}>
          {verifyResult.ok ? (
            <div className="space-y-1">
              <p className="font-bold">✅ كوكيز صالحة</p>
              {verifyResult.name && <p>الاسم: <span className="font-mono">{verifyResult.name}</span></p>}
              {verifyResult.cUser && <p>c_user: <span className="font-mono">{verifyResult.cUser}</span></p>}
              {verifyResult.fbDtsg && <p>fb_dtsg: <span className="font-mono">{verifyResult.fbDtsg.slice(0, 20)}…</span></p>}
              {verifyResult.lsd && <p>lsd: <span className="font-mono">{verifyResult.lsd}</span></p>}
              {verifyResult.accessToken && (
                <p>access_token: <span className="font-mono text-emerald-400">{verifyResult.accessToken.slice(0, 20)}…</span></p>
              )}
            </div>
          ) : (
            <p>❌ {verifyResult.error}</p>
          )}
        </div>
      )}

      {/* ── Playwright modal ── */}
      {showPlaywright && (
        <PlaywrightModal
          isDark={isDark}
          onCaptured={(json) => { onChange(json); setShowPlaywright(false); }}
          onClose={() => setShowPlaywright(false)}
        />
      )}
    </div>
  );
}

CookieInput.propTypes = {
  value:       PropTypes.string.isRequired,
  onChange:    PropTypes.func.isRequired,
  isDark:      PropTypes.bool,
  label:       PropTypes.string,
  disabled:    PropTypes.bool,
  onExtracted: PropTypes.func,
};
