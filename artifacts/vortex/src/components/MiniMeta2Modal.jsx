import { useState } from "react";
import PropTypes from "prop-types";

/* ─── small helpers ─────────────────────────────────────── */
// Every caller treats the resolved value as `{ok, reason, ...}`, so failures
// are converted into that shape rather than thrown. A rejected promise here
// would skip the caller's setLoading(false) and hang the button forever.
// The timeout matters because these routes proxy Facebook, which can stall
// well past the point a user assumes the app is broken.
const API = async (path, body, { timeoutMs = 90000 } = {}) => {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const r = await fetch(`/api/mini-meta${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: abort.signal,
    });
    const text = await r.text();
    try {
      return JSON.parse(text);
    } catch {
      // An HTML body here means the request fell through to the SPA rewrite
      // instead of reaching the API.
      return { ok: false, reason: `استجابة غير متوقعة من الخادم (HTTP ${r.status})` };
    }
  } catch (e) {
    if (e.name === "AbortError") {
      return { ok: false, reason: "انتهت المهلة — الخادم لم يستجب. حاول مرة أخرى." };
    }
    return { ok: false, reason: `تعذّر الاتصال بالخادم: ${e.message}` };
  } finally {
    clearTimeout(timer);
  }
};

function Loader() {
  return (
    <svg className="inline-block h-4 w-4 animate-spin mr-1" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="30 70" />
    </svg>
  );
}

/* ─── main component ────────────────────────────────────── */
export default function MiniMeta2Modal({ onClose }) {
  const [tab, setTab] = useState("t1");
  const [lang, setLang] = useState("ar");

  /* ── account state ── */
  const [cookies, setCookies] = useState("");
  const [adAccountInput, setAdAccountInput] = useState("");
  const [proxy, setProxy] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [token, setToken] = useState("");
  const [adAccount, setAdAccount] = useState("");

  /* ── cards state ── */
  const [cardMode, setCardMode] = useState("auto");
  const [cardsText, setCardsText] = useState("");
  const [cardsLoading, setCardsLoading] = useState(false);
  const [cardsLog, setCardsLog] = useState([]);

  /* ── create ad state ── */
  const [pageInput, setPageInput] = useState("");
  const [fetchingPosts, setFetchingPosts] = useState(false);
  const [fetchStatus, setFetchStatus] = useState("");
  const [posts, setPosts] = useState([]);
  const [selectedPost, setSelectedPost] = useState(null);
  const [budget, setBudget] = useState("5");
  const [days, setDays] = useState("3");
  const [country, setCountry] = useState("EG");
  const [gender, setGender] = useState("0");
  const [ageMin, setAgeMin] = useState("18");
  const [ageMax, setAgeMax] = useState("");
  const [adLoading, setAdLoading] = useState(false);
  const [adResult, setAdResult] = useState(null);

  const isAr = lang === "ar";

  /* ── labels ── */
  const L = {
    tabs: isAr
      ? ["الحساب", "البطاقات", "إنشاء إعلان"]
      : ["Account", "Cards", "Create Ad"],
    cookies: isAr ? "الكوكيز (JSON)" : "Cookies (JSON)",
    account: isAr ? "الحساب الإعلاني (رابط أو act_xxx)" : "Ad Account (URL or act_xxx)",
    accountHint: isAr
      ? "الأداة ستفتح صفحته لاستخراج التوكن"
      : "Tool opens its page to extract the token",
    proxy: isAr ? "بروكسي (اختياري)" : "Proxy (optional)",
    verify: isAr ? "التحقق واستخراج التوكن" : "Verify & Extract Token",
    cardWay: isAr ? "طريقة الربط" : "Link Method",
    autoLink: isAr ? "ربط تلقائي" : "Auto-link",
    manualLink: isAr ? "ربط يدوي" : "Manual",
    cardsField: isAr ? "البطاقات (card|mm|yyyy|cvv|name)" : "Cards (card|mm|yyyy|cvv|name)",
    startLink: isAr ? "بدء الربط" : "Start Linking",
    pageUrl: isAr ? "رابط الصفحة أو معرّفها" : "Page URL or ID",
    fetchPosts: isAr ? "جلب المنشورات" : "Fetch Posts",
    selectPost: isAr ? "اختر المنشور" : "Select Post",
    budgetDay: isAr ? "الميزانية / يوم ($)" : "Budget / day ($)",
    dur: isAr ? "المدة (أيام)" : "Duration (days)",
    ctry: isAr ? "الدولة (ISO2)" : "Country (ISO2)",
    genderLbl: isAr ? "الجنس" : "Gender",
    gAll: isAr ? "الكل" : "All",
    gMale: isAr ? "ذكور" : "Male",
    gFemale: isAr ? "إناث" : "Female",
    ageMin: isAr ? "الحد الأدنى للسن" : "Min Age",
    ageMax: isAr ? "الحد الأقصى للسن" : "Max Age",
    createAd: isAr ? "إنشاء الإعلان" : "Create Ad",
    back: isAr ? "→ رجوع" : "← Back",
    autoInfo: isAr
      ? "الأداة ستختار كارت عشوائياً من المصدر وتربطه تلقائياً"
      : "The tool will pick a random card from source and link it automatically",
    cardsNote: isAr
      ? "فيسبوك يحمي صفحة الفواتير — قد تحتاج للتحقق يدوياً"
      : "Facebook protects billing pages — manual verification may be needed",
  };

  /* ── handlers ── */
  async function handleVerify() {
    if (!cookies.trim()) return alert(isAr ? "أدخل الكوكيز أولاً" : "Enter cookies first");
    setVerifyLoading(true);
    setVerifyResult(null);
    try {
      const res = await API("/verify-extract", {
        cookies,
        proxy: proxy.trim() || null,
        billing_url: adAccountInput.trim() || null,
      });
      if (res.ok) {
        setToken(res.token || "");
        setAdAccount(res.ad_account || "");
      }
      setVerifyResult(res);
    } finally {
      setVerifyLoading(false);
    }
  }

  async function handleAddCards() {
    if (!adAccount) return alert(isAr ? "أدخل الحساب الإعلاني أولاً" : "Enter ad account first");
    const body = {
      cookies,
      proxy: proxy.trim() || null,
      ad_account: adAccount,
      mode: cardMode,
      cards_text: cardsText,
    };
    setCardsLoading(true);
    setCardsLog([]);
    try {
      const res = await API("/add-cards", body);
      if (res.ok) {
        setCardsLog(res.results || []);
      } else {
        setCardsLog([{ card: "—", status: `❌ ${res.reason}` }]);
      }
    } finally {
      setCardsLoading(false);
    }
  }

  async function handleFetchPosts() {
    if (!pageInput.trim()) return;
    setFetchingPosts(true);
    setFetchStatus(isAr ? "جاري جلب المنشورات..." : "Fetching posts...");
    setPosts([]);
    setSelectedPost(null);
    try {
      const res = await API("/fetch-page-posts", {
        cookies,
        proxy: proxy.trim() || null,
        page_id: pageInput.trim(),
        token: token || null,
      });
      if (res.ok) {
        setPosts(res.posts || []);
        setFetchStatus(
          res.posts?.length
            ? `✅ ${res.posts.length} ${isAr ? "منشور" : "posts"}`
            : isAr ? "لا منشورات" : "No posts found"
        );
      } else {
        setFetchStatus(`❌ ${res.reason}`);
      }
    } finally {
      setFetchingPosts(false);
    }
  }

  async function handleCreateAd() {
    if (!selectedPost) return alert(isAr ? "اختر منشوراً أولاً" : "Select a post first");
    if (!cookies.trim()) return alert(isAr ? "أدخل الكوكيز أولاً" : "Enter cookies first");
    setAdLoading(true);
    setAdResult(null);
    try {
      const res = await API("/boost-ad", {
        cookies,
        proxy: proxy.trim() || null,
        token: token || null,
        page_id: selectedPost.story_id?.split("_")[0] || pageInput,
        post_id: selectedPost.post_id,
        budget,
        days: parseInt(days) || 1,
        objective: "POST_ENGAGEMENT",
        countries: [country.trim().toUpperCase() || "EG"],
        age_min: ageMin || null,
        age_max: ageMax || null,
        gender: parseInt(gender) || 0,
        ad_account: adAccount || null,
      });
      setAdResult(res);
    } finally {
      setAdLoading(false);
    }
  }

  /* ── tab content ── */
  function TabAccount() {
    return (
      <div className="space-y-3">
        {/* Cookies */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
          <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
            {isAr ? "بيانات الدخول" : "Login Data"}
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">
              {L.cookies}
              <span className="ml-2 text-slate-600 font-normal">
                (raw string, JSON array, or JSON object)
              </span>
            </label>
            <textarea
              value={cookies}
              onChange={(e) => setCookies(e.target.value)}
              rows={3}
              placeholder='c_user=123; xs=abc; datr=xyz  ——أو——  [{"name":"c_user","value":"123"}]'
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-600 resize-none font-mono"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">{L.account}</label>
            <input
              value={adAccountInput}
              onChange={(e) => setAdAccountInput(e.target.value)}
              placeholder="https://www.facebook.com/adsmanager/?act=... أو act_xxx"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-600"
            />
            <p className="mt-1 text-[10px] text-slate-500">{L.accountHint}</p>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">{L.proxy}</label>
            <input
              value={proxy}
              onChange={(e) => setProxy(e.target.value)}
              placeholder="host:port:user:pass"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-600"
            />
          </div>
        </div>

        <button
          onClick={handleVerify}
          disabled={verifyLoading}
          className="w-full rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-50 transition-colors"
        >
          {verifyLoading ? <><Loader />{isAr ? "جاري التحقق..." : "Verifying..."}</> : L.verify}
        </button>

        {verifyResult && (
          <div
            className={`rounded-xl border p-3 text-xs space-y-1 ${
              verifyResult.ok
                ? "border-green-500/30 bg-green-500/10"
                : "border-red-500/30 bg-red-500/10"
            }`}
          >
            {verifyResult.ok ? (
              <>
                <div className="text-green-300 font-bold">
                  ✅ {isAr ? "تم التحقق — الجلسة صالحة" : "Session valid"}
                </div>
                <div className="text-slate-300">
                  fb_dtsg: <span className="font-mono text-cyan-300">{verifyResult.token.slice(0, 20)}...</span>
                </div>
                {verifyResult.access_token && (
                  <div className="text-slate-300">
                    EAA: <span className="font-mono text-green-300">{verifyResult.access_token.slice(0, 20)}...</span>
                  </div>
                )}
                {verifyResult.name && (
                  <div className="text-slate-400">{verifyResult.name}</div>
                )}
                <div className="text-slate-300">
                  {isAr ? "الحساب:" : "Account:"}{" "}
                  <span className="text-slate-100">{verifyResult.ad_account || (isAr ? "لم يُستخرج" : "Not found")}</span>
                </div>
              </>
            ) : (
              <div className="text-red-300">❌ {verifyResult.reason}</div>
            )}
          </div>
        )}

        {/* Token status badge */}
        {adAccount && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs text-amber-300 font-mono">{adAccount}</span>
          </div>
        )}
      </div>
    );
  }

  function TabCards() {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
          <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">{L.cardWay}</div>

          {/* Mode toggle */}
          <div className="flex rounded-lg border border-white/10 overflow-hidden">
            {[["auto", L.autoLink], ["manual", L.manualLink]].map(([m, lbl]) => (
              <button
                key={m}
                onClick={() => setCardMode(m)}
                className={`flex-1 py-2 text-xs font-bold transition-colors ${
                  cardMode === m
                    ? "bg-amber-500 text-black"
                    : "bg-transparent text-slate-400 hover:bg-white/5"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          {cardMode === "auto" ? (
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs text-blue-300">
              ℹ {L.autoInfo}
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-[11px] text-slate-400">{L.cardsField}</label>
              <textarea
                value={cardsText}
                onChange={(e) => setCardsText(e.target.value)}
                rows={4}
                placeholder={"4111111111111111|12|2025|123|John Doe"}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-600 resize-none font-mono"
              />
            </div>
          )}
        </div>

        <button
          onClick={handleAddCards}
          disabled={cardsLoading}
          className="w-full rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-50 transition-colors"
        >
          {cardsLoading ? <><Loader />{isAr ? "جاري الربط..." : "Linking..."}</> : L.startLink}
        </button>

        {cardsLog.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-1.5">
            {cardsLog.map((r, i) => {
              const isOk = r.status.includes("✅");
              const isWarn = r.status.includes("⚠️");
              return (
                <div
                  key={i}
                  className={`rounded-lg px-3 py-1.5 text-xs font-mono ${
                    isOk
                      ? "border border-green-500/30 bg-green-500/10 text-green-300"
                      : isWarn
                      ? "border border-yellow-500/30 bg-yellow-500/10 text-yellow-300"
                      : "border border-red-500/30 bg-red-500/10 text-red-300"
                  }`}
                >
                  {r.card} → {r.status}
                </div>
              );
            })}
          </div>
        )}

        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3 py-2 text-[11px] text-yellow-400">
          ⚠ {L.cardsNote}
        </div>
      </div>
    );
  }

  function TabCreateAd() {
    return (
      <div className="space-y-3">
        {/* Page + Posts */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
          <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
            {isAr ? "الصفحة والمنشور" : "Page & Post"}
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">{L.pageUrl}</label>
            <div className="flex gap-2">
              <input
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                placeholder="https://facebook.com/YourPage أو 1234567890"
                className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-600"
              />
              <button
                onClick={handleFetchPosts}
                disabled={fetchingPosts}
                className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/10 disabled:opacity-50"
              >
                {fetchingPosts ? <Loader /> : L.fetchPosts}
              </button>
            </div>
            {fetchStatus && (
              <p
                className={`mt-1 text-[11px] ${
                  fetchStatus.startsWith("✅")
                    ? "text-green-400"
                    : fetchStatus.startsWith("❌")
                    ? "text-red-400"
                    : "text-slate-400"
                }`}
              >
                {fetchStatus}
              </p>
            )}
          </div>

          {posts.length > 0 && (
            <div>
              <label className="mb-1 block text-[11px] text-slate-400">{L.selectPost}</label>
              <select
                value={selectedPost ? selectedPost.post_id : ""}
                onChange={(e) => {
                  const p = posts.find((x) => x.post_id === e.target.value);
                  setSelectedPost(p || null);
                }}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-100 outline-none"
              >
                <option value="">{isAr ? "— اختر منشوراً —" : "— Select a post —"}</option>
                {posts.map((p) => (
                  <option key={p.post_id} value={p.post_id}>
                    {p.title} {p.date ? `(${new Date(p.date).toLocaleDateString()})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedPost && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
              ✅ {selectedPost.title}
            </div>
          )}
        </div>

        {/* Ad settings */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
          <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
            {isAr ? "إعدادات الإعلان" : "Ad Settings"}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] text-slate-400">{L.budgetDay}</label>
              <input
                type="number"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                min="1"
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-100 outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-slate-400">{L.dur}</label>
              <input
                type="number"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                min="1"
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-100 outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-slate-400">{L.ctry}</label>
              <input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="EG"
                maxLength={2}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-100 outline-none uppercase"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-slate-400">{L.genderLbl}</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-100 outline-none"
              >
                <option value="0">{L.gAll}</option>
                <option value="1">{L.gMale}</option>
                <option value="2">{L.gFemale}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-slate-400">{L.ageMin}</label>
              <input
                type="number"
                value={ageMin}
                onChange={(e) => setAgeMin(e.target.value)}
                min="13"
                max="65"
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-100 outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-slate-400">{L.ageMax}</label>
              <input
                type="number"
                value={ageMax}
                onChange={(e) => setAgeMax(e.target.value)}
                min="13"
                max="65"
                placeholder="—"
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-100 outline-none"
              />
            </div>
          </div>
        </div>

        <button
          onClick={handleCreateAd}
          disabled={adLoading || !selectedPost}
          className="w-full rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-50 transition-colors"
        >
          {adLoading ? (
            <><Loader />{isAr ? "جاري إنشاء الإعلان..." : "Creating ad..."}</>
          ) : (
            L.createAd
          )}
        </button>

        {adResult && (
          <div
            className={`rounded-xl border p-3 text-xs space-y-1 ${
              adResult.ok
                ? "border-green-500/30 bg-green-500/10"
                : "border-red-500/30 bg-red-500/10"
            }`}
          >
            {adResult.ok ? (
              <>
                <div className="font-bold text-green-300">{adResult.message}</div>
                {adResult.ad_id && (
                  <div className="text-slate-300 font-mono">Ad ID: {adResult.ad_id}</div>
                )}
                <div className="text-slate-400">
                  fb_dtsg: {adResult.fb_dtsg_present ? "✅" : "❌"} | lsd:{" "}
                  {adResult.lsd_present ? "✅" : "❌"} | {isAr ? "عملة:" : "Currency:"}{" "}
                  {adResult.currency}
                </div>
                {adResult.used_doc_id && (
                  <div className="text-slate-500">doc_id: {adResult.used_doc_id}</div>
                )}
                {adResult.response_preview && (
                  <div className="mt-1 break-all rounded bg-black/30 p-2 text-[10px] text-slate-500 font-mono">
                    {adResult.response_preview.slice(0, 200)}
                  </div>
                )}
              </>
            ) : (
              <div className="text-red-300">❌ {adResult.reason}</div>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ── render ── */
  return (
    <div
      className="flex min-h-0 w-full flex-1 flex-col bg-[#0a0c10]"
      dir={isAr ? "rtl" : "ltr"}
    >
      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-white/10"
          >
            {isAr ? "→ رجوع" : "← Back"}
          </button>
          <div className="flex items-center gap-2">
            <img src="/mini_meta_2$.png" alt="Mini Meta 2$" className="h-14 w-14 object-contain" />
            <div>
              <h1 className="text-sm font-bold text-slate-100">Mini Meta 2$</h1>
              <p className="text-[10px] text-slate-500">
                {isAr ? "أداة إدارة إعلانات فيسبوك" : "Facebook Ads Management Tool"}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {["ar", "en"].map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`rounded px-2.5 py-1 text-xs font-bold transition-colors ${
                lang === l
                  ? "border border-amber-500/50 bg-amber-500/15 text-amber-300"
                  : "border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
              }`}
            >
              {l.toUpperCase()}
            </button>
          ))}
          {adAccount && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] font-mono text-amber-300">
              {adAccount}
            </span>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-white/10 shrink-0">
        {(["t1", "t2", "t3"]).map((id, i) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 py-2.5 text-xs font-bold transition-colors ${
              tab === id
                ? "border-b-2 border-amber-400 text-amber-300"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {L.tabs[i]}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === "t1" && <TabAccount />}
        {tab === "t2" && <TabCards />}
        {tab === "t3" && <TabCreateAd />}
      </div>
    </div>
  );
}

MiniMeta2Modal.propTypes = {
  onClose: PropTypes.func.isRequired,
};
