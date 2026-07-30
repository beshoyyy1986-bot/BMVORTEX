import { useState } from "react";
import PropTypes from "prop-types";
import ProxySelector from "./ProxySelector.jsx";

const GATEWAYS = [
  { id: "add-to-bm",         label: "Add Card to BM",         icon: "💼", desc: "Link credit card to Facebook Business Manager" },
  { id: "add-to-ad-account", label: "Add Card to Ad Account", icon: "💳", desc: "Link credit card directly to Ad Account billing" },
  { id: "fetch-from-bm",     label: "Fetch Cards from BM",    icon: "🔄", desc: "Retrieve cards from BM and link to Ad Account" },
];

const inputCls = "w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-blue-400/50 focus:outline-none transition";
const btnCls   = "w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed";

export default function CardsToolsModal({ onClose, navigateTo, pathname }) {
  const [proxy, setProxy]               = useState({ option: "none", proxy: null });
  const [loading, setLoading]           = useState(false);
  const [message, setMessage]           = useState("");
  const [messageType, setMessageType]   = useState("");
  const [showSuccess, setShowSuccess]   = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [clipboardCards, setClipboardCards] = useState([]);
  const [selectedCards, setSelectedCards]   = useState([]);
  const [fetchedCards, setFetchedCards]     = useState([]);

  const seg      = pathname?.split("/")[2] || "";
  const activeGw = GATEWAYS.find(g => g.id === seg) || null;

  const goGateway = (id) => {
    setMessage(""); setShowSuccess(false); setClipboardCards([]); setSelectedCards([]);
    navigateTo(`/cards/${id}`);
  };

  const showMsg = (msg, type = "info") => {
    setMessage(msg); setMessageType(type);
    setTimeout(() => { setMessage(""); setMessageType(""); }, 10000);
  };

  const showSuccessPopup = (msg) => { setSuccessMessage(msg); setShowSuccess(true); };

  const extractCardsFromClipboard = async () => {
    try {
      const text    = await navigator.clipboard.readText();
      const pattern = /(\d{13,19})[^\d]*(\d{2})[^\d]*(\d{4})[^\d]*(\d{3,4})/g;
      const cards   = [];
      let match;
      while ((match = pattern.exec(text)) !== null)
        cards.push({ number: match[1], month: match[2], year: match[3], cvv: match[4], id: `card_${Date.now()}_${cards.length}` });
      if (cards.length > 0) { setClipboardCards(cards); showMsg(`Found ${cards.length} card(s) in clipboard`, "success"); }
      else showMsg("No valid cards found in clipboard", "error");
    } catch { showMsg("Failed to read clipboard. Please paste manually.", "error"); }
  };

  const toggleCard    = (id) => setSelectedCards(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleAll     = () => setSelectedCards(selectedCards.length === clipboardCards.length ? [] : clipboardCards.map(c => c.id));

  const handleSubmit = async (e, toolId) => {
    e.preventDefault();
    setLoading(true); setMessage("");
    const data = Object.fromEntries(new FormData(e.target).entries());
    data.proxy_option = proxy.option;
    data.custom_proxy = proxy.proxy;
    if (selectedCards.length > 0) data.selected_cards = selectedCards;

    const endpoints = {
      "add-to-bm":         "/api/cards/add-to-business-manager",
      "add-to-ad-account": "/api/cards/add-to-ad-account",
      "fetch-from-bm":     "/api/cards/fetch-from-bm",
    };

    try {
      const res    = await fetch(endpoints[toolId], { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const result = await res.json();
      if (result.success) {
        showSuccessPopup(`✅ ${result.message || "Operation completed successfully!"}`);
        if (toolId === "fetch-from-bm" && result.cards) setFetchedCards(result.cards);
      } else showMsg(result.error || "Operation failed", "error");
    } catch (err) { showMsg("Network error: " + err.message, "error"); }
    finally { setLoading(false); }
  };

  const renderForm = () => {
    if (!activeGw) return null;
    switch (activeGw.id) {
      case "add-to-bm":
      case "add-to-ad-account":
        return (
          <form onSubmit={e => handleSubmit(e, activeGw.id)} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-400">Session Cookies</label>
              <textarea name="cookies" rows={3} className={inputCls} placeholder="c_user=...; xs=...; datr=..." required />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-400">Card Information</label>
              <button type="button" onClick={extractCardsFromClipboard}
                className="mb-2 w-full rounded-xl border border-blue-400/30 bg-blue-500/10 px-3 py-2.5 text-sm text-blue-300 transition hover:bg-blue-500/20">
                📋 Extract Cards from Clipboard
              </button>
              {clipboardCards.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400">Found Cards ({clipboardCards.length})</span>
                    <button type="button" onClick={toggleAll} className="text-xs text-blue-400 hover:text-blue-300">
                      {selectedCards.length === clipboardCards.length ? "Deselect All" : "Select All"}
                    </button>
                  </div>
                  <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-white/8 bg-black/20 p-2">
                    {clipboardCards.map(card => (
                      <label key={card.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/5 bg-white/3 p-2.5 hover:bg-white/5">
                        <input type="checkbox" checked={selectedCards.includes(card.id)} onChange={() => toggleCard(card.id)}
                          className="rounded text-blue-500" />
                        <div className="text-xs text-slate-300">
                          <div className="font-mono">**** **** **** {card.number.slice(-4)}</div>
                          <div className="text-slate-500">{card.month}/{card.year} · CVV {card.cvv}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-400">Ad Account ID</label>
              <input type="text" name="ad_account_id" className={inputCls} placeholder="act_123456789" required />
            </div>

            <button type="submit" disabled={loading || (clipboardCards.length === 0 && selectedCards.length === 0)} className={btnCls}>
              {loading ? "Processing…" : `${activeGw.icon} ${activeGw.label}`}
            </button>
          </form>
        );

      case "fetch-from-bm":
        return (
          <form onSubmit={e => handleSubmit(e, "fetch-from-bm")} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-400">Session Cookies</label>
              <textarea name="cookies" rows={3} className={inputCls} placeholder="c_user=...; xs=...; datr=..." required />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-400">Payment Account ID</label>
              <input type="text" name="payment_account_id" className={inputCls} placeholder="business_123456789" required />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-400">Ad Account ID</label>
              <input type="text" name="ad_account_id" className={inputCls} placeholder="act_123456789" required />
            </div>
            {fetchedCards.length > 0 && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-400">Available Cards</label>
                <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-white/8 bg-black/20 p-2">
                  {fetchedCards.map((card, i) => (
                    <div key={i} className="rounded-lg border border-white/5 bg-white/3 p-2.5 text-xs text-slate-300">
                      <div>Card ID: {card.id}</div>
                      <div>Last 4: {card.last4} · Type: {card.type}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button type="submit" disabled={loading} className={btnCls}>
              {loading ? "Fetching…" : "🔄 Fetch Cards from BM"}
            </button>
          </form>
        );

      default: return null;
    }
  };

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-[#0a0c10] text-white">

      {/* ── Top bar ── */}
      <header className="flex items-center gap-3 border-b border-white/8 bg-[#111318] px-5 py-3.5 shadow-sm">
        <button onClick={activeGw ? () => navigateTo("/cards") : onClose}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/10">
          ← {activeGw ? "Back" : "Home"}
        </button>
        <div className="h-4 w-px bg-white/10" />
        <span className="text-sm font-bold text-white">💳 Add Cards</span>
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
              <h2 className="mb-1 text-xl font-black text-white">Cards Management</h2>
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

          {activeGw && (
            <div className="mx-auto max-w-xl">
              <h2 className="mb-1 text-lg font-black text-white">{activeGw.icon} {activeGw.label}</h2>
              <p className="mb-5 text-xs text-slate-500">{activeGw.desc}</p>

              <div className="mb-4 rounded-xl border border-white/8 bg-[#141820] p-3">
                <ProxySelector onProxyChange={setProxy} />
              </div>

              {message && (
                <div className={`mb-4 rounded-xl border px-4 py-2.5 text-sm ${
                  messageType === "error"
                    ? "border-red-500/30 bg-red-500/10 text-red-300"
                    : "border-green-500/30 bg-green-500/10 text-green-300"
                }`}>{message}</div>
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
          <div className="flex w-72 flex-col items-center rounded-2xl border border-green-500/30 bg-[#141a22] p-8 shadow-2xl">
            <div className="mb-3 text-5xl">✅</div>
            <h3 className="mb-2 text-base font-bold text-green-300">Success!</h3>
            <p className="mb-5 text-center text-sm text-slate-400">{successMessage}</p>
            <button onClick={() => setShowSuccess(false)}
              className="rounded-xl bg-green-500 px-6 py-2 text-sm font-bold text-white hover:bg-green-600">OK</button>
          </div>
        </div>
      )}
    </div>
  );
}

CardsToolsModal.propTypes = {
  onClose:    PropTypes.func.isRequired,
  navigateTo: PropTypes.func.isRequired,
  pathname:   PropTypes.string.isRequired,
};
