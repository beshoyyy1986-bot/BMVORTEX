import { useState } from "react";
import PropTypes from "prop-types";
import ProxySelector from "./ProxySelector.jsx";

const inputCls = "w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-blue-400/50 focus:outline-none transition";
const btnCls   = "w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed";

/** Card wrapper giving each tool its own titled panel */
function ToolCard({ icon, title, subtitle, children }) {
  return (
    <section className="flex flex-col rounded-2xl border border-white/8 bg-[#111318] shadow-lg shadow-black/30">
      <div className="flex items-center gap-3 border-b border-white/8 px-5 py-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10 text-base">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-black text-white">{title}</div>
          <div className="truncate text-[11px] text-slate-500">{subtitle}</div>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
ToolCard.propTypes = {
  icon:     PropTypes.node,
  title:    PropTypes.string,
  subtitle: PropTypes.string,
  children: PropTypes.node,
};

/** Shared submit + feedback plumbing for a single funds tool */
function useFundsTool(endpoint) {
  const [proxy, setProxy]     = useState({ option: "none", proxy: null });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]         = useState("");
  const [msgType, setMsgType] = useState("");
  const [result, setResult]   = useState(null);

  const submit = async (payload) => {
    setLoading(true); setMsg(""); setResult(null);
    try {
      const res  = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, proxy_option: proxy.option, custom_proxy: proxy.proxy }),
      });
      const data = await res.json();
      if (data.success) { setResult(data); setMsg("Done!"); setMsgType("success"); }
      else { setMsg(data.error || "Failed"); setMsgType("error"); }
    } catch (err) {
      setMsg(err.message); setMsgType("error");
    } finally {
      setLoading(false);
    }
  };

  return { setProxy, loading, msg, msgType, result, submit };
}

function Feedback({ msg, msgType, result }) {
  if (!msg && !result) return null;
  return (
    <>
      {msg && (
        <div className={`rounded-xl border px-4 py-2.5 text-sm ${
          msgType === "error"
            ? "border-red-500/30 bg-red-500/10 text-red-300"
            : "border-green-500/30 bg-green-500/10 text-green-300"
        }`}>{msgType === "error" ? msg : `✅ ${msg}`}</div>
      )}
      {result && (result.campaignId || result.adId) && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-300">
          {result.campaignId && <div>Campaign: {result.campaignId}</div>}
          {result.adId && <div>Ad: {result.adId}</div>}
        </div>
      )}
    </>
  );
}
Feedback.propTypes = {
  msg:     PropTypes.string,
  msgType: PropTypes.string,
  result:  PropTypes.object,
};

function ConvertToPrepaid() {
  const [cookies, setCookies]         = useState("");
  const [adAccountId, setAdAccountId] = useState("");
  const { setProxy, loading, msg, msgType, result, submit } = useFundsTool("/api/funds/convert-prepaid");

  return (
    <form onSubmit={e => { e.preventDefault(); submit({ cookies, ad_account_id: adAccountId }); }} className="space-y-3">
      <ProxySelector onProxyChange={setProxy} />
      <textarea value={cookies} onChange={e => setCookies(e.target.value)} rows={3} className={inputCls} placeholder="Cookies: c_user=...; xs=...; datr=..." required />
      <input value={adAccountId} onChange={e => setAdAccountId(e.target.value)} className={inputCls} placeholder="Ad Account ID (act_...)" required />
      <button type="submit" disabled={loading} className={btnCls}>{loading ? "Processing..." : "💳 Convert to Prepaid"}</button>
      <Feedback msg={msg} msgType={msgType} result={result} />
    </form>
  );
}

function AddBalance() {
  const [cookies, setCookies]         = useState("");
  const [adAccountId, setAdAccountId] = useState("");
  const [amount, setAmount]           = useState("");
  const { setProxy, loading, msg, msgType, result, submit } = useFundsTool("/api/funds/add-funds");

  return (
    <form onSubmit={e => { e.preventDefault(); submit({ cookies, ad_account_id: adAccountId, amount }); }} className="space-y-3">
      <ProxySelector onProxyChange={setProxy} />
      <textarea value={cookies} onChange={e => setCookies(e.target.value)} rows={3} className={inputCls} placeholder="Cookies: c_user=...; xs=...; datr=..." required />
      <input value={adAccountId} onChange={e => setAdAccountId(e.target.value)} className={inputCls} placeholder="Ad Account ID (act_...)" required />
      <input value={amount} onChange={e => setAmount(e.target.value)} type="number" step="0.01" min="1" className={inputCls} placeholder="Amount (USD)" required />
      <button type="submit" disabled={loading} className={btnCls}>{loading ? "Processing..." : "💰 Add Balance"}</button>
      <Feedback msg={msg} msgType={msgType} result={result} />
    </form>
  );
}

export default function FundsToolsModal({ onClose }) {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-[#0a0c10] text-white">

      {/* ── Header (logo + nav) ── */}
      <header className="flex items-center gap-3 border-b border-white/8 bg-[#111318] px-5 shadow-sm"
              style={{ minHeight: "52px" }}>

        <button onClick={onClose}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/10 shrink-0">
          ← Home
        </button>

        <div className="h-4 w-px bg-white/10 shrink-0" />

        <img src="/prepaid-tools.png" alt="Prepaid Tools" className="h-7 w-7 rounded-lg object-contain shrink-0" />
        <span className="text-sm font-black text-white shrink-0">
          PREPAID <span className="text-blue-400">TOOLS</span>
        </span>
      </header>

      {/* ── Content — both tools side by side ── */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-5 lg:grid-cols-2">
          <ToolCard icon="💳" title="Convert to Prepaid" subtitle="Convert ad account to prepaid mode">
            <ConvertToPrepaid />
          </ToolCard>
          <ToolCard icon="💰" title="Add Balance" subtitle="Add funds from card to ad account">
            <AddBalance />
          </ToolCard>
        </div>
      </main>
    </div>
  );
}

FundsToolsModal.propTypes = {
  onClose: PropTypes.func.isRequired,
};
