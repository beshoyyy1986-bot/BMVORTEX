/** IPv4 string → true only if publicly routable (rejects private/reserved/multicast/link-local/bogon ranges). */

export function isValidPublicIPv4(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip).trim());
  if (!m) return false;
  const parts = m.slice(1, 5).map(Number);
  if (parts.some((n) => n > 255 || n < 0)) return false;
  const [a, b, c, d] = parts;

  if (a === 0) return false;
  if (a === 10) return false;
  if (a === 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 192 && b === 0 && c === 0) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a >= 224 && a <= 239) return false;
  if (a >= 240) return false;
  if (a === 255 && b === 255 && c === 255 && d === 255) return false;

  return true;
}

export const COMMON_PROXY_PORTS = [80, 443, 1080, 1081, 3128, 8000, 8001, 8080, 8081, 8118, 8888, 9050, 8443];

/** Weighted random pick from common proxy protocols when mode is Auto */
const AUTO_PROTOCOLS = [
  ["http", 0.35],
  ["https", 0.25],
  ["socks5", 0.25],
  ["socks4", 0.15],
];

export function pickAutoProtocolGuess() {
  const r = Math.random();
  let acc = 0;
  for (const [p, w] of AUTO_PROTOCOLS) {
    acc += w;
    if (r <= acc) return p;
  }
  return "http";
}

/** Normalize protocol label from URL */
function normalizeProtocolLabel(raw) {
  const p = String(raw || "").toLowerCase().replace(/:$/, "");
  if (p === "socks5") return "socks5";
  if (p === "socks4") return "socks4";
  if (p === "https") return "https";
  if (p === "http") return "http";
  return null;
}

/**
 * Parse lines: ip:port, protocol://ip:port, user:pass@ip:port, protocol://user:pass@ip:port
 * Returns { protocol_guess, host, port, username?, password?, source }
 */
export function parseProxyLine(line, sourceTag = "paste", options = {}) {
  const validatePublicIp = options.validatePublicIp !== false;
  const s = String(line).trim();
  if (!s) return null;

  let protocol_guess = "http";
  let rest = s;

  const protoMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//.exec(rest);
  if (protoMatch) {
    const norm = normalizeProtocolLabel(protoMatch[1]);
    if (norm) protocol_guess = norm;
    rest = rest.slice(protoMatch[0].length);
  }

  let username;
  let password;
  const atIdx = rest.lastIndexOf("@");
  let hostPart = rest;
  if (atIdx !== -1) {
    const auth = rest.slice(0, atIdx);
    hostPart = rest.slice(atIdx + 1);
    const colonAuth = auth.indexOf(":");
    if (colonAuth === -1) {
      username = auth;
    } else {
      username = auth.slice(0, colonAuth);
      password = auth.slice(colonAuth + 1);
    }
  }

  hostPart = hostPart.replace(/^\[/, "").replace(/\]$/, "");

  const lastColon = hostPart.lastIndexOf(":");
  if (lastColon === -1) return null;
  const host = hostPart.slice(0, lastColon).trim();
  const portStr = hostPart.slice(lastColon + 1).trim();
  const port = Number.parseInt(portStr, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) return null;
  if (validatePublicIp && !isValidPublicIPv4(host)) return null;

  return {
    protocol_guess,
    host,
    port,
    ...(username != null && username !== "" ? { username } : {}),
    ...(password != null && password !== "" ? { password } : {}),
    source: sourceTag,
  };
}

export function parseProxyText(text, sourceTag = "paste", options = {}) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  for (const line of lines) {
    const parsed = parseProxyLine(line, sourceTag, options);
    if (parsed) out.push(parsed);
  }
  return out;
}

export function dedupeCandidates(list, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const k = keyFn(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

export function candidateKey(c) {
  const u = c.username ?? "";
  const p = c.password ?? "";
  return `${c.host || c.ip}:${c.port}:${u}:${p}`;
}

/** Generator row shape */
export function computeGeneratorScore({ protocolGuess, mode, usedRandomHighPort, portIsCommon }) {
  let score = 35;
  if (portIsCommon) score += 28;
  else if (usedRandomHighPort) score += 8;
  else score += 18;

  if (protocolGuess && protocolGuess !== "auto") score += 12;
  else score += 6;

  if (mode === "Conservative") score += usedRandomHighPort ? -12 : 18;
  else if (mode === "Balanced") score += usedRandomHighPort ? -4 : 10;
  else if (mode === "Aggressive") score += usedRandomHighPort ? 4 : 6;

  return Math.min(98, Math.max(12, Math.round(score)));
}

export function randomPublicIPv4(maxAttempts = 80) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const a = Math.floor(Math.random() * 256);
    const b = Math.floor(Math.random() * 256);
    const c = Math.floor(Math.random() * 256);
    const d = Math.floor(Math.random() * 256);
    const ip = `${a}.${b}.${c}.${d}`;
    if (isValidPublicIPv4(ip)) return ip;
  }
  return null;
}

export function pickGeneratorPort({ selectedPorts, allowRandomHigh, mode }) {
  const ports = Array.isArray(selectedPorts) ? selectedPorts.filter((p) => Number.isFinite(p)) : [];
  if (!ports.length && !allowRandomHigh) return null;

  const useRandomHigh =
    allowRandomHigh &&
    (mode === "Aggressive" || (mode === "Balanced" && Math.random() < 0.35) || (mode === "Conservative" && Math.random() < 0.08));

  if (useRandomHigh && Math.random() < (mode === "Aggressive" ? 0.55 : mode === "Balanced" ? 0.35 : 0.15)) {
    return { port: Math.floor(Math.random() * (65535 - 1024 + 1)) + 1024, usedRandomHigh: true };
  }

  if (!ports.length) {
    return { port: COMMON_PROXY_PORTS[Math.floor(Math.random() * COMMON_PROXY_PORTS.length)], usedRandomHigh: false };
  }

  return { port: ports[Math.floor(Math.random() * ports.length)], usedRandomHigh: false };
}

export function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function candidatesToCsv(rows, columns) {
  const cols = columns || ["ip", "host", "port", "protocol_guess", "score", "status", "source_strategy", "source"];
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = cols.join(",");
  const lines = rows.map((r) => cols.map((c) => esc(r[c])).join(","));
  return [header, ...lines].join("\n");
}

export function formatCandidateLine(c) {
  const host = c.host || c.ip;
  const auth =
    c.username != null && c.username !== ""
      ? `${encodeURIComponent(c.username)}:${encodeURIComponent(c.password ?? "")}@`
      : "";
  const proto = c.protocol_guess && c.protocol_guess !== "auto" ? `${c.protocol_guess}://` : "";
  return `${proto}${auth}${host}:${c.port}`;
}
