import { useState, useRef } from 'react';
import PropTypes from 'prop-types';

// ── Color palette (same as CcFromBmModal) ──────────────────────────────────
const C = {
  bg:        '#0a0c10',
  card:      '#12151c',
  panel:     '#171c25',
  panel2:    '#141416',
  input:     '#232a38',
  border:    '#3d4757',
  borderHi:  '#525f73',
  gold:      '#f59e0b',
  goldH:     '#d97706',
  goldGlow:  'rgba(245,158,11,0.18)',
  orange:    '#ff6b1a',
  orangeGlow:'rgba(255,107,26,0.18)',
  blue:      '#1877f2',
  blueGlow:  'rgba(24,119,242,0.18)',
  cyan:      '#22d3ee',
  silver:    '#94a3b8',
  green:     '#22c55e',
  red:       '#ef4444',
  warn:      '#f59e0b',
  text:      '#eef2f8',
  textSub:   '#c3cddd',
  textMuted: '#99a5ba',
};

const BM_NAMES = [
  'Nexora Soluções Digitais','Vortex Mídia Online','Conecta Marketing Digital',
  'Impulso Publicidade','Pixel Criativo Studio','Radar Digital','Orbita Comunicações',
  'Zenith Soluções Web','Lumina Digital','Praxis Consultoria','Sigma Mídia Group',
  'Apex Marketing','Delta Comunicação','Nova Mídia Interativa','Prime Digital',
  'Vector Publicidade','Fusion Media','Catalyst Marketing','Horizon Digital',
  'Elevate Digital','Pulse Comunicações','CoreTech Marketing','Synergy Digital',
];

function pickBmName(i) { return BM_NAMES[(i - 1) % BM_NAMES.length] + ' ' + (Math.floor(Math.random() * 900) + 100); }
function randAdAccName() { return 'BM AD ACC ' + (Math.floor(Math.random() * 9000) + 1000); }

// ── Shared sub-components ──────────────────────────────────────────────────
function Spin() {
  return (
    <span style={{ display:'inline-block', width:11, height:11, borderRadius:'50%', border:'2px solid currentColor', borderTopColor:'transparent', animation:'bmSpin .7s linear infinite' }} />
  );
}

function ProgressBar({ value }) {
  return (
    <div style={{ background:'#111', borderRadius:4, height:5, overflow:'hidden', margin:'6px 0' }}>
      <div style={{ width:`${value}%`, height:'100%', background:`linear-gradient(90deg,${C.gold},${C.goldH})`, borderRadius:4, transition:'width .4s ease' }} />
    </div>
  );
}
ProgressBar.propTypes = { value: PropTypes.number };

function StatusTag({ type = 'info', children }) {
  const clr = type === 'success' ? C.green : type === 'error' ? C.red : type === 'warn' ? C.warn : C.cyan;
  return (
    <div style={{ padding:'6px 10px', borderRadius:7, border:`1px solid ${clr}33`, background:`${clr}11`, fontSize:12.5, color:clr, fontFamily:"'Share Tech Mono',monospace", lineHeight:1.6, whiteSpace:'pre-wrap', wordBreak:'break-all' }}>
      {children}
    </div>
  );
}
StatusTag.propTypes = { type: PropTypes.string, children: PropTypes.node };

function SectionBar() { return <span style={{ display:'inline-block', width:3, height:11, background:C.gold, borderRadius:2 }} />; }

const sectionTitle = { fontSize:12.5, fontWeight:800, color:C.text, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10, display:'flex', alignItems:'center', gap:7 };
const inputCls = { width:'100%', padding:'9px 12px', fontSize:12.5, borderRadius:8, fontFamily:"'Share Tech Mono',monospace", boxSizing:'border-box' };
const selectCls = { ...inputCls };
const labelCls = { fontSize:12.5, fontWeight:700, color:C.textSub, display:'block', marginBottom:5, fontFamily:"'Share Tech Mono',monospace", letterSpacing:'.06em' };
const panelCls = { background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:'14px', display:'flex', flexDirection:'column', gap:10, boxShadow:'0 1px 2px rgba(0,0,0,0.45), 0 6px 18px -8px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)' };

