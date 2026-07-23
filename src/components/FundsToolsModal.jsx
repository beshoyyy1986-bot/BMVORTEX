import { useState } from "react";
import PropTypes from "prop-types";
import ProxySelector from "./ProxySelector.jsx";

const GATEWAYS = [
  { id: "prepaid",   label: "Convert to Prepaid",     icon: "💳",  desc: "Convert ad account to prepaid mode" },
  { id: "add-funds", label: "Add Balance",             icon: "💰",  desc: "Add funds from card to ad account" },
  { id: "billing",   label: "Enable Billing",          icon: "📋",  desc: "Enable billing system on ad account" },
];

const inputCls = "w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-blue-400/50 focus:outline-none transition";
const btnCls   = "w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed";

export default function FundsToolsModal({ onClose, navigateTo, pathname }) {
  const [proxy, setProxy]         = useState({ option: "none", proxy: null });
  const [loading, setLoading]     = useState(false);
  const [msg, setMsg]             = useState("");
  const [msgType, setMsgType]     = useState("");
  const [result, setResult]       = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [cookies, setCookies]     = useState("");
  const [adAccountId, setAdAccountId] = useState("");
  const [amount, setAmount]       = useState("");

  // Derive active gateway from URL
  const seg        = pathname?.split("/")[2] || "";          // e.g. "prepaid"
  const activeGw   = GATEWAYS.find(g => g.id === seg) || null;

  const goGateway = (id) => {
    setMsg(""); setResult(null); setShowSuccess(false);
    navigateTo(`/funds/${id}`);
  };

  const showMessage = (text, type = "info") => {
    setMsg(text); setMsgType(type);
    if (type === "success") setTimeout(() => setMsg(""), 5000);
  };

  const submit = async (endpoint, payload) => {
    setLoading(true); setMsg(""); setResult(null); setShowSuccess(false);
    try {
      const res  = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, proxy_option: proxy.option, custom_proxy: proxy.proxy }),
      });
      const data = await res.json();
      if (data.success) { setResult(data); setShowSuccess(true); }
      else showMessage(data.error || "Failed", "error");
    } catch (err) { showMessage(err.message, "error"); }
    finally { setLoading(false); }
  };

  const renderForm = () => {
    if (!activeGw) return null;
    switch (activeGw.id) {
      case "prepaid":
        return (
          <form onSubmit={e => { e.preventDefault(); submit("/api/funds/convert-prepaid", { cookies, ad_account_id: adAccountId }); }} className="space-y-3">
            <textarea value={cookies} onChange={e => setCookies(e.target.value)} rows={3} className={inputCls} placeholder="Cookies: c_user=...; xs=...; datr=..." required />
            <input value={adAccountId} onChange={e => setAdAccountId(e.target.value)} className={inputCls} placeholder="Ad Account ID (act_...)" required />
            <button type="submit" disabled={loading} className={btnCls}>{loading ? "Processing..." : "💳 Convert to Prepaid"}</button>
          </form>
        );
      case "add-funds":
        return (
          <form onSubmit={e => { e.preventDefault(); submit("/api/funds/add-funds", { cookies, ad_account_id: adAccountId, amount }); }} className="space-y-3">
            <textarea value={cookies} onChange={e => setCookies(e.target.value)} rows={3} className={inputCls} placeholder="Cookies: c_user=...; xs=...; datr=..." required />
            <input value={adAccountId} onChange={e => setAdAccountId(e.target.value)} className={inputCls} placeholder="Ad Account ID (act_...)" required />
            <input value={amount} onChange={e => setAmount(e.target.value)} type="number" step="0.01" min="1" className={inputCls} placeholder="Amount (USD)" required />
            <button type="submit" disabled={loading} className={btnCls}>{loading ? "Processing..." : "💰 Add Funds"}</button>
          </form>
        );
      case "billing":
        return (
          <form onSubmit={e => { e.preventDefault(); submit("/api/funds/enable-billing", { cookies, ad_account_id: adAccountId }); }} className="space-y-3">
            <textarea value={cookies} onChange={e => setCookies(e.target.value)} rows={3} className={inputCls} placeholder="Cookies: c_user=...; xs=...; datr=..." required />
            <input value={adAccountId} onChange={e => setAdAccountId(e.target.value)} className={inputCls} placeholder="Ad Account ID (act_...)" required />
            <button type="submit" disabled={loading} className={btnCls}>{loading ? "Processing..." : "📋 Enable Billing"}</button>
          </form>
        );
      default: return null;
    }
  };

  return (
    <div className="flex h-screen w-full flex-col bg-[#0d0f14] text-white">

      {/* ── Top bar ── */}
      <header className="flex items-center gap-3 border-b border-white/8 bg-[#111318] px-5 py-3.5 shadow-sm">
        <button onClick={activeGw ? () => navigateTo("/funds") : onClose}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/10">
          ← {activeGw ? "Back" : "Home"}
        </button>
        <div className="h-4 w-px bg-white/10" />
        <span className="text-sm font-bold text-white">💰 Add Funds</span>
        {activeGw && (
          <>
            <span className="text-slate-600">/</span>
            <span className="text-sm text-blue-300 font-semibold">{activeGw.icon} {activeGw.label}</span>
          </>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar ── */}
        <aside className="w-56 shrink-0 overflow-y-auto border-r border-white/8 bg-[#0f1117] px-3 py-4">
          <p className="mb-3 px-2 text-[10px] font-black uppercase tracking-widest text-slate-600">Gateways</p>
          <div className="space-y-1">
            {GATEWAYS.map(gw => (
              <button key={gw.id} onClick={() => goGateway(gw.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
                  activeGw?.id === gw.id
                    ? "bg-blue-500/20 text-blue-200 border border-blue-500/30"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                }`}>
                <span className="text-base">{gw.icon}</span>
                <span>{gw.label}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-y-auto p-6">

          {/* Gateway selection (index) */}
          {!activeGw && (
            <div>
              <h2 className="mb-1 text-xl font-black text-white">Funds Tools</h2>
              <p className="mb-6 text-sm text-slate-500">Choose a gateway to continue</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {GATEWAYS.map(gw => (
                  <button key={gw.id} onClick={() => goGateway(gw.id)}
                    className="group rounded-2xl border border-white/8 bg-[#141820] p-5 text-left shadow transition hover:border-blue-500/40 hover:bg-[#1a2030]">
                    <div className="mb-3 text-3xl">{gw.icon}</div>
                    <h3 className="mb-1 text-sm font-bold text-white group-hover:text-blue-300 transition">{gw.label}</h3>
                    <p className="text-xs text-slate-500">{gw.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Active gateway form */}
          {activeGw && (
            <div className="mx-auto max-w-xl">
              <h2 className="mb-1 text-lg font-black text-white">{activeGw.icon} {activeGw.label}</h2>
              <p className="mb-5 text-xs text-slate-500">{activeGw.desc}</p>

              {/* Proxy */}
              <div className="mb-4 rounded-xl border border-white/8 bg-[#141820] p-3">
                <ProxySelector onProxyChange={setProxy} />
              </div>

              {/* Message */}
              {msg && (
                <div className={`mb-4 rounded-xl border px-4 py-2.5 text-sm ${
                  msgType === "error"
                    ? "border-red-500/30 bg-red-500/10 text-red-300"
                    : "border-green-500/30 bg-green-500/10 text-green-300"
                }`}>{msg}</div>
              )}

              {/* Result */}
              {result && (
                <div className="mb-4 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-300">
                  <div className="font-semibold">✅ Done!</div>
                  {result.campaignId && <div>Campaign: {result.campaignId}</div>}
                  {result.adId && <div>Ad: {result.adId}</div>}
                </div>
              )}

              {/* Form */}
              <div className="rounded-2xl border border-white/8 bg-[#141820] p-5">
                {renderForm()}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
            <p className="text-sm text-slate-300">Processing…</p>
          </div>
        </div>
      )}

      {/* Success popup */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="flex w-64 flex-col items-center rounded-2xl border border-green-500/30 bg-[#141a22] p-8 shadow-2xl">
            <div className="mb-3 text-5xl">✅</div>
            <h3 className="mb-4 text-base font-bold text-green-300">Success!</h3>
            <button onClick={() => setShowSuccess(false)}
              className="rounded-xl bg-green-500 px-6 py-2 text-sm font-bold text-white hover:bg-green-600">OK</button>
          </div>
        </div>
      )}
    </div>
  );
}

FundsToolsModal.propTypes = {
  onClose:    PropTypes.func.isRequired,
  navigateTo: PropTypes.func.isRequired,
  pathname:   PropTypes.string.isRequired,
};
