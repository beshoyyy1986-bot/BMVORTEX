import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import PasswordInput from './PasswordInput.jsx';

// ── Permissions this tool actually needs ──────────────────────────
// Derived from the Graph endpoints in server/routes/meta.js.
const REQUIRED_SCOPES = [
  { scope: 'ads_management',      why: 'إنشاء الحملات والإعلانات وتعديلها وإيقافها' },
  { scope: 'ads_read',            why: 'قراءة الحسابات الإعلانية وحالتها ورصيدها' },
  { scope: 'business_management', why: 'الوصول لأصول Business Manager' },
  { scope: 'pages_show_list',     why: 'عرض قائمة صفحاتك' },
  { scope: 'pages_read_engagement', why: 'قراءة منشورات الصفحة' },
  { scope: 'pages_manage_posts',  why: 'نشر وحذف منشورات الصفحة (Dark Posts)' },
];

const GRAPH_EXPLORER_URL = 'https://developers.facebook.com/tools/explorer/';
const ACCESS_TOKEN_TOOL_URL = 'https://developers.facebook.com/tools/accesstoken/';
const SYSTEM_USER_DOCS_URL = 'https://www.facebook.com/business/help/503306463479099';

// ── localStorage helpers ──────────────────────────────────────────
const STORAGE_KEY = 'bm_saved_accounts';
const ACTIVE_KEY  = 'bm_active_token';

function loadAccounts() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); }
  catch { return []; }
}
function saveAccounts(accs) { localStorage.setItem(STORAGE_KEY, JSON.stringify(accs)); }

