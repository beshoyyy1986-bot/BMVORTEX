import React, { useState, useRef } from "react";

// ── Helpers ───────────────────────────────────────────────────────────────────
const COUNTRIES = [
  { value: "BR", label: "🇧🇷 البرازيل (Brazil)" },
  { value: "US", label: "🇺🇸 الولايات المتحدة (USA)" },
  { value: "GB", label: "🇬🇧 المملكة المتحدة (UK)" },
  { value: "AE", label: "🇦🇪 الإمارات (UAE)" },
  { value: "SA", label: "🇸🇦 السعودية (Saudi Arabia)" },
  { value: "EG", label: "🇪🇬 مصر (Egypt)" },
];

function Field({ label, hint, children }) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[10px] text-slate-600">{hint}</p>}
    </div>
  );
}

function Inp({ ...props }) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-white placeholder-slate-600 outline-none
        focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20 transition-all ${props.className || ""}`}
    />
  );
}

function Textarea({ ...props }) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-white placeholder-slate-600 outline-none font-mono leading-relaxed
        focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20 transition-all resize-y ${props.className || ""}`}
    />
  );
}

function Sel({ children, ...props }) {
  return (
    <select
      {...props}
      className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-white outline-none
        focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20 transition-all"
    >
      {children}
    </select>
  );
}