// ── Sub-tool: CREATE BM ────────────────────────────────────────────────────
function CreateBmTool({ cookies }) {
  const [count, setCount]       = useState(5);
  const [timezone, setTimezone] = useState('1');
  const [running, setRunning]   = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult]     = useState(null);
  const [logs, setLogs]         = useState([]);
  const stopRef                 = useRef(false);

  function addLog(msg, type = 'info') {
    const time = new Date().toLocaleTimeString('en', { hour12: false });
    setLogs(p => [...p, { msg, type, time }]);
  }

  async function handleRun() {
    if (!cookies.trim()) return setResult({ type:'error', msg:'أدخل الكوكيز أولاً في الحقل المشترك ↑' });
    const n = Math.min(parseInt(count) || 5, 5);
    stopRef.current = false;
    setRunning(true); setProgress(0); setLogs([]); setResult({ type:'info', msg:`⟳ إنشاء ${n} BMs...` });
    let ok = 0; const results = [];

    for (let i = 1; i <= n; i++) {
      if (stopRef.current) { addLog('⏹ تم الإيقاف', 'warn'); break; }
      const name = pickBmName(i);
      addLog(`⟳ [${i}/${n}] ${name}...`);
      try {
        const r = await fetch('/api/bm-creator/create-bm', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cookies, timezone_id: timezone, name }),
        }).then(x => x.json());
        if (r.ok) {
          ok++;
          results.push(`✓ ${name} → ID: ${r.bm_id}`);
          addLog(`✓ ${name} → ${r.bm_id}`, 'success');
        } else {
          results.push(`✗ ${name} → ${r.reason || 'Error'}`);
          addLog(`✗ ${r.reason || 'Error'}`, 'error');
        }
      } catch (e) {
        results.push(`✗ ${e.message}`);
        addLog(`✗ ${e.message}`, 'error');
      }
      setProgress((i / n) * 100);
      if (i < n && !stopRef.current) await new Promise(r => setTimeout(r, 1200));
    }

    setRunning(false);
    setResult({ type: ok === n ? 'success' : ok > 0 ? 'warn' : 'error', msg: `${ok}/${n} BMs Created\n\n${results.join('\n')}` });
  }

  return (
    <div style={panelCls}>
      <div style={{ ...sectionTitle, color:C.orange }}><SectionBar />🏗️ CREATE BM</div>
      <div style={{ padding:'6px 8px', background:`rgba(255,107,26,.06)`, border:`1px solid rgba(255,107,26,.2)`, borderRadius:7, fontSize:11, color:C.textMuted, fontFamily:"'Share Tech Mono',monospace" }}>
        ينشئ BMs بأسماء عشوائية مقبولة على فيسبوك
      </div>

      <div>
        <label style={labelCls}>◈ عدد الـ BM (max 5)</label>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          <input type="number" min={1} max={5} value={count} onChange={e => setCount(e.target.value)} style={{ ...inputCls, width:60 }} disabled={running} />
          <span style={{ fontSize:11, color:C.textMuted, fontFamily:"'Share Tech Mono',monospace" }}>max 5</span>
        </div>
      </div>

      <div>
        <label style={labelCls}>◈ Timezone</label>
        <select value={timezone} onChange={e => setTimezone(e.target.value)} style={selectCls} disabled={running}>
          <option value="17">UTC+00</option>
          <option value="1">America/LA</option>
          <option value="6">America/New York</option>
          <option value="56">Africa/Cairo</option>
          <option value="39">America/Sao Paulo</option>
        </select>
      </div>

      {(running || progress > 0) && <ProgressBar value={progress} />}
      {result && <StatusTag type={result.type}>{result.msg}</StatusTag>}

      <div style={{ display:'flex', gap:6 }}>
        <button onClick={handleRun} disabled={running}
          style={{ flex:1, padding:'8px', borderRadius:7, fontWeight:700, fontSize:12.5, cursor:running?'not-allowed':'pointer', border:'none', background:`linear-gradient(135deg,${C.orange},${C.goldH})`, color:'#fff', opacity:running?.65:1, display:'flex', alignItems:'center', justifyContent:'center', gap:5, boxShadow:`0 2px 10px ${C.orangeGlow}` }}>
          {running ? <><Spin />يعمل...</> : '🏗️ CREATE BMs'}
        </button>
        {running && (
          <button onClick={() => { stopRef.current = true; }}
            style={{ padding:'8px 12px', borderRadius:7, fontWeight:700, fontSize:12.5, cursor:'pointer', border:`1px solid ${C.red}55`, background:'rgba(239,68,68,0.1)', color:C.red }}>⏹</button>
        )}
      </div>

      {/* Log */}
      {logs.length > 0 && (
        <div style={{ background:'#08090c', border:`1px solid ${C.border}`, borderRadius:7, padding:'6px 8px', maxHeight:100, overflowY:'auto', fontFamily:"'Share Tech Mono',monospace", fontSize:11, lineHeight:1.7 }}>
          {logs.slice(-40).reverse().map((l, i) => (
            <div key={i} style={{ color: l.type==='success'?C.green:l.type==='error'?C.red:l.type==='warn'?C.warn:C.cyan, borderBottom:`1px solid rgba(255,255,255,.03)` }}>
              [{l.time}] {l.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
CreateBmTool.propTypes = { cookies: PropTypes.string };

// ── Sub-tool: CREATE AD ACC ────────────────────────────────────────────────
function CreateAdAccTool({ cookies }) {
  const [count, setCount]     = useState(5);
  const [currency, setCurrency] = useState('USD');
  const [bmId, setBmId]       = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult]   = useState(null);
  const [logs, setLogs]       = useState([]);
  const stopRef               = useRef(false);

  function addLog(msg, type = 'info') {
    const time = new Date().toLocaleTimeString('en', { hour12: false });
    setLogs(p => [...p, { msg, type, time }]);
  }

  async function handleRun() {
    if (!cookies.trim()) return setResult({ type:'error', msg:'أدخل الكوكيز أولاً في الحقل المشترك ↑' });
    const n = Math.min(parseInt(count) || 5, 10);
    stopRef.current = false;
    setRunning(true); setProgress(0); setLogs([]); setResult({ type:'info', msg:`⟳ إنشاء ${n} Ad Accounts...` });
    let ok = 0; const results = [];

    for (let i = 1; i <= n; i++) {
      if (stopRef.current) { addLog('⏹ تم الإيقاف', 'warn'); break; }
      const name = randAdAccName();
      addLog(`⟳ [${i}/${n}] ${name}...`);
      try {
        const r = await fetch('/api/bm-creator/create-ad-acc', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cookies, bm_id: bmId.trim() || undefined, currency, name }),
        }).then(x => x.json());
        if (r.ok) {
          ok++;
          results.push(`✓ ${name} → act_${r.acc_id}`);
          addLog(`✓ act_${r.acc_id}`, 'success');
        } else {
          results.push(`✗ ${name} → ${r.reason || 'Error'}`);
          addLog(`✗ ${r.reason || 'Error'}`, 'error');
        }
      } catch (e) {
        results.push(`✗ ${e.message}`);
        addLog(`✗ ${e.message}`, 'error');
      }
      setProgress((i / n) * 100);
      if (i < n && !stopRef.current) await new Promise(r => setTimeout(r, 2000));
    }

    setRunning(false);
    setResult({ type: ok === n ? 'success' : ok > 0 ? 'warn' : 'error', msg: `${ok}/${n} Accounts Created\n\n${results.join('\n')}` });
  }

  return (
    <div style={panelCls}>
      <div style={{ ...sectionTitle, color:C.blue }}><SectionBar />📊 CREATE AD ACC</div>
      <div style={{ padding:'6px 8px', background:`rgba(24,119,242,.07)`, border:`1px solid rgba(24,119,242,.2)`, borderRadius:7, fontSize:11, color:C.textMuted, fontFamily:"'Share Tech Mono',monospace" }}>
        ينشئ Ad Accounts عبر BizKitSettingsCreateAdAccountMutation
      </div>

      <div>
        <label style={labelCls}>◈ عدد الحسابات (max 10)</label>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          <input type="number" min={1} max={10} value={count} onChange={e => setCount(e.target.value)} style={{ ...inputCls, width:60 }} disabled={running} />
          <span style={{ fontSize:11, color:C.textMuted, fontFamily:"'Share Tech Mono',monospace" }}>max 10</span>
        </div>
      </div>

      <div style={{ display:'flex', gap:6 }}>
        <div style={{ flex:1 }}>
          <label style={labelCls}>◈ Currency</label>
          <select value={currency} onChange={e => setCurrency(e.target.value)} style={selectCls} disabled={running}>
            <option value="USD">USD</option>
            <option value="BRL">BRL</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="EGP">EGP</option>
          </select>
        </div>
        <div style={{ flex:1 }}>
          <label style={labelCls}>◈ BM ID (يدوي)</label>
          <input value={bmId} onChange={e => setBmId(e.target.value)} placeholder="auto" style={inputCls} disabled={running} />
        </div>
      </div>

      {(running || progress > 0) && <ProgressBar value={progress} />}
      {result && <StatusTag type={result.type}>{result.msg}</StatusTag>}

      <div style={{ display:'flex', gap:6 }}>
        <button onClick={handleRun} disabled={running}
          style={{ flex:1, padding:'8px', borderRadius:7, fontWeight:700, fontSize:12.5, cursor:running?'not-allowed':'pointer', border:'none', background:`linear-gradient(135deg,${C.blue},#1251b5)`, color:'#fff', opacity:running?.65:1, display:'flex', alignItems:'center', justifyContent:'center', gap:5, boxShadow:`0 2px 10px ${C.blueGlow}` }}>
          {running ? <><Spin />يعمل...</> : '📊 CREATE'}
        </button>
        {running && (
          <button onClick={() => { stopRef.current = true; }}
            style={{ padding:'8px 12px', borderRadius:7, fontWeight:700, fontSize:12.5, cursor:'pointer', border:`1px solid ${C.red}55`, background:'rgba(239,68,68,0.1)', color:C.red }}>⏹</button>
        )}
      </div>

      {logs.length > 0 && (
        <div style={{ background:'#08090c', border:`1px solid ${C.border}`, borderRadius:7, padding:'6px 8px', maxHeight:100, overflowY:'auto', fontFamily:"'Share Tech Mono',monospace", fontSize:11, lineHeight:1.7 }}>
          {logs.slice(-40).reverse().map((l, i) => (
            <div key={i} style={{ color: l.type==='success'?C.green:l.type==='error'?C.red:l.type==='warn'?C.warn:C.cyan, borderBottom:`1px solid rgba(255,255,255,.03)` }}>
              [{l.time}] {l.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
CreateAdAccTool.propTypes = { cookies: PropTypes.string };

// ── Sub-tool: ADD INFO BM (inline panel, toggled) ─────────────────────────
function AddInfoPanel({ cookies, onClose }) {
  const [bmId, setBmId]       = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult]   = useState(null);
  const [logs, setLogs]       = useState([]);

  function addLog(msg, type = 'info') {
    const time = new Date().toLocaleTimeString('en', { hour12: false });
    setLogs(p => [...p, { msg, type, time }]);
  }

  async function handleRun() {
    if (!cookies.trim()) return setResult({ type:'error', msg:'أدخل الكوكيز أولاً في الحقل المشترك ↑' });
    if (!bmId.trim()) return setResult({ type:'error', msg:'أدخل Business ID' });
    setRunning(true); setProgress(0); setLogs([]);
    setResult({ type:'info', msg:'⟳ Step 1/2: Uploading picture...' });
    addLog('⟳ Uploading profile picture...');
    try {
      const r1 = await fetch('/api/bm-creator/upload-picture', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies, bm_id: bmId.trim() }),
      }).then(x => x.json());
      setProgress(50);
      if (r1.ok) addLog('✓ Picture uploaded', 'success');
      else addLog(`⚠ Picture: ${r1.reason || 'Server rejected'}`, 'warn');

      setResult({ type:'info', msg:'⟳ Step 2/2: Updating business details...' });
      addLog('⟳ Updating business data...');

      const r2 = await fetch('/api/bm-creator/update-info', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies, bm_id: bmId.trim() }),
      }).then(x => x.json());
      setProgress(100);

      if (r2.ok) {
        addLog('✓ Business details updated', 'success');
        setResult({ type:'success', msg:'✓ تم!\n✓ صورة البيزنس\n✓ البيانات والضرائب' });
      } else {
        addLog(`✗ ${r2.reason || 'Error'}`, 'error');
        setResult({ type:'error', msg:`✗ فشل: ${r2.reason || 'Error'}` });
      }
    } catch (e) {
      setProgress(100);
      addLog(`✗ ${e.message}`, 'error');
      setResult({ type:'error', msg:`✗ ${e.message}` });
    }
    setRunning(false);
  }

  return (
    <div style={{ ...panelCls, border:`1px solid rgba(245,158,11,0.35)`, background:'rgba(245,158,11,0.04)', position:'relative' }}>
      {/* Close button */}
      <button onClick={onClose} style={{ position:'absolute', top:8, left:8, background:'transparent', border:'none', color:C.textMuted, cursor:'pointer', fontSize:13, lineHeight:1 }}>✕</button>

      <div style={{ ...sectionTitle, color:C.gold, justifyContent:'center' }}><SectionBar />⚡ ADD INFO BM</div>

      <div style={{ padding:'8px 10px', background:'rgba(0,0,0,.3)', border:`1px solid ${C.border}`, borderRadius:7, fontFamily:"'Share Tech Mono',monospace", fontSize:11, lineHeight:1.9, color:C.text }}>
        🏢 <span style={{ color:C.cyan }}>Name:</span> CONSELHO ESCOLAR VICE<br />
        📍 <span style={{ color:C.cyan }}>City:</span> Guarani, Goiás, BR<br />
        🪪 <span style={{ color:C.cyan }}>Tax ID:</span> 00658805000127<br />
        🖼️ <span style={{ color:C.cyan }}>Photo:</span> Business profile image
      </div>

      <div>
        <label style={labelCls}>◈ Business ID</label>
        <input value={bmId} onChange={e => setBmId(e.target.value)} placeholder="يُكتشف تلقائياً" style={inputCls} disabled={running} />
      </div>

      {(running || progress > 0) && <ProgressBar value={progress} />}
      {result && <StatusTag type={result.type}>{result.msg}</StatusTag>}

      <button onClick={handleRun} disabled={running}
        style={{ width:'100%', padding:'9px', borderRadius:7, fontWeight:700, fontSize:12, cursor:running?'not-allowed':'pointer', border:'none', background:`linear-gradient(135deg,${C.gold},${C.goldH})`, color:'#111', opacity:running?.65:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, boxShadow:`0 2px 14px ${C.goldGlow}` }}>
        {running ? <><Spin />يعمل...</> : '⚡ UPDATE BM INFO'}
      </button>

      {logs.length > 0 && (
        <div style={{ background:'#08090c', border:`1px solid ${C.border}`, borderRadius:7, padding:'6px 8px', maxHeight:90, overflowY:'auto', fontFamily:"'Share Tech Mono',monospace", fontSize:11, lineHeight:1.7 }}>
          {logs.slice(-30).reverse().map((l, i) => (
            <div key={i} style={{ color: l.type==='success'?C.green:l.type==='error'?C.red:l.type==='warn'?C.warn:C.cyan }}>
              [{l.time}] {l.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
AddInfoPanel.propTypes = { cookies: PropTypes.string, onClose: PropTypes.func };

// ── Main modal ─────────────────────────────────────────────────────────────
export default function BmCreatorModal({ onClose }) {
  const [cookies, setCookies]         = useState('');
  const [showAddInfo, setShowAddInfo] = useState(false);

  return (
    <div style={{ display:'flex', flex:1, minHeight:0, width:'100%', flexDirection:'column', background:C.bg, fontFamily:"'Tajawal','Segoe UI',sans-serif", fontSize:13 }} dir="rtl">
      <style>{`
        @keyframes bmSpin { to { transform: rotate(360deg) } }
        @keyframes bmPulse { 0%,100% { opacity:1 } 50% { opacity:.35 } }
        .bmc-cookie:focus { border-color: rgba(245,158,11,0.5) !important; }
      `}</style>

      {/* ── Header ── */}
      <header style={{ background:`linear-gradient(135deg,#131313 0%,#1a1a1a 50%,#141414 100%)`, borderBottom:`1px solid ${C.border}`, padding:'12px 18px', flexShrink:0, boxShadow:`0 1px 20px rgba(245,158,11,0.08)` }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <button onClick={onClose} style={{ background:C.input, border:`1px solid ${C.border}`, borderRadius:7, padding:'5px 12px', color:C.textSub, fontSize:12.5, cursor:'pointer' }}>→ رجوع</button>
            <img
              src="/meta_cards_from_bm.png"
              alt="Create BM & Ad Acc"
              style={{ width:52, height:52, objectFit:'contain', borderRadius:10, filter:'drop-shadow(0 0 10px rgba(245,158,11,0.45))' }}
            />
            <div>
              <div style={{ fontSize:14, fontWeight:800, letterSpacing:'.3px', background:`linear-gradient(90deg,${C.gold},#fcd34d)`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
                CREATE BM & AD ACC & INFO
              </div>
              <div style={{ fontSize:11.5, color:C.textMuted }}>إنشاء BM + حسابات إعلانية + بيانات البيزنس</div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div style={{ flex:1, overflowY:'auto', padding:'14px 18px', display:'flex', flexDirection:'column', gap:12 }}>

        {/* ── Shared cookies field ── */}
        <div style={{ background:C.panel, border:`1px solid rgba(245,158,11,0.25)`, borderRadius:10, padding:'12px' }}>
          <div style={{ ...sectionTitle, color:C.gold, marginBottom:6 }}><SectionBar />◈ COOKIES — مشترك للأدوات الثلاثة</div>
          <textarea
            className="bmc-cookie"
            value={cookies}
            onChange={e => setCookies(e.target.value)}
            rows={2}
            placeholder='c_user=123; xs=abc  ——أو——  [{"name":"c_user","value":"123"}]'
            style={{ ...inputCls, resize:'none', display:'block', lineHeight:1.6 }}
          />
        </div>

        {/* ── Two tools side-by-side ── */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <CreateBmTool cookies={cookies} />
          <CreateAdAccTool cookies={cookies} />
        </div>

        {/* ── ADD INFO — centered button / panel ── */}
        {!showAddInfo ? (
          <div style={{ display:'flex', justifyContent:'center' }}>
            <button
              onClick={() => setShowAddInfo(true)}
              style={{
                padding:'10px 32px', borderRadius:10, fontWeight:700, fontSize:12, cursor:'pointer',
                border:`1px solid rgba(245,158,11,0.4)`,
                background:`linear-gradient(135deg,rgba(245,158,11,0.12),rgba(245,158,11,0.06))`,
                color:C.gold,
                display:'flex', alignItems:'center', gap:8,
                boxShadow:`0 0 18px rgba(245,158,11,0.12)`,
                transition:'all .2s',
              }}
            >
              ⚡ ADD INFO BM
              <span style={{ fontSize:11.5, color:C.textMuted, fontFamily:"'Share Tech Mono',monospace" }}>يحدث بيانات البيزنس</span>
            </button>
          </div>
        ) : (
          <div style={{ maxWidth:480, margin:'0 auto', width:'100%' }}>
            <AddInfoPanel cookies={cookies} onClose={() => setShowAddInfo(false)} />
          </div>
        )}

      </div>
    </div>
  );
}

BmCreatorModal.propTypes = { onClose: PropTypes.func.isRequired };