// ── API helper ────────────────────────────────────────────────────
async function api(endpoint, body) {
  const r = await fetch(`/api/meta/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

// ── Country list ──────────────────────────────────────────────────
const COUNTRIES = [
  { code: 'EG', name: 'مصر' }, { code: 'SA', name: 'السعودية' }, { code: 'AE', name: 'الإمارات' },
  { code: 'KW', name: 'الكويت' }, { code: 'QA', name: 'قطر' }, { code: 'BH', name: 'البحرين' },
  { code: 'OM', name: 'عُمان' }, { code: 'JO', name: 'الأردن' }, { code: 'LB', name: 'لبنان' },
  { code: 'IQ', name: 'العراق' }, { code: 'SY', name: 'سوريا' }, { code: 'YE', name: 'اليمن' },
  { code: 'LY', name: 'ليبيا' }, { code: 'TN', name: 'تونس' }, { code: 'DZ', name: 'الجزائر' },
  { code: 'MA', name: 'المغرب' }, { code: 'SD', name: 'السودان' }, { code: 'PS', name: 'فلسطين' },
  { code: 'US', name: 'الولايات المتحدة' }, { code: 'GB', name: 'المملكة المتحدة' },
  { code: 'DE', name: 'ألمانيا' }, { code: 'FR', name: 'فرنسا' }, { code: 'TR', name: 'تركيا' },
];

const OBJECTIVES = [
  { value: 'OUTCOME_ENGAGEMENT', label: 'تفاعل مع المنشور' },
  { value: 'MESSENGER',          label: 'رسائل ماسنجر 💬' },
  { value: 'OUTCOME_TRAFFIC',    label: 'زيارات (يتطلب رابط)' },
  { value: 'OUTCOME_AWARENESS',  label: 'وعي / وصول' },
  { value: 'OUTCOME_LEADS',      label: 'عملاء محتملون' },
  { value: 'OUTCOME_SALES',      label: 'مبيعات (يتطلب Pixel)' },
];

// Standard pixel events accepted as custom_event_type for conversion goals.
const PIXEL_EVENTS = [
  'PURCHASE', 'ADD_TO_CART', 'INITIATED_CHECKOUT', 'LEAD',
  'COMPLETE_REGISTRATION', 'ADD_PAYMENT_INFO', 'VIEW_CONTENT', 'SEARCH',
];

const ACCOUNT_STATUS = {
  1: { label: 'نشط',       color: 'bg-green-500/20 text-green-400' },
  2: { label: 'معطّل',     color: 'bg-red-500/20 text-red-400' },
  3: { label: 'غير محدد',  color: 'bg-yellow-500/20 text-yellow-400' },
  7: { label: 'معلّق',     color: 'bg-orange-500/20 text-orange-400' },
  9: { label: 'مراجعة',    color: 'bg-blue-500/20 text-blue-400' },
};

function fmtCents(val, currency) {
  if (!val) return null;
  const n = parseInt(val, 10);
  if (isNaN(n)) return null;
  return `${(n / 100).toFixed(2)} ${currency ?? ''}`.trim();
}

// ── Sub-components ────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-amber-400/80">{label}</label>
      {children}
    </div>
  );
}
Field.propTypes = { label: PropTypes.string, children: PropTypes.node };

function Input({ className = '', ...props }) {
  return (
    <input
      className={`w-full rounded-md border border-amber-500/20 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-amber-500/50 focus:outline-none ${className}`}
      {...props}
    />
  );
}
Input.propTypes = { className: PropTypes.string };

function Select({ value, onChange, children, disabled }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className="w-full rounded-md border border-amber-500/20 bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-amber-500/50 focus:outline-none disabled:opacity-50"
    >
      {children}
    </select>
  );
}
Select.propTypes = { value: PropTypes.string, onChange: PropTypes.func, children: PropTypes.node, disabled: PropTypes.bool };

function Btn({ onClick, disabled, loading, variant = 'primary', children, size = 'md' }) {
  const base = 'rounded-lg font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2';
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-5 py-2.5 text-sm' };
  const variants = {
    primary:  'bg-amber-500 hover:bg-amber-400 text-black',
    secondary:'border border-amber-500/30 bg-transparent text-amber-400 hover:bg-amber-500/10',
    danger:   'border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20',
    green:    'bg-green-600 hover:bg-green-500 text-white',
    ghost:    'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10',
  };
  return (
    <button onClick={onClick} disabled={disabled || loading} className={`${base} ${sizes[size]} ${variants[variant]}`}>
      {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}
Btn.propTypes = { onClick: PropTypes.func, disabled: PropTypes.bool, loading: PropTypes.bool, variant: PropTypes.string, children: PropTypes.node, size: PropTypes.string };

function ResultBox({ data }) {
  if (!data) return null;
  return (
    <div className={`rounded-xl border p-3 text-sm ${data.ok ? 'border-green-500/30 bg-green-500/10 text-green-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>
      {data.ok
        ? <><span className="font-bold">✅ </span>{data.message}</>
        : <><span className="font-bold">❌ </span>{data.reason}</>
      }
      {data.ok && data.ad_id && (
        <div className="mt-2 space-y-0.5 text-[11px] font-mono text-green-400/80">
          {data.campaign_id && <div>Campaign: {data.campaign_id}</div>}
          {data.adset_id && <div>AdSet: {data.adset_id}</div>}
          {data.ad_id && <div>Ad: {data.ad_id}</div>}
        </div>
      )}
    </div>
  );
}
ResultBox.propTypes = { data: PropTypes.object };

// ── Token expiry formatting ───────────────────────────────────────
function fmtRemaining(expiresAt) {
  if (expiresAt === 0) return { text: 'لا ينتهي (دائم)', tone: 'good' };
  if (!expiresAt) return null;
  const secs = expiresAt - Math.floor(Date.now() / 1000);
  if (secs <= 0) return { text: 'منتهي', tone: 'bad' };
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return { text: `${d} يوم و ${h} ساعة`, tone: d >= 7 ? 'good' : 'warn' };
  if (h > 0) return { text: `${h} ساعة و ${m} دقيقة`, tone: 'warn' };
  return { text: `${m} دقيقة`, tone: 'bad' };
}

function TokenHelpModal({ onClose }) {
  const [copied, setCopied] = useState(false);
  const scopeString = REQUIRED_SCOPES.map(s => s.scope).join(',');

  const copyScopes = () => {
    navigator.clipboard?.writeText(scopeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-amber-500/25 bg-[#141414] shadow-2xl"
      >
        <header className="sticky top-0 flex items-center justify-between border-b border-amber-500/15 bg-[#141414] px-5 py-3">
          <h3 className="text-sm font-bold text-amber-400">🔑 كيفية الحصول على User Token</h3>
          <button onClick={onClose} className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10">✕</button>
        </header>

        <div className="space-y-5 px-5 py-4 text-sm text-slate-300">
          <section className="space-y-2">
            <h4 className="font-bold text-amber-400/90">١ · من أين تستخرج التوكن؟</h4>
            <ol className="list-decimal space-y-1.5 pr-5 text-[13px] leading-relaxed text-slate-400">
              <li>افتح <a href={GRAPH_EXPLORER_URL} target="_blank" rel="noopener noreferrer" className="text-amber-400 underline">Graph API Explorer</a></li>
              <li>من قائمة <span className="text-slate-200">Meta App</span> اختر تطبيقك (أنشئ واحداً من نوع Business لو مش موجود)</li>
              <li>من <span className="text-slate-200">User or Page</span> اختر <span className="text-slate-200">User Token</span></li>
              <li>من <span className="text-slate-200">Permissions</span> أضف الصلاحيات المذكورة بالأسفل</li>
              <li>اضغط <span className="text-slate-200">Generate Access Token</span> ووافق على الأذونات</li>
              <li>انسخ التوكن (يبدأ بـ <span className="font-mono text-amber-400">EAA</span>) والصقه في «إضافة توكن»</li>
            </ol>
            <div className="flex flex-wrap gap-2 pt-1">
              <a href={GRAPH_EXPLORER_URL} target="_blank" rel="noopener noreferrer"
                 className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-black hover:bg-amber-400">
                فتح Graph API Explorer ↗
              </a>
              <a href={ACCESS_TOKEN_TOOL_URL} target="_blank" rel="noopener noreferrer"
                 className="rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs font-bold text-amber-400 hover:bg-amber-500/10">
                أداة فحص التوكنات ↗
              </a>
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-amber-400/90">٢ · الصلاحيات المطلوبة فعلاً</h4>
              <button onClick={copyScopes} className="rounded-md border border-amber-500/30 px-2 py-1 text-[11px] text-amber-400 hover:bg-amber-500/10">
                {copied ? '✓ تم النسخ' : 'نسخ الكل'}
              </button>
            </div>
            <p className="text-[12px] text-slate-500">هذه بالضبط ما تستخدمه الأداة — لا تضف صلاحيات زائدة.</p>
            <div className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
              {REQUIRED_SCOPES.map(s => (
                <div key={s.scope} className="flex items-start justify-between gap-3 px-3 py-2">
                  <code className="flex-shrink-0 font-mono text-[12px] text-amber-400">{s.scope}</code>
                  <span className="text-left text-[12px] text-slate-400">{s.why}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h4 className="font-bold text-amber-400/90">٣ · مدة صلاحية التوكن</h4>
            <div className="space-y-2 text-[13px] leading-relaxed text-slate-400">
              <p>
                التوكن الذي تنسخه من Graph API Explorer <span className="text-amber-400">قصير الأجل</span> — ينتهي خلال ساعة أو ساعتين تقريباً.
                عند انتهائه ستظهر رسالة خطأ برقم <span className="font-mono text-slate-200">190</span>، والحل هو توليد توكن جديد بنفس الخطوات.
              </p>
              <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                <p className="mb-1.5 font-bold text-slate-300">تمديد المدة إلى ٦٠ يوماً</p>
                <p>
                  يمكن تحويل التوكن القصير إلى <span className="text-amber-400">Long-Lived</span> يدوم ٦٠ يوماً، لكن ذلك
                  يتطلب <span className="text-slate-200">App Secret</span> الخاص بتطبيقك.
                  ولأن هذا السر خطير ولا يصح إرساله لأي خدمة خارجية، لا تقوم الأداة بهذه الخطوة نيابةً عنك.
                  نفّذها بنفسك من متصفحك عبر رابط <span className="font-mono text-[11px] text-slate-300">/oauth/access_token</span> بصيغة{' '}
                  <span className="font-mono text-[11px] text-slate-300">grant_type=fb_exchange_token</span>.
                </p>
              </div>
              <div className="rounded-xl border border-green-500/25 bg-green-500/5 p-3">
                <p className="mb-1.5 font-bold text-green-400">الحل الأفضل للعمل المستمر: System User</p>
                <p>
                  من <span className="text-slate-200">Business Manager</span> يمكنك إنشاء <span className="text-green-400">System User</span> والحصول على توكن
                  <span className="text-green-400"> بلا تاريخ انتهاء</span> — لا يعتمد على بقائك مسجّل الدخول، وهو الخيار المناسب للاستخدام طويل المدى.
                </p>
                <a href={SYSTEM_USER_DOCS_URL} target="_blank" rel="noopener noreferrer"
                   className="mt-2 inline-block text-[12px] text-green-400 underline">
                  شرح إنشاء System User ↗
                </a>
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <h4 className="font-bold text-amber-400/90">٤ · كيف تعرف أن التوكن يعمل؟</h4>
            <p className="text-[13px] leading-relaxed text-slate-400">
              بعد إضافة التوكن اضغط زر <span className="text-amber-400">🔍 فحص</span> بجوار اسم الحساب.
              سيعرض لك صلاحية التوكن، الوقت المتبقي قبل انتهائه، والصلاحيات الممنوحة مقارنةً بالمطلوبة.
            </p>
            <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-400/80">
              ملاحظة: تفاصيل الصلاحيات ومدة الانتهاء تظهر فقط إذا كان حسابك يملك دوراً على التطبيق الذي أصدر التوكن.
              وإلا ستظهر حالة الصلاحية فقط (يعمل / لا يعمل).
            </p>
          </section>

          <section className="rounded-xl border border-red-500/25 bg-red-500/5 p-3">
            <p className="text-[12px] leading-relaxed text-red-300/90">
              <span className="font-bold">تحذير أمني:</span> التوكن يمنح صلاحية كاملة على حساباتك الإعلانية وصفحاتك.
              لا تشاركه مع أحد. يُحفظ في متصفحك فقط ولا يُرسل لأي جهة غير Meta.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
TokenHelpModal.propTypes = { onClose: PropTypes.func };

// ── Main Component ────────────────────────────────────────────────
export default function BmMetaToolModal({ onClose }) {
  // Account management
  const [accounts, setAccounts]         = useState(loadAccounts);
  const [activeToken, setActiveToken]   = useState(() => localStorage.getItem(ACTIVE_KEY) ?? loadAccounts()[0]?.token ?? '');
  const [showAddToken, setShowAddToken] = useState(false);
  const [showTokenHelp, setShowTokenHelp] = useState(false);
  const [tokenInfo, setTokenInfo]        = useState(null);
  const [checkingToken, setCheckingToken] = useState(false);
  const [newToken, setNewToken]         = useState('');
  const [newProxy, setNewProxy]         = useState('');
  const [useProxy, setUseProxy]         = useState(false);

  // Connection data
  const [connectData, setConnectData]   = useState(null);
  const [connecting, setConnecting]     = useState(false);

  // Selections
  const [selAccount, setSelAccount]     = useState('');
  const [selPage, setSelPage]           = useState('');
  const [selPost, setSelPost]           = useState('');
  const [manualPageToken, setManualPageToken] = useState('');
  const [posts, setPosts]               = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(false);

  // Ad settings
  const [budget, setBudget]             = useState(10);
  const [days, setDays]                 = useState(0);
  const [objective, setObjective]       = useState('OUTCOME_ENGAGEMENT');
  const [trafficUrl, setTrafficUrl]     = useState('');
  const [publishStatus, setPublishStatus] = useState('PAUSED');
  const [unpublishAfter, setUnpublishAfter] = useState(true);
  const [pixels, setPixels]             = useState([]);
  const [pixelId, setPixelId]           = useState('');
  const [pixelEvent, setPixelEvent]     = useState('PURCHASE');
  const [loadingPixels, setLoadingPixels] = useState(false);
  const [refreshing, setRefreshing]     = useState(false);

  // Targeting
  const [audienceMode, setAudienceMode] = useState('custom');
  const [country, setCountry]           = useState('EG');
  const [ageMin, setAgeMin]             = useState(18);
  const [ageMax, setAgeMax]             = useState(65);
  const [gender, setGender]             = useState(0);
  const [customAudienceId, setCustomAudienceId] = useState('');

  // Post mode
  const [postMode, setPostMode]         = useState('existing');
  const [darkMessage, setDarkMessage]   = useState('');
  const [darkImageB64, setDarkImageB64] = useState(null);
  const [darkImageName, setDarkImageName] = useState('');
  const [darkImagePreview, setDarkImagePreview] = useState('');
  const [creatingDarkPost, setCreatingDarkPost] = useState(false);
  const [darkPostResult, setDarkPostResult] = useState(null);

  // Results
  const [adResult, setAdResult]         = useState(null);
  const [creating, setCreating]         = useState(false);

  // Ad management
  const [tab, setTab]                   = useState('create');
  const [editAdId, setEditAdId]         = useState('');
  const [editAdsetId, setEditAdsetId]   = useState('');
  const [editCampaignId, setEditCampaignId] = useState('');
  const [adStatus, setAdStatus]         = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [editBudget, setEditBudget]     = useState('');
  const [editEndDays, setEditEndDays]   = useState('');
  const [editPostId, setEditPostId]     = useState('');
  const [updatingAd, setUpdatingAd]     = useState(false);
  const [updateResult, setUpdateResult] = useState(null);

  // Persist accounts
  useEffect(() => { saveAccounts(accounts); }, [accounts]);
  useEffect(() => {
    if (activeToken) localStorage.setItem(ACTIVE_KEY, activeToken);
    else localStorage.removeItem(ACTIVE_KEY);
  }, [activeToken]);

  // Auto-connect on mount
  useEffect(() => {
    if (activeToken) connectWithToken(activeToken, accounts.find(a => a.token === activeToken)?.proxy ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectWithToken = useCallback(async (token, proxy = null) => {
    if (!token) return;
    setConnecting(true);
    setConnectData(null);
    setSelAccount(''); setSelPage(''); setSelPost(''); setPosts([]);
    const data = await api('connect', { token, proxy });
    setConnectData(data);
    setConnecting(false);
  }, []);

  const handleAddToken = async () => {
    if (!newToken.trim()) return;
    const token = newToken.trim();
    const proxy = useProxy && newProxy.trim() ? newProxy.trim() : null;
    setConnecting(true);
    const data = await api('connect', { token, proxy });
    setConnecting(false);
    if (!data.ok) { alert(data.reason ?? 'توكن غير صالح'); return; }
    const label = `حساب ${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`;
    const acc = { token, label, proxy, savedAt: Date.now() };
    setAccounts(prev => prev.find(a => a.token === token) ? prev : [acc, ...prev]);
    setActiveToken(token);
    setConnectData(data);
    setNewToken(''); setNewProxy(''); setUseProxy(false); setShowAddToken(false);
  };

  const handleCheckToken = async () => {
    if (!activeToken) return;
    setCheckingToken(true);
    setTokenInfo(null);
    const acc = accounts.find(a => a.token === activeToken);
    const data = await api('token-info', { token: activeToken, proxy: acc?.proxy ?? null });
    setTokenInfo(data);
    setCheckingToken(false);
  };

  const handleSwitchAccount = (acc) => {
    setActiveToken(acc.token);
    setTokenInfo(null);
    connectWithToken(acc.token, acc.proxy ?? null);
  };

  const handleDeleteAccount = (token) => {
    const remaining = accounts.filter(a => a.token !== token);
    setAccounts(remaining);
    if (activeToken === token) {
      if (remaining.length > 0) handleSwitchAccount(remaining[0]);
      else { setActiveToken(''); setConnectData(null); }
    }
  };

  // Fetch page posts when page selected
  const pageAccessToken = (connectData?.pages ?? []).find(p => p.id === selPage)?.access_token
    || activeToken;

  const reloadPosts = useCallback(async (keepSelection = false) => {
    if (!selPage || !pageAccessToken) return;
    setLoadingPosts(true);
    if (!keepSelection) { setSelPost(''); setPosts([]); }
    try {
      const data = await api('page-posts', { page_id: selPage, page_token: pageAccessToken });
      setPosts(data.posts ?? []);
    } finally {
      setLoadingPosts(false);
    }
  }, [selPage, pageAccessToken]);

  useEffect(() => { reloadPosts(); }, [reloadPosts]);

  // Load pixels when the Sales objective needs one
  useEffect(() => {
    if (objective !== 'OUTCOME_SALES' || !selAccount || !activeToken) return;
    setLoadingPixels(true);
    api('pixels', { token: activeToken, ad_account: selAccount })
      .then(d => {
        const list = d.pixels ?? [];
        setPixels(list);
        setPixelId(prev => prev || (list[0]?.id ?? ''));
      })
      .finally(() => setLoadingPixels(false));
  }, [objective, selAccount, activeToken]);

  // Pull fresh accounts / pages / posts for the active token
  const handleRefreshAll = async () => {
    if (!activeToken) return;
    setRefreshing(true);
    const acc = accounts.find(a => a.token === activeToken);
    const data = await api('connect', { token: activeToken, proxy: acc?.proxy ?? null });
    if (data.ok) setConnectData(data);
    await reloadPosts(true);
    setRefreshing(false);
  };

  // Reset when token changes
  useEffect(() => {
    setSelAccount(''); setSelPage(''); setSelPost(''); setPosts([]);
    setAdResult(null);
  }, [activeToken]);

  // Auto-fill IDs when ad is created
  useEffect(() => {
    if (adResult?.ok) {
      if (adResult.ad_id) setEditAdId(adResult.ad_id);
      if (adResult.adset_id) setEditAdsetId(adResult.adset_id);
      if (adResult.campaign_id) setEditCampaignId(adResult.campaign_id);
    }
  }, [adResult]);

  const activeAccounts = (connectData?.accounts ?? []).filter(a => a.account_status === 1);
  const pages = connectData?.pages ?? [];
  const activePage = pages.find(p => p.id === selPage);
  const autoPageToken = activePage?.access_token ?? null;
  const activePageToken = autoPageToken || manualPageToken || activeToken;
  const needsManualToken = selPage && !autoPageToken;
  const activeAcc = accounts.find(a => a.token === activeToken);

  const handleCreateDarkPost = async () => {
    if (!selPage || !activePageToken || !darkMessage.trim()) return;
    setCreatingDarkPost(true);
    setDarkPostResult(null);
    const data = await api('dark-post', {
      page_id: selPage, page_token: activePageToken,
      message: darkMessage,
      image_base64: darkImageB64, image_name: darkImageName || 'image.jpg',
    });
    setDarkPostResult(data);
    setCreatingDarkPost(false);
    if (data.ok && data.post_id) setSelPost(data.post_id);
  };

  const handleCreateAd = async (status) => {
    const postId = postMode === 'dark' ? (darkPostResult?.post_id ?? selPost) : selPost;
    if (!selAccount || !selPage || !postId || !activeToken) return;
    setCreating(true); setAdResult(null);
    const data = await api('create-ad', {
      token: activeToken, ad_account: selAccount, page_id: selPage, post_id: postId,
      budget: Number(budget), days: Number(days), objective,
      traffic_url: trafficUrl || null, publish_status: status,
      pixel_id: objective === 'OUTCOME_SALES' ? (pixelId || null) : null,
      custom_event_type: objective === 'OUTCOME_SALES' ? pixelEvent : undefined,
      country: audienceMode === 'custom' ? country : 'WW',
      age_min: audienceMode === 'custom' ? Number(ageMin) : undefined,
      age_max: audienceMode === 'custom' ? Number(ageMax) : undefined,
      gender: audienceMode === 'custom' ? Number(gender) : undefined,
      custom_audience_id: audienceMode === 'saved' && customAudienceId ? customAudienceId : null,
    });

    // Await the deletion so its outcome can be reported, not fired blindly.
    if (data.ok && unpublishAfter && postMode === 'existing' && selPost) {
      const del = await api('delete-post', { post_id: selPost, page_token: activePageToken });
      data.message = `${data.message ?? ''} | ${
        del?.ok ? '✅ تم حذف المنشور بنجاح' : `⚠️ فشل حذف المنشور: ${del?.reason ?? 'خطأ غير معروف'}`
      }`;
      if (del?.ok) {
        setPosts(prev => prev.filter(p => p.id !== selPost));
        setSelPost('');
      }
    }

    setAdResult(data);
    setCreating(false);
  };

  const handleFetchAdStatus = async () => {
    if (!editAdId.trim() || !activeToken) return;
    setLoadingStatus(true); setAdStatus(null); setUpdateResult(null);
    const data = await api('get-ad-status', {
      token: activeToken, ad_id: editAdId.trim(),
      adset_id: editAdsetId.trim() || null,
      campaign_id: editCampaignId.trim() || null,
    });
    setAdStatus(data);
    setLoadingStatus(false);
  };

  const handleToggleAdStatus = async (newStatus) => {
    setUpdatingAd(true); setUpdateResult(null);
    const data = await api('update-ad', {
      token: activeToken,
      ad_id: editAdId.trim() || adStatus?.ad_id,
      adset_id: editAdsetId.trim() || adStatus?.adset_id,
      campaign_id: editCampaignId.trim() || adStatus?.campaign_id,
      status: newStatus, daily_budget: null, end_time: null, post_id: null, page_id: null, ad_account: null,
    });
    setUpdateResult(data);
    setUpdatingAd(false);
    if (data.ok) handleFetchAdStatus();
  };

  const handleUpdateAd = async () => {
    setUpdatingAd(true); setUpdateResult(null);
    const endTime = editEndDays && Number(editEndDays) > 0
      ? new Date(Date.now() + Number(editEndDays) * 86400000).toISOString().replace(/\.\d{3}Z$/, '+0000')
      : null;
    const data = await api('update-ad', {
      token: activeToken,
      ad_id: editAdId.trim() || adStatus?.ad_id,
      adset_id: editAdsetId.trim() || adStatus?.adset_id,
      campaign_id: editCampaignId.trim() || adStatus?.campaign_id,
      daily_budget: editBudget ? Number(editBudget) : null,
      end_time: endTime,
      post_id: editPostId.trim() || null,
      page_id: selPage || null,
      ad_account: selAccount || null,
      status: null,
    });
    setUpdateResult(data);
    setUpdatingAd(false);
    if (data.ok) handleFetchAdStatus();
  };

  const objectiveReady =
    (objective !== 'OUTCOME_SALES' || Boolean(pixelId)) &&
    (objective !== 'OUTCOME_TRAFFIC' || Boolean(trafficUrl.trim()));
  const canCreate = Boolean(selAccount && selPage && (postMode === 'dark' ? (darkPostResult?.post_id) : selPost) && objectiveReady && !creating);

  const adStatusColor = {
    ACTIVE: 'text-green-400', PAUSED: 'text-yellow-400',
    DISAPPROVED: 'text-red-400', PENDING_REVIEW: 'text-blue-400',
  };

  return (
    <div dir="rtl" className="flex min-h-0 w-full flex-1 flex-col bg-[#0a0c10] text-white">
      {/* ── Header ──────────────────────────────────────── */}
      <header className="flex items-center gap-3 border-b border-amber-500/20 bg-black/60 px-4 py-2.5 sticky top-0 z-40">
        <img src="/bm_meta_tool.png" alt="BM META TOOL" className="h-14 w-14 object-contain drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
        <span className="font-black text-sm">
          <span className="text-white">BM </span>
          <span className="text-amber-400">META</span>
          <span className="text-white/50 text-xs font-bold ml-1">TOOL</span>
        </span>

        <div className="flex-1" />

        {/* Connection status */}
        <div className="hidden sm:flex items-center gap-2 text-xs">
          {connecting && <span className="text-slate-400 flex items-center gap-1"><span className="h-3 w-3 animate-spin rounded-full border border-amber-500 border-t-transparent" /> جاري الاتصال…</span>}
          {connectData?.ok && !connecting && (
            <span className="text-amber-400/80 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_5px_rgba(251,191,36,0.8)]" />
              {activeAccounts.length} حساب · {pages.length} صفحة
            </span>
          )}
          {connectData && !connectData.ok && !connecting && (
            <span className="text-red-400 text-xs">✗ {connectData.reason ?? 'خطأ'}</span>
          )}
        </div>

        {/* Account switcher */}
        <div className="flex items-center gap-2">
          {accounts.length > 0 && (
            <div className="relative group">
              <button className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-500/10 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                <span className="max-w-[100px] truncate">{activeAcc?.label ?? 'حساب'}</span>
                <span>▾</span>
              </button>
              <div className="absolute left-0 top-full mt-1 hidden group-hover:block w-52 rounded-xl border border-amber-500/20 bg-[#1a1a1a] shadow-xl z-50">
                {accounts.map(acc => (
                  <div key={acc.token} className={`flex items-center justify-between px-3 py-2 text-xs hover:bg-white/5 cursor-pointer ${acc.token === activeToken ? 'text-amber-400' : 'text-slate-300'}`}>
                    <span onClick={() => handleSwitchAccount(acc)} className="flex-1 truncate">{acc.label}</span>
                    <button onClick={() => handleDeleteAccount(acc.token)} className="text-red-400/60 hover:text-red-400 ml-2 flex-shrink-0">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {accounts.length > 0 && (
            <Btn size="sm" variant="ghost" loading={refreshing} onClick={handleRefreshAll} disabled={!activeToken}>
              🔄 تحديث
            </Btn>
          )}
          {accounts.length > 0 && (
            <Btn size="sm" variant="ghost" loading={checkingToken} onClick={handleCheckToken} disabled={!activeToken}>
              🔍 فحص
            </Btn>
          )}
          <Btn size="sm" variant="ghost" onClick={() => setShowTokenHelp(true)}>
            🔑 Get User Token
          </Btn>
          <Btn size="sm" variant="secondary" onClick={() => setShowAddToken(v => !v)}>
            + إضافة توكن
          </Btn>
        </div>

        <button onClick={onClose} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10">
          ✕ إغلاق
        </button>
      </header>

      {showTokenHelp && <TokenHelpModal onClose={() => setShowTokenHelp(false)} />}

      {/* ── Token check result ───────────────────────────── */}
      {tokenInfo && (
        <div className="border-b border-amber-500/15 bg-black/40 px-4 py-3">
          {!tokenInfo.ok ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-red-400">❌ {tokenInfo.reason}</span>
              <button onClick={() => setTokenInfo(null)} className="text-xs text-slate-500 hover:text-slate-300">✕</button>
            </div>
          ) : !tokenInfo.valid ? (
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-bold text-red-400">❌ التوكن لا يعمل</p>
                <p className="text-[11px] text-slate-400">{tokenInfo.reason}</p>
                <button onClick={() => { setTokenInfo(null); setShowTokenHelp(true); }}
                        className="text-[11px] text-amber-400 underline">
                  كيف أحصل على توكن جديد؟
                </button>
              </div>
              <button onClick={() => setTokenInfo(null)} className="text-xs text-slate-500 hover:text-slate-300">✕</button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="text-xs font-bold text-green-400">✅ التوكن يعمل</span>
                  {tokenInfo.name && <span className="text-[11px] text-slate-400">{tokenInfo.name}</span>}
                  {(() => {
                    const rem = fmtRemaining(tokenInfo.expires_at);
                    if (!rem) return null;
                    const tone = rem.tone === 'good' ? 'text-green-400'
                               : rem.tone === 'warn' ? 'text-amber-400' : 'text-red-400';
                    return <span className={`text-[11px] ${tone}`}>⏳ متبقٍ: {rem.text}</span>;
                  })()}
                  {tokenInfo.app_name && (
                    <span className="text-[11px] text-slate-500">التطبيق: {tokenInfo.app_name}</span>
                  )}
                </div>
                <button onClick={() => setTokenInfo(null)} className="text-xs text-slate-500 hover:text-slate-300">✕</button>
              </div>

              {tokenInfo.details_available && tokenInfo.scopes ? (
                <div className="flex flex-wrap gap-1.5">
                  {REQUIRED_SCOPES.map(s => {
                    const has = tokenInfo.scopes.includes(s.scope);
                    return (
                      <span key={s.scope} title={s.why}
                        className={`rounded-md px-2 py-0.5 font-mono text-[10px] ${
                          has ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                        }`}>
                        {has ? '✓' : '✕'} {s.scope}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">
                  تفاصيل الصلاحيات والمدة غير متاحة — حسابك لا يملك دوراً على التطبيق المُصدِر للتوكن.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Add token form ───────────────────────────────── */}
      {showAddToken && (
        <div className="border-b border-amber-500/15 bg-black/40 px-4 py-3 space-y-2">
          <div className="flex gap-2 flex-wrap">
            <PasswordInput
              placeholder="Access Token (EAA...)" dir="ltr" isDark
              wrapperClassName="flex-1 min-w-[200px]"
              value={newToken} onChange={e => setNewToken(e.target.value)}
              className="w-full rounded-md border border-amber-500/20 bg-black/40 px-3 py-2 text-sm font-mono text-white placeholder:text-slate-500 focus:outline-none"
            />
            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
              <input type="checkbox" checked={useProxy} onChange={e => setUseProxy(e.target.checked)} className="accent-amber-500" />
              بروكسي
            </label>
          </div>
          {useProxy && (
            <input
              type="text" placeholder="host:port أو host:port:user:pass" dir="ltr"
              value={newProxy} onChange={e => setNewProxy(e.target.value)}
              className="w-full rounded-md border border-amber-500/20 bg-black/40 px-3 py-2 text-sm font-mono text-white placeholder:text-slate-500 focus:outline-none"
            />
          )}
          <div className="flex gap-2">
            <Btn loading={connecting} onClick={handleAddToken} disabled={!newToken.trim()}>✓ إضافة وتحقق</Btn>
            <Btn variant="ghost" onClick={() => setShowAddToken(false)}>إلغاء</Btn>
          </div>
        </div>
      )}

      {/* ── No token state ──────────────────────────────── */}
      {!activeToken && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20">
          <img src="/bm_meta_tool.png" alt="BM" className="h-20 w-20 object-contain opacity-60" />
          <div className="text-center">
            <p className="text-base font-bold text-amber-400">أضف Access Token للبدء</p>
            <p className="text-xs text-slate-500 mt-1">اضغط "إضافة توكن" أعلاه</p>
          </div>
        </div>
      )}

      {/* ── Main content ────────────────────────────────── */}
      {activeToken && (
        <>
          {/* Tabs */}
          <div className="flex gap-1 border-b border-white/10 px-4 pt-2">
            {[['create', '📢 إنشاء إعلان'], ['manage', '⚙️ إدارة إعلان']].map(([key, label]) => (
              <button
                key={key} onClick={() => setTab(key)}
                className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-colors ${tab === key ? 'border-b-2 border-amber-500 text-amber-400' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {/* ── CREATE TAB ───────────────────────────────────── */}
            {tab === 'create' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* LEFT: Basic settings */}
                <div className="space-y-4">
                  <div className="rounded-xl border border-amber-500/20 bg-black/30 p-4 space-y-4">
                    <h4 className="text-xs font-black uppercase tracking-widest text-amber-400">الإعدادات الأساسية</h4>

                    {/* Ad Account */}
                    <Field label="حساب الإعلانات (النشطة فقط)">
                      <Select value={selAccount} onChange={setSelAccount}>
                        <option value="">اختر الحساب</option>
                        {activeAccounts.length === 0 && <option disabled>لا توجد حسابات نشطة</option>}
                        {activeAccounts.map(acc => {
                          const st = ACCOUNT_STATUS[acc.account_status];
                          const bal = fmtCents(acc.balance, acc.currency);
                          return (
                            <option key={acc.id} value={acc.id}>
                              {acc.name ?? acc.id} — {acc.id} {st ? `(${st.label})` : ''} {bal ? `| رصيد: ${bal}` : ''}
                            </option>
                          );
                        })}
                      </Select>
                      {selAccount && (() => {
                        const acc = activeAccounts.find(a => a.id === selAccount);
                        if (!acc) return null;
                        const st = ACCOUNT_STATUS[acc.account_status];
                        const bal = fmtCents(acc.balance, acc.currency);
                        const spent = fmtCents(acc.amount_spent, acc.currency);
                        return (
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            <button
                              type="button"
                              onClick={() => navigator.clipboard?.writeText(acc.id)}
                              title="نسخ معرف الحساب"
                              className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-mono hover:bg-amber-500/20"
                            >
                              {acc.id} ⧉
                            </button>
                            {st && <span className={`text-[11px] px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>}
                            {acc.account_quality != null && (
                              <span className={`text-[11px] px-2 py-0.5 rounded-full ${acc.account_quality >= 4 ? 'bg-green-500/20 text-green-400' : acc.account_quality >= 2 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>
                                جودة: {acc.account_quality}/5
                              </span>
                            )}
                            {bal && <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">رصيد: {bal}</span>}
                            {spent && <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-400">أُنفق: {spent}</span>}
                          </div>
                        );
                      })()}
                    </Field>

                    {/* Page */}
                    <Field label="الصفحة">
                      <Select value={selPage} onChange={setSelPage}>
                        <option value="">اختر الصفحة</option>
                        {pages.map(p => (
                          <option key={p.id} value={p.id}>{p.name}{p.fan_count ? ` (${p.fan_count.toLocaleString('ar-EG')} متابع)` : ''}</option>
                        ))}
                      </Select>
                      {needsManualToken && (
                        <div className="space-y-1 mt-1">
                          <p className="text-[11px] text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded px-2 py-1.5">
                            ⚠ أدخل توكن الصفحة يدوياً من <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer" className="underline">Graph API Explorer</a>
                          </p>
                          <PasswordInput
                            dir="ltr" placeholder="Page Access Token" isDark
                            value={manualPageToken} onChange={e => setManualPageToken(e.target.value)}
                            className="w-full text-xs font-mono rounded-md border border-amber-500/20 bg-black/30 px-3 py-2 text-white focus:outline-none"
                          />
                        </div>
                      )}
                      {selPage && autoPageToken && (
                        <p className="mt-1 text-[10px] text-amber-400">✓ توكن الصفحة متوفر تلقائياً</p>
                      )}
                    </Field>

                    {/* Post */}
                    <Field label="المنشور">
                      <div className="flex rounded-lg border border-amber-500/20 overflow-hidden text-[11px] mb-2">
                        {[['existing', 'موجود'], ['dark', 'منشور جديد']].map(([mode, label]) => (
                          <button
                            key={mode}
                            onClick={() => { setPostMode(mode); setSelPost(''); setDarkPostResult(null); }}
                            className={`flex-1 py-1.5 transition-colors ${postMode === mode ? 'bg-amber-500 text-black font-bold' : 'text-slate-400 hover:text-white'}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      {postMode === 'existing' ? (
                        <Select value={selPost} onChange={setSelPost} disabled={!selPage || loadingPosts}>
                          <option value="">
                            {loadingPosts ? 'جاري جلب المنشورات…' : !selPage ? 'اختر الصفحة أولاً' : posts.length === 0 ? 'لا توجد منشورات' : 'اختر المنشور'}
                          </option>
                          {posts.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </Select>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-[11px] text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded px-2 py-1.5">
                            منشور غير منشور (Dark Post) — لا يظهر على الصفحة
                          </p>
                          <textarea
                            placeholder="نص المنشور…"
                            value={darkMessage} onChange={e => setDarkMessage(e.target.value)}
                            rows={3}
                            className="w-full text-sm rounded-md border border-amber-500/20 bg-black/30 px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none resize-none"
                          />
                          {/* Image upload */}
                          <label className="flex flex-col items-center justify-center w-full border border-dashed border-amber-500/20 rounded-lg cursor-pointer hover:border-amber-500/40 bg-amber-500/5 overflow-hidden">
                            {darkImagePreview ? (
                              <div className="relative w-full">
                                <img src={darkImagePreview} alt="preview" className="w-full max-h-32 object-cover" />
                                <button
                                  type="button"
                                  onClick={e => { e.preventDefault(); setDarkImageB64(null); setDarkImagePreview(''); setDarkImageName(''); }}
                                  className="absolute top-1 left-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-500/80"
                                >✕</button>
                              </div>
                            ) : (
                              <div className="py-3 text-center text-slate-500 text-xs">+ أضف صورة (اختياري)</div>
                            )}
                            <input type="file" accept="image/*" className="hidden" onChange={e => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              setDarkImageName(f.name);
                              setDarkImagePreview(URL.createObjectURL(f));
                              const reader = new FileReader();
                              reader.onload = ev => setDarkImageB64(ev.target.result.split(',')[1]);
                              reader.readAsDataURL(f);
                            }} />
                          </label>
                          {darkPostResult ? (
                            <div className={`text-xs rounded px-2 py-1.5 border ${darkPostResult.ok ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>
                              {darkPostResult.ok ? `✅ تم إنشاء المنشور — ID: ${darkPostResult.post_id}` : `❌ ${darkPostResult.reason}`}
                            </div>
                          ) : (
                            <Btn variant="secondary" loading={creatingDarkPost} onClick={handleCreateDarkPost} disabled={!selPage || !darkMessage.trim() || creatingDarkPost}>
                              إنشاء المنشور المخفي
                            </Btn>
                          )}
                        </div>
                      )}
                    </Field>
                  </div>
                </div>

                {/* RIGHT: Ad settings + targeting + action */}
                <div className="space-y-4">
                  {/* Budget & objective */}
                  <div className="rounded-xl border border-amber-500/20 bg-black/30 p-4 space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-widest text-amber-400">إعدادات الإعلان</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="الميزانية اليومية ($)">
                        <Input type="number" min={1} value={budget} onChange={e => setBudget(e.target.value)} />
                      </Field>
                      <Field label="عدد الأيام (0 = يومي)">
                        <Input type="number" min={0} value={days} onChange={e => setDays(e.target.value)} />
                      </Field>
                    </div>
                    <Field label="الهدف">
                      <Select value={objective} onChange={setObjective}>
                        {OBJECTIVES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </Select>
                    </Field>
                    {objective === 'OUTCOME_TRAFFIC' && (
                      <Field label="رابط الزيارات">
                        <Input type="url" dir="ltr" placeholder="https://example.com" value={trafficUrl} onChange={e => setTrafficUrl(e.target.value)} />
                      </Field>
                    )}
                    {objective === 'MESSENGER' && (
                      <p className="rounded-lg border border-blue-500/25 bg-blue-500/5 px-3 py-2 text-[11px] leading-relaxed text-blue-300">
                        💬 إعلان رسائل ماسنجر — الضغط على الإعلان يفتح محادثة مع صفحتك مباشرة.
                        يُرسل كحملة تفاعل مع تحسين للمحادثات.
                      </p>
                    )}
                    {objective === 'OUTCOME_SALES' && (
                      <div className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5">
                        <Field label="Pixel (مطلوب لهدف المبيعات)">
                          <Select value={pixelId} onChange={setPixelId} disabled={loadingPixels}>
                            <option value="">
                              {loadingPixels ? 'جاري التحميل...'
                                : pixels.length === 0 ? 'لا يوجد Pixel في هذا الحساب'
                                : 'اختر Pixel'}
                            </option>
                            {pixels.map(px => (
                              <option key={px.id} value={px.id}>{px.name ?? px.id} — {px.id}</option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="حدث التحويل">
                          <Select value={pixelEvent} onChange={setPixelEvent}>
                            {PIXEL_EVENTS.map(ev => <option key={ev} value={ev}>{ev}</option>)}
                          </Select>
                        </Field>
                        {!loadingPixels && pixels.length === 0 && selAccount && (
                          <p className="text-[11px] text-amber-400/80">
                            ⚠️ هدف المبيعات يتطلب Pixel مرتبطاً بالحساب الإعلاني. أنشئ واحداً من Events Manager أو اختر هدفاً آخر.
                          </p>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={unpublishAfter} onChange={e => setUnpublishAfter(e.target.checked)} className="accent-amber-500" />
                        حذف المنشور بعد الإنشاء
                      </label>
                    </div>
                  </div>

                  {/* Targeting */}
                  <div className="rounded-xl border border-amber-500/20 bg-black/30 p-4 space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-widest text-amber-400">الاستهداف</h4>
                    <div className="flex rounded-lg border border-amber-500/20 overflow-hidden text-[11px]">
                      {[['custom', 'مخصص'], ['saved', 'جمهور محفوظ']].map(([mode, label]) => (
                        <button key={mode} onClick={() => setAudienceMode(mode)}
                          className={`flex-1 py-1.5 transition-colors ${audienceMode === mode ? 'bg-amber-500 text-black font-bold' : 'text-slate-400 hover:text-white'}`}>
                          {label}
                        </button>
                      ))}
                    </div>

                    {audienceMode === 'custom' ? (
                      <div className="space-y-3">
                        <Field label="الدولة">
                          <Select value={country} onChange={setCountry}>
                            {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                          </Select>
                        </Field>
                        <div className="grid grid-cols-3 gap-2">
                          <Field label="عمر من">
                            <Input type="number" min={13} max={65} value={ageMin} onChange={e => setAgeMin(e.target.value)} />
                          </Field>
                          <Field label="عمر إلى">
                            <Input type="number" min={13} max={65} value={ageMax} onChange={e => setAgeMax(e.target.value)} />
                          </Field>
                          <Field label="الجنس">
                            <Select value={String(gender)} onChange={v => setGender(Number(v))}>
                              <option value="0">الكل</option>
                              <option value="1">ذكور</option>
                              <option value="2">إناث</option>
                            </Select>
                          </Field>
                        </div>
                      </div>
                    ) : (
                      <Field label="معرف الجمهور المحفوظ">
                        <Input dir="ltr" placeholder="Custom Audience ID" value={customAudienceId} onChange={e => setCustomAudienceId(e.target.value)} />
                      </Field>
                    )}
                  </div>

                  {/* Result */}
                  <ResultBox data={adResult} />

                  {/* Action buttons */}
                  <div className="flex flex-col gap-2">
                    <Btn
                      loading={creating}
                      disabled={!canCreate}
                      onClick={() => handleCreateAd('PAUSED')}
                      variant="secondary"
                      size="lg"
                    >
                      ⏸ إنشاء متوقف
                    </Btn>
                    <Btn
                      loading={creating}
                      disabled={!canCreate}
                      onClick={() => handleCreateAd('ACTIVE')}
                      variant="green"
                      size="lg"
                    >
                      ▶️ إنشاء ونشر مباشرة
                    </Btn>
                    {adResult?.ok && (
                      <Btn variant="primary" onClick={() => api('activate-ad', { token: activeToken, ad_id: adResult.ad_id, campaign_id: adResult.campaign_id, adset_id: adResult.adset_id }).then(d => setAdResult(p => ({ ...p, message: d.message ?? d.reason })))}>
                        ⚡ تنشيط الإعلان
                      </Btn>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── MANAGE TAB ───────────────────────────────────── */}
            {tab === 'manage' && (
              <div className="space-y-4 max-w-2xl mx-auto">
                <div className="rounded-xl border border-amber-500/20 bg-black/30 p-4 space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-widest text-amber-400">بحث عن إعلان</h4>
                  <Field label="Ad ID">
                    <Input dir="ltr" placeholder="12345678..." value={editAdId} onChange={e => setEditAdId(e.target.value)} />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="AdSet ID (اختياري)">
                      <Input dir="ltr" placeholder="Optional" value={editAdsetId} onChange={e => setEditAdsetId(e.target.value)} />
                    </Field>
                    <Field label="Campaign ID (اختياري)">
                      <Input dir="ltr" placeholder="Optional" value={editCampaignId} onChange={e => setEditCampaignId(e.target.value)} />
                    </Field>
                  </div>
                  <Btn loading={loadingStatus} onClick={handleFetchAdStatus} disabled={!editAdId.trim() || !activeToken}>
                    🔍 جلب حالة الإعلان
                  </Btn>
                </div>

                {/* Ad status display */}
                {adStatus && (
                  <div className="rounded-xl border border-amber-500/20 bg-black/30 p-4 space-y-3">
                    {adStatus.ok ? (
                      <>
                        <div className="flex flex-wrap gap-2 text-xs">
                          {[
                            { label: 'الإعلان', val: adStatus.ad_status },
                            { label: 'المجموعة', val: adStatus.adset_status },
                            { label: 'الحملة', val: adStatus.campaign_status },
                          ].map(({ label, val }) => val && (
                            <div key={label} className="flex items-center gap-1.5 bg-black/30 border border-white/10 rounded-lg px-3 py-1.5">
                              <span className="text-slate-400">{label}:</span>
                              <span className={adStatusColor[val] ?? 'text-slate-300'}>{val}</span>
                            </div>
                          ))}
                        </div>
                        {(adStatus.daily_budget || adStatus.lifetime_budget) && (
                          <div className="text-xs text-slate-400">
                            {adStatus.daily_budget && <span>ميزانية يومية: {fmtCents(adStatus.daily_budget, '')}</span>}
                            {adStatus.lifetime_budget && <span className="mr-3">ميزانية إجمالية: {fmtCents(adStatus.lifetime_budget, '')}</span>}
                          </div>
                        )}
                        {adStatus.end_time && <p className="text-[11px] text-slate-500">ينتهي: {new Date(adStatus.end_time).toLocaleDateString('ar-EG')}</p>}
                        {adStatus.post_id && <p className="text-[11px] font-mono text-amber-400/70">Post: {adStatus.post_id}</p>}

                        {/* Quick actions */}
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Btn size="sm" variant="green" loading={updatingAd} onClick={() => handleToggleAdStatus('ACTIVE')}>▶️ تنشيط</Btn>
                          <Btn size="sm" variant="secondary" loading={updatingAd} onClick={() => handleToggleAdStatus('PAUSED')}>⏸ إيقاف</Btn>
                        </div>

                        {/* Edit section */}
                        <div className="border-t border-white/10 pt-3 space-y-2">
                          <h5 className="text-xs font-bold text-slate-300">تعديل الإعلان</h5>
                          <div className="grid grid-cols-2 gap-2">
                            <Field label="ميزانية يومية جديدة ($)">
                              <Input type="number" min={1} value={editBudget} onChange={e => setEditBudget(e.target.value)} placeholder="اتركه فارغاً للإبقاء" />
                            </Field>
                            <Field label="تمديد (أيام إضافية)">
                              <Input type="number" min={0} value={editEndDays} onChange={e => setEditEndDays(e.target.value)} placeholder="0 = بدون تغيير" />
                            </Field>
                          </div>
                          <Field label="نقل إلى منشور آخر (Post ID)">
                            <div className="space-y-1.5">
                              <div className="flex gap-2">
                                <Select value={editPostId} onChange={setEditPostId} disabled={!selPage || loadingPosts}>
                                  <option value="">
                                    {!selPage ? 'اختر الصفحة من تبويب الإنشاء أولاً'
                                      : loadingPosts ? 'جاري التحميل...'
                                      : posts.length === 0 ? 'لا توجد منشورات'
                                      : 'اختر من أحدث المنشورات'}
                                  </option>
                                  {posts.map(p => (
                                    <option key={p.id} value={p.id}>
                                      {p.is_published === false ? '🔒 ' : ''}{p.label}
                                    </option>
                                  ))}
                                </Select>
                                <Btn size="sm" variant="ghost" loading={loadingPosts}
                                     onClick={() => reloadPosts(true)} disabled={!selPage}>
                                  🔄
                                </Btn>
                              </div>
                              <Input dir="ltr" placeholder="أو الصق Post ID يدوياً" value={editPostId} onChange={e => setEditPostId(e.target.value)} />
                            </div>
                          </Field>
                          <Btn variant="primary" loading={updatingAd} onClick={handleUpdateAd} disabled={!editBudget && !editEndDays && !editPostId}>
                            💾 حفظ التعديلات
                          </Btn>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-red-400">❌ {adStatus.reason}</p>
                    )}
                  </div>
                )}

                <ResultBox data={updateResult} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

BmMetaToolModal.propTypes = { onClose: PropTypes.func };
