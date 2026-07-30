import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import PropTypes from "prop-types";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "./lib/supabaseClient";
import { useLang } from "./i18n.jsx";
import PasswordInput from "./components/PasswordInput.jsx";

// ── Lazy-loaded tool modals (code-split into separate chunks) ─────
const ProxyToolsModal      = lazy(() => import("./components/ProxyToolsModal.jsx"));
const AdminPanel           = lazy(() => import("./components/AdminPanel.jsx"));
const AdvertisingToolsModal= lazy(() => import("./components/AdvertisingToolsModal.jsx"));
const CardsToolsModal      = lazy(() => import("./components/CardsToolsModal.jsx"));
const PayPalToolModal      = lazy(() => import("./components/PayPalToolModal.jsx"));
const IBANToolModal        = lazy(() => import("./components/IBANToolModal.jsx"));
const FundsToolsModal      = lazy(() => import("./components/FundsToolsModal.jsx"));
const BmMetaToolModal      = lazy(() => import("./components/BmMetaToolModal.jsx"));
const MiniMeta2Modal       = lazy(() => import("./components/MiniMeta2Modal.jsx"));
const MetaAdsOneWayModal   = lazy(() => import("./components/MetaAdsOneWayModal.jsx"));
const CcFromBmModal        = lazy(() => import("./components/CcFromBmModal.jsx"));
const VortexCCToolsPage    = lazy(() => import("./components/VortexCCToolsPage.jsx"));
const BmCreatorModal          = lazy(() => import("./components/BmCreatorModal.jsx"));
const VortexMetaToolsModal    = lazy(() => import("./components/VortexMetaToolsModal.jsx"));
const RemovePaymentModal      = lazy(() => import("./components/RemovePaymentModal.jsx"));
const AddFundsModal           = lazy(() => import("./components/AddFundsModal.jsx"));
const AddPrimaryModal         = lazy(() => import("./components/AddPrimaryModal.jsx"));

const HEADER_LOGO_PATH = "/logo_vortex.png";
const TELEGRAM_SUPPORT_URL = "https://t.me/BaBa_MeDia_0";

const fundTools = ["Convert Ad Account to Prepaid", "Add Balance From Card", "Enable Billing System"];
const adsTools  = ["Standard", "Dark Post", "Private API", "Partnership", "PRO", "Boost Post",
                   "Vortex-001", "Vortex-002", "Partner 2", ...fundTools];

const mainCards = [
  { title: "BM Meta Tool",          type: "bm_meta_tool",      logo: "/bm_meta_tool.png" },
  { title: "Meta Ads One Way",      type: "meta_ads_one_way",  logo: "/meta_ads_one_way.png" },
  { title: "Mini Meta 2$",          type: "mini_meta_2",       logo: "/mini-meta-2$/logo.png" },
  { title: "CC FROM BM",            type: "cc_from_bm",        logo: "/meta_cards_from_bm.png" },
  { title: "CREATE BM & AD ACC",   type: "bm_creator",        logo: "/meta_cards_from_bm.png" },
  { title: "Vortex CC Tools",       type: "cc_tools",          logo: "/cc_tools_logo.png" },
  { title: "Vortex Meta Tools",     type: "vortex_meta_tools", logo: "/vortex_meta_tools.png", free: true },
  { title: "Remove Payment",        type: "remove_payment",    logo: "/remove_payment.png" },
  { title: "Add Funds Metagraph",   type: "add_funds_meta",    logo: "/add_funds_meta.png" },
  { title: "Add Primary CC",        type: "add_primary_cc",    logo: "/add_primary_cc.png" },
  { title: "Switch BM to Old",      type: "switch_bm_old",     logo: "/switch_bm_old.png" },
  { title: "Add Funds",             type: "funds" },
  { title: "Ads Creation",          type: "ads" },
  { title: "Add Cards",             type: "cards" },
  { title: "Add PayPal",            type: "paypal" },
  { title: "Link PayPal Gateway",   type: "gateway" },
  { title: "Add IBAN",              type: "iban" },
  { title: "Methods",               type: "methods" },
  { title: "Debug Data",            type: "debug" },
  { title: "CC Generator",          type: "generator" },
  { title: "CC Checker",            type: "checker" },
  { title: "Email Checker",         type: "email" },
  { title: "Social Gateway Checker",type: "social" },
  { title: "Proxy Tools",           type: "proxy" },
  { title: "Support Center",        type: "support" },
];

const HOT_TYPES = new Set(["bm_meta_tool", "meta_ads_one_way", "mini_meta_2", "cc_from_bm", "bm_creator", "cc_tools"]);

const planAccess = {
  none:       [],
  basic:      ["funds"],
  pro:        ["funds", "ads", "support"],
  enterprise: mainCards.map(c => c.type),
};

