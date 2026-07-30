import { useState } from 'react';
import PropTypes from 'prop-types';

const C = {
  bg:'#0a0c10', card:'#12151c', panel:'#171c25', input:'#232a38',
  border:'#3d4757', borderHi:'#525f73',
  gold:'#f59e0b', goldH:'#d97706', goldGlow:'rgba(245,158,11,0.18)',
  orange:'#ff6b1a', orangeGlow:'rgba(255,107,26,0.18)',
  red:'#ef4444', redGlow:'rgba(239,68,68,0.18)',
  cyan:'#22d3ee', green:'#22c55e', warn:'#f59e0b',
  text:'#eef2f8', textSub:'#c3cddd', textMuted:'#99a5ba',
};
const inputCls = { width:'100%', padding:'9px 12px', fontSize:12.5, borderRadius:8, fontFamily:"'Share Tech Mono',monospace", boxSizing:'border-box' };
const labelCls = { fontSize:12.5, fontWeight:700, color:C.textSub, display:'block', marginBottom:5, fontFamily:"'Share Tech Mono',monospace", letterSpacing:'.06em' };

function StatusTag({ type='info', children }) {
  const clr = type==='success'?C.green:type==='error'?C.red:type==='warn'?C.warn:C.cyan;
  return <div style={{ padding:'8px 10px', borderRadius:7, border:`1px solid ${clr}33`, background:`${clr}11`, fontSize:12.5, color:clr, fontFamily:"'Share Tech Mono',monospace", lineHeight:1.7, whiteSpace:'pre-wrap', wordBreak:'break-all' }}>{children}</div>;
}
StatusTag.propTypes = { type:PropTypes.string, children:PropTypes.node };

