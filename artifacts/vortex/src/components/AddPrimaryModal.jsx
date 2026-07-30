import { useState } from 'react';
import PropTypes from 'prop-types';

const C = {
  bg:'#0a0c10', panel:'#171c25', input:'#232a38',
  border:'#3d4757', gold:'#f59e0b', goldH:'#d97706', goldGlow:'rgba(245,158,11,0.22)',
  orange:'#ff6b1a', orangeGlow:'rgba(255,107,26,0.18)',
  cyan:'#22d3ee', green:'#22c55e', red:'#ef4444', warn:'#f59e0b',
  text:'#eef2f8', textSub:'#c3cddd', textMuted:'#99a5ba',
};
const inputCls = { width:'100%', padding:'9px 12px', fontSize:12.5, borderRadius:8, fontFamily:"'Share Tech Mono',monospace", boxSizing:'border-box' };
const labelCls = { fontSize:12.5, fontWeight:700, color:C.textSub, display:'block', marginBottom:5, fontFamily:"'Share Tech Mono',monospace", letterSpacing:'.06em' };

function StatusTag({ type='info', children }) {
  const clr = type==='success'?C.green:type==='error'?C.red:type==='warn'?C.warn:C.cyan;
  return <div style={{ padding:'8px 10px', borderRadius:7, border:`1px solid ${clr}33`, background:`${clr}11`, fontSize:12.5, color:clr, fontFamily:"'Share Tech Mono',monospace", lineHeight:1.7, whiteSpace:'pre-wrap', wordBreak:'break-all' }}>{children}</div>;
}
StatusTag.propTypes = { type:PropTypes.string, children:PropTypes.node };

