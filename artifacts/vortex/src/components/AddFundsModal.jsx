import { useState } from 'react';
import PropTypes from 'prop-types';

const C = {
  bg:'#0a0c10', card:'#12151c', panel:'#171c25', input:'#232a38',
  border:'#3d4757', gold:'#f59e0b', goldH:'#d97706', goldGlow:'rgba(245,158,11,0.22)',
  orange:'#ff6b1a', cyan:'#22d3ee', green:'#22c55e', red:'#ef4444', warn:'#f59e0b',
  text:'#eef2f8', textSub:'#c3cddd', textMuted:'#99a5ba',
};
const inputCls = { width:'100%', padding:'9px 12px', fontSize:12.5, borderRadius:8, fontFamily:"'Share Tech Mono',monospace", boxSizing:'border-box' };
const labelCls = { fontSize:12.5, fontWeight:700, color:C.textSub, display:'block', marginBottom:5, fontFamily:"'Share Tech Mono',monospace", letterSpacing:'.06em' };

function StatusTag({ type='info', children }) {
  const clr = type==='success'?C.green:type==='error'?C.red:type==='warn'?C.warn:C.cyan;
  return <div style={{ padding:'8px 10px', borderRadius:7, border:`1px solid ${clr}33`, background:`${clr}11`, fontSize:12.5, color:clr, fontFamily:"'Share Tech Mono',monospace", lineHeight:1.7, whiteSpace:'pre-wrap', wordBreak:'break-all' }}>{children}</div>;
}
StatusTag.propTypes = { type:PropTypes.string, children:PropTypes.node };

const STEPS = [
  'جلب البطاقات من الحساب',
  'التحقق من البيانات',
  'إرسال طلب الإضافة',
  'انتظار تأكيد السيرفر',
];

function StepBar({ steps, current, states }) {
  return (
    <div style={{ background:'#06080b', border:`1px solid ${C.border}`, borderRadius:9, padding:'8px 10px', display:'flex', flexDirection:'column', gap:4 }}>
      {steps.map((s, i) => {
        const state = states[i] || 'pending';
        const clr = state==='done'?C.green:state==='error'?C.red:state==='active'?C.cyan:C.textMuted;
        return (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'3px 0', fontFamily:"'Share Tech Mono',monospace", fontSize:11.5 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:clr, flexShrink:0, boxShadow: state==='active'?`0 0 8px ${C.cyan}`:state==='done'?`0 0 6px ${C.green}`:state==='error'?`0 0 6px ${C.red}`:'none', transition:'.3s', display:'inline-block' }} />
            <span style={{ color: clr }}>{s}</span>
          </div>
        );
      })}
    </div>
  );
}
StepBar.propTypes = { steps:PropTypes.array, current:PropTypes.number, states:PropTypes.object };

