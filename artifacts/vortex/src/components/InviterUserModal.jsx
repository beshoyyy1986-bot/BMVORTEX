import React, { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import CookieInput from "./CookieInput";

const C = {
  panel:    '#171c25',
  input:    '#232a38',
  border:   '#3d4757',
  blue:     '#3b82f6',
  purple:   '#a855f7',
  green:    '#22c55e',
  red:      '#ef4444',
  text:     '#eef2f8',
  textSub:  '#c3cddd',
  textMuted:'#99a5ba',
};

const ADMIN_TASKS = [
  "MANAGE", "CREATE_CONTENT", "BASIC_CARDS", "MESSAGE",
  "EDIT_PROFILE", "ANALYZE", "MODERATE", "ADVERTISE",
  "CASHIER_ROLE", "VIEW_COST", "MANAGE_LEADS", "PUBLISH_CONTENT",
];

const POLL_INTERVAL_MS = 5000;

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

function Panel({ title, accent, children }) {
  return (
    <div style={{
      background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <h3 style={{
        margin: 0, fontSize: 13, fontWeight: 800, color: accent,
        textTransform: 'uppercase', letterSpacing: '.06em',
        display: 'flex', alignItems: 'center', gap: 7,
      }}>
        <span style={{ display: 'inline-block', width: 3, height: 12, background: accent, borderRadius: 2 }} />
        {title}
      </h3>
      {children}
    </div>
  );
}

Panel.propTypes = {
  title: PropTypes.string.isRequired,
  accent: PropTypes.string.isRequired,
  children: PropTypes.node,
};

function Field({ label, children }) {
  return (
    <div>
      <label style={{
        fontSize: 12, fontWeight: 700, color: C.textSub,
        display: 'block', marginBottom: 5,
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

Field.propTypes = { label: PropTypes.string.isRequired, children: PropTypes.node };

const inputStyle = {
  width: '100%', padding: '9px 12px', fontSize: 13, borderRadius: 8,
  boxSizing: 'border-box', background: C.input,
  border: `1px solid ${C.border}`, color: C.text, outline: 'none',
};

function Note({ tone, children }) {
  const clr = tone === 'ok' ? C.green : tone === 'err' ? C.red : C.textMuted;
  return (
    <div style={{
      padding: '8px 12px', borderRadius: 8, fontSize: 12,
      border: `1px solid ${clr}33`, background: `${clr}11`, color: clr,
      wordBreak: 'break-word',
    }}>
      {children}
    </div>
  );
}

Note.propTypes = { tone: PropTypes.string, children: PropTypes.node };

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
  const [userId, setUserId]         = useState("");
  const [granting, setGranting]     = useState(false);
  const [grantResult, setGrantResult] = useState(null);

  const pollRef = useRef(null);

  useEffect(() => () => clearInterval(pollRef.current), []);

  const authReady = cookies.trim() && businessId.trim();

  const handleGenerateEmail = async () => {
    setGenerating(true);
    setInviteResult(null);
    try {
      const data = await postJson("/api/temp-email/create", {});
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
      const data = await postJson("/api/send-invite", {
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
        `/api/temp-email/messages?token=${encodeURIComponent(emailToken)}`);
      const list = msgData.messages || [];
      setMessages(list);
      setInboxError("");

      if (list.length > 0) {
        const linkData = await getJson(
          `/api/temp-email/invite-link?token=${encodeURIComponent(emailToken)}` +
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
      const data = await postJson("/api/grant-permissions", {
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

  return (
    <div style={{ width: '100%', maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingBottom: 12, borderBottom: `1px solid ${C.border}`,
      }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.text }}>
          Inviter User to BM
        </h1>
        <button onClick={onClose} aria-label="Close" style={{
          width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
          background: 'rgba(255,255,255,0.08)', border: `1px solid ${C.border}`,
          color: C.text, fontSize: 14,
        }}>
          ✕
        </button>
      </div>

      {/* Shared credentials — applies to both tools */}
      <Panel title="Auth — shared by both tools" accent={C.textSub}>
        <Field label="Cookies">
          <CookieInput value={cookies} onChange={setCookies} />
        </Field>
        <Field label="Business ID">
          <input
            type="text"
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value)}
            placeholder="1234567890"
            style={inputStyle}
          />
        </Field>
        <div style={{ fontSize: 11, color: C.textMuted }}>
          fb_dtsg and LSD are extracted server-side from these cookies on every request.
        </div>
      </Panel>

      {/* The two tools, side by side */}
      <div style={{
        display: 'grid', gap: 14,
        gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
        alignItems: 'start',
      }}>
        {/* ── Invite tool ── */}
        <Panel title="📧 Invite User" accent={C.blue}>
          <Field label="Temp email address">
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                readOnly
                value={generatedEmail}
                placeholder="Not generated yet"
                style={{ ...inputStyle, color: C.blue, fontFamily: 'monospace' }}
              />
              <button onClick={() => copy(generatedEmail)} disabled={!generatedEmail}
                style={{
                  padding: '9px 12px', borderRadius: 8, cursor: generatedEmail ? 'pointer' : 'default',
                  background: C.input, border: `1px solid ${C.border}`, color: C.textSub,
                  opacity: generatedEmail ? 1 : .5,
                }}>
                📋
              </button>
              <button onClick={handleGenerateEmail} disabled={generating}
                style={{
                  padding: '9px 16px', borderRadius: 8, cursor: generating ? 'default' : 'pointer',
                  background: generating ? C.input : C.blue, border: 'none',
                  color: '#fff', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap',
                }}>
                {generating ? '…' : 'Generate'}
              </button>
            </div>
          </Field>

          <Field label="Asset ID (optional)">
            <input
              type="text"
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              placeholder="Page or Ad Account ID"
              style={inputStyle}
            />
          </Field>

          <button
            onClick={handleSendInvite}
            disabled={sending || !generatedEmail || !authReady}
            style={{
              width: '100%', padding: '10px', borderRadius: 8, border: 'none',
              cursor: (sending || !generatedEmail || !authReady) ? 'default' : 'pointer',
              background: (sending || !generatedEmail || !authReady) ? C.input : C.blue,
              color: '#fff', fontWeight: 700, fontSize: 13,
            }}>
            {sending ? 'Sending…' : 'Send Invite'}
          </button>

          {inviteResult && (
            <Note tone={inviteResult.success ? 'ok' : 'err'}>{inviteResult.message}</Note>
          )}

          {/* Inbox */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.textSub }}>Inbox</span>
            <button onClick={togglePolling} disabled={!emailToken}
              style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 11,
                cursor: emailToken ? 'pointer' : 'default',
                background: C.input, border: `1px solid ${C.border}`,
                color: polling ? C.green : C.textSub, opacity: emailToken ? 1 : .5,
              }}>
              {polling ? '⏸ Stop polling' : '▶ Check inbox'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
            {!emailToken ? (
              <div style={{ padding: 14, textAlign: 'center', fontSize: 11, color: C.textMuted, border: `1px dashed ${C.border}`, borderRadius: 8 }}>
                Generate a temp email first
              </div>
            ) : messages.length === 0 ? (
              <div style={{ padding: 14, textAlign: 'center', fontSize: 11, color: C.textMuted, border: `1px dashed ${C.border}`, borderRadius: 8 }}>
                {polling ? 'Listening for mail…' : 'No messages yet'}
              </div>
            ) : messages.map(m => (
              <div key={m.id} style={{ padding: 8, borderRadius: 6, background: C.input, border: `1px solid ${C.border}`, fontSize: 11 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ color: C.text, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.subject}
                  </span>
                  <span style={{ color: C.textMuted, fontSize: 10, flexShrink: 0 }}>
                    {m.createdAt ? new Date(m.createdAt).toLocaleTimeString() : ''}
                  </span>
                </div>
                <div style={{ color: C.textMuted, fontSize: 10 }}>{m.from}</div>
              </div>
            ))}
          </div>

          {inboxError && <Note tone="err">{inboxError}</Note>}

          {inviteLink && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, borderRadius: 8, border: `1px solid ${C.green}55`, background: `${C.green}11` }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.green }}>✓ Invite link extracted</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <input readOnly value={inviteLink}
                  style={{ ...inputStyle, fontSize: 11, color: C.green, fontFamily: 'monospace', borderColor: `${C.green}55` }} />
                <button onClick={() => copy(inviteLink)}
                  style={{ padding: '6px 10px', borderRadius: 6, cursor: 'pointer', background: C.input, border: `1px solid ${C.border}`, color: C.textSub }}>
                  📋
                </button>
              </div>
            </div>
          )}
        </Panel>

        {/* ── Permissions tool ── */}
        <Panel title="🔐 Grant Permissions" accent={C.purple}>
          <Field label="Target user ID">
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="1000..."
              style={inputStyle}
            />
          </Field>

          <button
            onClick={handleGrantPermissions}
            disabled={granting || !userId.trim() || !authReady}
            style={{
              width: '100%', padding: '10px', borderRadius: 8, border: 'none',
              cursor: (granting || !userId.trim() || !authReady) ? 'default' : 'pointer',
              background: (granting || !userId.trim() || !authReady) ? C.input : C.purple,
              color: '#fff', fontWeight: 700, fontSize: 13,
            }}>
            {granting ? 'Granting…' : 'Grant All Admin Permissions'}
          </button>

          {grantResult && (
            <Note tone={grantResult.success ? 'ok' : 'err'}>{grantResult.message}</Note>
          )}

          <div>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.textSub, display: 'block', marginBottom: 8 }}>
              Operations included
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {ADMIN_TASKS.map(task => (
                <div key={task} style={{
                  fontSize: 10, fontFamily: 'monospace', padding: '4px 8px',
                  borderRadius: 6, background: C.input,
                  border: `1px solid ${C.border}`, color: C.textSub,
                }}>
                  ✓ {task}
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      {!authReady && (
        <Note tone="info">Enter cookies and Business ID above to enable both tools.</Note>
      )}
    </div>
  );
}

InviterUserModal.propTypes = {
  onClose: PropTypes.func.isRequired,
};