// ── Status row ────────────────────────────────────────────────────────────────
function ResultRow({ r }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
      r.ok ? "bg-green-900/30 border border-green-500/20" : "bg-red-900/30 border border-red-500/20"
    }`}>
      <span className="text-base">{r.ok ? "✅" : "❌"}</span>
      <span className="font-mono font-bold text-white">**** {r.card}</span>
      <span className="text-slate-400 uppercase text-[10px]">{r.type}</span>
      {r.ok
        ? <span className="ml-auto text-green-400">تمت الإضافة</span>
        : <span className="ml-auto text-red-400 truncate max-w-[200px]">{r.error}</span>
      }
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MetaCardAdderModal({ onClose }) {
  const [cookies,     setCookies]     = useState("");
  const [businessId,  setBusinessId]  = useState("");
  const [country,     setCountry]     = useState("BR");
  const [concurrency, setConcurrency] = useState("1");
  const [proxy,       setProxy]       = useState("");
  const [cards,       setCards]       = useState("");
  const [loading,     setLoading]     = useState(false);
  const [results,     setResults]     = useState(null);
  const [error,       setError]       = useState("");

  const totalCards = cards.trim().split("\n").filter(l => l.trim()).length;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!cookies.trim())    return setError("الكوكيز مطلوبة");
    if (!businessId.trim()) return setError("Business ID مطلوب");
    if (!cards.trim())      return setError("أدخل بطاقة واحدة على الأقل");

    setError("");
    setLoading(true);
    setResults(null);

    try {
      const res = await fetch("/api/meta-card-adder/add-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookies, businessId, country, concurrency, cards, proxy }),
      });
      const data = await res.json();

      if (!data.ok && !data.results) {
        setError(data.reason || "حدث خطأ غير متوقع");
      } else {
        setResults(data);
      }
    } catch (e) {
      setError("تعذر الاتصال بالسيرفر: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0e0e10] shadow-2xl">

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-[#0e0e10]/95 px-6 py-4 backdrop-blur">
          <img src="/meta_card_adder.png" alt="Meta Card Adder" className="h-10 w-10 rounded-xl object-contain" />
          <div>
            <h2 className="text-lg font-black text-white">Meta Card Adder</h2>
            <p className="text-xs text-slate-500">إضافة بطاقات دفع لـ Meta Business Manager</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-0">

          {/* Warning banner */}
          <div className="mb-4 flex gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5">
            <span className="text-amber-400 text-sm">⚠️</span>
            <p className="text-xs text-amber-300/80 leading-relaxed">
              هذه الأداة تستخدم Browser Automation — قد تستغرق عملية كل بطاقة 30-60 ثانية.
              تأكد أن الكوكيز فعّالة وأن الحساب لم يُفعّل 2FA.
            </p>
          </div>

          {/* Cookies */}
          <Field label="Cookies" hint="JSON array أو النص المباشر: c_user=xxx; xs=xxx">
            <Textarea
              rows={4}
              value={cookies}
              onChange={e => setCookies(e.target.value)}
              placeholder={'[{"name":"c_user","value":"xxx",...}]\nأو\nc_user=xxx; xs=xxx; datr=xxx'}
              required
            />
          </Field>

          {/* Business ID */}
          <Field label="Business ID" hint="رقم الـ BM من business.facebook.com">
            <Inp
              type="text"
              value={businessId}
              onChange={e => setBusinessId(e.target.value)}
              placeholder="123456789012345"
              required
            />
          </Field>

          {/* Country + Concurrency row */}
          <div className="mb-4 grid grid-cols-2 gap-3">
            <Field label="الدولة">
              <Sel value={country} onChange={e => setCountry(e.target.value)}>
                {COUNTRIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Sel>
            </Field>
            <Field label="عمال متوازيين" hint="أقصى 3">
              <Inp
                type="number"
                min={1} max={3}
                value={concurrency}
                onChange={e => setConcurrency(e.target.value)}
              />
            </Field>
          </div>

          {/* Proxy */}
          <Field label="Proxy (اختياري)" hint="http://user:pass@host:port أو host:port:user:pass">
            <Inp
              type="text"
              value={proxy}
              onChange={e => setProxy(e.target.value)}
              placeholder="http://user:pass@1.2.3.4:8080"
            />
          </Field>

          {/* Cards */}
          <Field
            label={`البطاقات ${totalCards ? `(${totalCards})` : ""}`}
            hint="كل بطاقة في سطر: رقم|شهر|سنة|cvv — الاسم يتولّد عشوائياً"
          >
            <Textarea
              rows={6}
              value={cards}
              onChange={e => setCards(e.target.value)}
              placeholder={"4111111111111111|05|2029|123\n5154620020562771|01|2030|839\n373737373737376|11|2029|0000"}
              required
            />
          </Field>

          {/* Error */}
          {error && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-900/20 px-3 py-2.5 text-sm text-red-400">
              ❌ {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 py-3 text-sm font-black text-white
              hover:from-amber-400 hover:to-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all
              shadow-lg shadow-amber-500/20"
          >
            {loading
              ? <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  جارٍ الإضافة عبر المتصفح...
                </span>
              : `🚀 بدء الإضافة${totalCards ? ` (${totalCards} بطاقة)` : ""}`
            }
          </button>
        </form>

        {/* Results */}
        {results && (
          <div className="border-t border-white/10 px-6 pb-6">
            {/* Summary */}
            <div className="my-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-green-500/20 bg-green-900/20 p-3 text-center">
                <div className="text-2xl font-black text-green-400">{results.successCount}</div>
                <div className="text-xs text-green-600">نجحت</div>
              </div>
              <div className="rounded-xl border border-red-500/20 bg-red-900/20 p-3 text-center">
                <div className="text-2xl font-black text-red-400">{results.failCount}</div>
                <div className="text-xs text-red-600">فشلت</div>
              </div>
            </div>

            {/* Parse errors */}
            {results.parseErrors?.length > 0 && (
              <div className="mb-3 rounded-xl border border-yellow-500/20 bg-yellow-900/10 px-3 py-2 text-xs text-yellow-400">
                ⚠️ {results.parseErrors.length} سطر لم يمكن قراءته
              </div>
            )}

            {/* Per-card results */}
            <div className="space-y-2">
              {results.results?.map((r, i) => <ResultRow key={i} r={r} />)}
            </div>

            <button
              onClick={() => { setResults(null); setCards(""); }}
              className="mt-4 w-full rounded-xl border border-white/10 py-2.5 text-sm text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
            >
              إضافة المزيد
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