// ── Loading fallback for lazy chunks ──────────────────────────────
function ChunkFallback() {
  return (
    <div className="flex h-40 w-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────
// Solid padlock with a cut-out keyhole. Reads far better than a thin outline
// once it sits on top of busy card artwork.
function LockIcon({ size = 20, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      className={className} aria-hidden="true" focusable="false">
      <path d="M7.9 10.6V7.9a4.1 4.1 0 0 1 8.2 0v2.7"
        stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <rect x="4.5" y="10.4" width="15" height="10.5" rx="3.1" fill="currentColor" />
      <circle cx="12" cy="14.9" r="1.65" fill="#1b1405" fillOpacity="0.85" />
      <path d="M12 16.1v2.3" stroke="#1b1405" strokeOpacity="0.85"
        strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
LockIcon.propTypes = { size: PropTypes.number, className: PropTypes.string };

// ── Profile Dropdown ─────────────────────────────────────────────
function ProfileDropdown({ session, userInfo, onSignOut, onAvatarUpdate, isDark }) {
  const { t } = useLang();
  const [open, setOpen]             = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [uploadMsg, setUploadMsg]   = useState("");
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const triggerRef = useRef(null);
  const fileRef    = useRef(null);

  const displayName = userInfo.username || session?.user?.email?.split("@")[0] || "User";
  const email       = session?.user?.email || "";
  const avatarUrl   = userInfo.avatar_url  || null;
  const initials    = displayName.slice(0, 2).toUpperCase();

  function handleOpen() {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({
        top:   rect.bottom + window.scrollY + 8,
        right: window.innerWidth - rect.right,
      });
    }
    setOpen(p => !p);
  }

  useEffect(() => {
    if (!open) return;
    function reposition() {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setDropdownPos({ top: rect.bottom + window.scrollY + 8, right: window.innerWidth - rect.right });
      }
    }
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg("");
    try {
      ensureSupabase();
      const ext = file.name.split('.').pop() || 'jpg';
      const filePath = `${session.user.id}/avatar.${ext}`;

      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: dbErr } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', session.user.id);
      if (dbErr) throw dbErr;

      setUploadMsg(t("photo_updated"));
      onAvatarUpdate?.(publicUrl);
    } catch (err) {
      setUploadMsg(t("upload_failed") + err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  const dropdownPanel = open && ReactDOM.createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
      {/* Portals render outside the dashboard's theme scope, so this panel
          carries `vx-light` itself — otherwise the shared muted-text tokens
          would stay on their dark values over a white dropdown. */}
      <div
        className={`fixed z-[9999] w-64 overflow-hidden rounded-2xl border shadow-2xl ${
          isDark ? "border-white/15 bg-[#1b202b]" : "vx-light border-slate-300 bg-white"
        }`}
        style={{ top: dropdownPos.top, right: dropdownPos.right }}
      >
        <div className={`px-4 py-3 border-b ${isDark ? "border-white/[0.08]" : "border-slate-100"}`}>
          <div className="flex items-center gap-3">
            <span className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-600 text-sm font-black text-white overflow-hidden ring-2 ring-blue-500/30">
              {avatarUrl
                ? <img src={avatarUrl} alt="avatar" className="h-full w-full rounded-full object-cover" />
                : initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm font-bold ${isDark ? "text-slate-100" : "text-slate-800"}`}>
                @{displayName}
              </p>
              <p className={`truncate text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                {email}
              </p>
              <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${
                userInfo.plan === "enterprise" ? "bg-amber-500/20 text-amber-500" :
                userInfo.plan === "pro"        ? "bg-blue-500/20 text-blue-500"   :
                userInfo.plan === "basic"      ? "bg-green-500/20 text-green-600" :
                                                 "bg-slate-500/20 text-slate-500"
              }`}>{userInfo.plan || t("no_plan")}</span>
            </div>
          </div>
        </div>

        <div className="p-2 space-y-0.5">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
              isDark ? "text-slate-300 hover:bg-white/[0.06]" : "text-slate-600 hover:bg-slate-50"
            } disabled:opacity-50`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            {uploading ? t("uploading") : t("change_photo")}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />

          {uploadMsg && (
            <p className={`px-3 text-[10px] font-semibold ${uploadMsg.startsWith(t("upload_failed")) ? "text-red-400" : "text-emerald-500"}`}>
              {uploadMsg}
            </p>
          )}

          <div className={`my-1 h-px ${isDark ? "bg-white/[0.08]" : "bg-slate-100"}`} />

          <button
            onClick={() => { setOpen(false); onSignOut(); }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-red-500 transition-colors hover:bg-red-500/10"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            {t("logout")}
          </button>
        </div>
      </div>
    </>,
    document.body
  );

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={handleOpen}
        className="flex items-center gap-2 rounded-xl border px-2 py-1.5 transition-colors focus:outline-none"
        style={{
          borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)",
          background:  isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)",
        }}
      >
        <span className="relative flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-600 text-[11px] font-black text-white overflow-hidden ring-2 ring-blue-500/40">
          {avatarUrl
            ? <img src={avatarUrl} alt="avatar" className="h-full w-full rounded-full object-cover" />
            : initials}
          <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border border-[#1a1a1a] bg-emerald-400" />
        </span>
        <span className={`hidden sm:block max-w-[90px] truncate text-xs font-semibold ${isDark ? "text-slate-200" : "text-slate-700"}`}>
          {displayName}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          className={`transition-transform ${open ? "rotate-180" : ""} ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {dropdownPanel}
    </div>
  );
}
ProfileDropdown.propTypes = {
  session:        PropTypes.object.isRequired,
  userInfo:       PropTypes.object.isRequired,
  onSignOut:      PropTypes.func.isRequired,
  onAvatarUpdate: PropTypes.func,
  isDark:         PropTypes.bool.isRequired,
};

// ── Auth page shell ───────────────────────────────────────────────
function AuthPageShell({ title, subtitle, children, isDark }) {
  return (
    <div className={`flex min-h-screen flex-col items-center justify-center gap-7 p-6 ${
      isDark ? "bg-[#0a0c10]" : "vx-light bg-[#eef1f6]"
    }`}>
      {/* A clear step between page title and supporting line: the title is
          the only 30px element on screen, the subtitle is muted body text. */}
      <div className="max-w-md text-center">
        <h1 className={`text-[30px] font-black leading-tight tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>{title}</h1>
        {subtitle && (
          <p className={`mx-auto mt-2 max-w-sm text-sm leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}
AuthPageShell.propTypes = { title: PropTypes.string, subtitle: PropTypes.string, children: PropTypes.node, isDark: PropTypes.bool };

// ── Blocking screen (frozen / security lock) ──────────────────────
function BlockScreen({ title, body, body2, footer, contactLabel }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0505] p-6" dir="auto">
      <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-[#150a0a] p-8 text-center shadow-[0_0_80px_rgba(239,68,68,0.12)]">
        <div className="mb-5 flex items-center justify-center">
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10">
            <span className="text-4xl">🔒</span>
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-black text-white">!</span>
          </div>
        </div>
        <h2 className="mb-3 text-lg font-black text-red-400">{title}</h2>
        <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/5 px-5 py-4">
          <p className="text-sm leading-7 text-slate-300">{body}</p>
          {body2 && <p className="mt-2 text-sm leading-7 text-slate-400">{body2}</p>}
        </div>
        <a
          href={TELEGRAM_SUPPORT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-red-500"
        >
          <span>✈️</span> {contactLabel}
        </a>
        <p className="mt-4 text-[11px] text-slate-600">{footer}</p>
      </div>
    </div>
  );
}
BlockScreen.propTypes = {
  title: PropTypes.string, body: PropTypes.string, body2: PropTypes.string,
  footer: PropTypes.string, contactLabel: PropTypes.string,
};

function ensureSupabase() {
  if (!supabase) throw new Error("Supabase client not initialized");
}

// ── Main app ──────────────────────────────────────────────────────
export default function SecureDashboardApp() {
  const { t, lang, toggleLang, isArabic } = useLang();
  const [theme, setTheme]         = useState("dark");
  const [session, setSession]     = useState(null);
  const [userInfo, setUserInfo]   = useState({ role: "user", plan: "none", allowed_types: [] });
  const [activeCard, setActiveCard] = useState(null);
  const [authMode, setAuthMode]   = useState(null);
  const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem("vortex_remember_email"));
  const [loginForm, setLoginForm] = useState({
    email: localStorage.getItem("vortex_remember_email") || "",
    password: "",
  });
  const [signupForm, setSignupForm] = useState({ email: "", password: "", confirmPassword: "" });
  const [authFieldError, setAuthFieldError] = useState("");
  const [ticketForm, setTicketForm] = useState({ subject: "", message: "", priority: "normal" });
  const [pathname, setPathname]   = useState(window.location.pathname);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotStatus, setForgotStatus] = useState({ ok: "", error: "", loading: false });
  const [resetForm, setResetForm] = useState({ password: "", confirmPassword: "" });
  const [resetStatus, setResetStatus] = useState({ ok: "", error: "", loading: false });
  const [emailConfirmed, setEmailConfirmed] = useState(true);
  const [msg, setMsg]             = useState("");
  const [securityLocked, setSecurityLocked] = useState(false);
  const [frozen, setFrozen]       = useState(false);

  // Ownership is decided by the `role` column on the profile row, never by a
  // list of e-mails baked into the bundle. The DB is the single source of
  // truth and the API server re-checks the same column on every admin call,
  // so nothing here is worth spoofing client-side.
  const SECURITY_LOCK_MARKER = "LOCKED";
  const isDark = theme === "dark";

  // ── Theme-aware class helpers ──────────────────────────────────
  // `themeScope` switches the design tokens in index.css for the whole
  // subtree. Only screens that actually honour the light/dark toggle get
  // it — the tool pages are dark-only by design and must not inherit it.
  const themeScope = isDark ? "" : "vx-light";

  const cls = {
    headerBorder: isDark ? "border-white/10"  : "border-slate-200",
    // Secondary buttons need a border you can see and a surface a step off
    // the header, otherwise they read as plain text.
    btn:          isDark ? "bg-[#2b3240] border-slate-400/35 text-slate-100 hover:bg-[#353d4d] hover:border-slate-300/50"
                        : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400",
    // Cards are the primary objects on the page — they get the deepest
    // elevation of anything in the grid so the layer order is obvious.
    card:         isDark ? "border-slate-400/25 bg-[#232936] text-slate-100 shadow-[0_2px_4px_rgba(0,0,0,0.4),0_14px_30px_-14px_rgba(0,0,0,0.85)] hover:border-blue-400/50 hover:shadow-[0_4px_8px_rgba(0,0,0,0.45),0_20px_40px_-14px_rgba(0,0,0,0.9)]"
                        : "border-slate-300/80 bg-white text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.08),0_10px_24px_-12px_rgba(15,23,42,0.25)] hover:border-blue-400/60 hover:shadow-[0_4px_10px_rgba(15,23,42,0.12),0_18px_36px_-14px_rgba(15,23,42,0.3)]",
    lockedCard:   isDark ? "border-amber-500/35 bg-[#211d13] shadow-[0_2px_4px_rgba(0,0,0,0.4),0_12px_26px_-14px_rgba(0,0,0,0.8)]"
                        : "border-amber-400/70 bg-amber-50 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_20px_-12px_rgba(15,23,42,0.2)]",
    modal:        isDark ? "border-slate-400/30 bg-[#1b202b] text-slate-100"
                        : "border-slate-200 bg-white text-slate-900",
    input:        isDark ? "border-blue-400/15 bg-black/25 text-slate-100 placeholder:text-slate-500"
                        : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400",
    subtext:      isDark ? "text-slate-400" : "text-slate-500",
    // Field labels sit directly above their input and were the hardest
    // thing to find on the page. Uppercase + weight + spacing makes the
    // label/field pairing scannable at a glance.
    label:        isDark ? "text-slate-400" : "text-slate-600",
  };
  const fieldCls = `w-full rounded-xl border px-4 py-3 text-sm outline-none ${cls.input}`;
  const labelCls = `mb-1.5 block text-xs font-bold uppercase tracking-wide ${cls.label}`;

  const isPrivileged = userInfo.role === "admin" || userInfo.role === "owner";

  const unlockedTypes = useMemo(() => {
    if (!session) return [];
    if (userInfo.role === "admin" || userInfo.role === "owner") return mainCards.map(c => c.type);
    const byPlan = planAccess[userInfo.plan] || [];
    const custom = Array.isArray(userInfo.allowed_types) ? userInfo.allowed_types : [];
    return [...new Set([...byPlan, ...custom])];
  }, [session, userInfo]);

  const getFingerprint = () =>
    `${navigator.userAgent}-${screen.width}x${screen.height}-${navigator.language}`;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        setEmailConfirmed(!!session.user.email_confirmed_at);
        loadAccess(session.user.id);
      }
    });

    const { data: { subscription: authListener } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      if (session) {
        setEmailConfirmed(!!session.user.email_confirmed_at);
        loadAccess(session.user.id);
      } else {
        setUserInfo({ role: "user", plan: "none", allowed_types: [] });
      }
    });

    return () => { authListener.unsubscribe(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real-time profile subscription
  useEffect(() => {
    if (!session?.user) return;
    const profileSub = supabase
      .channel("public:profiles")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles",
        filter: `id=eq.${session.user.id}` },
        (payload) => {
          const data = payload.new;
          const isOwnerRT = data.role === "owner";
          if (!isOwnerRT) {
            if (data.is_frozen) { setFrozen(true); supabase.auth.signOut(); return; }
            if (data.current_session_id === SECURITY_LOCK_MARKER) {
              setSecurityLocked(true); supabase.auth.signOut(); return;
            }
            const localSid = sessionStorage.getItem("vortex_sid");
            if (data.current_session_id && localSid && data.current_session_id !== localSid) {
              setMsg(t("logged_in_elsewhere")); supabase.auth.signOut(); return;
            }
          }
          setUserInfo(prev => ({ ...data, avatar_url: data.avatar_url || prev.avatar_url }));
        })
      .subscribe();
    return () => { supabase.removeChannel(profileSub); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  // ── Heartbeat: poll every 30 s to catch freeze / session hijack ──
  useEffect(() => {
    if (!session?.user) return;
    const localSid = sessionStorage.getItem("vortex_sid");
    const check = async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("current_session_id, is_frozen, role")
          .eq("id", session.user.id)
          .single();
        if (!data) return;
        await supabase.from("profiles")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("id", session.user.id);
        // Owners are never kicked out by heartbeat checks.
        if (data.role === "owner") return;
        if (data.is_frozen) {
          setFrozen(true);
          supabase.auth.signOut();
          return;
        }
        if (data.current_session_id === SECURITY_LOCK_MARKER) {
          setSecurityLocked(true);
          supabase.auth.signOut();
          return;
        }
        if (localSid && data.current_session_id && data.current_session_id !== localSid) {
          setMsg(t("logged_in_elsewhere"));
          supabase.auth.signOut();
        }
      } catch (_) { /* network hiccup — skip */ }
    };
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  useEffect(() => {
    const onPopState = () => { setPathname(window.location.pathname); };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  async function loadAccess(userId) {
    try {
      ensureSupabase();
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
      if (data) {
        const isOwnerRole = data.role === "owner";

        // ── Owners are NEVER blocked by frozen or security-lock ──────────
        if (!isOwnerRole) {
          if (data.is_frozen) { setFrozen(true); await supabase.auth.signOut(); return; }
          if (data.current_session_id === SECURITY_LOCK_MARKER) {
            setSecurityLocked(true);
            await supabase.auth.signOut();
            return;
          }
        }

        // Never let a null avatar_url from the row wipe an avatar we already
        // have in state (e.g. right after an upload before DB round-trips).
        setUserInfo(prev => ({ ...data, avatar_url: data.avatar_url || prev.avatar_url }));
      }
    } catch (e) { console.error("Error loading access:", e); }
  }

  async function submitAuth(e) {
    e.preventDefault();
    setAuthFieldError("");
    try {
      ensureSupabase();
      if (authMode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: loginForm.email.trim(), password: loginForm.password,
        });
        if (error) throw error;

        const { data: profile } = await supabase
          .from("profiles")
          .select("current_session_id, is_frozen, role")
          .eq("id", data.user.id)
          .single();

        // ── Owners bypass all frozen / security-lock checks ───────────────
        if (profile?.role !== "owner") {
          // Frozen → block immediately with the dedicated screen.
          if (profile?.is_frozen) {
            await supabase.auth.signOut();
            setFrozen(true);
            return;
          }

          if (profile?.current_session_id === SECURITY_LOCK_MARKER) {
            await supabase.auth.signOut();
            setSecurityLocked(true);
            return;
          }

          if (profile?.current_session_id) {
            await supabase.from("profiles")
              .update({ current_session_id: SECURITY_LOCK_MARKER })
              .eq("id", data.user.id);
            await supabase.auth.signOut();
            setSecurityLocked(true);
            return;
          }
        }

        const sid = Date.now().toString();
        sessionStorage.setItem("vortex_sid", sid);
        await supabase.from("profiles").update({
          current_session_id: sid,
          fingerprint: getFingerprint(),
          last_seen_at: new Date().toISOString(),
        }).eq("id", data.user.id);
        if (rememberMe) {
          localStorage.setItem("vortex_remember_email", loginForm.email.trim());
        } else {
          localStorage.removeItem("vortex_remember_email");
        }
        setMsg(t("login_success")); navigateTo("/");
      } else {
        if (signupForm.password.length < 8) return setAuthFieldError(t("err_pwd_short"));
        if (signupForm.password !== signupForm.confirmPassword) return setAuthFieldError(t("err_pwd_match"));
        const { data, error } = await supabase.auth.signUp({
          email: signupForm.email.trim(), password: signupForm.password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (error) throw error;
        // When email confirmation is enabled, signUp returns a user but NO
        // active session. Writing to `profiles` now would run unauthenticated
        // and be rejected by RLS (that was the source of "Auth Error: {}").
        // Only stamp the session fields when we actually have a session; the
        // rest is handled on first sign-in via loadAccess().
        if (data.session && data.user) {
          const sid = Date.now().toString();
          sessionStorage.setItem("vortex_sid", sid);
          await supabase.from("profiles").update({ current_session_id: sid, fingerprint: getFingerprint() })
            .eq("id", data.user.id);
          setMsg(t("signup_success")); navigateTo("/");
        } else {
          // Confirmation required — no session yet. Show a friendly notice.
          setMsg(t("signup_check_email"));
          setAuthMode("login");
        }
      }
    } catch (err) {
      const detail = err?.message || err?.error_description || err?.msg ||
        (typeof err === "string" ? err : t("auth_error_generic"));
      setMsg(t("auth_error") + detail);
    }
  }

  async function submitTicket(e) {
    e.preventDefault();
    if (!session) return setMsg(t("login_required"));
    try {
      ensureSupabase();
      const { error } = await supabase.from("support_tickets").insert({
        user_id: session.user.id, email: session.user.email,
        subject: ticketForm.subject, message: ticketForm.message,
        priority: ticketForm.priority, status: "open",
      });
      if (error) throw error;
      setTicketForm({ subject: "", message: "", priority: "normal" });
      setMsg(t("ticket_submitted"));
    } catch (err) { setMsg(err.message); }
  }

  function navigateTo(path) {
    if (window.location.pathname === path) return;
    window.history.pushState({}, "", path);
    setPathname(path);
  }

  async function handleForgotPassword(e) {
    e.preventDefault();
    setForgotStatus({ ok: "", error: "", loading: true });
    try {
      ensureSupabase();
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setForgotStatus({ ok: t("reset_link_sent"), error: "", loading: false });
    } catch (error) {
      setForgotStatus({ ok: "", error: error.message || t("reset_email_fail"), loading: false });
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    setResetStatus({ ok: "", error: "", loading: true });
    if (resetForm.password.length < 8) return setResetStatus({ ok: "", error: t("err_pwd_short"), loading: false });
    if (resetForm.password !== resetForm.confirmPassword) return setResetStatus({ ok: "", error: t("err_pwd_match"), loading: false });
    try {
      ensureSupabase();
      const { error } = await supabase.auth.updateUser({ password: resetForm.password });
      if (error) throw error;
      setResetStatus({ ok: t("password_updated"), error: "", loading: false });
      setResetForm({ password: "", confirmPassword: "" });
    } catch (error) {
      setResetStatus({ ok: "", error: error.message || t("reset_failed"), loading: false });
    }
  }

  async function resendConfirmationEmail() {
    if (!session?.user?.email) return;
    try {
      ensureSupabase();
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: session.user.email,
        options: { emailRedirectTo: `${window.location.origin}/` },
      });
      if (error) throw error;
      setMsg(t("verification_sent"));
    } catch (error) {
      setMsg(t("auth_error") + (error.message || ""));
    }
  }

  const modalTools = activeCard?.type === "ads" ? adsTools : activeCard?.type === "funds" ? fundTools : [];

  // ── Frozen account screen (blocks all access) ──────────────────
  if (frozen) {
    return (
      <BlockScreen
        title={t("frozen_title")}
        body={t("frozen_body")}
        body2={t("frozen_body2")}
        footer={t("frozen_footer")}
        contactLabel={t("contact_support")}
      />
    );
  }

  // ── Security lock screen ───────────────────────────────────────
  if (securityLocked) {
    return (
      <BlockScreen
        title={t("seclock_title")}
        body={t("seclock_body")}
        footer={t("seclock_footer")}
        contactLabel={t("contact_support")}
      />
    );
  }

  // ── Login / Signup full pages ──────────────────────────────────
  if (pathname === "/login" || pathname === "/signup") {
    const isLogin = pathname === "/login";
    return (
      <AuthPageShell
        isDark={isDark}
        title={isLogin ? t("auth_signin_title") : t("auth_signup_title")}
        subtitle={isLogin ? t("auth_signin_sub") : t("auth_signup_sub")}
      >
        <form onSubmit={submitAuth} className={`w-full max-w-md rounded-2xl border p-7 ${
          isDark
            ? "border-white/20 bg-[#161b24] text-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.5),0_32px_80px_-24px_rgba(0,0,0,0.9)]"
            : "border-slate-300 bg-white text-slate-900 shadow-[0_2px_8px_rgba(15,23,42,0.06),0_28px_64px_-24px_rgba(15,23,42,0.3)]"
        }`}>
          <span className={`mb-3 inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${isLogin ? "bg-blue-500/15 text-blue-500" : "bg-emerald-500/15 text-emerald-500"}`}>
            {isLogin ? t("auth_secure_signin") : t("auth_create_account")}
          </span>

          {authFieldError && <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{authFieldError}</div>}
          {msg && <div className="mb-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-500">{msg}</div>}


          <label className={labelCls}>{t("email")}</label>
          <input type="email" required autoComplete="email"
            value={isLogin ? loginForm.email : signupForm.email}
            onChange={e => {
              setAuthMode(isLogin ? "login" : "signup");
              if (isLogin) setLoginForm(p => ({ ...p, email: e.target.value }));
              else setSignupForm(p => ({ ...p, email: e.target.value }));
            }}
            className={`mb-3 ${fieldCls}`} placeholder={t("email_placeholder")} />

          <label className={labelCls}>{t("password")}</label>
          <div className="mb-3">
            <PasswordInput required autoComplete={isLogin ? "current-password" : "new-password"}
              isDark={isDark}
              value={isLogin ? loginForm.password : signupForm.password}
              onChange={e => {
                setAuthMode(isLogin ? "login" : "signup");
                if (isLogin) setLoginForm(p => ({ ...p, password: e.target.value }));
                else setSignupForm(p => ({ ...p, password: e.target.value }));
              }}
              className={fieldCls} placeholder={t("min8")} />
          </div>

          {!isLogin && (
            <>
              <label className={labelCls}>{t("confirm_password")}</label>
              <div className="mb-3">
                <PasswordInput required autoComplete="new-password" isDark={isDark} value={signupForm.confirmPassword}
                  onChange={e => setSignupForm(p => ({ ...p, confirmPassword: e.target.value }))}
                  className={fieldCls} placeholder={t("repeat_password")} />
              </div>
            </>
          )}

          {isLogin && (
            <div className="mb-4 flex items-center justify-between">
              <label className="flex cursor-pointer items-center gap-2 select-none">
                <span className={`relative inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                  rememberMe
                    ? "border-blue-500 bg-blue-500"
                    : isDark ? "border-slate-500 bg-transparent" : "border-slate-300 bg-white"
                }`}>
                  <input
                    type="checkbox"
                    className="absolute inset-0 cursor-pointer opacity-0"
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                  />
                  {rememberMe && (
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="pointer-events-none">
                      <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </span>
                <span className={`text-xs ${isDark ? "text-slate-300" : "text-slate-600"}`}>{t("remember_me")}</span>
              </label>
              <button type="button" onClick={() => navigateTo("/forgot-password")}
                className={`text-xs font-semibold ${isDark ? "text-slate-300 hover:text-slate-100" : "text-slate-500 hover:text-slate-700"}`}>
                {t("forgot_password")}
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button type="submit" className="rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-600">
              {isLogin ? t("login") : t("auth_create_account")}
            </button>
            <button type="button" onClick={() => { setAuthFieldError(""); navigateTo("/"); }}
              className={`rounded-xl border px-5 py-2.5 text-sm font-bold ${cls.btn}`}>
              {t("back")}
            </button>
          </div>

          <div className={`mt-4 text-center text-xs ${cls.subtext}`}>
            {isLogin ? (
              <>{t("no_account")}{" "}
                <button type="button" className="font-semibold text-emerald-500 hover:underline" onClick={() => { setAuthFieldError(""); setMsg(""); navigateTo("/signup"); }}>{t("create_account_link")}</button>
              </>
            ) : (
              <>{t("have_account")}{" "}
                <button type="button" className="font-semibold text-blue-500 hover:underline" onClick={() => { setAuthFieldError(""); setMsg(""); navigateTo("/login"); }}>{t("signin_link")}</button>
              </>
            )}
          </div>
        </form>
      </AuthPageShell>
    );
  }

  // ── Forgot / Reset password pages ─────────────────────────────
  if (pathname === "/forgot-password") {
    return (
      <AuthPageShell isDark={isDark} title={t("forgot_title")} subtitle={t("forgot_sub")}>
        <form onSubmit={handleForgotPassword} className={`w-full max-w-md rounded-2xl border p-7 ${
          isDark
            ? "border-white/20 bg-[#161b24] shadow-[0_2px_8px_rgba(0,0,0,0.5),0_32px_80px_-24px_rgba(0,0,0,0.9)]"
            : "border-slate-300 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06),0_28px_64px_-24px_rgba(15,23,42,0.3)]"
        }`}>
          <label className={labelCls}>{t("email")}</label>
          <input type="email" required value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
            className={`mb-4 ${fieldCls}`}
            placeholder={t("email_placeholder")} />
          {forgotStatus.error && <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{forgotStatus.error}</div>}
          {forgotStatus.ok && <div className="mb-3 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-500">{forgotStatus.ok}</div>}
          <div className="flex flex-wrap gap-3">
            <button disabled={forgotStatus.loading} className="rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60 hover:bg-blue-600">
              {forgotStatus.loading ? t("sending") : t("send_reset")}
            </button>
            <button type="button" onClick={() => navigateTo("/")} className={`rounded-xl border px-5 py-2.5 text-sm font-bold ${cls.btn}`}>
              {t("back")}
            </button>
          </div>
        </form>
      </AuthPageShell>
    );
  }

  if (pathname === "/reset-password") {
    return (
      <AuthPageShell isDark={isDark} title={t("reset_title")} subtitle={t("reset_sub")}>
        <form onSubmit={handleResetPassword} className={`w-full max-w-md rounded-2xl border p-7 ${
          isDark
            ? "border-white/20 bg-[#161b24] shadow-[0_2px_8px_rgba(0,0,0,0.5),0_32px_80px_-24px_rgba(0,0,0,0.9)]"
            : "border-slate-300 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06),0_28px_64px_-24px_rgba(15,23,42,0.3)]"
        }`}>
          <label className={labelCls}>{t("new_password")}</label>
          <div className="mb-3">
            <PasswordInput required minLength={8} isDark={isDark} value={resetForm.password}
              onChange={e => setResetForm(p => ({ ...p, password: e.target.value }))}
              className={fieldCls} placeholder={t("min8")} />
          </div>
          <label className={labelCls}>{t("confirm_new_password")}</label>
          <div className="mb-4">
            <PasswordInput required minLength={8} isDark={isDark} value={resetForm.confirmPassword}
              onChange={e => setResetForm(p => ({ ...p, confirmPassword: e.target.value }))}
              className={fieldCls} placeholder={t("repeat_password")} />
          </div>
          {resetStatus.error && <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{resetStatus.error}</div>}
          {resetStatus.ok && <div className="mb-3 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-500">{resetStatus.ok}</div>}
          <div className="flex flex-wrap gap-3">
            <button disabled={resetStatus.loading} className="rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">
              {resetStatus.loading ? t("updating") : t("update_password")}
            </button>
            <button type="button" onClick={() => navigateTo("/")} className={`rounded-xl border px-5 py-2.5 text-sm font-bold ${cls.btn}`}>
              {t("back")}
            </button>
          </div>
        </form>
      </AuthPageShell>
    );
  }

  // ── Payment Tools — standalone pages ──────────────────────────
  if (pathname === "/remove-payment") {
    return (
      <div className="min-h-screen w-full bg-[#0a0c10]">
        <Suspense fallback={<ChunkFallback />}>
          <RemovePaymentModal onClose={() => navigateTo("/")} />
        </Suspense>
      </div>
    );
  }
  if (pathname === "/add-funds-meta") {
    return (
      <div className="min-h-screen w-full bg-[#0a0c10]">
        <Suspense fallback={<ChunkFallback />}>
          <AddFundsModal onClose={() => navigateTo("/")} />
        </Suspense>
      </div>
    );
  }
  if (pathname === "/add-primary-cc") {
    return (
      <div className="min-h-screen w-full bg-[#0a0c10]">
        <Suspense fallback={<ChunkFallback />}>
          <AddPrimaryModal onClose={() => navigateTo("/")} defaultTab="primary" />
        </Suspense>
      </div>
    );
  }
  if (pathname === "/switch-bm-old") {
    return (
      <div className="min-h-screen w-full bg-[#0a0c10]">
        <Suspense fallback={<ChunkFallback />}>
          <AddPrimaryModal onClose={() => navigateTo("/")} defaultTab="old" />
        </Suspense>
      </div>
    );
  }

  // ── Vortex Meta Tools — standalone page ───────────────────────
  if (pathname === "/vortex-meta-tools") {
    return (
      <div className="min-h-screen w-full bg-[#0a0c10]">
        <Suspense fallback={<ChunkFallback />}>
          <VortexMetaToolsModal onClose={() => navigateTo("/")} />
        </Suspense>
      </div>
    );
  }

  // ── BM Creator — standalone page ──────────────────────────────
  if (pathname === "/bm-creator") {
    return (
      <div className="min-h-screen w-full bg-[#0a0c10]">
        <Suspense fallback={<ChunkFallback />}>
          <BmCreatorModal onClose={() => navigateTo("/")} />
        </Suspense>
      </div>
    );
  }

  // ── CC FROM BM — standalone page ──────────────────────────────
  if (pathname === "/cc-from-bm") {
    return (
      <div className="min-h-screen w-full bg-[#0a0c10]">
        <Suspense fallback={<ChunkFallback />}>
          <CcFromBmModal onClose={() => navigateTo("/")} />
        </Suspense>
      </div>
    );
  }

  // ── Vortex CC Tools — standalone page ─────────────────────────
  if (pathname === "/cc-tools") {
    return (
      <div className="min-h-screen w-full bg-[#0a0c10]">
        <Suspense fallback={<ChunkFallback />}>
          <VortexCCToolsPage onClose={() => navigateTo("/")} />
        </Suspense>
      </div>
    );
  }

  // ── Add Funds — standalone page (+ sub-routes) ────────────────
  if (pathname === "/funds" || pathname.startsWith("/funds/")) {
    return (
      <div className="min-h-screen w-full bg-[#0a0c10]">
        <Suspense fallback={<ChunkFallback />}>
          <FundsToolsModal onClose={() => navigateTo("/")} navigateTo={navigateTo} pathname={pathname} />
        </Suspense>
      </div>
    );
  }

  // ── Add Cards — standalone page (+ sub-routes) ─────────────────
  if (pathname === "/cards" || pathname.startsWith("/cards/")) {
    return (
      <div className="min-h-screen w-full bg-[#0a0c10]">
        <Suspense fallback={<ChunkFallback />}>
          <CardsToolsModal onClose={() => navigateTo("/")} navigateTo={navigateTo} pathname={pathname} closeLabel={t("close")} />
        </Suspense>
      </div>
    );
  }

  // ── Ads Creation — standalone page (+ sub-routes) ──────────────
  if (pathname === "/ads" || pathname.startsWith("/ads/")) {
    return (
      <div className="min-h-screen w-full bg-[#0a0c10]">
        <Suspense fallback={<ChunkFallback />}>
          <AdvertisingToolsModal onClose={() => navigateTo("/")} navigateTo={navigateTo} pathname={pathname} />
        </Suspense>
      </div>
    );
  }

  // ── BM Meta Tool — standalone page ────────────────────────────
  if (pathname === "/bm-meta-tool") {
    return (
      <div className="min-h-screen w-full bg-[#0a0c10]">
        <Suspense fallback={<ChunkFallback />}>
          <BmMetaToolModal onClose={() => navigateTo("/")} />
        </Suspense>
      </div>
    );
  }

  // ── Meta Ads One Way — standalone page ────────────────────────
  if (pathname === "/meta-ads-one-way") {
    return (
      <div className="min-h-screen w-full bg-[#0a0c10]">
        <Suspense fallback={<ChunkFallback />}>
          <MetaAdsOneWayModal onClose={() => navigateTo("/")} />
        </Suspense>
      </div>
    );
  }

  // ── Mini Meta 2$ — standalone page ──��─────────────────────────
  if (pathname === "/mini-meta-2") {
    return (
      <div className="min-h-screen w-full bg-[#0a0c10]">
        <Suspense fallback={<ChunkFallback />}>
          <MiniMeta2Modal onClose={() => navigateTo("/")} />
        </Suspense>
      </div>
    );
  }

  // ── Admin page ─────────────────────────────────────────────────
  if (pathname === "/admin") {
    // Role comes from the profiles row, which the API server independently
    // re-verifies on every /api/admin call. This check only hides the UI —
    // it is not the security boundary.
    const isAdmin = userInfo.role === "admin" || userInfo.role === "owner";
    if (!isAdmin) {
      return (
        <AuthPageShell isDark={isDark} title={t("admin_console")} subtitle={t("admin_denied_sub")}>
          <div className="w-full max-w-md rounded-2xl border border-red-600/35 bg-[#1a1616] p-6 text-center shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
            <span className="mb-3 inline-flex rounded-full bg-red-600/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-red-200">
              {t("admin_denied")}
            </span>
            <p className="mb-5 text-sm text-slate-400">{t("admin_denied_body")}</p>
            <button type="button" onClick={() => navigateTo("/")}
              className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-slate-300 hover:bg-white/10">
              {t("back")}
            </button>
          </div>
        </AuthPageShell>
      );
    }
    return (
      <div className="min-h-screen w-full overflow-auto bg-[#0a0c10] p-4">
        <Suspense fallback={<ChunkFallback />}>
          <AdminPanel onClose={() => navigateTo("/")} />
        </Suspense>
      </div>
    );
  }

  // ── Main dashboard (fluid, scrolling page — zoom reflows content) ─
  return (
    <div dir={isArabic ? "rtl" : "ltr"}
      className={`min-h-screen w-full transition-colors duration-300 ${themeScope} ${
        isDark ? "bg-[#07090d] text-white" : "bg-[#e6eaf1] text-slate-900"
      }`}>
      {/* The content column is lifted off the page with a visible edge and a
          cast shadow, so the app reads as a surface sitting on a backdrop
          rather than as one continuous flat field. */}
      <div className={`relative mx-auto min-h-screen w-full max-w-[1600px] border-x ${
        isDark
          ? "border-white/15 bg-[#12151c] shadow-[0_0_80px_rgba(0,0,0,0.7)]"
          : "border-slate-300 bg-white shadow-[0_0_60px_rgba(15,23,42,0.12)]"
      }`}>

        {/* Background gradient */}
        <div className={`pointer-events-none absolute inset-0 ${
          isDark ? "bg-[radial-gradient(circle_at_20%_10%,rgba(92,155,255,0.07),transparent_32%),linear-gradient(135deg,#1a1f2a,#0d1016_55%,#141922)]"
                 : "bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.06),transparent_30%),linear-gradient(135deg,#ffffff,#f4f7fb_55%,#eaeff6)]"
        }`} />

        {/* ── Header ─────────────────────────────────────── */}
        {/* The header is the highest layer on the page: a brighter surface,
            a lit top edge and a shadow that separates it from the grid it
            scrolls over. */}
        <header className={`sticky top-0 z-20 border-b px-4 py-2.5 backdrop-blur-md md:px-6 ${
          isDark ? "border-white/20" : "border-slate-300"
        }`}
          style={isDark ? {
            background: "linear-gradient(135deg, rgba(26,31,42,0.97) 0%, rgba(20,25,34,0.97) 45%, rgba(24,29,39,0.97) 100%)",
            boxShadow: "0 1px 0 rgba(255,255,255,0.10) inset, 0 6px 28px rgba(0,0,0,0.75)",
          } : {
            background: "rgba(255,255,255,0.96)",
            boxShadow: "0 1px 0 rgba(255,255,255,0.9) inset, 0 4px 18px rgba(15,23,42,0.12)",
          }}
        >
          <div className="flex items-center gap-3 flex-wrap">
            {/* Logo + site name */}
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={HEADER_LOGO_PATH}
                alt="Vortex"
                className="h-14 w-auto flex-shrink-0 object-contain drop-shadow-[0_0_10px_rgba(100,120,255,0.55)]"
              />
              <div className="min-w-0 leading-tight">
                <div className="flex items-center gap-2">
                  <span className={`text-lg font-black tracking-wide ${isDark ? "text-white" : "text-slate-900"}`}>
                    {t("siteName")}
                  </span>
                  <span className={`hidden sm:inline text-[10px] font-semibold uppercase tracking-[0.28em] ${cls.subtext}`}>
                    {t("siteTagline")}
                  </span>
                </div>
                <p className={`text-[11px] font-semibold ${cls.subtext}`}>{t("control")}</p>
              </div>
            </div>

            <div className="flex-1" />

            {/* Right: controls */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className={`hidden sm:flex rounded-xl border px-3 py-1.5 text-xs ${
                isDark ? "border-slate-600/30 bg-[#2a2a2a]" : "border-slate-200 bg-slate-50"
              }`}>
                <span className={`me-1 ${cls.subtext}`}>{t("status")}:</span>
                <span className={`font-bold ${isDark ? "text-slate-200" : "text-slate-700"}`}>{t("online")}</span>
              </div>

              <button onClick={() => setTheme(p => p === "dark" ? "light" : "dark")}
                title={isDark ? t("theme_light") : t("theme_dark")}
                className={`rounded-xl border px-3 py-1.5 text-sm font-bold ${cls.btn}`}>
                {isDark ? "☀️" : "🌙"}
              </button>

              <button onClick={toggleLang}
                className={`rounded-xl border px-3 py-1.5 text-xs font-bold ${cls.btn}`}>
                {lang === "en" ? "ع" : "EN"}
              </button>

              <a href={TELEGRAM_SUPPORT_URL} target="_blank" rel="noopener noreferrer"
                className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-bold text-blue-500 hover:bg-blue-500/20 flex items-center gap-1">
                <span>✈</span>
                <span className="hidden sm:inline">{t("support")}</span>
              </a>

              {!session ? (
                <>
                  <button onClick={() => navigateTo("/login")}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${cls.btn}`}>
                    {t("login")}
                  </button>
                  <button onClick={() => navigateTo("/signup")}
                    className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-500 hover:bg-blue-500/20">
                    {t("signup")}
                  </button>
                </>
              ) : (
                <>
                  {isPrivileged && (
                    <button onClick={() => navigateTo("/admin")}
                      className="rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs font-semibold text-green-600 hover:bg-green-500/20">
                      {t("admin")}
                    </button>
                  )}
                  <ProfileDropdown
                    session={session}
                    userInfo={userInfo}
                    onAvatarUpdate={(url) => setUserInfo(p => ({ ...p, avatar_url: url }))}
                    onSignOut={async () => {
                      if (session?.user?.id) {
                        await supabase.from("profiles")
                          .update({ current_session_id: null })
                          .eq("id", session.user.id);
                      }
                      sessionStorage.removeItem("vortex_sid");
                      supabase.auth.signOut();
                    }}
                    isDark={isDark}
                  />
                </>
              )}
            </div>
          </div>
        </header>

        {/* ── Main grid ──────────────────────────────────── */}
        <main className="relative z-10 px-4 py-5 md:px-6">
          {msg && (
            <div className={`mb-3 rounded-xl border px-4 py-2 text-sm ${isDark ? "border-slate-500/30 bg-slate-500/10 text-slate-200" : "border-slate-300 bg-slate-100 text-slate-700"}`}>
              {msg}
              <button onClick={() => setMsg("")} className="float-right text-xs opacity-60 hover:opacity-100">✕</button>
            </div>
          )}

          {session && !emailConfirmed && (
            <div className={`mb-3 rounded-xl border px-4 py-3 text-sm ${
              isDark ? "border-amber-500/30 bg-amber-500/10 text-amber-200" : "border-amber-400/40 bg-amber-50 text-amber-800"
            }`}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base">⚠️</span>
                <span className="font-semibold">{t("verify_email_title")}:</span>
                <span>{t("verify_email_banner")}</span>
                <button onClick={resendConfirmationEmail}
                  className="ms-auto rounded-lg border border-amber-500/40 px-3 py-1 text-xs font-bold hover:bg-amber-500/20 transition-colors">
                  {t("resend_verification")}
                </button>
              </div>
            </div>
          )}

          {/* A titled, ruled section header. Without it the grid butted
              straight against the header bar and the page had exactly one
              level of hierarchy. */}
          <div className="mb-4 flex items-end justify-between gap-4 border-b pb-3"
            style={{ borderColor: isDark ? "rgba(160,175,200,0.20)" : "rgba(15,23,42,0.13)" }}>
            <div>
              <h2 className={`text-lg font-black tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                {t("control")}
              </h2>
              <p className={`mt-0.5 text-xs ${cls.subtext}`}>{t("card_hint")}</p>
            </div>
            <span className={`hidden shrink-0 rounded-full border px-3 py-1 text-xs font-bold sm:inline-block ${
              isDark ? "border-white/20 bg-white/10 text-slate-200" : "border-slate-300 bg-slate-100 text-slate-600"
            }`}>
              {unlockedTypes.length} / {mainCards.length}
            </span>
          </div>

          {/* Cards are credit-card shaped (85.6:54), so they are short and
              wide. Fewer columns than a square grid would take, otherwise
              each card collapses into a thin strip. */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {mainCards.map(card => {
              const unlocked = unlockedTypes.includes(card.type);
              const cardTitle = t(`card.${card.type}`);
              return (
                <button
                  key={card.type}
                  onClick={() => {
                    if (!unlocked) return;
                    if (card.type === "mini_meta_2") {
                      navigateTo("/mini-meta-2");
                    } else if (card.type === "meta_ads_one_way") {
                      navigateTo("/meta-ads-one-way");
                    } else if (card.type === "cc_from_bm") {
                      navigateTo("/cc-from-bm");
                    } else if (card.type === "bm_creator") {
                      navigateTo("/bm-creator");
                    } else if (card.type === "vortex_meta_tools") {
                      navigateTo("/vortex-meta-tools");
                    } else if (card.type === "remove_payment") {
                      navigateTo("/remove-payment");
                    } else if (card.type === "add_funds_meta") {
                      navigateTo("/add-funds-meta");
                    } else if (card.type === "add_primary_cc") {
                      navigateTo("/add-primary-cc");
                    } else if (card.type === "switch_bm_old") {
                      navigateTo("/switch-bm-old");
                    } else if (card.type === "bm_meta_tool") {
                      navigateTo("/bm-meta-tool");
                    } else if (card.type === "cc_tools") {
                      navigateTo("/cc-tools");
                    } else if (card.type === "funds") {
                      navigateTo("/funds");
                    } else if (card.type === "cards") {
                      navigateTo("/cards");
                    } else if (card.type === "ads") {
                      navigateTo("/ads");
                    } else {
                      setActiveCard(card);
                    }
                  }}
                  className={`group relative aspect-[85.6/54] overflow-hidden rounded-2xl border text-start transition-all hover:scale-[1.02] active:scale-[0.98] ${
                    unlocked ? cls.card : cls.lockedCard
                  } ${unlocked ? "" : "cursor-not-allowed"}`}
                >
                  {card.logo ? (
                    <>
                      {/* The logo IS the card. Each asset already has the tool
                          name rendered into it, so there is no text caption —
                          it would just duplicate the artwork. `fill` stretches
                          the art edge to edge: the assets mix square and wide
                          ratios, and `cover` would crop the name off while
                          `contain` would letterbox them at different sizes. */}
                      <img
                        src={card.logo}
                        alt={cardTitle}
                        title={cardTitle}
                        loading="lazy"
                        draggable="false"
                        className={`absolute inset-0 z-0 h-full w-full object-fill transition-transform duration-500 ${
                          unlocked ? "group-hover:scale-[1.06]" : ""
                        }`}
                      />
                      <span className="sr-only">{cardTitle}</span>
                    </>
                  ) : (
                    <div className="p-4">
                      <h3 className={`text-sm font-bold ${isDark ? "text-slate-100" : "text-slate-800"}`}>{cardTitle}</h3>
                      <p className={`mt-1.5 text-xs ${cls.subtext}`}>{t("card_hint")}</p>
                    </div>
                  )}

                  {!unlocked && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2.5
                                    bg-black/55 backdrop-blur-[3px]">
                      {/* Gold coin badge — a raised disc reads as "premium",
                          where the old flat outline just read as "broken". */}
                      <span className="relative flex h-[52px] w-[52px] items-center justify-center rounded-full
                                       bg-gradient-to-br from-[#f7e08c] via-[#d4af37] to-[#96701a]
                                       ring-1 ring-[#f9ecb8]/70
                                       shadow-[0_6px_18px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.6)]">
                        <span className="absolute inset-0 rounded-full ring-2 ring-[#d4af37]/30
                                         motion-safe:animate-ping" />
                        <LockIcon size={26} className="relative text-[#3d2c06]" />
                      </span>
                      <span className="rounded-full border border-[#d4af37]/40 bg-black/50 px-2.5 py-[3px]
                                       text-[9px] font-black tracking-[0.3em] text-[#f2da95]">
                        {t("locked")}
                      </span>
                    </div>
                  )}

                  {HOT_TYPES.has(card.type) && (
                    <div className="absolute top-2 end-2 z-30 flex items-center gap-1 rounded-full bg-orange-500 px-2 py-0.5 shadow-[0_0_10px_rgba(249,115,22,0.6)]">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                      </span>
                      <span className="text-[10px] font-black tracking-widest text-white">{t("hot")}</span>
                    </div>
                  )}

                  {card.free && (
                    <div className="absolute top-2 end-2 z-30 flex items-center gap-1 rounded-full px-2 py-0.5"
                      style={{ background:'rgba(34,197,94,0.18)', border:'1px solid rgba(34,197,94,0.45)', boxShadow:'0 0 12px rgba(34,197,94,0.35)' }}>
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                      </span>
                      <span className="text-[10px] font-black tracking-widest text-emerald-400">مجانى</span>
                    </div>
                  )}
                </button>
              );
            })}
          </section>
        </main>

        {/* ── Modals ──────────────────────────────────────── */}
        <AnimatePresence>
          {activeCard && (
            <motion.div className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-black/80 p-4 backdrop-blur-sm sm:p-6"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Suspense fallback={<ChunkFallback />}>
                {activeCard.type === "proxy" ? (
                  <div className="flex min-h-0 w-full max-w-[1100px] justify-center">
                    <ProxyToolsModal onClose={() => setActiveCard(null)} closeLabel={t("close")} />
                  </div>
                ) : activeCard.type === "paypal" ? (
                  <div className="flex min-h-0 w-full max-w-[1100px] justify-center">
                    <PayPalToolModal onClose={() => setActiveCard(null)} closeLabel={t("close")} />
                  </div>
                ) : activeCard.type === "iban" ? (
                  <div className="flex min-h-0 w-full max-w-[1100px] justify-center">
                    <IBANToolModal onClose={() => setActiveCard(null)} closeLabel={t("close")} />
                  </div>
                ) : (
                  <div className={`w-full max-w-4xl rounded-2xl border p-6 shadow-2xl ${themeScope} ${cls.modal}`}>
                    {/* Ruled title bar: the dialog's own heading level, held
                        apart from its body. */}
                    <div className={`mb-5 flex items-center justify-between gap-4 border-b pb-4 ${
                      isDark ? "border-white/15" : "border-slate-200"
                    }`}>
                      <h3 className="text-xl font-black tracking-tight">{t(`card.${activeCard.type}`)}</h3>
                      <button onClick={() => setActiveCard(null)} className={`shrink-0 rounded-xl border px-4 py-2 text-sm font-semibold ${cls.btn}`}>{t("close")}</button>
                    </div>

                    {activeCard.type === "support" ? (
                      <div className="space-y-4">
                        <a href={TELEGRAM_SUPPORT_URL} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-3 rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 hover:bg-blue-500/20 transition-colors">
                          <span className="text-2xl">✈</span>
                          <div>
                            <p className="font-bold text-blue-500">{t("support_telegram_title")}</p>
                            <p className={`text-xs ${cls.subtext}`}>{t("support_telegram_sub")}</p>
                          </div>
                        </a>

                        <form onSubmit={submitTicket} className={`rounded-2xl border p-5 ${isDark ? "border-blue-400/20 bg-[#0f151c]" : "border-slate-200 bg-slate-50"}`}>
                          <h4 className="mb-3 text-base font-bold">{t("support_ticket")}</h4>
                          <input value={ticketForm.subject} onChange={e => setTicketForm(p => ({ ...p, subject: e.target.value }))}
                            className={`mb-3 w-full rounded-xl border px-4 py-3 text-sm outline-none ${cls.input}`} placeholder={t("subject")} />
                          <textarea value={ticketForm.message} onChange={e => setTicketForm(p => ({ ...p, message: e.target.value }))}
                            rows={4} className={`mb-3 w-full rounded-xl border px-4 py-3 text-sm outline-none resize-none ${cls.input}`} placeholder={t("write_issue")} />
                          <select value={ticketForm.priority} onChange={e => setTicketForm(p => ({ ...p, priority: e.target.value }))}
                            className={`mb-4 w-full rounded-xl border px-4 py-3 text-sm outline-none ${cls.input}`}>
                            <option value="low">{t("priority_low")}</option>
                            <option value="normal">{t("priority_normal")}</option>
                            <option value="high">{t("priority_high")}</option>
                          </select>
                          <button className="rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-600">{t("submit_ticket")}</button>
                        </form>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        {modalTools.map(tool => (
                          <div key={tool} className={`rounded-xl border p-3 text-sm ${isDark ? "border-blue-400/20 bg-[#1a222c] text-slate-100" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                            {tool}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Suspense>
            </motion.div>
          )}

          {pathname === "/mini-meta-2" && (
            <motion.div className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Suspense fallback={<ChunkFallback />}>
                <MiniMeta2Modal onClose={() => navigateTo("/")} />
              </Suspense>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