export default function AddFundsModal({ onClose }) {
  const [cookies, setCookies]     = useState('');
  const [accountId, setAccountId] = useState('');
  const [cards, setCards]         = useState([]);
  const [cardId, setCardId]       = useState('');
  const [amount, setAmount]       = useState('');
  const [status, setStatus]       = useState(null);
  const [log, setLog]             = useState('> Ready...\n');
  const [loading, setLoading]     = useState(false);
  const [stepStates, setStepStates] = useState({});

  const addLog = (msg) => setLog(prev => prev + `\n> ${msg}`);
  const setStep = (i, state) => setStepStates(prev => ({ ...prev, [i]: state }));
  const resetSteps = () => setStepStates({});

  const fetchCards = async () => {
    if (!cookies.trim()) return setStatus({ type:'error', msg:'أدخل الكوكيز أولاً ↑' });
    if (!accountId.trim()) return setStatus({ type:'error', msg:'أدخل Payment Account ID' });
    setLoading(true); resetSteps(); setStep(0,'active');
    setStatus({ type:'info', msg:'⟳ جاري جلب البطاقات...' });
    addLog(`🔍 Fetching cards for: ${accountId}`);
    try {
      const r = await fetch('/api/payments/fetch-cards', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ cookies, account_id: accountId.trim() }) });
      const d = await r.json();
      if (!d.ok) { setStep(0,'error'); setStatus({ type:'error', msg:'✗ ' + d.reason }); addLog('✗ ' + d.reason); }
      else {
        const creditCards = d.cards.filter(c => c.icon === '💳');
        setStep(0,'done'); setStep(1,'done');
        setCards(creditCards);
        if (creditCards.length > 0) setCardId(creditCards[0].id);
        addLog(`✓ Found ${creditCards.length} card(s)`);
        setStatus({ type:'success', msg:`✓ ${creditCards.length} بطاقة — اختر البطاقة والمبلغ وضغط ADD FUNDS` });
      }
    } catch(e) { setStep(0,'error'); setStatus({ type:'error', msg:'✗ ' + e.message }); addLog('✗ ' + e.message); }
    setLoading(false);
  };

  const addFunds = async () => {
    if (!cookies.trim()) return setStatus({ type:'error', msg:'أدخل الكوكيز' });
    if (!accountId.trim() || !cardId || !amount) return setStatus({ type:'error', msg:'Account + بطاقة + مبلغ مطلوبين' });
    setLoading(true); resetSteps(); setStep(0,'done'); setStep(1,'active');
    setStatus({ type:'info', msg:`⟳ جاري إضافة $${amount}...` });
    addLog(`⟳ Injecting $${amount} using card: ${cardId}`);
    await new Promise(r=>setTimeout(r,400));
    setStep(1,'done'); setStep(2,'active');
    addLog(`✓ Validated: payAccId=${accountId} | cardId=${cardId} | amount=${amount}`);
    try {
      const r = await fetch('/api/payments/add-funds', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ cookies, account_id: accountId.trim(), card_id: cardId, amount }) });
      const d = await r.json();
      setStep(2,'done'); setStep(3,'active');
      addLog('⟳ Waiting for server confirmation...');
      await new Promise(r=>setTimeout(r,400));
      if (d.ok) { setStep(3,'done'); addLog(`✅ SUCCESS: $${amount} added.`); setStatus({ type:'success', msg:`✓ تم إضافة $${amount} بنجاح!` }); }
      else { setStep(3,'error'); addLog(`✗ ${d.reason}`); setStatus({ type:'error', msg:'✗ فشلت العملية\n' + d.reason }); }
    } catch(e) { setStep(2,'error'); addLog(`✗ ${e.message}`); setStatus({ type:'error', msg:'✗ ' + e.message }); }
    setLoading(false);
  };

  return (
    <div style={{ display:'flex', flex:1, minHeight:0, flexDirection:'column', background:C.bg, fontFamily:"'Tajawal','Segoe UI',sans-serif" }}>
      {/* Header */}
      <header style={{ background:'linear-gradient(135deg,#0d0d0f,#161618)', borderBottom:`1px solid ${C.border}`, padding:'12px 20px', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.05)', border:`1px solid ${C.border}`, borderRadius:8, padding:'5px 12px', color:C.textSub, fontSize:12.5, cursor:'pointer' }}>→ رجوع</button>
          <img src="/add_funds_meta.png" alt="Add Funds" style={{ width:70, height:46, objectFit:'contain', filter:'drop-shadow(0 0 10px rgba(245,158,11,0.5))' }} />
          <div>
            <div style={{ fontSize:15, fontWeight:800, letterSpacing:'.3px', background:'linear-gradient(90deg,#f59e0b,#fcd34d)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>ADD FUNDS METAGRAPH</div>
            <div style={{ fontSize:11.5, color:C.textMuted }}>إضافة رصيد لحساب الإعلانات عبر GraphQL</div>
          </div>
        </div>
      </header>

      {/* Body */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>
        {/* Cookies */}
        <div style={{ background:C.panel, border:`1px solid rgba(245,158,11,0.45)`, borderRadius:12, padding:14, boxShadow:'0 1px 2px rgba(0,0,0,0.45), 0 6px 18px -8px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.gold, letterSpacing:'.08em', marginBottom:6, fontFamily:"'Share Tech Mono',monospace" }}>◈ COOKIES</div>
          <textarea value={cookies} onChange={e=>setCookies(e.target.value)} placeholder="c_user=...; xs=...; datr=..." rows={3}
            style={{ ...inputCls, resize:'vertical', lineHeight:1.5 }} />
        </div>

        {/* Payment Account ID */}
        <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:14, display:'flex', flexDirection:'column', gap:10, boxShadow:'0 1px 2px rgba(0,0,0,0.45), 0 6px 18px -8px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
          <div>
            <label style={labelCls}>◈ PAYMENT ACCOUNT ID</label>
            <div style={{ display:'flex', gap:8 }}>
              <input value={accountId} onChange={e=>setAccountId(e.target.value)} placeholder="يُكتشف تلقائياً" style={{ ...inputCls, flex:1 }} />
              <button onClick={fetchCards} disabled={loading} style={{ padding:'7px 14px', background:`linear-gradient(135deg,${C.gold},${C.goldH})`, border:'none', borderRadius:7, color:'#111', fontWeight:800, fontSize:12.5, cursor:'pointer', flexShrink:0 }}>
                {loading ? '⟳' : '🔍 FETCH'}
              </button>
            </div>
          </div>

          {cards.length > 0 && (
            <div>
              <label style={labelCls}>◈ البطاقة</label>
              <select value={cardId} onChange={e=>setCardId(e.target.value)} style={{ ...inputCls }}>
                {cards.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label style={labelCls}>◈ المبلغ (USD)</label>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <input type="number" min={1} step={1} value={amount} onChange={e=>setAmount(e.target.value)} placeholder="مثال: 50" style={{ ...inputCls, flex:1 }} />
              <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11.5, color:C.textMuted, flexShrink:0 }}>USD</span>
            </div>
          </div>
        </div>

        {/* Step bar — visible when steps are active */}
        {Object.keys(stepStates).length > 0 && <StepBar steps={STEPS} states={stepStates} />}

        {/* Status */}
        {status && <StatusTag type={status.type}>{status.msg}</StatusTag>}

        {/* ADD FUNDS button */}
        <button onClick={addFunds} disabled={loading || cards.length===0} style={{ padding:'11px', background: cards.length>0 ? `linear-gradient(135deg,${C.gold},${C.goldH})` : C.border, border:'none', borderRadius:10, color: cards.length>0 ? '#111' : C.textMuted, fontWeight:800, fontSize:13, cursor: cards.length>0 ? 'pointer':'not-allowed', boxShadow: cards.length>0 ? `0 2px 18px ${C.goldGlow}` : 'none' }}>
          💰 ADD FUNDS
        </button>

        {/* Terminal */}
        <div style={{ background:'#06080b', border:`1px solid ${C.border}`, borderRadius:9, overflow:'hidden' }}>
          <div style={{ padding:'4px 8px', borderBottom:`1px solid ${C.border}`, fontFamily:"'Share Tech Mono',monospace", fontSize:10.5, color:C.textMuted }}>◈ TERMINAL</div>
          <pre style={{ padding:'7px 9px', maxHeight:130, overflowY:'auto', fontFamily:"'Share Tech Mono',monospace", fontSize:11, lineHeight:1.6, color:'#86ffb3', margin:0, background:'transparent', whiteSpace:'pre-wrap' }}>{log}</pre>
        </div>
      </div>
    </div>
  );
}
AddFundsModal.propTypes = { onClose: PropTypes.func.isRequired };
