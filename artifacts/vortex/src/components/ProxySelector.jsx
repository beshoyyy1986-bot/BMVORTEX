import React, { useState } from 'react';
import PropTypes from 'prop-types';

/** Detect proxy type from a raw proxy string (client-side mirror of server detectProxyType). */
function detectProxyType(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const m = s.match(/^(https?|socks[45]):\/\//i);
  if (m) return m[1].toLowerCase();
  return 'http';
}

/** Parse a raw proxy string into display-friendly { host, port, type, authenticated } */
function parseProxyDisplay(proxy) {
  if (!proxy || typeof proxy !== 'string') return null;
  const s = proxy.trim();
  if (!s) return null;

  let normalized = s;
  if (/^(https?|socks[45]):\/\//i.test(s)) {
    // already normalised
  } else if (s.includes('@')) {
    normalized = `http://${s}`;
  } else {
    const parts = s.split(':');
    if (parts.length === 4) {
      const [host, port] = parts;
      return {
        host,
        port: port || null,
        type: 'http',
        authenticated: true,
      };
    }
    normalized = `http://${s}`;
  }

  try {
    const parseable = normalized
      .replace(/^socks[45]:\/\//i, 'http://');
    const url = new URL(parseable);
    return {
      host: url.hostname,
      port: url.port ? parseInt(url.port, 10) : null,
      type: detectProxyType(normalized),
      authenticated: !!(url.username && url.password),
    };
  } catch {
    return { host: s.split(':')[0], port: null, type: detectProxyType(s), authenticated: false };
  }
}

/** Convert a 2-letter ISO country code into a flag emoji. */
function countryFlag(code) {
  if (!code || typeof code !== 'string') return '';
  const cc = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '';
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

const ProxySelector = ({ onProxyChange, defaultOption = 'none', proxyInfo }) => {
    const [proxyOption, setProxyOption] = useState(defaultOption);
    const [customProxy, setCustomProxy] = useState('');
    // Result of the on-demand "Test" button (a proxy_info payload from
    // POST /api/proxy/quick-check). Takes priority over the passive prop.
    const [testResult, setTestResult] = useState(null);
    const [testReason, setTestReason] = useState('');
    const [testing, setTesting] = useState(false);

    const resetTest = () => { setTestResult(null); setTestReason(''); };

    const handleOptionChange = (option) => {
        setProxyOption(option);
        resetTest();
        onProxyChange({ option, proxy: option === 'custom' ? customProxy : null });
    };

    const handleCustomProxyChange = (value) => {
        setCustomProxy(value);
        resetTest();
        if (proxyOption === 'custom') {
            onProxyChange({ option: 'custom', proxy: value });
        }
    };

    // Shared "Test / Connect" routine — routes a request THROUGH the proxy on
    // the server, then reports live status + type + country + latency.
    const handleTest = async () => {
        const target = customProxy.trim();
        if (!target || testing) return;
        setTesting(true);
        resetTest();
        try {
            const res = await fetch('/api/proxy/quick-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ proxy: target }),
            });
            const json = await res.json();
            if (json.proxy_info) setTestResult(json.proxy_info);
            if (!json.success) setTestReason(json.reason || json.error || 'Connection failed');
        } catch (e) {
            setTestResult({ status: 'disconnected' });
            setTestReason(e?.message || 'Network error');
        } finally {
            setTesting(false);
        }
    };

    const btnClass = (active) =>
        `rounded-lg border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
            active
                ? 'border-blue-400/60 bg-blue-500/20 text-blue-100'
                : 'border-white/15 bg-black/20 text-slate-400 hover:border-white/25 hover:bg-white/5'
        }`;

    // ── Derive display info ──────────────────────────────────────
    // Priority: live Test result > proxyInfo from API > live parse of customProxy
    let displayInfo = null;
    const source = testResult && testResult.status !== 'no_proxy'
        ? testResult
        : (proxyInfo && proxyInfo.status !== 'no_proxy' ? proxyInfo : null);

    if (source) {
        displayInfo = {
            status: source.status,       // active | disconnected | invalid
            type: (source.type || 'http').toUpperCase(),
            host: source.host || null,
            port: source.port || null,
            authenticated: source.authenticated || false,
            country: source.country || null,
            countryCode: source.countryCode || null,
            city: source.city || null,
            ip: source.ip || null,
            responseTime: typeof source.responseTime === 'number' ? source.responseTime : null,
            egressVerified: source.egress_verified === true,
        };
    } else if (proxyOption === 'custom' && customProxy) {
        const parsed = parseProxyDisplay(customProxy);
        if (parsed) {
            displayInfo = {
                status: 'pending',          // not yet tested by API
                type: (parsed.type || 'http').toUpperCase(),
                host: parsed.host || null,
                port: parsed.port || null,
                authenticated: parsed.authenticated,
            };
        }
    }

    const canTest = proxyOption === 'custom' && customProxy.trim().length > 0;

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-400 mr-1">Proxy:</span>
                {[
                    { value: 'none', label: 'No Proxy' },
                    { value: 'site', label: 'Site Proxy' },
                    { value: 'custom', label: 'Custom Proxy' }
                ].map((opt) => (
                    <button
                        key={opt.value}
                        type="button"
                        className={btnClass(proxyOption === opt.value)}
                        onClick={() => handleOptionChange(opt.value)}
                    >
                        {opt.label}
                    </button>
                ))}
                {proxyOption === 'custom' && (
                    <>
                        <input
                            type="text"
                            placeholder="http://host:port  ·  socks5://host:port  ·  host:port:user:pass"
                            value={customProxy}
                            onChange={(e) => handleCustomProxyChange(e.target.value)}
                            className="w-64 rounded-lg border border-white/20 bg-black/30 px-2 py-1.5 text-xs text-slate-300 outline-none placeholder:text-slate-600"
                        />
                        <button
                            type="button"
                            onClick={handleTest}
                            disabled={!canTest || testing}
                            title="Test the proxy connection"
                            className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                                !canTest || testing
                                    ? 'cursor-not-allowed border-white/10 bg-black/20 text-slate-600'
                                    : 'cursor-pointer border-emerald-400/50 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
                            }`}
                        >
                            {testing ? (
                                <>
                                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-emerald-300/40 border-t-emerald-200" />
                                    Testing…
                                </>
                            ) : (
                                <>🔌 Test</>
                            )}
                        </button>
                    </>
                )}
            </div>

            {/* ── Proxy status badge ─────────────────────────── */}
            {displayInfo && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/8 bg-black/20 px-3 py-1.5 text-xs">
                    {displayInfo.status === 'active' && (
                        <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-green-400 shadow-sm shadow-green-400/50" />
                    )}
                    {(displayInfo.status === 'disconnected' || displayInfo.status === 'invalid') && (
                        <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-red-400 shadow-sm shadow-red-400/50" />
                    )}
                    {displayInfo.status === 'no_proxy' && (
                        <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-slate-500" />
                    )}
                    {displayInfo.status === 'pending' && (
                        <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-slate-400 animate-pulse" />
                    )}

                    <span className={`font-semibold ${
                        displayInfo.status === 'active' ? 'text-green-300' :
                        displayInfo.status === 'disconnected' ? 'text-red-300' :
                        displayInfo.status === 'invalid' ? 'text-red-300' :
                        displayInfo.status === 'no_proxy' ? 'text-slate-500' :
                        'text-slate-400'
                    }`}>
                        {displayInfo.status === 'active' ? 'Connected' :
                         displayInfo.status === 'disconnected' ? 'Disconnected' :
                         displayInfo.status === 'invalid' ? 'Invalid' :
                         displayInfo.status === 'no_proxy' ? 'No Proxy' :
                         'Pending'}
                    </span>

                    <span className="text-slate-500">—</span>
                    <span className="text-slate-300">{displayInfo.type}</span>

                    {displayInfo.host && (
                        <>
                            <span className="text-slate-600">—</span>
                            <span className="font-mono text-slate-300">
                                {displayInfo.host}{displayInfo.port ? `:${displayInfo.port}` : ''}
                            </span>
                        </>
                    )}

                    {(displayInfo.country || displayInfo.countryCode) && (
                        <>
                            <span className="text-slate-600">·</span>
                            <span className="text-slate-200" title={displayInfo.city || ''}>
                                {countryFlag(displayInfo.countryCode)} {displayInfo.country || displayInfo.countryCode}
                            </span>
                        </>
                    )}

                    {displayInfo.responseTime != null && (
                        <>
                            <span className="text-slate-600">·</span>
                            <span className="text-slate-400">{displayInfo.responseTime} ms</span>
                        </>
                    )}

                    {displayInfo.egressVerified && (
                        <>
                            <span className="text-slate-600">·</span>
                            <span className="text-emerald-400" title="Traffic verified to egress through the proxy">
                                ✓ egress
                            </span>
                        </>
                    )}

                    {displayInfo.authenticated && (
                        <>
                            <span className="text-slate-600">·</span>
                            <span className="text-amber-400" title="Requires authentication">🔐</span>
                        </>
                    )}

                    {displayInfo.status === 'disconnected' && testReason && (
                        <>
                            <span className="text-slate-600">·</span>
                            <span className="text-red-300/80">{testReason}</span>
                        </>
                    )}
                </div>
            )}

            {proxyOption === 'none' && !displayInfo && (
                <div className="flex items-center gap-2 rounded-lg border border-white/8 bg-black/20 px-3 py-1.5 text-xs">
                    <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-slate-500" />
                    <span className="text-slate-500">No Proxy</span>
                </div>
            )}
        </div>
    );
};

ProxySelector.propTypes = {
    onProxyChange: PropTypes.func.isRequired,
    defaultOption: PropTypes.string,
    /** Optional proxy_info from API response — adds status badge */
    proxyInfo: PropTypes.shape({
        status: PropTypes.string,
        type: PropTypes.string,
        host: PropTypes.string,
        port: PropTypes.number,
        authenticated: PropTypes.bool,
        country: PropTypes.string,
        countryCode: PropTypes.string,
        city: PropTypes.string,
        ip: PropTypes.string,
        responseTime: PropTypes.number,
        egress_verified: PropTypes.bool,
    }),
};

export default ProxySelector;