export default function RemovePaymentModal({ onClose }) {
  const [cookies, setCookies]   = useState('');
  const [accountId, setAccountId] = useState('');
  const [cards, setCards]       = useState([]);
  const [checked, setChecked]   = useState({});
  const [status, setStatus]     = useState(null);
  const [log, setLog]           = useState([]);
  const [loading, setLoading]   = useState(false);

  const addLog = (msg, type='info') => setLog(prev => [{ msg, type, t: new Date().toLocaleTimeString('en',{hour12:false}) }, ...prev.slice(0,50)]);

  const fetchCards = async () => {
    if (!cookies.trim()) return setStatus({ type:'error', msg:'أدخل الكوكيز أولاً ↑' });
    if (!accountId.trim()) return setStatus({ type:'error', msg:'أدخل Account ID' });
    setLoading(true); setStatus({ type:'info', msg:'⟳ جاري جلب طرق الدفع...' }); setCards([]);
    try {
      const r = await fetch('/api/payments/fetch-cards', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ cookies, account_id: accountId.trim() }) });
      const d = await r.json();
      if (!d.ok) { setStatus({ type:'error', msg:'✗ ' + d.reason }); addLog('✗ ' + d.reason, 'error'); }
      else {
        setCards(d.cards); setChecked({});
        addLog(`✓ Found ${d.cards.length} payment method(s)`, 'success');
        setStatus({ type:'success', msg:`✓ ${d.cards.length} طريقة دفع — اختر وضغط DELETE` });
      }
    } catch(e) { setStatus({ type:'error', msg:'✗ ' + e.message }); }
    setLoading(false);
  };

  const deleteSelected = async () => {
    const selected = cards.filter((_, i) => checked[i]);
    if (!selected.length) return setStatus({ type:'warn', msg:'⚠ لم تختر أي طريقة' });
    if (!confirm(`⚠️ حذف ${selected.length} طريقة دفع؟`)) return;
    setLoading(true);
    let ok=0, fail=0;
    setStatus({ type:'info', msg:`⟳ حذف ${selected.length}...` });
    for (const card of selected) {
      addLog(`🗑 ${card.name}`);
      try {
        const r = await fetch('/api/payments/remove-card', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ cookies, account_id: accountId.trim(), card_id: card.id }) });
        const d = await r.json();
        if (d.ok) { ok++; addLog(`✓ Deleted: ${card.name}`, 'success'); }
        else { fail++; addLog(`✗ ${card.name}: ${d.reason}`, 'error'); }
      } catch(e) { fail++; addLog(`✗ ${e.message}`, 'error'); }
      if (selected.indexOf(card) < selected.length - 1) await new Promise(r => setTimeout(r, 1200));
    }
    setLoading(false);
    setStatus({ type: ok===selected.length?'success':ok>0?'warn':'error', msg:`🗑 ${ok}/${selected.length} تم حذفها\n✓ ${ok} نجح  ✗ ${fail} فشل` });
    if (ok > 0) { setCards(prev => prev.filter(c => !selected.find(s => s.id===c.id))); setChecked({}); }
  };

  const toggleAll = (v) => { const n={}; cards.forEach((_,i) => n[i]=v); setChecked(n); };

  return (
    <div style={{ display:'flex', flex:1, minHeight:0, flexDirection:'column', background:C.bg, fontFamily:"'Tajawal','Segoe UI',sans-serif" }}>
      <style>{`@keyframes bmSpin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <header style={{ background:'linear-gradient(135deg,#0d0d0f,#161618)', borderBottom:`1px solid ${C.border}`, padding:'12px 20px', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.05)', border:`1px solid ${C.border}`, borderRadius:8, padding:'5px 12px', color:C.textSub, fontSize:12.5, cursor:'pointer' }}>→ رجوع</button>
          <img src="/remove_payment.png" alt="Remove Payment" style={{ width:60, height:44, objectFit:'contain', filter:'drop-shadow(0 0 10px rgba(239,68,68,0.5))' }} />
          <div>
            <div style={{ fontSize:15, fontWeight:800, letterSpacing:'.3px', background:'linear-gradient(90deg,#ef4444,#f97316)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>REMOVE PAYMENT</div>
            <div style={{ fontSize:11.5, color:C.textMuted }}>حذف طرق الدفع من حساب الإعلانات</div>
          </div>
        </div>
      </header>

      {/* Body */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>
        {/* Cookies */}
        <div style={{ background:C.panel, border:`1px solid rgba(245,158,11,0.45)`, borderRadius:12, padding:14, boxShadow:'0 1px 2px rgba(0,0,0,0.45), 0 6px 18px -8px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.gold, letterSpacing:'.08em', marginBottom:6, fontFamily:"'Share Tech Mono',monospace" }}>◈ COOKIES</div>
          <label style={labelCls}>أدخل كوكيز الفيسبوك (نص أو JSON)</label>
          <textarea value={cookies} onChange={e=>setCookies(e.target.value)} placeholder="c_user=...; xs=...; datr=..." rows={3}
            style={{ ...inputCls, resize:'vertical', lineHeight:1.5 }} />
        </div>

        {/* Account ID */}
        <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:14, boxShadow:'0 1px 2px rgba(0,0,0,0.45), 0 6px 18px -8px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
          <label style={labelCls}>◈ PAYMENT / AD ACCOUNT ID</label>
          <div style={{ display:'flex', gap:8 }}>
            <input value={accountId} onChange={e=>setAccountId(e.target.value)} placeholder="مثال: 1234567890" style={{ ...inputCls, flex:1 }} />
            <button onClick={fetchCards} disabled={loading} style={{ padding:'7px 14px', background:`linear-gradient(135deg,${C.gold},${C.goldH})`, border:'none', borderRadius:7, color:'#111', fontWeight:800, fontSize:12.5, cursor:'pointer', flexShrink:0 }}>
              {loading ? '⟳' : '🔍 FETCH'}
            </button>
          </div>
        </div>

        {/* Status */}
        {status && <StatusTag type={status.type}>{status.msg}</StatusTag>}

        {/* Cards list */}
        {cards.length > 0 && (
          <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:14, boxShadow:'0 1px 2px rgba(0,0,0,0.45), 0 6px 18px -8px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <div style={{ fontSize:11, fontWeight:700, color:C.textMuted, fontFamily:"'Share Tech Mono',monospace", letterSpacing:'.08em' }}>◈ طرق الدفع ({cards.length})</div>
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={()=>toggleAll(true)} style={{ padding:'3px 10px', background:'rgba(255,255,255,0.07)', border:`1px solid ${C.border}`, borderRadius:5, color:C.textSub, fontSize:11.5, cursor:'pointer' }}>☑ الكل</button>
                <button onClick={()=>toggleAll(false)} style={{ padding:'3px 10px', background:'rgba(255,255,255,0.07)', border:`1px solid ${C.border}`, borderRadius:5, color:C.textSub, fontSize:11.5, cursor:'pointer' }}>☐ إلغاء</button>
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:5, maxHeight:200, overflowY:'auto' }}>
              {cards.map((card, i) => (
                <label key={card.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 10px', background:'#111318', border:`1px solid ${checked[i]?C.red:'#1e2330'}`, borderRadius:7, cursor:'pointer', transition:'.15s' }}>
                  <input type="checkbox" checked={!!checked[i]} onChange={e=>setChecked(prev=>({...prev,[i]:e.target.checked}))} style={{ width:14, height:14, accentColor:C.red, cursor:'pointer', flexShrink:0 }} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:C.text }}>{card.icon} {card.name}{card.isPrimary&&<span style={{ background:C.orange, color:'#000', padding:'1px 6px', borderRadius:3, fontSize:10.5, marginRight:5, fontWeight:700 }}>أساسي</span>}</div>
                    <div style={{ fontSize:10.5, color:C.textMuted, marginTop:2, fontFamily:"'Share Tech Mono',monospace" }}>ID: {card.id}</div>
                  </div>
                </label>
              ))}
            </div>
            <button onClick={deleteSelected} disabled={loading} style={{ marginTop:10, width:'100%', padding:9, background:`linear-gradient(135deg,${C.red},#dc2626)`, border:'none', borderRadius:8, color:'#fff', fontWeight:800, fontSize:12, cursor:'pointer', boxShadow:`0 2px 16px ${C.redGlow}` }}>
              🗑 DELETE SELECTED
            </button>
          </div>
        )}

        {/* Log */}
        <div style={{ background:'#06080b', border:`1px solid ${C.border}`, borderRadius:9, overflow:'hidden' }}>
          <div style={{ padding:'4px 8px', borderBottom:`1px solid ${C.border}`, fontFamily:"'Share Tech Mono',monospace", fontSize:10.5, color:C.textMuted }}>◈ LOG</div>
          <div style={{ padding:'6px 8px', maxHeight:100, overflowY:'auto', fontFamily:"'Share Tech Mono',monospace", fontSize:11, lineHeight:1.7 }}>
            {log.length === 0 ? <span style={{ color:C.textMuted }}>جاهز...</span> : log.map((l, i) => (
              <div key={i} style={{ color: l.type==='success'?C.green:l.type==='error'?C.red:C.cyan, borderBottom:'1px solid rgba(255,255,255,.04)', paddingBottom:1 }}>
                [{l.t}] {l.msg}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
RemovePaymentModal.propTypes = { onClose: PropTypes.func.isRequired };
