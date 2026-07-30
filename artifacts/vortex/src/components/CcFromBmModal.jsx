import { useState, useRef } from 'react';
import PropTypes from 'prop-types';

// ── Color palette ─────────────────────────────────────────────────────────
const C = {
  bg:       '#0a0c10',
  card:     '#12151c',
  panel:    '#171c25',
  input:    '#232a38',
  border:   '#3d4757',
  borderHi: '#525f73',
  gold:     '#f59e0b',
  goldH:    '#d97706',
  goldGlow: 'rgba(245,158,11,0.18)',
  silver:   '#94a3b8',
  text:     '#eef2f8',
  textSub:  '#c3cddd',
  textMuted:'#99a5ba',
  green:    '#22c55e',
  red:      '#ef4444',
  cyan:     '#22d3ee',
};

const inputCls = {
  width:'100%', padding:'9px 12px', fontSize:13, borderRadius:8, boxSizing:'border-box',
};
const panelCls = { background: C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:'14px', boxShadow:'0 1px 2px rgba(0,0,0,0.45), 0 6px 18px -8px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)' };
const labelCls = { fontSize:12.5, fontWeight:700, color: C.textSub, display:'block', marginBottom:5, fontFamily:"'Share Tech Mono',monospace", letterSpacing:'.06em' };
const SectionBar = () => <span style={{ display:'inline-block', width:3, height:12, background:C.gold, borderRadius:2 }} />;
const sectionTitleCls = { fontSize:12.5, fontWeight:800, color:C.text, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:12, display:'flex', alignItems:'center', gap:7 };

function Spin() {
  return <span style={{ display:'inline-block', width:12, height:12, borderRadius:'50%', border:'2px solid currentColor', borderTopColor:'transparent', animation:'bmSpin .7s linear infinite' }} />;
}

function Tag({ type='info', children }) {
  const clr = type === 'success' ? C.green : type === 'error' ? C.red : type === 'warn' ? C.gold : C.cyan;
  return (
    <div style={{ padding:'8px 12px', borderRadius:8, border:`1px solid ${clr}33`, background:`${clr}11`, fontSize:12, color: clr }}>
      {children}
    </div>
  );
}
Tag.propTypes = { type: PropTypes.string, children: PropTypes.node };

