import React, { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";

// ── Color palette (shared with BmCreatorModal / AddPrimaryModal) ────────────
const C = {
  bg:        '#0a0c10',
  card:      '#12151c',
  panel:     '#171c25',
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
  purple:    '#a855f7',
  purpleGlow:'rgba(168,85,247,0.18)',
  cyan:      '#22d3ee',
  green:     '#22c55e',
  red:       '#ef4444',
  warn:      '#f59e0b',
  text:      '#eef2f8',
  textSub:   '#c3cddd',
  textMuted: '#99a5ba',
};

const ADMIN_TASKS = [
  "MANAGE", "CREATE_CONTENT", "BASIC_CARDS", "MESSAGE",
  "EDIT_PROFILE", "ANALYZE", "MODERATE", "ADVERTISE",
  "CASHIER_ROLE", "VIEW_COST", "MANAGE_LEADS", "PUBLISH_CONTENT",
];

const POLL_INTERVAL_MS = 5000;

// invite / permissions / temp-email routers are all mounted under /meta
// in api-server's routes/index.ts.
const API = "/api/meta";

// ── Shared styles (mirror BmCreatorModal) ───────────────────────────────────
const inputCls   = { width:'100%', padding:'9px 12px', fontSize:12.5, borderRadius:8, fontFamily:"'Share Tech Mono',monospace", boxSizing:'border-box' };
const labelCls   = { fontSize:12.5, fontWeight:700, color:C.textSub, display:'block', marginBottom:5, fontFamily:"'Share Tech Mono',monospace", letterSpacing:'.06em' };
const panelCls   = { background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:'14px', height:'100%', display:'flex', flexDirection:'column', gap:10, boxShadow:'0 1px 2px rgba(0,0,0,0.45), 0 6px 18px -8px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)' };
const sectionTitle = { fontSize:12.5, fontWeight:800, textTransform:'uppercase', letterSpacing:'.08em', display:'flex', alignItems:'center', gap:7 };

async function postJson(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
}

async function getJson(url) {
  const r = await fetch(url);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
}

function SectionBar({ color }) {
  return <span style={{ display:'inline-block', width:3, height:11, background:color, borderRadius:2 }} />;
}
SectionBar.propTypes = { color: PropTypes.string };

function Spin() {
  return <span style={{ display:'inline-block', width:11, height:11, borderRadius:'50%', border:'2px solid currentColor', borderTopColor:'transparent', animation:'invSpin .7s linear infinite' }} />;
}

function StatusTag({ type = 'info', children }) {
  const clr = type === 'success' ? C.green : type === 'error' ? C.red : type === 'warn' ? C.warn : C.cyan;
  return (
    <div style={{ padding:'8px 10px', borderRadius:7, border:`1px solid ${clr}33`, background:`${clr}11`, fontSize:12.5, color:clr, fontFamily:"'Share Tech Mono',monospace", lineHeight:1.7, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
      {children}
    </div>
  );
}
StatusTag.propTypes = { type: PropTypes.string, children: PropTypes.node };

export default function InviterUserModal({ onClose }) {
  // Shared auth — both tools post the same cookies + businessId.
  // fb_dtsg / lsd are deliberately absent: the server pulls them fresh from
  // the session via extractFbTokens() on every request.
  const [cookies, setCookies]       = useState("");
  const [businessId, setBusinessId] = useState("");

  // Invite tool
  const [generatedEmail, setGeneratedEmail] = useState("");
  const [emailToken, setEmailToken]         = useState("");
  const [assetId, setAssetId]               = useState("");
  const [generating, setGenerating]         = useState(false);
  const [sending, setSending]               = useState(false);
  const [inviteResult, setInviteResult]     = useState(null);
  const [messages, setMessages]             = useState([]);
  const [polling, setPolling]               = useState(false);
  const [inviteLink, setInviteLink]         = useState("");
  const [inboxError, setInboxError]         = useState("");

  // Permissions tool
  const [userId, setUserId]           = useState("");
  const [granting, setGranting]       = useState(false);
  const [grantResult, setGrantResult] = useState(null);

  const pollRef = useRef(null);

  useEffect(() => () => clearInterval(pollRef.current), []);

  const authReady = cookies.trim() && businessId.trim();

  const handleGenerateEmail = async () => {
    setGenerating(true);
    setInviteResult(null);
    try {
      const data = await postJson(`${API}/temp-email/create`, {});
      setGeneratedEmail(data.email);
      setEmailToken(data.token);
      setMessages([]);
      setInviteLink("");
      setInboxError("");
    } catch (e) {
      setInviteResult({ success: false, message: e.message });
    } finally {
      setGenerating(false);
    }
  };

  const handleSendInvite = async () => {
    setSending(true);
    setInviteResult(null);
    try {
      const data = await postJson(`${API}/send-invite`, {
        cookies, businessId,
        email: generatedEmail,
        assetId: assetId.trim() || null,
      });
      setInviteResult(data);
    } catch (e) {
      setInviteResult({ success: false, message: e.message });
    } finally {
      setSending(false);
    }
  };

  const pollInbox = async () => {
    if (!emailToken) return;
    try {
      const msgData = await getJson(
        `${API}/temp-email/messages?token=${encodeURIComponent(emailToken)}`);
      const list = msgData.messages || [];
      setMessages(list);
      setInboxError("");

      if (list.length > 0) {
        const linkData = await getJson(
          `${API}/temp-email/invite-link?token=${encodeURIComponent(emailToken)}` +
          `&messageId=${encodeURIComponent(list[0].id)}`);
        if (linkData.found && linkData.link) {
          setInviteLink(linkData.link);
          stopPolling();
        }
      }
    } catch (e) {
      setInboxError(e.message);
    }
  };

  const stopPolling = () => {
    clearInterval(pollRef.current);
    pollRef.current = null;
    setPolling(false);
  };

  const togglePolling = () => {
    if (polling) { stopPolling(); return; }
    if (!emailToken) return;
    setPolling(true);
    pollInbox();
    pollRef.current = setInterval(pollInbox, POLL_INTERVAL_MS);
  };

  const handleGrantPermissions = async () => {
    setGranting(true);
    setGrantResult(null);
    try {
      const data = await postJson(`${API}/grant-permissions`, {
        cookies, businessId, userId: userId.trim(),
      });
      setGrantResult(data);
    } catch (e) {
      setGrantResult({ success: false, message: e.message });
    } finally {
      setGranting(false);
    }
  };

  const copy = (text) => { if (text) navigator.clipboard.writeText(text); };

  const ltrInput = { ...inputCls, direction: 'ltr', textAlign: 'left' };

  return (
    <div style={{ display:'flex', flex:1, minHeight:0, width:'100%', flexDirection:'column', background:C.bg, fontFamily:"'Tajawal','Segoe UI',sans-serif", fontSize:13 }} dir="rtl">
      <style>{`
        @keyframes invSpin { to { transform: rotate(360deg) } }
        .inv-cookie:focus { border-color: rgba(24,119,242,0.5) !important; }
      `}</style>

      {/* ── Header ── */}
      <header style={{ background:'linear-gradient(135deg,#131313 0%,#1a1a1a 50%,#141414 100%)', borderBottom:`1px solid ${C.border}`, padding:'12px 18px', height:76, boxSizing:'border-box', display:'flex', alignItems:'center', flexShrink:0, boxShadow:'0 1px 20px rgba(24,119,242,0.08)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <button onClick={onClose} style={{ background:C.input, border:`1px solid ${C.border}`, borderRadius:7, padding:'5px 12px', color:C.textSub, fontSize:12.5, cursor:'pointer', flexShrink:0 }}>→ رجوع</button>
            <img
              src="/inviter_user_to_bm.png"
              alt="Inviter User to BM"
              style={{ width:72, height:72, flexShrink:0, objectFit:'contain', borderRadius:12, margin:'-10px 0', filter:'drop-shadow(0 0 12px rgba(24,119,242,0.5))' }}
            />
            <div>
              <div style={{ fontSize:14, fontWeight:800, letterSpacing:'.3px', background:`linear-gradient(90deg,${C.blue},#60a5fa)`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
                INVITER USER TO BM
              </div>
              <div style={{ fontSize:11.5, color:C.textMuted }}>دعوة مستخدم للبيزنس + منح كل الصلاحيات</div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div style={{ flex:1, overflowY:'auto', padding:'14px 18px', display:'flex', flexDirection:'column', gap:12 }}>

        {/* ── Shared auth ── */}
        <div style={{ background:C.panel, border:`1px solid rgba(24,119,242,0.25)`, borderRadius:10, padding:'12px', display:'flex', flexDirection:'column', gap:10 }}>
          <div style={{ ...sectionTitle, color:C.blue }}><SectionBar color={C.blue} />◈ COOKIES — مشترك للأداتين</div>
          <textarea
            className="inv-cookie"
            value={cookies}
            onChange={e => setCookies(e.target.value)}
            rows={2}
            placeholder='c_user=123; xs=abc  ——أو——  [{"name":"c_user","value":"123"}]'
            style={{ ...ltrInput, resize:'none', display:'block', lineHeight:1.6 }}
          />
          <div>
            <label style={labelCls}>◈ BUSINESS ID</label>
            <input
              value={businessId}
              onChange={e => setBusinessId(e.target.value)}
              placeholder="1234567890"
              style={ltrInput}
            />
          </div>
          <div style={{ fontSize:11, color:C.textMuted, fontFamily:"'Share Tech Mono',monospace" }}>
            fb_dtsg و LSD يُستخرجان تلقائياً من الكوكيز في كل طلب.
          </div>
        </div>

        {/* ── Two tools side-by-side ── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(360px, 1fr))', gap:12, alignItems:'stretch' }}>

          {/* ── Invite tool ── */}
          <div style={panelCls}>
            <div style={{ ...sectionTitle, color:C.blue }}><SectionBar color={C.blue} />📧 دعوة مستخدم</div>
            <div style={{ padding:'6px 8px', background:'rgba(24,119,242,.07)', border:'1px solid rgba(24,119,242,.2)', borderRadius:7, fontSize:11, color:C.textMuted, fontFamily:"'Share Tech Mono',monospace" }}>
              يولّد إيميل مؤقت ويرسل دعوة عبر BizKitSettingsInvitePeopleModalMutation
            </div>

            <div>
              <label style={labelCls}>◈ الإيميل المؤقت</label>
              <div style={{ display:'flex', gap:6 }}>
                <input readOnly value={generatedEmail} placeholder="لم يُولَّد بعد"
                  style={{ ...ltrInput, flex:1, color:C.blue }} />
                <button onClick={() => copy(generatedEmail)} disabled={!generatedEmail}
                  style={{ padding:'8px 11px', borderRadius:7, cursor:generatedEmail?'pointer':'default', background:C.input, border:`1px solid ${C.border}`, color:C.textSub, opacity:generatedEmail?1:.5 }}>
                  📋
                </button>
                <button onClick={handleGenerateEmail} disabled={generating}
                  style={{ padding:'8px 14px', borderRadius:7, cursor:generating?'default':'pointer', background:`linear-gradient(135deg,${C.blue},#1251b5)`, border:'none', color:'#fff', fontWeight:800, fontSize:12.5, whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:5 }}>
                  {generating ? <Spin /> : 'توليد'}
                </button>
              </div>
            </div>

            <div>
              <label style={labelCls}>◈ ASSET ID (اختياري)</label>
              <input value={assetId} onChange={e => setAssetId(e.target.value)} placeholder="Page or Ad Account ID" style={ltrInput} />
            </div>

            <button
              onClick={handleSendInvite}
              disabled={sending || !generatedEmail || !authReady}
              style={{ padding:'10px', borderRadius:8, border:'none', cursor:(sending||!generatedEmail||!authReady)?'default':'pointer', background:(sending||!generatedEmail||!authReady)?C.input:`linear-gradient(135deg,${C.blue},#1251b5)`, color:'#fff', fontWeight:800, fontSize:13, opacity:(sending||!generatedEmail||!authReady)?.6:1, boxShadow:`0 2px 10px ${C.blueGlow}`, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              {sending ? <><Spin />جاري الإرسال...</> : '📨 إرسال الدعوة'}
            </button>

            {inviteResult && (
              <StatusTag type={inviteResult.success ? 'success' : 'error'}>{inviteResult.message}</StatusTag>
            )}

            {/* Inbox */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:12, fontWeight:700, color:C.textSub, fontFamily:"'Share Tech Mono',monospace" }}>◈ INBOX</span>
              <button onClick={togglePolling} disabled={!emailToken}
                style={{ padding:'4px 10px', borderRadius:6, fontSize:11, cursor:emailToken?'pointer':'default', background:C.input, border:`1px solid ${C.border}`, color:polling?C.green:C.textSub, opacity:emailToken?1:.5 }}>
                {polling ? '⏸ إيقاف' : '▶ فحص الوارد'}
              </button>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:150, overflowY:'auto' }}>
              {!emailToken ? (
                <div style={{ padding:12, textAlign:'center', fontSize:11, color:C.textMuted, border:`1px dashed ${C.border}`, borderRadius:8 }}>
                  ولّد إيميل مؤقت أولاً
                </div>
              ) : messages.length === 0 ? (
                <div style={{ padding:12, textAlign:'center', fontSize:11, color:C.textMuted, border:`1px dashed ${C.border}`, borderRadius:8 }}>
                  {polling ? 'جاري الاستماع للبريد…' : 'لا رسائل بعد'}
                </div>
              ) : messages.map(m => (
                <div key={m.id} style={{ padding:8, borderRadius:6, background:C.input, border:`1px solid ${C.border}`, fontSize:11 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
                    <span style={{ color:C.text, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.subject}</span>
                    <span style={{ color:C.textMuted, fontSize:10, flexShrink:0 }}>{m.createdAt ? new Date(m.createdAt).toLocaleTimeString() : ''}</span>
                  </div>
                  <div style={{ color:C.textMuted, fontSize:10 }}>{m.from}</div>
                </div>
              ))}
            </div>

            {inboxError && <StatusTag type="error">{inboxError}</StatusTag>}

            {inviteLink && (
              <div style={{ display:'flex', flexDirection:'column', gap:6, padding:10, borderRadius:8, border:`1px solid ${C.green}55`, background:`${C.green}11` }}>
                <span style={{ fontSize:11, fontWeight:700, color:C.green, fontFamily:"'Share Tech Mono',monospace" }}>✓ تم استخراج رابط الدعوة</span>
                <div style={{ display:'flex', gap:6 }}>
                  <input readOnly value={inviteLink} style={{ ...ltrInput, flex:1, fontSize:11, color:C.green }} />
                  <button onClick={() => copy(inviteLink)}
                    style={{ padding:'6px 10px', borderRadius:6, cursor:'pointer', background:C.input, border:`1px solid ${C.border}`, color:C.textSub }}>
                    📋
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Permissions tool ── */}
          <div style={panelCls}>
            <div style={{ ...sectionTitle, color:C.purple }}><SectionBar color={C.purple} />🔐 منح الصلاحيات</div>
            <div style={{ padding:'6px 8px', background:'rgba(168,85,247,.07)', border:'1px solid rgba(168,85,247,.2)', borderRadius:7, fontSize:11, color:C.textMuted, fontFamily:"'Share Tech Mono',monospace" }}>
              يمنح المستخدم كل صلاحيات الأدمن على البيزنس
            </div>

            <div>
              <label style={labelCls}>◈ USER ID المستهدف</label>
              <input value={userId} onChange={e => setUserId(e.target.value)} placeholder="1000..." style={ltrInput} />
            </div>

            <button
              onClick={handleGrantPermissions}
              disabled={granting || !userId.trim() || !authReady}
              style={{ padding:'10px', borderRadius:8, border:'none', cursor:(granting||!userId.trim()||!authReady)?'default':'pointer', background:(granting||!userId.trim()||!authReady)?C.input:`linear-gradient(135deg,${C.purple},#7c3aed)`, color:'#fff', fontWeight:800, fontSize:13, opacity:(granting||!userId.trim()||!authReady)?.6:1, boxShadow:`0 2px 10px ${C.purpleGlow}`, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              {granting ? <><Spin />جاري المنح...</> : '🔓 منح كل صلاحيات الأدمن'}
            </button>

            {grantResult && (
              <StatusTag type={grantResult.success ? 'success' : 'error'}>{grantResult.message}</StatusTag>
            )}

            <div>
              <span style={{ fontSize:12, fontWeight:700, color:C.textSub, display:'block', marginBottom:8, fontFamily:"'Share Tech Mono',monospace" }}>
                ◈ العمليات المشمولة
              </span>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                {ADMIN_TASKS.map(task => (
                  <div key={task} style={{ fontSize:10, fontFamily:"'Share Tech Mono',monospace", padding:'4px 8px', borderRadius:6, background:C.input, border:`1px solid ${C.border}`, color:C.textSub, direction:'ltr', textAlign:'left' }}>
                    ✓ {task}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {!authReady && (
          <StatusTag type="info">أدخل الكوكيز و Business ID بالأعلى لتفعيل الأداتين.</StatusTag>
        )}
      </div>
    </div>
  );
}

InviterUserModal.propTypes = {
  onClose: PropTypes.func.isRequired,
};
