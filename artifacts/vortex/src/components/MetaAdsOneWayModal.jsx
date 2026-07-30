import { useState, useRef } from 'react';
import PropTypes from 'prop-types';

// ── Color palette (matches the original tool's CSS variables) ─────────────
const C = {
  bg:        '#0d0d0d',
  card:      '#12151c',
  panel:     '#171c25',
  input:     '#232a38',
  border:    '#3d4757',
  borderHi:  '#333333',
  accent:    '#4da6ff',
  accentH:   '#3a8fe0',
  accentGlow:'rgba(77,166,255,0.15)',
  text:      '#f2f2f2',
  textSub:   '#c3cddd',
  textMuted: '#99a5ba',
  green:     '#22c55e',
  red:       '#ef4444',
};

// ── Reusable style objects ────────────────────────────────────────────────
const inputStyle = { borderRadius: 8 };
const sectionStyle = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, boxShadow: '0 1px 2px rgba(0,0,0,0.45), 0 6px 18px -8px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)' };
const sectionTitleStyle = {
  fontSize: 12.5, fontWeight: 800, color: C.text, textTransform: 'uppercase',
  letterSpacing: '.08em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7,
};
const SectionBar = () => (
  <span style={{ display: 'inline-block', width: 3, height: 12, background: C.accent, borderRadius: 2 }} />
);

function Loader() {
  return (
    <span style={{
      display: 'inline-block', width: 13, height: 13, borderRadius: '50%',
      border: '2px solid currentColor', borderTopColor: 'transparent', animation: 'spin .8s linear infinite',
    }} />
  );
}

function InputField({ label, children, hint }) {
  return (
    <div>
      <label style={{ color: C.textSub, fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 5 }}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: 11.5, color: C.textMuted, marginTop: 4, lineHeight: 1.5 }}>{hint}</p>}
    </div>
  );
}
InputField.propTypes = { label: PropTypes.string, children: PropTypes.node, hint: PropTypes.string };

const inputCls = {
  width: '100%', padding: '9px 12px', fontSize: 13, boxSizing: 'border-box',
  ...inputStyle,
};