function LogBox({ lines }) {
  const el = useRef(null);
  return (
    <div style={{ background:'#08090c', border:`1px solid ${C.border}`, borderRadius:7, overflow:'hidden' }}>
      <div style={{ padding:'4px 8px', borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:C.textMuted, letterSpacing:'1px' }}>◈ LOG</span>
      </div>
      <div ref={el} style={{ padding:'6px 8px', maxHeight:140, overflowY:'auto', fontFamily:"'Share Tech Mono',monospace", fontSize:11, lineHeight:1.7 }}>
        {lines.slice(-60).reverse().map((l,i) => (
          <div key={i} style={{ color: l.type==='success'?C.green : l.type==='error'?C.red : l.type==='warn'?C.gold : C.cyan, borderBottom:`1px solid rgba(255,255,255,.03)`, padding:'1px 0' }}>
            [{l.time}] {l.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
LogBox.propTypes = { lines: PropTypes.array };

function ProgressBar({ value }) {
  return (
    <div style={{ background:'#111', borderRadius:4, height:6, overflow:'hidden', margin:'4px 0 8px' }}>
      <div style={{ width:`${value}%`, height:'100%', background:`linear-gradient(90deg,${C.gold},${C.goldH})`, borderRadius:4, transition:'width .4s ease' }} />
    </div>
  );
}
ProgressBar.propTypes = { value: PropTypes.number };

export default function CcFromBmModal({ onClose }) {
  const [cookies, setCookies]       = useState('');
  const [billingUrl, setBillingUrl] = useState('');

  const [loading, setLoading]         = useState(false);
  const [result, setResult]           = useState(null);
  const [cards, setCards]             = useState([]);
  const [session, setSession]         = useState(null);
  const [selectedId, setSelectedId]   = useState('');
  const [runAll, setRunAll]           = useState(false);
  const [interval, setInterval_]      = useState(3);
  const [progress, setProgress]       = useState(0);
  const [running, setRunning]         = useState(false);
  const [logs, setLogs]               = useState([]);
  const stopRef                       = useRef(false);

  function addLog(msg, type='info') {
    const time = new Date().toLocaleTimeString('en',{hour12:false});
    setLogs(prev => [...prev, { msg, type, time }]);
  }

  // ── Parse billing URL live ────────────────────────────────────────────────
  function parsedFromUrl(url) {
    try {
      const u = new URL(url.trim());
      const biz = u.searchParams.get('business_id') || '';
      const ad  = (u.searchParams.get('ad_account_id') || '').replace(/^act_/i,'');
      return { biz, ad };
    } catch(_) { return { biz:'', ad:'' }; }
  }
  const { biz: parsedBiz, ad: parsedAd } = parsedFromUrl(billingUrl);

  async function handleFetch() {
    if (!cookies.trim()) return setResult({ type:'error', msg:'أدخل الكوكيز أولاً' });
    if (!billingUrl.trim()) return setResult({ type:'error', msg:'أدخل رابط الفوترة أولاً' });
    setLoading(true); setResult(null); setCards([]); setSession(null); setLogs([]);
    addLog('جاري تحميل صفحة الفوترة وفحص الجلسة...');
    try {
      const r = await fetch('/api/cc-from-bm/fetch-cards', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ cookies, billing_url: billingUrl.trim() }),
      }).then(x => x.json());
      if (r.ok) {
        setCards(r.cards || []);
        setSession(r.session);
        if (r.cards?.length) setSelectedId(r.cards[0].credential_id);
        addLog(`✓ تم استخراج الجلسة — Business: ${r.session?.businessId}`, 'success');
        addLog(`✓ ${r.cards?.length} كارت متاح`, 'success');
        setResult({ type:'success', msg:`✅ تم جلب ${r.cards?.length} بطاقة — اختر وضغط MAKE DEFAULT` });
      } else {
        addLog(`✗ ${r.reason}`, 'error');
        setResult({ type:'error', msg:`❌ ${r.reason}` });
      }
    } catch(e) {
      addLog(`✗ ${e.message}`, 'error');
      setResult({ type:'error', msg:`❌ ${e.message}` });
    }
    setLoading(false);
  }

  async function handleMakeDefault() {
    if (running) return;
    const toRun = runAll ? cards : cards.filter(c => c.credential_id === selectedId);
    if (!toRun.length) return setResult({ type:'error', msg:'لا يوجد كارت محدد' });
    stopRef.current = false;
    setRunning(true); setProgress(0);
    addLog(`▶ بدء العملية على ${toRun.length} كارت`, 'info');
    let ok=0, fail=0;
    for (let i=0; i<toRun.length; i++) {
      if (stopRef.current) { addLog('⏹ تم الإيقاف', 'warn'); break; }
      const card = toRun[i];
      addLog(`🔄 ${card.label}`, 'info');
      try {
        const r = await fetch('/api/cc-from-bm/make-default', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ cookies, session, credential_id: card.credential_id }),
        }).then(x => x.json());
        if (r.ok) { ok++; addLog(`✓ SUCCESS: ${card.label}`, 'success'); }
        else       { fail++; addLog(`✗ FAILED: ${card.label} — ${r.reason}`, 'error'); }
      } catch(e) {
        fail++;
        addLog(`✗ ERROR: ${card.label} — ${e.message}`, 'error');
      }
      setProgress(((i+1)/toRun.length)*100);
      if (i < toRun.length-1 && !stopRef.current) {
        addLog(`⏳ انتظار ${interval}s...`);
        await new Promise(r => setTimeout(r, interval*1000));
      }
    }
    setRunning(false);
    addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━`, ok>0?'success':'error');
    addLog(`📊 النتيجة: ${ok} نجاح، ${fail} فشل`, ok>0?'success':'error');
    setResult({ type: fail===0?'success':'warn', msg:`${ok}/${toRun.length} كارت — ✓ ${ok} نجاح  ✗ ${fail} فشل` });
  }

  function handleReset() {
    setCards([]); setSession(null); setResult(null); setLogs([]);
    setProgress(0); setSelectedId(''); setRunAll(false);
  }

  return (
    <div style={{ display:'flex', height:'100%', width:'100%', flexDirection:'column', background:C.bg, fontFamily:"'Tajawal','Segoe UI',sans-serif", fontSize:13 }} dir="rtl">
      <style>{`@keyframes bmSpin{to{transform:rotate(360deg)}} @keyframes bmPulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>

      {/* Header */}
      <header style={{ background:`linear-gradient(135deg, #131313 0%, #1a1a1a 50%, #141414 100%)`, borderBottom:`1px solid ${C.border}`, padding:'14px 20px', flexShrink:0, boxShadow:`0 1px 20px rgba(245,158,11,0.08)` }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <button onClick={onClose} style={{ background:C.input, border:`1px solid ${C.border}`, borderRadius:7, padding:'6px 12px', color:C.textSub, fontSize:12.5, cursor:'pointer' }}>→ رجوع</button>
            <img src="/meta_cards_from_bm.png" alt="CC FROM BM" style={{ width:52, height:52, objectFit:'contain', borderRadius:10, filter:'drop-shadow(0 0 8px rgba(245,158,11,0.4))' }} />
            <div>
              <div style={{ fontSize:15, fontWeight:800, letterSpacing:'.4px', background:`linear-gradient(90deg,${C.gold},#fcd34d)`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>CC FROM BM</div>
              <div style={{ fontSize:11.5, color:C.textMuted }}>إضافة كارت من BM كـ Default</div>
            </div>
          </div>
          {session && (
            <div style={{ display:'flex', alignItems:'center', gap:6, borderRadius:7, padding:'5px 10px', background:`rgba(245,158,11,0.08)`, border:`1px solid rgba(245,158,11,0.2)`, fontSize:11.5 }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:C.gold, animation:'bmPulse 2s infinite', flexShrink:0 }} />
              <span style={{ color:C.gold, fontFamily:"'Share Tech Mono',monospace" }}>BM: {session.businessId}</span>
            </div>
          )}
        </div>
      </header>

      {/* Body */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>

        {/* ── Session input ── */}
        <div style={panelCls}>
          <div style={sectionTitleCls}><SectionBar />بيانات الجلسة</div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>

            <div>
              <label style={labelCls}>◈ COOKIES (JSON أو نص)</label>
              <textarea value={cookies} onChange={e=>setCookies(e.target.value)} rows={3} placeholder='c_user=123; xs=abc  ——أو——  [{"name":"c_user","value":"123"}]' style={{ ...inputCls, resize:'none', fontFamily:"'Share Tech Mono',monospace", display:'block' }} />
            </div>

            <div>
              <label style={labelCls}>◈ رابط الفوترة (billing_hub)</label>
              <input value={billingUrl} onChange={e=>setBillingUrl(e.target.value)} placeholder="https://business.facebook.com/billing_hub/payment_accounts/?business_id=...&ad_account_id=act_..." style={inputCls} />
              {/* Live parse preview */}
              {(parsedBiz || parsedAd) && (
                <div style={{ display:'flex', gap:8, marginTop:5 }}>
                  {parsedBiz && <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11.5, color:C.cyan, background:'rgba(34,211,238,0.08)', border:'1px solid rgba(34,211,238,0.2)', borderRadius:5, padding:'2px 8px' }}>BIZ: {parsedBiz}</span>}
                  {parsedAd  && <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11.5, color:C.gold, background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:5, padding:'2px 8px' }}>ACT: {parsedAd}</span>}
                </div>
              )}
              <p style={{ fontSize:11.5, color:C.textMuted, marginTop:4 }}>الأداة تستخرج Business ID و Ad Account ID من الرابط تلقائياً</p>
            </div>
          </div>
        </div>

        {/* Fetch button */}
        <button onClick={handleFetch} disabled={loading} style={{ width:'100%', padding:'10px', borderRadius:7, fontWeight:700, fontSize:13, cursor:loading?'not-allowed':'pointer', border:'none', background:`linear-gradient(135deg,${C.gold},${C.goldH})`, color:'#111', opacity:loading?.65:1, display:'flex', alignItems:'center', justifyContent:'center', gap:7, boxShadow:`0 2px 14px ${C.goldGlow}` }}>
          {loading ? <><Spin />جاري جلب الكروت...</> : '🔍 FETCH CARDS'}
        </button>

        {/* Result tag */}
        {result && <Tag type={result.type}>{result.msg}</Tag>}

        {/* ── Cards section ── */}
        {cards.length > 0 && (
          <div style={panelCls}>
            <div style={sectionTitleCls}><SectionBar />الكروت المتاحة ({cards.length})</div>

            {/* Card select */}
            <div style={{ marginBottom:10 }}>
              <label style={labelCls}>◈ اختر الكارت</label>
              <select value={selectedId} onChange={e=>setSelectedId(e.target.value)} disabled={runAll} style={{ ...inputCls, display:'block', opacity: runAll?.5:1 }}>
                {cards.map(c => (
                  <option key={c.credential_id} value={c.credential_id}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Run all checkbox */}
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', background:'rgba(0,0,0,.3)', border:`1px solid ${C.border}`, borderRadius:7, marginBottom: runAll ? 10 : 0 }}>
              <input type="checkbox" id="cbfb-all" checked={runAll} onChange={e=>setRunAll(e.target.checked)} style={{ width:14, height:14, accentColor:C.gold, cursor:'pointer' }} />
              <label htmlFor="cbfb-all" style={{ fontSize:12, fontWeight:600, color:C.text, cursor:'pointer', letterSpacing:'.4px' }}>تشغيل على كل الكروت (Sequential)</label>
            </div>

            {runAll && (
              <div style={{ marginBottom:0 }}>
                <label style={labelCls}>◈ فاصل زمني (ثواني)</label>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <input type="number" value={interval} onChange={e=>setInterval_(parseInt(e.target.value)||1)} min={1} max={60} style={{ ...inputCls, width:70 }} />
                  <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11.5, color:C.textMuted }}>ثواني بين كل كارت</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Progress */}
        {(running || progress > 0) && <ProgressBar value={progress} />}

        {/* Action buttons */}
        {cards.length > 0 && (
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={handleMakeDefault} disabled={running} style={{ flex:1, padding:'10px', borderRadius:7, fontWeight:700, fontSize:13, cursor:running?'not-allowed':'pointer', border:'none', background:running?'#222':`linear-gradient(135deg,${C.gold},${C.goldH})`, color:'#111', opacity:running?.65:1, display:'flex', alignItems:'center', justifyContent:'center', gap:7, boxShadow:`0 2px 14px ${C.goldGlow}` }}>
              {running ? <><Spin />يعمل...</> : '▶ MAKE DEFAULT'}
            </button>
            {running && (
              <button onClick={()=>{stopRef.current=true;}} style={{ padding:'10px 14px', borderRadius:7, fontWeight:700, fontSize:12, cursor:'pointer', border:`1px solid ${C.red}55`, background:'rgba(239,68,68,0.1)', color:C.red }}>⏹ STOP</button>
            )}
            <button onClick={handleReset} style={{ padding:'10px 14px', borderRadius:7, fontWeight:700, fontSize:12, cursor:'pointer', border:`1px solid ${C.border}`, background:C.panel, color:C.textSub }}>↺ Reset</button>
          </div>
        )}

        {/* Log box */}
        {logs.length > 0 && <LogBox lines={logs} />}
      </div>
    </div>
  );
}

CcFromBmModal.propTypes = { onClose: PropTypes.func.isRequired };
