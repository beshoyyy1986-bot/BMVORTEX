import { useState } from "react";
import PropTypes from "prop-types";
import ProxySelector from "./ProxySelector.jsx";

const GATEWAYS = [
  { id: "partnership", label: "Partnership",  icon: "🤝", desc: "Create partnership ads using ad code" },
  { id: "partner2",    label: "Partner 2",    icon: "🤝", desc: "Alternate partnership ad creation" },
  { id: "dark-post",   label: "Dark Post",    icon: "🌑", desc: "Create unpublished (dark) ads" },
  { id: "post-link",   label: "Post Link",    icon: "📝", desc: "Use existing published post for ads" },
];

const inputCls = "w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-blue-400/50 focus:outline-none transition";
const btnCls   = "w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed";

export default function AdvertisingToolsModal({ onClose, navigateTo, pathname }) {
  const [proxy, setProxy]         = useState({ option: "none", proxy: null });
  const [loading, setLoading]     = useState(false);
  const [msg, setMsg]             = useState("");
  const [msgType, setMsgType]     = useState("");
  const [result, setResult]       = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const seg      = pathname?.split("/")[2] || "";
  const activeGw = GATEWAYS.find(g => g.id === seg) || null;

  const goGateway = (id) => { setMsg(""); setResult(null); setShowSuccess(false); navigateTo(`/ads/${id}`); };

  const showMessage = (text, type = "info") => {
    setMsg(text); setMsgType(type);
    if (type === "success") setTimeout(() => setMsg(""), 5000);
  };

  const submit = async (e, toolId) => {
    e.preventDefault();
    setLoading(true); setMsg(""); setResult(null); setShowSuccess(false);

    const data = Object.fromEntries(new FormData(e.target).entries());
    data.proxy_option = proxy.option;
    data.custom_proxy = proxy.proxy;

    const endpoints = {
      partnership: "/api/ads/partnership",
      partner2:    "/api/ads/partnership",
      "dark-post": "/api/ads/dark-post",
      "post-link": "/api/ads/post-link",
    };

    try {
      const res  = await fetch(endpoints[toolId] || "/api/ads/partnership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.success) { setResult(json); setShowSuccess(true); }
      else showMessage(json.error || "Failed", "error");
    } catch (err) { showMessage(err.message, "error"); }
    finally { setLoading(false); }
  };

  const activate = async (adId) => {
    if (!adId) return;
    setLoading(true);
    try {
      const res  = await fetch("/api/ads/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookies: result?.cookies || "", ad_id: adId, proxy_option: proxy.option, custom_proxy: proxy.proxy }),
      });
      const json = await res.json();
      if (json.success) setShowSuccess(true);
      else showMessage(json.error, "error");
    } catch (err) { showMessage(err.message, "error"); }
    finally { setLoading(false); }
  };

  const commonFields = (
    <>
      <div className="grid grid-cols-2 gap-2">
        <input name="ad_account_id" className={inputCls} placeholder="Ad Account ID" required />
        <input name="audience_id"   className={inputCls} placeholder="Audience ID (optional)" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input name="daily_budget" type="number" step="0.01" min="1" className={inputCls} placeholder="Daily Budget ($)" required />
        <input name="days"         type="number" min="1"             className={inputCls} placeholder="Duration (days)" required />
      </div>
      <select name="publish_mode" className={inputCls} required>
        <option value="active">Active</option>
        <option value="paused">Paused</option>
      </select>
    </>
  );

  const renderForm = () => {
    if (!activeGw) return null;
    switch (activeGw.id) {
      case "partnership":
      case "partner2":
        return (
          <form onSubmit={e => submit(e, activeGw.id)} className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-400">Session Cookies</label>
              <textarea name="cookies" rows={3} className={inputCls} placeholder="c_user=...; xs=...; datr=..." required />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-400">Partnership Ad Code</label>
              <input name="partner_code" className={inputCls} placeholder="Partnership Ad Code" required />
            </div>
            <div className="space-y-2">{commonFields}</div>
            <button type="submit" disabled={loading} className={btnCls}>{loading ? "Creating…" : "🤝 Create Partnership Ad"}</button>
          </form>
        );

      case "dark-post":
        return (
          <form onSubmit={e => submit(e, "dark-post")} className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-400">Session Cookies</label>
              <textarea name="cookies" rows={3} className={inputCls} placeholder="c_user=...; xs=...; datr=..." required />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-400">Page ID</label>
                <input name="page_id" className={inputCls} placeholder="Page ID" required />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-400">Ad Image</label>
                <input name="image" type="file" accept="image/*" className={inputCls} required />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-400">Ad Content</label>
              <textarea name="content" rows={3} className={inputCls} placeholder="Ad content text…" required />
            </div>
            <div className="space-y-2">{commonFields}</div>
            <button type="submit" disabled={loading} className={btnCls}>{loading ? "Creating…" : "🌑 Create Dark Post"}</button>
          </form>
        );

      case "post-link":
        return (
          <form onSubmit={e => submit(e, "post-link")} className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-400">Session Cookies</label>
              <textarea name="cookies" rows={3} className={inputCls} placeholder="c_user=...; xs=...; datr=..." required />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-400">Post URL</label>
              <input name="post_link" type="url" className={inputCls} placeholder="https://facebook.com/..." required />
            </div>
            <div className="space-y-2">{commonFields}</div>
            <button type="submit" disabled={loading} className={btnCls}>{loading ? "Creating…" : "📝 Create Post Link Ad"}</button>
          </form>
        );

      default: return null;
    }
  };

  return (
    <div className="flex h-screen w-full flex-col bg-[#0d0f14] text-white">

      {/* ── Top bar ── */}
      <header className="flex items-center gap-3 border-b border-white/8 bg-[#111318] px-5 py-3.5 shadow-sm">
        <button onClick={activeGw ? () => navigateTo("/ads") : onClose}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/10">
          ← {activeGw ? "Back" : "Home"}
        </button>
        <div className="h-4 w-px bg-white/10" />
        <span className="text-sm font-bold text-white">🚀 Ads Creation</span>
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

          {!activeGw && (
            <div>
              <h2 className="mb-1 text-xl font-black text-white">Ads Creation</h2>
              <p className="mb-6 text-sm text-slate-500">Choose a gateway to continue</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

          {activeGw && (
            <div className="mx-auto max-w-xl">
              <h2 className="mb-1 text-lg font-black text-white">{activeGw.icon} {activeGw.label}</h2>
              <p className="mb-5 text-xs text-slate-500">{activeGw.desc}</p>

              <div className="mb-4 rounded-xl border border-white/8 bg-[#141820] p-3">
                <ProxySelector onProxyChange={setProxy} />
              </div>

              {msg && (
                <div className={`mb-4 rounded-xl border px-4 py-2.5 text-sm ${
                  msgType === "error"
                    ? "border-red-500/30 bg-red-500/10 text-red-300"
                    : "border-green-500/30 bg-green-500/10 text-green-300"
                }`}>{msg}</div>
              )}

              {result && (
                <div className="mb-4 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-300">
                  <div className="font-semibold">✅ Done!</div>
                  {result.campaignId && <div>Campaign: {result.campaignId}</div>}
                  {result.adId && <div>Ad: {result.adId}</div>}
                  {result.publishMode === "paused" && (
                    <button onClick={() => activate(result.adId)} disabled={loading}
                      className="mt-2 rounded-lg bg-green-500 px-3 py-1 text-xs font-bold text-white hover:bg-green-600 disabled:opacity-50">
                      ▶ Activate
                    </button>
                  )}
                </div>
              )}

              <div className="rounded-2xl border border-white/8 bg-[#141820] p-5">
                {renderForm()}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Loading */}
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
            <p className="text-sm text-slate-300">Processing…</p>
          </div>
        </div>
      )}

      {/* Success */}
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

AdvertisingToolsModal.propTypes = {
  onClose:    PropTypes.func.isRequired,
  navigateTo: PropTypes.func.isRequired,
  pathname:   PropTypes.string.isRequired,
};
