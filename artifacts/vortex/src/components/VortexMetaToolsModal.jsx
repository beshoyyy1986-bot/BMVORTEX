import { useState } from 'react';
import PropTypes from 'prop-types';

const C = {
  bg:       '#0a0c10',
  panel:    '#12151c',
  panel2:   '#17171a',
  border:   '#3d4757',
  gold:     '#f59e0b',
  goldH:    '#d97706',
  goldGlow: 'rgba(245,158,11,0.2)',
  green:    '#22c55e',
  greenGlow:'rgba(34,197,94,0.15)',
  text:     '#eef2f8',
  textSub:  '#c3cddd',
  textMuted:'#99a5ba',
  cyan:     '#22d3ee',
  blue:     '#3b82f6',
  orange:   '#f97316',
  red:      '#ef4444',
};

// ── Sub-tool card wrapper ───────────────────────────────────────────────────
function ToolCard({ emoji, title, badge, children, comingSoon }) {
  return (
    <div style={{
      background: C.panel,
      border: `1px solid ${comingSoon ? C.border : 'rgba(245,158,11,0.45)'}`,
      borderRadius: 14,
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      // Coming-soon cards stay recessive, but 0.6 opacity dropped their text
      // below readable contrast; 0.75 plus the overlay still reads as
      // "unavailable" without making the label guesswork.
      opacity: comingSoon ? 0.75 : 1,
      position: 'relative',
      overflow: 'hidden',
      boxShadow: '0 1px 2px rgba(0,0,0,0.45), 0 8px 22px -10px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.05)',
    }}>
      {comingSoon && (
        <div style={{
          position:'absolute', top:0, left:0, right:0, bottom:0,
          display:'flex', alignItems:'center', justifyContent:'center',
          background:'rgba(9,9,11,0.55)', backdropFilter:'blur(2px)',
          borderRadius:14, zIndex:10,
        }}>
          <div style={{
            padding:'6px 18px', borderRadius:20,
            background:'rgba(245,158,11,0.12)', border:`1px solid rgba(245,158,11,0.35)`,
            color:C.gold, fontSize:12.5, fontWeight:700, letterSpacing:'0.12em',
            fontFamily:"'Share Tech Mono',monospace",
          }}>⏳ COMING SOON</div>
        </div>
      )}
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ fontSize:20 }}>{emoji}</span>
        <div>
          <div style={{ fontSize:12, fontWeight:800, color:C.text, letterSpacing:'0.04em' }}>{title}</div>
          {badge && (
            <span style={{
              fontSize:11, fontWeight:700, letterSpacing:'0.1em',
              background:'rgba(34,197,94,0.15)', border:'1px solid rgba(34,197,94,0.3)',
              color:C.green, borderRadius:20, padding:'1px 8px', display:'inline-block', marginTop:2,
            }}>{badge}</span>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
ToolCard.propTypes = { emoji:PropTypes.string, title:PropTypes.string, badge:PropTypes.string, children:PropTypes.node, comingSoon:PropTypes.bool };

// ── Extension install tool ─────────────────────────────────────────────────
function ExtensionInstaller() {
  const [step, setStep] = useState(0);

  const steps = [
    { num:'01', title:'حمّل الإضافة', desc:'اضغط زر التحميل أدناه للحصول على ملف ZIP الخاص بالإضافة' },
    { num:'02', title:'افتح المتصفح', desc:'اذهب إلى chrome://extensions في شريط العنوان واضغط Enter' },
    { num:'03', title:'فعّل وضع المطور', desc:'شغّل مفتاح "Developer mode" في أعلى اليمين' },
    { num:'04', title:'حمّل الإضافة', desc:'اضغط "Load unpacked" واختر المجلد الذي استخرجته من الـ ZIP' },
    { num:'05', title:'جاهز!', desc:'ستظهر أيقونة VORTEX ⚡ في شريط أدوات المتصفح' },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {/* Description */}
      <div style={{ padding:'10px 12px', background:'rgba(34,197,94,0.07)', border:'1px solid rgba(34,197,94,0.2)', borderRadius:10, fontSize:12.5, color:C.textSub, lineHeight:1.8, fontFamily:"'Tajawal',sans-serif" }} dir="rtl">
        <div style={{ color:C.green, fontWeight:700, marginBottom:4, fontSize:12 }}>🔌 ما هي إضافة VORTEX؟</div>
        إضافة متصفح متخصصة لـ Facebook Business Manager — تستخرج بيانات الجلسة (Cookies، DTSGToken، User ID، Business ID) وتعرضها بصيغ متعددة: نص، JSON، وGraphQL. تُستخدم مع أدوات Vortex للعمليات الآلية على حسابات الإعلانات.
      </div>

      {/* Features */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
        {[
          { icon:'🍪', label:'استخراج الكوكيز' },
          { icon:'🔑', label:'DTSGToken' },
          { icon:'👤', label:'User & Business ID' },
          { icon:'📊', label:'GraphQL Fields' },
        ].map(f => (
          <div key={f.label} style={{ padding:'6px 10px', background:'rgba(255,255,255,0.04)', border:`1px solid ${C.border}`, borderRadius:8, fontSize:11.5, color:C.textSub, display:'flex', alignItems:'center', gap:6 }}>
            <span>{f.icon}</span><span>{f.label}</span>
          </div>
        ))}
      </div>

      {/* Steps */}
      <div style={{ fontSize:12.5, color:C.textMuted, fontWeight:700, letterSpacing:'0.06em', marginBottom:2, fontFamily:"'Share Tech Mono',monospace" }}>◈ خطوات التثبيت</div>
      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        {steps.map((s, i) => (
          <div key={i} onClick={() => setStep(i)}
            style={{
              display:'flex', gap:10, alignItems:'flex-start', cursor:'pointer',
              padding:'8px 10px', borderRadius:8, transition:'all .15s',
              background: step === i ? 'rgba(245,158,11,0.08)' : 'transparent',
              border: `1px solid ${step === i ? 'rgba(245,158,11,0.3)' : 'transparent'}`,
            }}>
            <span style={{
              flexShrink:0, width:22, height:22, borderRadius:'50%',
              background: step === i ? C.gold : 'rgba(255,255,255,0.07)',
              color: step === i ? '#111' : C.textMuted,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:11, fontWeight:800, fontFamily:"'Share Tech Mono',monospace",
            }}>{s.num}</span>
            <div>
              <div style={{ fontSize:12.5, fontWeight:700, color: step === i ? C.gold : C.text }}>{s.title}</div>
              <div style={{ fontSize:11.5, color:C.textMuted, lineHeight:1.6, marginTop:1 }} dir="rtl">{s.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Download button */}
      <a
        href="/vortex-extension.zip"
        download="vortex-extension.zip"
        style={{
          display:'flex', alignItems:'center', justifyContent:'center', gap:8,
          padding:'11px', borderRadius:10, fontWeight:800, fontSize:13, textDecoration:'none',
          background:`linear-gradient(135deg,${C.gold},${C.goldH})`,
          color:'#111', boxShadow:`0 2px 18px ${C.goldGlow}`,
          transition:'all .2s',
        }}
      >
        ⬇️ تحميل الإضافة (ZIP)
      </a>

      <div style={{ fontSize:11.5, color:C.textMuted, textAlign:'center', fontFamily:"'Share Tech Mono',monospace" }}>
        Chrome · Edge · Brave · Opera — Chromium based browsers
      </div>
    </div>
  );
}

// ── Coming-soon placeholder tools ──────────────────────────────────────────
const COMING_TOOLS = [
  { emoji:'🔍', title:'Account Inspector',   desc:'فحص وتحليل حسابات فيسبوك والبيزنس بالتفصيل' },
  { emoji:'📊', title:'BM Analyzer',         desc:'تحليل شامل لإحصائيات البيزنس مانجر' },
  { emoji:'🎯', title:'Pixel Manager',        desc:'إدارة وتتبع بكسلات الإعلانات بسهولة' },
  { emoji:'🔄', title:'Auto Campaign',        desc:'إنشاء وجدولة الحملات الإعلانية تلقائياً' },
  { emoji:'🛡️', title:'Account Guard',       desc:'حماية ومراقبة الحسابات من الإيقاف' },
  { emoji:'📈', title:'Ads Reporter',         desc:'تقارير تفصيلية لأداء الإعلانات' },
  { emoji:'💼', title:'BM Bulk Actions',      desc:'عمليات جماعية على حسابات البيزنس' },
];

// ── Main modal ─────────────────────────────────────────────────────────────
export default function VortexMetaToolsModal({ onClose }) {
  const [selected, setSelected] = useState(0);

  const tools = [
    { emoji:'🔌', title:'Browser Extension', badge:'مجانى الآن', key:'ext' },
    ...COMING_TOOLS.map((t, i) => ({ ...t, key:`tool_${i}` })),
  ];

  return (
    <div style={{ display:'flex', height:'100%', width:'100%', flexDirection:'column', background:C.bg, fontFamily:"'Tajawal','Segoe UI',sans-serif" }}>
      <style>{`@keyframes freeGlow{0%,100%{box-shadow:0 0 10px rgba(34,197,94,0.4)}50%{box-shadow:0 0 22px rgba(34,197,94,0.7)}}`}</style>

      {/* Header */}
      <header style={{ background:'linear-gradient(135deg,#0d0d0f 0%,#161618 50%,#0d0d0f 100%)', borderBottom:`1px solid ${C.border}`, padding:'12px 20px', flexShrink:0, boxShadow:'0 1px 20px rgba(245,158,11,0.07)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <button onClick={onClose} style={{ background:'rgba(255,255,255,0.05)', border:`1px solid ${C.border}`, borderRadius:8, padding:'5px 12px', color:C.textSub, fontSize:12.5, cursor:'pointer' }}>→ رجوع</button>
            <img src="/vortex_meta_tools.png" alt="Vortex Meta Tools" style={{ width:56, height:44, objectFit:'contain', filter:'drop-shadow(0 0 10px rgba(245,158,11,0.5))' }} />
            <div>
              <div style={{ fontSize:15, fontWeight:800, letterSpacing:'.3px', background:'linear-gradient(90deg,#f59e0b,#fcd34d)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
                VORTEX META TOOLS
              </div>
              <div style={{ fontSize:11.5, color:C.textMuted }}>مجموعة أدوات Meta المتكاملة — مجانى مؤقتاً</div>
            </div>
          </div>
          {/* FREE badge */}
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
            <div style={{
              padding:'4px 14px', borderRadius:20, fontSize:12.5, fontWeight:800,
              background:'rgba(34,197,94,0.15)', border:'1px solid rgba(34,197,94,0.4)',
              color:C.green, letterSpacing:'0.1em', animation:'freeGlow 2s infinite',
            }}>✅ مجانى مؤقتاً</div>
            <div style={{ fontSize:11, color:C.textMuted, fontFamily:"'Share Tech Mono',monospace" }}>FREE · TEMP</div>
          </div>
        </div>
      </header>

      {/* Body — two-column: tool list + detail */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'grid', gridTemplateColumns:'220px 1fr', gap:14 }}>

        {/* Left: tool list */}
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <div style={{ fontSize:11, color:C.textMuted, fontFamily:"'Share Tech Mono',monospace", letterSpacing:'0.08em', marginBottom:4 }}>◈ 8 TOOLS</div>
          {tools.map((tool, i) => (
            <button key={tool.key} onClick={() => setSelected(i)}
              style={{
                display:'flex', alignItems:'center', gap:8, padding:'9px 11px',
                borderRadius:10, border:`1px solid ${selected === i ? 'rgba(245,158,11,0.45)' : C.border}`,
                background: selected === i ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.03)',
                cursor:'pointer', textAlign:'left', transition:'all .15s', width:'100%',
              }}>
              <span style={{ fontSize:16, flexShrink:0 }}>{tool.emoji}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12.5, fontWeight:700, color: selected===i ? C.gold : C.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{tool.title}</div>
                {tool.badge ? (
                  <span style={{ fontSize:11, color:C.green, fontFamily:"'Share Tech Mono',monospace" }}>● {tool.badge}</span>
                ) : (
                  <span style={{ fontSize:11, color:C.textMuted, fontFamily:"'Share Tech Mono',monospace" }}>⏳ قريباً</span>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Right: tool detail */}
        <div>
          {selected === 0 ? (
            <ToolCard emoji="🔌" title="Browser Extension" badge="مجانى الآن">
              <ExtensionInstaller />
            </ToolCard>
          ) : (
            <ToolCard
              emoji={tools[selected].emoji}
              title={tools[selected].title}
              comingSoon
            >
              <div style={{ fontSize:12, color:C.textSub, lineHeight:1.8, padding:'4px 0' }} dir="rtl">
                {tools[selected].desc}
              </div>
              <div style={{ padding:'10px 12px', background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:8, textAlign:'center' }}>
                <div style={{ fontSize:12.5, color:C.gold, fontWeight:700 }}>🚧 قيد التطوير</div>
                <div style={{ fontSize:11.5, color:C.textMuted, marginTop:4 }}>سيتم إضافة هذه الأداة قريباً ضمن مجموعة Vortex Meta Tools</div>
              </div>
            </ToolCard>
          )}
        </div>

      </div>
    </div>
  );
}

VortexMetaToolsModal.propTypes = { onClose: PropTypes.func.isRequired };
