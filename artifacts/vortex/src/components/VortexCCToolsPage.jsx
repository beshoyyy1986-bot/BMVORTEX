import { useState, useCallback } from "react";
import PropTypes from "prop-types";

// ── Luhn helpers ──────────────────────────────────────────────────────────────

/** Compute Luhn check digit for an array of digits (without the check digit) */
function luhnCheckDigit(digits) {
  let sum = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits[i];
    if ((digits.length - i) % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}

/** Full Luhn validation */
function luhnValid(number) {
  const digits = String(number).replace(/\D/g, "").split("").map(Number);
  if (digits.length < 2) return false;
  const check = digits.pop();
  return luhnCheckDigit(digits) === check;
}

/** Detect card brand + length from pattern prefix */
function detectCard(pattern) {
  const p = pattern.replace(/X/gi, "0");
  const d1 = p[0];
  const d2 = parseInt(p.slice(0, 2), 10);
  const d4 = parseInt(p.slice(0, 4), 10);
  const d6 = parseInt(p.slice(0, 6), 10);

  if (d2 === 34 || d2 === 37)
    return { brand: "American Express", length: 15, cvvLen: 4, color: "#60a5fa" };
  if (d1 === "4")
    return { brand: "Visa", length: 16, cvvLen: 3, color: "#34d399" };
  if ((d2 >= 51 && d2 <= 55) || (d4 >= 2221 && d4 <= 2720))
    return { brand: "Mastercard", length: 16, cvvLen: 3, color: "#f87171" };
  if (d4 === 6011 || (d6 >= 622126 && d6 <= 622925) || (d2 >= 64 && d2 <= 65))
    return { brand: "Discover", length: 16, cvvLen: 3, color: "#fb923c" };
  if (d2 === 35)
    return { brand: "JCB", length: 16, cvvLen: 3, color: "#a78bfa" };
  if (d2 === 30 || d2 === 36 || d2 === 38 || d2 === 39)
    return { brand: "Diners Club", length: 14, cvvLen: 3, color: "#94a3b8" };
  if (d1 === "6")
    return { brand: "Discover / Union", length: 16, cvvLen: 3, color: "#fb923c" };

  return { brand: "Unknown", length: 16, cvvLen: 3, color: "#64748b" };
}

/** Generate CC numbers from pattern. Returns { cards: string[], capped: boolean } */
function generateCCNumbers(pattern, count) {
  const pat = pattern.toUpperCase().replace(/\s/g, "");
  const len = pat.length;
  const lastIsX = pat[len - 1] === "X";

  const xPositions = [];
  for (let i = 0; i < len; i++) {
    if (pat[i] === "X" && !(lastIsX && i === len - 1)) xPositions.push(i);
  }

  const results = new Set();
  const MAX_ATTEMPTS = Math.max(count * 100, 10000);
  let attempts = 0;

  if (lastIsX) {
    while (results.size < count && attempts < MAX_ATTEMPTS) {
      attempts++;
      const candidate = pat.split("");
      for (const pos of xPositions) {
        candidate[pos] = String(Math.floor(Math.random() * 10));
      }
      const prefix = candidate.slice(0, -1).map(Number);
      candidate[len - 1] = String(luhnCheckDigit(prefix));
      const num = candidate.join("");
      // Double-verify
      if (luhnValid(num)) results.add(num);
    }
  } else {
    while (results.size < count && attempts < MAX_ATTEMPTS) {
      attempts++;
      const candidate = pat.split("");
      for (const pos of xPositions) {
        candidate[pos] = String(Math.floor(Math.random() * 10));
      }
      const num = candidate.join("");
      if (luhnValid(num)) results.add(num);
    }
  }

  return { cards: [...results], capped: results.size < count };
}

// ── Shared style tokens (green palette) ──────────────────────────────────────
const G = {
  accent:      "text-emerald-400",
  accentHex:   "#34d399",
  border:      "border-emerald-500/20",
  borderFocus: "focus:border-emerald-400/50",
  bg:          "bg-emerald-500/10",
  btnGrad:     "bg-gradient-to-r from-emerald-500 to-green-500",
  tabActive:   "text-emerald-400",
  tabBar:      "bg-emerald-400",
  spinner:     "border-emerald-400",
};

const inputCls =
  `w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm
   text-white placeholder:text-slate-500 focus:border-emerald-400/50 focus:outline-none transition`;

const btnCls =
  `rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 px-5 py-2.5
   text-sm font-bold text-black shadow-lg transition hover:brightness-110
   disabled:opacity-50 disabled:cursor-not-allowed`;

// ── BIN CHECKER TAB ───────────────────────────────────────────────────────────
function BinChecker() {
  const [bin, setBin]       = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState("");

  const check = async () => {
    const clean = bin.replace(/\D/g, "").slice(0, 8);
    if (clean.length < 6) return setError("BIN must be at least 6 digits");
    setLoading(true); setError(""); setResult(null);
    try {
      const res  = await fetch(`/api/cc-tools/bin/${clean}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lookup failed");
      setResult(data);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  /** One info row — skips if value is falsy */
  const Row = ({ label, value }) =>
    value != null && value !== "" && value !== false ? (
      <div className="flex items-start justify-between gap-4 py-2 border-b border-white/5 last:border-0">
        <span className="text-xs text-slate-500 shrink-0 w-36">{label}</span>
        <span className="text-xs text-slate-100 text-right font-medium break-all">{String(value)}</span>
      </div>
    ) : null;

  const schemeIcon = (s) =>
    s === "visa" ? "💳" : s === "mastercard" ? "💳" :
    s === "amex" || s === "american express" ? "💳" : "💳";

  const brandColor = (s) =>
    s === "visa" ? "#34d399" : s === "mastercard" ? "#f87171" :
    s === "amex" ? "#60a5fa" : G.accentHex;

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="flex gap-2">
        <input
          value={bin}
          onChange={e => { setBin(e.target.value.replace(/\D/g, "").slice(0, 8)); setError(""); setResult(null); }}
          onKeyDown={e => e.key === "Enter" && check()}
          className={inputCls + " font-mono tracking-widest text-base"}
          placeholder="Enter BIN (6–8 digits)"
          maxLength={8}
        />
        <button onClick={check} disabled={loading || bin.length < 6} className={btnCls + " shrink-0"}>
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Checking…
            </span>
          ) : "🔍 Check"}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {result && (
        <div className="rounded-2xl border border-emerald-500/20 bg-[#141820] p-5">
          {/* Brand header */}
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-2xl border border-emerald-500/20">
              {schemeIcon(result.scheme)}
            </div>
            <div>
              <div className="text-base font-black text-white capitalize" style={{ color: brandColor(result.scheme) }}>
                {result.brand || result.scheme || "Unknown"}
              </div>
              <div className="text-xs text-slate-400 capitalize mt-0.5">
                <span className="text-emerald-400 font-semibold uppercase">{result.scheme || "—"}</span>
                {" · "}
                <span className="capitalize">{result.type || "—"}</span>
                {result.prepaid != null && (
                  <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold ${result.prepaid ? "bg-yellow-500/20 text-yellow-300" : "bg-white/5 text-slate-500"}`}>
                    {result.prepaid ? "PREPAID" : "NOT PREPAID"}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-0">
            <Row label="Network / Scheme"  value={result.scheme?.toUpperCase()} />
            <Row label="Card Type"         value={result.type} />
            <Row label="Card Brand"        value={result.brand} />
            <Row label="Prepaid"           value={result.prepaid != null ? (result.prepaid ? "Yes ✓" : "No") : null} />
            <Row label="Number Length"     value={result.number?.length} />
            <Row label="Luhn Check"        value={result.number?.luhn != null ? (result.number.luhn ? "Valid ✓" : "Invalid") : null} />
            <Row label="Country"           value={result.country?.emoji ? `${result.country.emoji} ${result.country.name}` : result.country?.name} />
            <Row label="Country Code"      value={result.country?.alpha2} />
            <Row label="Currency"          value={result.country?.currency} />
            <Row label="Bank Name"         value={result.bank?.name} />
            <Row label="Bank Phone"        value={result.bank?.phone} />
            <Row label="Bank City"         value={result.bank?.city} />
            <Row label="Bank URL"          value={result.bank?.url} />
          </div>

          {/* Raw BIN badge */}
          <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
            <span className="text-[10px] text-slate-600">BIN</span>
            <span className="font-mono text-xs text-emerald-400 tracking-widest">{result.bin}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── GEN CC TAB ────────────────────────────────────────────────────────────────
function GenCC() {
  const [pattern, setPattern]   = useState("");
  const [count, setCount]       = useState(10);
  // Empty = random per card
  const [month, setMonth]       = useState("");
  const [year, setYear]         = useState("");
  const [cvv, setCvv]           = useState("");
  const [output, setOutput]     = useState([]);
  const [info, setInfo]         = useState("");
  const [error, setError]       = useState("");
  const [copied, setCopied]     = useState(false);

  const cardInfo = pattern.length >= 1 ? detectCard(pattern) : null;

  const rndMonth = () => String(Math.floor(Math.random() * 12) + 1).padStart(2, "0");
  const rndYear  = () => {
    const base = new Date().getFullYear();
    return String(base + Math.floor(Math.random() * 6)); // +0..+5 years
  };
  const rndCvv = (len) =>
    Array.from({ length: len }, () => Math.floor(Math.random() * 10)).join("");

  const generate = useCallback(() => {
    setError(""); setOutput([]); setInfo(""); setCopied(false);

    const pat = pattern.toUpperCase().replace(/\s/g, "");
    if (!pat) return setError("Enter a card pattern");
    if (!/^[0-9X]+$/.test(pat)) return setError("Pattern can only contain digits 0-9 and X");

    const card = detectCard(pat);
    if (pat.length !== card.length)
      return setError(`Pattern length is ${pat.length} but ${card.brand} requires exactly ${card.length} digits`);

    const { cards, capped } = generateCCNumbers(pat, count);
    if (!cards.length)
      return setError("Could not generate valid cards with this pattern. Add more X positions.");

    const cvvFixed   = cvv.trim();
    const monthFixed = month.trim();
    const yearFixed  = year.trim();

    const results = cards.map(num => {
      const m = monthFixed || rndMonth();
      const y = yearFixed  || rndYear();
      const c = cvvFixed   || rndCvv(card.cvvLen);
      return `${num}|${m}/${y}|${c}`;
    });

    setOutput(results);
    setInfo(
      capped
        ? `⚠️ Only ${cards.length} valid card(s) found mathematically (Luhn). Requested ${count}.`
        : `✅ Generated ${cards.length} Luhn-valid card(s).`
    );
  }, [pattern, count, month, year, cvv]);

  const copy = () => {
    navigator.clipboard.writeText(output.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
  const years  = Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() + i));

  return (
    <div className="mx-auto max-w-2xl space-y-5">

      {/* Pattern input */}
      <div>
        <label className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-slate-400">
          Card Pattern
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-500 font-mono">
            X = random digit
          </span>
        </label>
        <input
          value={pattern}
          onChange={e => {
            setPattern(e.target.value.replace(/[^0-9Xx]/g, "").toUpperCase());
            setError(""); setOutput([]);
          }}
          className={inputCls + " font-mono tracking-widest text-base"}
          placeholder="e.g. 4111XXXXXXXXX100 or 371628XXXXX1001"
        />
        {cardInfo && pattern.length > 0 && (
          <div className="mt-1.5 flex items-center gap-2 text-[11px]">
            <span className="text-slate-500">Detected:</span>
            <span className="font-bold" style={{ color: cardInfo.color }}>{cardInfo.brand}</span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-500">{cardInfo.length} digits</span>
            <span className="text-slate-600">·</span>
            <span className={pattern.length === cardInfo.length ? "text-emerald-400 font-bold" : "text-red-400"}>
              {pattern.length}/{cardInfo.length}
            </span>
            {pattern.length === cardInfo.length && pattern[pattern.length - 1] === "X" && (
              <span className="text-emerald-400/70">· Luhn auto-computed ✓</span>
            )}
          </div>
        )}
      </div>

      {/* Count + Expiry + CVV */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-400">Count</label>
          <input
            type="number" min="1" max="9999" value={count}
            onChange={e => setCount(Math.max(1, parseInt(e.target.value) || 1))}
            className={inputCls}
          />
        </div>

        {/* Month — empty = random */}
        <div>
          <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-400">
            Month
            <span className="text-slate-600 font-normal text-[10px]">(blank=rnd)</span>
          </label>
          <select value={month} onChange={e => setMonth(e.target.value)} className={inputCls}>
            <option value="">Random</option>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {/* Year — empty = random */}
        <div>
          <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-400">
            Year
            <span className="text-slate-600 font-normal text-[10px]">(blank=rnd)</span>
          </label>
          <select value={year} onChange={e => setYear(e.target.value)} className={inputCls}>
            <option value="">Random</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div>
          <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-400">
            CVV
            <span className="text-slate-600 font-normal text-[10px]">(blank=rnd)</span>
          </label>
          <input
            type="text" value={cvv} maxLength={4}
            onChange={e => setCvv(e.target.value.replace(/\D/g, ""))}
            className={inputCls + " font-mono"} placeholder="Random"
          />
        </div>
      </div>

      {/* Generate button */}
      <button onClick={generate} className={btnCls + " w-full text-base py-3"}>
        ⚡ Generate Cards
      </button>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {info && (
        <div className={`rounded-xl border px-4 py-2.5 text-sm ${
          info.startsWith("⚠️")
            ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-300"
            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
        }`}>{info}</div>
      )}

      {output.length > 0 && (
        <div className="rounded-2xl border border-white/8 bg-[#141820] p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">
              {output.length} card(s) · <span className="font-mono text-slate-500">NUMBER|MM/YYYY|CVV</span>
            </span>
            <button onClick={copy}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                copied
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                  : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}>
              {copied ? "✓ Copied!" : "📋 Copy All"}
            </button>
          </div>
          <textarea
            readOnly
            value={output.join("\n")}
            rows={Math.min(output.length, 15)}
            className="w-full rounded-xl border border-white/8 bg-black/30 px-3 py-2.5 font-mono text-xs text-slate-200 outline-none resize-none"
          />
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
const TABS = [
  { id: "bin", label: "🔍 BIN Checker" },
  { id: "gen", label: "⚡ Gen CC"      },
];

export default function VortexCCToolsPage({ onClose }) {
  const [tab, setTab] = useState("bin");

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-[#0a0c10] text-white">

      {/* ── Header (logo + nav + tabs all in one bar) ── */}
      <header className="flex items-center gap-3 border-b border-white/8 bg-[#111318] px-5 shadow-sm"
              style={{ minHeight: "52px" }}>

        {/* Back */}
        <button onClick={onClose}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/10 shrink-0">
          ← Home
        </button>

        <div className="h-4 w-px bg-white/10 shrink-0" />

        {/* Logo + title */}
        <img src="/cc_tools_logo.png" alt="Vortex CC Tools" className="h-7 w-7 rounded-lg object-contain shrink-0" />
        <span className="text-sm font-black text-white shrink-0">
          Vortex <span className="text-emerald-400">CC Tools</span>
        </span>

        <div className="h-4 w-px bg-white/10 shrink-0" />

        {/* Tabs — inside the header bar */}
        <nav className="flex h-full items-end gap-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative h-full px-4 pb-0 text-sm font-bold transition flex items-center ${
                tab === t.id
                  ? "text-emerald-400"
                  : "text-slate-500 hover:text-slate-300"
              }`}
              style={{ paddingBottom: "0" }}
            >
              {t.label}
              {tab === t.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-emerald-400" />
              )}
            </button>
          ))}
        </nav>
      </header>

      {/* ── Content ── */}
      <main className="flex-1 overflow-y-auto p-6">
        {tab === "bin" ? <BinChecker /> : <GenCC />}
      </main>
    </div>
  );
}

VortexCCToolsPage.propTypes = {
  onClose: PropTypes.func.isRequired,
};