// ── Main component ────────────────────────────────────────────────────────
export default function MetaAdsOneWayModal({ onClose }) {
  // ── screens: 1=cookies/proxy, 2=targeting ─────────────────────────
  const [step, setStep]           = useState(1);

  // Step 1
  const [cookies, setCookies]             = useState('');
  const [adAccountInput, setAdAccountInput] = useState('');
  const [proxy, setProxy]                 = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyResult, setVerifyResult]   = useState(null);
  const [token, setToken]                 = useState('');
  const [adAccount, setAdAccount]         = useState('');

  // Step 2
  const [contentType, setContentType]     = useState('post'); // 'post' | 'image'
  const [pageInput, setPageInput]         = useState('');
  const [fetchingPosts, setFetchingPosts] = useState(false);
  const [fetchStatus, setFetchStatus]     = useState('');
  const [posts, setPosts]                 = useState([]);
  const [selectedPost, setSelectedPost]   = useState(null);
  const [imageFile, setImageFile]         = useState(null);
  const [imagePreview, setImagePreview]   = useState(null);
  const [adContent, setAdContent]         = useState('');
  const [budget, setBudget]               = useState('10');
  const [days, setDays]                   = useState('1');
  const [country, setCountry]             = useState('EG');
  const [gender, setGender]               = useState('0');
  const [ageMin, setAgeMin]               = useState('18');
  const [ageMax, setAgeMax]               = useState('');
  const [adLoading, setAdLoading]         = useState(false);
  const [adResult, setAdResult]           = useState(null);

  const fileRef = useRef(null);

  // ── Handlers ──────────────────────────────────────────────────────
  async function handleVerify() {
    if (!cookies.trim()) return alert('أدخل الكوكيز أولاً');
    setVerifyLoading(true);
    setVerifyResult(null);
    try {
      const res = await fetch('/api/mini-meta/verify-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cookies,
          proxy: proxy.trim() || null,
          billing_url: adAccountInput.trim() || null,
        }),
      }).then(r => r.json());
      setVerifyResult(res);
      if (res.ok) {
        setToken(res.token || '');
        setAdAccount(res.ad_account || '');
      }
    } catch (e) {
      setVerifyResult({ ok: false, reason: e.message });
    } finally {
      setVerifyLoading(false);
    }
  }

  async function handleFetchPosts() {
    if (!pageInput.trim()) return;
    setFetchingPosts(true);
    setFetchStatus('جاري جلب المنشورات...');
    setPosts([]);
    setSelectedPost(null);
    try {
      const res = await fetch('/api/mini-meta/fetch-page-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cookies,
          proxy: proxy.trim() || null,
          page_id: pageInput.trim(),
          token: token || null,
        }),
      }).then(r => r.json());
      if (res.ok) {
        setPosts(res.posts || []);
        setFetchStatus(
          res.posts?.length
            ? `✅ ${res.posts.length} منشور`
            : 'لا توجد منشورات'
        );
      } else {
        setFetchStatus(`❌ ${res.reason}`);
      }
    } catch (e) {
      setFetchStatus(`❌ ${e.message}`);
    } finally {
      setFetchingPosts(false);
    }
  }

  function handleImageChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = ev => setImagePreview(ev.target.result);
    reader.readAsDataURL(file);
  }

  async function handleCreateAd() {
    if (contentType === 'post' && !selectedPost) return alert('اختر منشوراً أولاً');
    if (contentType === 'image' && !imageFile) return alert('ارفع صورة أولاً');
    if (!token) return alert('لم يتم استخراج التوكن — ارجع للخطوة الأولى');
    setAdLoading(true);
    setAdResult(null);
    try {
      let res;
      if (contentType === 'post') {
        res = await fetch('/api/mini-meta/boost-ad', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cookies,
            proxy: proxy.trim() || null,
            token,
            ad_account: adAccount,
            page_id: selectedPost.story_id?.split('_')[0] || pageInput,
            post_id: selectedPost.post_id,
            budget,
            days: parseInt(days) || 1,
            objective: 'POST_ENGAGEMENT',
            countries: [(country || 'EG').trim().toUpperCase()],
            age_min: ageMin || null,
            age_max: ageMax || null,
            gender: parseInt(gender) || 0,
          }),
        }).then(r => r.json());
      } else {
        // Image ad: send via FormData (multipart)
        const form = new FormData();
        form.append('image', imageFile);
        form.append('token', token);
        form.append('ad_account', adAccount);
        form.append('content', adContent);
        form.append('budget', budget);
        form.append('days', days);
        form.append('country', (country || 'EG').toUpperCase());
        form.append('gender', gender);
        form.append('age_min', ageMin || '');
        form.append('age_max', ageMax || '');
        res = await fetch('/api/meta-one-way/create-image-ad', {
          method: 'POST',
          body: form,
        }).then(r => r.json());
      }
      setAdResult(res);
    } catch (e) {
      setAdResult({ ok: false, reason: e.message });
    } finally {
      setAdLoading(false);
    }
  }

  function handleReset() {
    setStep(1);
    setToken('');
    setAdAccount('');
    setVerifyResult(null);
    setPosts([]);
    setSelectedPost(null);
    setImageFile(null);
    setImagePreview(null);
    setAdContent('');
    setAdResult(null);
    setFetchStatus('');
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div
      className="flex h-full w-full flex-col"
      dir="rtl"
      style={{ background: C.bg, fontFamily: "'Tajawal','Segoe UI',sans-serif", fontSize: 13 }}
    >
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>

      {/* ── Header ── */}
      <header style={{ background: C.panel, borderBottom: `1px solid ${C.border}`, padding: '14px 20px', flexShrink: 0 }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 12px', color: C.textSub, fontSize: 12.5, cursor: 'pointer' }}
            >
              → رجوع
            </button>
            <div className="flex items-center gap-2">
              <img src="/meta_ads_one_way.png" alt="Meta Ads One Way" style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 10 }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.accent, letterSpacing: '.3px' }}>META ADS ONE WAY</div>
                <div style={{ fontSize: 11.5, color: C.textSub }}>أداة إنشاء إعلانات فيسبوك</div>
              </div>
            </div>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2">
            {[1, 2].map(s => (
              <div
                key={s}
                style={{
                  width: 28, height: 28, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12.5, fontWeight: 700,
                  background: step === s ? C.accent : C.input,
                  color: step === s ? '#fff' : C.textMuted,
                  border: `1px solid ${step === s ? C.accent : C.border}`,
                  transition: 'all .2s',
                }}
              >
                {s}
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

        {/* ════════════════ STEP 1: Cookies / Proxy ════════════════ */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            <div style={sectionStyle}>
              <div style={sectionTitleStyle}><SectionBar />بيانات الدخول</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <InputField label="الكوكيز (JSON)">
                  <textarea
                    value={cookies}
                    onChange={e => setCookies(e.target.value)}
                    rows={3}
                    placeholder={'c_user=123; xs=abc  ——أو——  [{"name":"c_user","value":"123"}]'}
                    style={{ ...inputCls, resize: 'none', fontFamily: 'monospace', display: 'block' }}
                  />
                </InputField>

                <InputField label="الحساب الإعلاني (رابط أو act_xxx)" hint="الأداة ستفتح صفحته لاستخراج التوكن">
                  <input
                    value={adAccountInput}
                    onChange={e => setAdAccountInput(e.target.value)}
                    placeholder="https://www.facebook.com/adsmanager/?act=... أو act_xxx"
                    style={inputCls}
                  />
                </InputField>

                <InputField label="بروكسي (اختياري)">
                  <input
                    value={proxy}
                    onChange={e => setProxy(e.target.value)}
                    placeholder="host:port:user:pass"
                    style={inputCls}
                  />
                </InputField>
              </div>
            </div>

            {/* Verify button */}
            <button
              onClick={handleVerify}
              disabled={verifyLoading}
              style={{
                width: '100%', padding: '10px', borderRadius: 7, fontWeight: 700, fontSize: 13,
                cursor: verifyLoading ? 'not-allowed' : 'pointer', border: 'none',
                background: `linear-gradient(135deg, ${C.accent}, ${C.accentH})`,
                color: '#fff', opacity: verifyLoading ? .65 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                boxShadow: `0 2px 10px ${C.accentGlow}`,
              }}
            >
              {verifyLoading && <Loader />}
              {verifyLoading ? 'جاري التحقق...' : 'التحقق واستخراج التوكن'}
            </button>

            {/* Result */}
            {verifyResult && (
              <div style={{
                borderRadius: 8, padding: '10px 12px', fontSize: 12,
                border: `1px solid ${verifyResult.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                background: verifyResult.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
              }}>
                {verifyResult.ok ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ color: C.green, fontWeight: 700 }}>✅ تم استخراج التوكن بنجاح</div>
                    <div style={{ color: '#ccc' }}>
                      التوكن:{' '}
                      <span style={{ fontFamily: 'monospace', color: C.accent }}>
                        {verifyResult.token?.slice(0, 26)}…
                      </span>
                    </div>
                    {verifyResult.name && <div style={{ color: C.textSub }}>الاسم: {verifyResult.name}</div>}
                    <div style={{ color: '#ccc' }}>
                      الحساب:{' '}
                      <span style={{ color: C.text }}>{verifyResult.ad_account || 'لم يُستخرج'}</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ color: '#f87171' }}>❌ {verifyResult.reason}</div>
                )}
              </div>
            )}

            {/* Active token badge */}
            {token && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 7, padding: '7px 12px', background: C.accentGlow, border: `1px solid rgba(77,166,255,0.25)` }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.accent, animation: 'pulse 2s infinite', flexShrink: 0 }} />
                <span style={{ fontFamily: 'monospace', fontSize: 12.5, color: C.accent }}>{adAccount || 'حساب محفوظ'}</span>
              </div>
            )}

            {/* Continue */}
            {token && (
              <button
                onClick={() => setStep(2)}
                style={{
                  width: '100%', padding: '10px', borderRadius: 7, fontWeight: 700, fontSize: 13,
                  cursor: 'pointer', background: 'transparent',
                  border: `1px solid ${C.accent}`, color: C.accent,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                متابعة إلى الاستهداف ←
              </button>
            )}
          </div>
        )}

        {/* ════════════════ STEP 2: Targeting ════════════════ */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Token active badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 7, padding: '6px 12px', background: C.accentGlow, border: `1px solid rgba(77,166,255,0.25)`, fontSize: 12.5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.accent, animation: 'pulse 2s infinite', flexShrink: 0 }} />
              <span style={{ fontFamily: 'monospace', color: C.accent }}>{adAccount}</span>
              <span style={{ color: C.textMuted, marginRight: 'auto' }}>● التوكن نشط</span>
            </div>

            {/* ── Content type ── */}
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}><SectionBar />نوع المحتوى</div>

              {/* Toggle */}
              <div style={{ display: 'flex', border: `1px solid ${C.border}`, borderRadius: 7, overflow: 'hidden', background: C.input, marginBottom: 12 }}>
                {[['post', '📄 منشور موجود'], ['image', '🖼 صورة + محتوى']].map(([val, lbl]) => (
                  <button
                    key={val}
                    onClick={() => setContentType(val)}
                    style={{
                      flex: 1, padding: 9, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                      border: 'none', transition: 'all .2s',
                      background: contentType === val ? `linear-gradient(135deg, ${C.accent}, ${C.accentH})` : 'transparent',
                      color: contentType === val ? '#fff' : C.textMuted,
                    }}
                  >{lbl}</button>
                ))}
              </div>

              {/* Post mode */}
              {contentType === 'post' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <InputField label="رابط الصفحة أو معرّفها">
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        value={pageInput}
                        onChange={e => setPageInput(e.target.value)}
                        placeholder="https://facebook.com/YourPage أو 1234567890"
                        style={{ ...inputCls, flex: 1 }}
                      />
                      <button
                        onClick={handleFetchPosts}
                        disabled={fetchingPosts}
                        style={{
                          padding: '8px 12px', borderRadius: 7, border: `1px solid ${C.border}`,
                          background: C.panel, color: C.textSub, fontSize: 12.5, fontWeight: 600,
                          cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                          display: 'flex', alignItems: 'center', gap: 5,
                        }}
                      >
                        {fetchingPosts ? <Loader /> : 'جلب المنشورات'}
                      </button>
                    </div>
                    {fetchStatus && (
                      <p style={{
                        fontSize: 12.5, marginTop: 3,
                        color: fetchStatus.startsWith('✅') ? C.green : fetchStatus.startsWith('❌') ? C.red : C.textSub,
                      }}>{fetchStatus}</p>
                    )}
                  </InputField>

                  {posts.length > 0 && (
                    <InputField label="اختر المنشور">
                      <select
                        value={selectedPost?.post_id || ''}
                        onChange={e => setSelectedPost(posts.find(p => p.post_id === e.target.value) || null)}
                        style={{ ...inputCls, display: 'block' }}
                      >
                        <option value="">— اختر منشوراً —</option>
                        {posts.map(p => (
                          <option key={p.post_id} value={p.post_id}>
                            {p.title} {p.date ? `(${new Date(p.date).toLocaleDateString('ar-EG')})` : ''}
                          </option>
                        ))}
                      </select>
                    </InputField>
                  )}

                  {selectedPost && (
                    <div style={{
                      background: 'rgba(77,166,255,0.08)', border: `1px solid rgba(77,166,255,0.25)`,
                      borderRadius: 7, padding: '8px 12px', fontSize: 12, color: C.accent,
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <span style={{ fontSize: 16 }}>⏰</span>
                      <div>
                        <div style={{ fontWeight: 700 }}>جدولة تلقائية — 30 دقيقة</div>
                        <div style={{ fontSize: 11.5, opacity: .8, marginTop: 1 }}>سيبدأ الإعلان تلقائياً بعد 30 دقيقة من الآن</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Image mode */}
              {contentType === 'image' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <InputField label="الصورة">
                    <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} />
                    <button
                      onClick={() => fileRef.current?.click()}
                      style={{
                        width: '100%', padding: '28px 12px', borderRadius: 7, cursor: 'pointer',
                        border: `2px dashed ${imageFile ? C.accent : C.border}`,
                        background: imageFile ? 'rgba(77,166,255,0.06)' : 'transparent',
                        color: imageFile ? C.accent : C.textMuted,
                        transition: 'all .2s', textAlign: 'center',
                      }}
                    >
                      {imagePreview ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                          <img src={imagePreview} alt="preview" style={{ maxHeight: 90, maxWidth: 220, borderRadius: 6, objectFit: 'cover' }} />
                          <span style={{ fontSize: 12.5 }}>✅ {imageFile.name}</span>
                        </div>
                      ) : (
                        <>
                          <div style={{ fontSize: 24, marginBottom: 6 }}>📁</div>
                          <div style={{ fontSize: 12 }}>انقر لرفع صورة الإعلان</div>
                        </>
                      )}
                    </button>
                  </InputField>

                  <InputField label="محتوى الإعلان (النص)">
                    <textarea
                      value={adContent}
                      onChange={e => setAdContent(e.target.value)}
                      rows={3}
                      placeholder="اكتب نص الإعلان هنا..."
                      style={{ ...inputCls, resize: 'none', fontFamily: 'inherit', display: 'block' }}
                    />
                  </InputField>
                </div>
              )}
            </div>

            {/* ── Campaign settings ── */}
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}><SectionBar />إعدادات الحملة</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <InputField label="الميزانية / يوم ($)">
                  <input type="number" value={budget} onChange={e => setBudget(e.target.value)} min="1" style={inputCls} />
                </InputField>
                <InputField label="المدة (أيام)">
                  <input type="number" value={days} onChange={e => setDays(e.target.value)} min="1" style={inputCls} />
                </InputField>
              </div>
            </div>

            {/* ── Targeting ── */}
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}><SectionBar />الاستهداف</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <InputField label="الدولة (ISO2)">
                  <input value={country} onChange={e => setCountry(e.target.value.toUpperCase())} placeholder="EG" maxLength={2} style={inputCls} />
                </InputField>
                <InputField label="النوع">
                  <select value={gender} onChange={e => setGender(e.target.value)} style={{ ...inputCls, display: 'block' }}>
                    <option value="0">الكل</option>
                    <option value="1">ذكور</option>
                    <option value="2">إناث</option>
                  </select>
                </InputField>
                <InputField label="السن من">
                  <input type="number" value={ageMin} onChange={e => setAgeMin(e.target.value)} min="13" max="65" placeholder="18" style={inputCls} />
                </InputField>
                <InputField label="السن إلى">
                  <input type="number" value={ageMax} onChange={e => setAgeMax(e.target.value)} min="13" max="65" placeholder="65" style={inputCls} />
                </InputField>
              </div>
            </div>

            {/* ── Action buttons ── */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleCreateAd}
                disabled={adLoading}
                style={{
                  flex: 1, padding: '11px', borderRadius: 7, fontWeight: 700, fontSize: 13,
                  cursor: adLoading ? 'not-allowed' : 'pointer', border: 'none',
                  background: `linear-gradient(135deg, ${C.accent}, ${C.accentH})`,
                  color: '#fff', opacity: adLoading ? .65 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  boxShadow: `0 2px 10px ${C.accentGlow}`,
                }}
              >
                {adLoading ? <><Loader />جاري الإنشاء...</> : '🚀 إنشاء الإعلان'}
              </button>
              <button
                onClick={handleReset}
                style={{
                  padding: '11px 18px', borderRadius: 7, fontWeight: 700, fontSize: 12,
                  cursor: 'pointer', border: `1px solid ${C.border}`,
                  background: C.panel, color: C.textSub, whiteSpace: 'nowrap',
                }}
              >
                ↺ Reset
              </button>
            </div>

            {/* Ad result */}
            {adResult && (
              <div style={{
                borderRadius: 8, padding: '10px 12px', fontSize: 12,
                border: `1px solid ${adResult.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                background: adResult.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
              }}>
                {adResult.ok ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ color: C.green, fontWeight: 700 }}>✅ {adResult.message || 'تم إنشاء الإعلان بنجاح'}</div>
                    {adResult.ad_id      && <div style={{ color: C.textSub, fontFamily: 'monospace', fontSize: 12.5 }}>Ad ID: {adResult.ad_id}</div>}
                    {adResult.adset_id   && <div style={{ color: C.textSub, fontFamily: 'monospace', fontSize: 12.5 }}>AdSet: {adResult.adset_id}</div>}
                    {adResult.campaign_id && <div style={{ color: C.textSub, fontFamily: 'monospace', fontSize: 12.5 }}>Campaign: {adResult.campaign_id}</div>}
                    {adResult.currency   && <div style={{ color: C.textSub, fontSize: 12.5 }}>العملة: {adResult.currency}</div>}
                    {adResult.response_preview && (
                      <div style={{ marginTop: 4, padding: '4px 8px', background: 'rgba(0,0,0,0.3)', borderRadius: 5, fontFamily: 'monospace', fontSize: 11.5, color: '#666', wordBreak: 'break-all' }}>
                        {adResult.response_preview.slice(0, 200)}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ color: '#f87171' }}>❌ {adResult.reason}</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

MetaAdsOneWayModal.propTypes = {
  onClose: PropTypes.func.isRequired,
};