// ── Add Primary CC tab ─────────────────────────────────────────────────────
function AddPrimaryTab({ cookies }) {
  const [accountId, setAccountId] = useState('');
  const [cards, setCards]         = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [status, setStatus]       = useState(null);
  const [log, setLog]             = useState([]);
  const [loading, setLoading]     = useState(false);

  const addLog = (msg, type='info') => setLog(prev => [{ msg, type, t: new Date().toLocaleTimeString('en',{hour12:false}) }, ...prev.slice(0,50)]);

  const fetchCards = async () => {
    if (!cookies.trim()) return setStatus({ type:'error', msg:'أدخل الكوكيز أولاً ↑' });
    if (!accountId.trim()) return setStatus({ type:'error', msg:'أدخل Account ID' });
    setLoading(true); setStatus({ type:'info', msg:'⟳ جاري جلب طرق الدفع...' });
    addLog('Fetching...');
    try {
      const r = await fetch('/api/payments/fetch-cards', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ cookies, account_id: accountId.trim() }) });
      const d = await r.json();
      if (!d.ok) { setStatus({ type:'error', msg:'✗ ' + d.reason }); addLog('✗ ' + d.reason, 'error'); }
      else {
        setCards(d.cards);
        const primary = d.cards.find(c => c.isPrimary);
        if (primary) setSelectedId(primary.id);
        else if (d.cards.length) setSelectedId(d.cards[0].id);
        addLog(`✓ Found ${d.cards.length}`, 'success');
        setStatus({ type:'success', msg:`✓ ${d.cards.length} طريقة — اختر وضغط SET PRIMARY` });
      }
    } catch(e) { setStatus({ type:'error', msg:'✗ ' + e.message }); }
    setLoading(false);
  };

  const setPrimary = async () => {
    if (!selectedId) return setStatus({ type:'error', msg:'اختر طريقة دفع' });
    setLoading(true);
    const card = cards.find(c => c.id === selectedId);
    addLog(`⭐ ${card?.name || selectedId}`);
    setStatus({ type:'info', msg:'⟳ Setting primary...' });
    try {
      const r = await fetch('/api/payments/set-primary', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ cookies, account_id: accountId.trim(), card_id: selectedId }) });
      const d = await r.json();
      if (d.ok) { addLog(`✓ Primary set: ${card?.name}`, 'success'); setStatus({ type:'success', msg:`✓ تم تعيين "${card?.name || selectedId}" كطريقة دفع أساسية!` }); }
      else { addLog(`✗ ${d.reason}`, 'error'); setStatus({ type:'error', msg:'✗ ' + d.reason }); }
    } catch(e) { addLog(`✗ ${e.message}`, 'error'); setStatus({ type:'error', msg:'✗ ' + e.message }); }
    setLoading(false);
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ padding:'8px 10px', background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:7, fontSize:11.5, color:C.textSub, fontFamily:"'Share Tech Mono',monospace" }}>
        يجلب طرق الدفع ويعيّن المختارة كـ Primary — BillingMakePrimaryStateMutation
      </div>

      <div>
        <label style={labelCls}>◈ ACCOUNT ID</label>
        <div style={{ display:'flex', gap:8 }}>
          <input value={accountId} onChange={e=>setAccountId(e.target.value)} placeholder="Payment / Ad Account ID" style={{ ...inputCls, flex:1 }} />
          <button onClick={fetchCards} disabled={loading} style={{ padding:'7px 14px', background:`linear-gradient(135deg,${C.gold},${C.goldH})`, border:'none', borderRadius:7, color:'#111', fontWeight:800, fontSize:12.5, cursor:'pointer', flexShrink:0 }}>
            {loading ? '⟳' : '🔍 FETCH'}
          </button>
        </div>
      </div>

      {cards.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:5, maxHeight:200, overflowY:'auto' }}>
          {cards.map(card => (
            <label key={card.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 10px', background:'#111318', border:`1px solid ${selectedId===card.id?C.gold:'#1e2330'}`, borderRadius:7, cursor:'pointer', transition:'.15s' }}>
              <input type="radio" name="ap-radio" value={card.id} checked={selectedId===card.id} onChange={()=>setSelectedId(card.id)} style={{ width:14, height:14, accentColor:C.gold, cursor:'pointer', flexShrink:0 }} />
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, fontWeight:700, color:C.text }}>{card.icon} {card.name}{card.isPrimary&&<span style={{ background:C.orange, color:'#000', padding:'1px 6px', borderRadius:3, fontSize:10.5, marginRight:5, fontWeight:700 }}>أساسي</span>}</div>
                <div style={{ fontSize:10.5, color:C.textMuted, marginTop:2, fontFamily:"'Share Tech Mono',monospace" }}>ID: {card.id}</div>
              </div>
            </label>
          ))}
        </div>
      )}

      {status && <StatusTag type={status.type}>{status.msg}</StatusTag>}

      {cards.length > 0 && (
        <button onClick={setPrimary} disabled={loading} style={{ padding:'10px', background:`linear-gradient(135deg,${C.gold},${C.goldH})`, border:'none', borderRadius:9, color:'#111', fontWeight:800, fontSize:13, cursor:'pointer', boxShadow:`0 2px 16px ${C.goldGlow}` }}>
          ⭐ SET PRIMARY
        </button>
      )}

      {/* Log */}
      <div style={{ background:'#06080b', border:`1px solid ${C.border}`, borderRadius:9, overflow:'hidden' }}>
        <div style={{ padding:'4px 8px', borderBottom:`1px solid ${C.border}`, fontFamily:"'Share Tech Mono',monospace", fontSize:10.5, color:C.textMuted }}>◈ LOG</div>
        <div style={{ padding:'6px 8px', maxHeight:80, overflowY:'auto', fontFamily:"'Share Tech Mono',monospace", fontSize:11, lineHeight:1.7 }}>
          {log.length === 0 ? <span style={{ color:C.textMuted }}>جاهز...</span> : log.map((l, i) => (
            <div key={i} style={{ color: l.type==='success'?C.green:l.type==='error'?C.red:C.cyan, borderBottom:'1px solid rgba(255,255,255,.04)', paddingBottom:1 }}>
              [{l.t}] {l.msg}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
AddPrimaryTab.propTypes = { cookies: PropTypes.string };

// ── Switch Old BM tab ──────────────────────────────────────────────────────
function SwitchOldTab({ cookies }) {
  const [bizId, setBizId]   = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const switchOld = async () => {
    if (!cookies.trim()) return setStatus({ type:'error', msg:'أدخل الكوكيز أولاً ↑' });
    setLoading(true); setStatus({ type:'info', msg:'⟳ Switching to old BM UI...' });
    try {
      const r = await fetch('/api/payments/switch-old', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ cookies, biz_id: bizId.trim() || undefined }) });
      const d = await r.json();
      if (d.ok) {
        setStatus({ type:'success', msg:`✓ تم! جاري التوجيه...\n↪ ${d.redirect}` });
        setTimeout(() => window.open(d.redirect, '_blank'), 1500);
      } else { setStatus({ type:'error', msg:'✗ ' + d.reason }); }
    } catch(e) { setStatus({ type:'error', msg:'✗ ' + e.message }); }
    setLoading(false);
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ padding:'8px 10px', background:'rgba(255,107,26,0.06)', border:'1px solid rgba(255,107,26,0.2)', borderRadius:7, fontSize:11.5, color:C.textSub, fontFamily:"'Share Tech Mono',monospace" }}>
        يحول الـ BM للواجهة القديمة — BizKitSetBMCOptinStatusMutation
      </div>

      <div>
        <label style={labelCls}>◈ BUSINESS ID (اختياري — يُكتشف تلقائياً)</label>
        <input value={bizId} onChange={e=>setBizId(e.target.value)} placeholder="يُكتشف تلقائياً من الكوكيز" style={inputCls} />
      </div>

      {status && <StatusTag type={status.type}>{status.msg}</StatusTag>}

      <button onClick={switchOld} disabled={loading} style={{ padding:'11px', background:`linear-gradient(135deg,${C.orange},#e55a0a)`, border:'none', borderRadius:10, color:'#000', fontWeight:800, fontSize:13, cursor:'pointer', boxShadow:`0 2px 18px ${C.orangeGlow}` }}>
        {loading ? '⟳ Switching...' : '↩ SWITCH TO OLD BM UI'}
      </button>

      <div style={{ padding:'10px', background:'rgba(255,107,26,0.05)', border:'1px solid rgba(255,107,26,0.15)', borderRadius:8, fontSize:11.5, color:C.textMuted, fontFamily:"'Share Tech Mono',monospace" }} dir="rtl">
        ⚠️ ستفتح نافذة جديدة بعد التحويل تتجه إلى واجهة البيزنس القديمة
      </div>
    </div>
  );
}
SwitchOldTab.propTypes = { cookies: PropTypes.string };

// ── Main modal ─────────────────────────────────────────────────────────────
export default function AddPrimaryModal({ onClose, defaultTab = 'primary' }) {
  const [cookies, setCookies] = useState('');
  const [activeTab, setActiveTab] = useState(defaultTab);

  const tabs = [
    { key:'primary', label:'⭐ ADD PRIMARY CC', logo:'/add_primary_cc.png', glow:'rgba(245,158,11,0.5)' },
    { key:'old',     label:'↩ SWITCH OLD BM',  logo:'/switch_bm_old.png',  glow:'rgba(255,107,26,0.5)' },
  ];
  const current = tabs.find(t => t.key === activeTab);

  return (
    <div style={{ display:'flex', flex:1, minHeight:0, flexDirection:'column', background:C.bg, fontFamily:"'Tajawal','Segoe UI',sans-serif" }}>
      {/* Header */}
      <header style={{ background:'linear-gradient(135deg,#0d0d0f,#161618)', borderBottom:`1px solid ${C.border}`, padding:'12px 20px', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.05)', border:`1px solid ${C.border}`, borderRadius:8, padding:'5px 12px', color:C.textSub, fontSize:12.5, cursor:'pointer' }}>→ رجوع</button>
          <img src={current.logo} alt={current.label} style={{ width:64, height:46, objectFit:'contain', filter:`drop-shadow(0 0 10px ${current.glow})` }} />
          <div>
            <div style={{ fontSize:15, fontWeight:800, letterSpacing:'.3px', background:'linear-gradient(90deg,#f59e0b,#ff6b1a)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
              {activeTab === 'primary' ? 'ADD PRIMARY CC' : 'SWITCH BM TO OLD'}
            </div>
            <div style={{ fontSize:11.5, color:C.textMuted }}>{activeTab === 'primary' ? 'تعيين طريقة الدفع الأساسية' : 'التحويل للواجهة القديمة'}</div>
          </div>
        </div>
      </header>

      {/* Body */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>
        {/* Tabs */}
        <div style={{ display:'flex', gap:6 }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)} style={{ flex:1, padding:'8px 0', background: activeTab===t.key ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.04)', border:`1px solid ${activeTab===t.key ? 'rgba(245,158,11,0.4)' : C.border}`, borderRadius:8, color: activeTab===t.key ? C.gold : C.textSub, fontWeight:700, fontSize:12.5, cursor:'pointer', transition:'all .15s' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Cookies */}
        <div style={{ background:C.panel, border:`1px solid rgba(245,158,11,0.45)`, borderRadius:12, padding:14, boxShadow:'0 1px 2px rgba(0,0,0,0.45), 0 6px 18px -8px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.gold, letterSpacing:'.08em', marginBottom:6, fontFamily:"'Share Tech Mono',monospace" }}>◈ COOKIES — مشترك للأداتين</div>
          <textarea value={cookies} onChange={e=>setCookies(e.target.value)} placeholder="c_user=...; xs=...; datr=..." rows={3}
            style={{ ...inputCls, resize:'vertical', lineHeight:1.5 }} />
        </div>

        {/* Active tab content */}
        {activeTab === 'primary'
          ? <AddPrimaryTab cookies={cookies} />
          : <SwitchOldTab cookies={cookies} />
        }
      </div>
    </div>
  );
}
AddPrimaryModal.propTypes = { onClose: PropTypes.func.isRequired, defaultTab: PropTypes.string };
