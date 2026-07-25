import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { checkProxiesViaApi, fetchProxiesViaApi } from "../api/proxyApi";
import {
  COMMON_PROXY_PORTS,
  candidateKey,
  candidatesToCsv,
  computeGeneratorScore,
  dedupeCandidates,
  downloadTextFile,
  formatCandidateLine,
  parseProxyLine,
  parseProxyText,
  pickAutoProtocolGuess,
  pickGeneratorPort,
  randomPublicIPv4,
} from "../lib/proxyCandidateUtils";

const QUANTITY_PRESETS = [100, 500, 1000, 5000];
const PROTOCOL_MODES = ["Auto", "HTTP", "HTTPS", "SOCKS4", "SOCKS5"];
const FETCH_PROTOCOL_FILTERS = ["All", "HTTP", "HTTPS", "SOCKS4", "SOCKS5"];

function isWorkingRow(r) {
  return String(r?.status ?? "").toLowerCase() === "working";
}

function chipClass(active) {
  return `rounded-full border px-3 py-1 text-xs font-semibold transition ${
    active ? "border-blue-400/60 bg-blue-500/20 text-blue-100" : "border-white/15 bg-black/20 text-slate-400 hover:border-white/25"
  }`;
}

function cardShell(title, children) {
  return (
    <div className="flex min-h-0 flex-col rounded-2xl border border-blue-400/20 bg-[#0f151c] p-4 shadow-inner">
      <h4 className="mb-3 shrink-0 text-base font-bold text-blue-200">{title}</h4>
      <div className="min-h-0 flex-1 space-y-3 overflow-hidden">{children}</div>
    </div>
  );
}

function mapUiProtocolToGuess(ui) {
  if (ui === "Auto") return null;
  return ui.toLowerCase();
}

function matchesProtocolFilter(row, filter) {
  if (filter === "All") return true;
  const g = String(row.protocol_guess || "http").toLowerCase();
  return g === filter.toLowerCase();
}

export default function ProxyToolsModal({ onClose, closeLabel }) {
  const [genQuantityPreset, setGenQuantityPreset] = useState(500);
  const [genQuantityCustom, setGenQuantityCustom] = useState("");
  const [genMode, setGenMode] = useState("Balanced");
  const [genProtocolUi, setGenProtocolUi] = useState("Auto");
  const [genSelectedPorts, setGenSelectedPorts] = useState(() => new Set(COMMON_PROXY_PORTS));
  const [genAllowRandomHigh, setGenAllowRandomHigh] = useState(false);
  const [generatedRows, setGeneratedRows] = useState([]);

  const [fetchUrls, setFetchUrls] = useState("");
  const [fetchPaste, setFetchPaste] = useState("");
  const [fetchQtyLimit, setFetchQtyLimit] = useState(2000);
  const [fetchTimeout, setFetchTimeout] = useState(15000);
  const [fetchProtoFilter, setFetchProtoFilter] = useState("All");
  const [fetchDedupe, setFetchDedupe] = useState(true);
  const [fetchValidateIp, setFetchValidateIp] = useState(true);
  const [fetchedRows, setFetchedRows] = useState([]);
  const [fetchCorsNote, setFetchCorsNote] = useState(false);
  const [fetchBackendMsg, setFetchBackendMsg] = useState("");

  const [checkerInput, setCheckerInput] = useState("");
  const [checkerConcurrency, setCheckerConcurrency] = useState(5);
  const [checkerTimeout, setCheckerTimeout] = useState(8000);
  const [checkerProtoMode, setCheckerProtoMode] = useState("Auto");
  const [checkerResults, setCheckerResults] = useState([]);
  const [checkerWorking, setCheckerWorking] = useState(false);
  const [checkerBanner, setCheckerBanner] = useState("");
  const [selectedQueueKeys, setSelectedQueueKeys] = useState(() => new Set());
  const abortRef = useRef(null);

  const checkerQueue = useMemo(() => {
    const lines = checkerInput.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines
      .map((line, idx) => {
        const parsed = parseProxyLine(line, `checker_${idx}`, { validatePublicIp: false });
        if (!parsed) return null;
        return {
          lineKey: String(idx),
          host: parsed.host,
          port: parsed.port,
          protocol: parsed.protocol_guess,
          username: parsed.username,
          password: parsed.password,
          raw: line,
        };
      })
      .filter(Boolean);
  }, [checkerInput]);

  useEffect(() => {
    setSelectedQueueKeys(new Set(checkerQueue.map((q) => q.lineKey)));
  }, [checkerInput, checkerQueue]);

  const genQuantity = useMemo(() => {
    if (genQuantityCustom.trim()) {
      const n = Number.parseInt(genQuantityCustom, 10);
      return Number.isFinite(n) ? Math.min(Math.max(n, 1), 50000) : genQuantityPreset;
    }
    return genQuantityPreset;
  }, [genQuantityCustom, genQuantityPreset]);

  const toggleGenPort = useCallback((p) => {
    setGenSelectedPorts((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }, []);

  const handleGenerate = useCallback(() => {
    const selectedPorts = [...genSelectedPorts];
    const rows = [];
    const protoResolved =
      genProtocolUi === "Auto"
        ? () => pickAutoProtocolGuess()
        : () => mapUiProtocolToGuess(genProtocolUi) || "http";

    for (let i = 0; i < genQuantity; i += 1) {
      const ip = randomPublicIPv4();
      if (!ip) continue;
      const picked = pickGeneratorPort({
        selectedPorts,
        allowRandomHigh: genAllowRandomHigh,
        mode: genMode,
      });
      if (!picked) continue;
      const { port, usedRandomHigh } = picked;
      const protocol_guess = protoResolved();
      const portIsCommon = COMMON_PROXY_PORTS.includes(port);
      const score = computeGeneratorScore({
        protocolGuess: protocol_guess,
        mode: genMode,
        usedRandomHighPort: usedRandomHigh,
        portIsCommon,
      });
      rows.push({
        id: `${ip}-${port}-${i}-${crypto.randomUUID?.() ?? Date.now()}`,
        ip,
        port,
        protocol_guess,
        source_strategy: `smart_${genMode.toLowerCase()}_${genProtocolUi.toLowerCase()}`,
        score,
        status: "unverified",
      });
    }
    setGeneratedRows(rows);
  }, [genQuantity, genMode, genProtocolUi, genSelectedPorts, genAllowRandomHigh]);

  const appendCheckerLines = useCallback((lines) => {
    const normalized = lines.filter(Boolean);
    if (!normalized.length) return;
    setCheckerInput((prev) => {
      const parts = prev.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      return [...parts, ...normalized].join("\n");
    });
  }, []);

  const sendGeneratedToChecker = useCallback(() => {
    const lines = generatedRows.map((r) => formatCandidateLine({ host: r.ip, port: r.port, protocol_guess: r.protocol_guess }));
    appendCheckerLines(lines);
  }, [generatedRows, appendCheckerLines]);

  const sendFetchedToChecker = useCallback(() => {
    const lines = fetchedRows.map((r) =>
      formatCandidateLine({
        host: r.host,
        port: r.port,
        protocol_guess: r.protocol_guess,
        username: r.username,
        password: r.password,
      })
    );
    appendCheckerLines(lines);
  }, [fetchedRows, appendCheckerLines]);

  const exportGenerated = useCallback(() => {
    if (!generatedRows.length) return;
    const csv = candidatesToCsv(
      generatedRows.map((r) => ({
        ip: r.ip,
        host: r.ip,
        port: r.port,
        protocol_guess: r.protocol_guess,
        score: r.score,
        status: r.status,
        source_strategy: r.source_strategy,
        source: "generator",
      }))
    );
    downloadTextFile(`vortex-proxy-candidates-${Date.now()}.csv`, csv);
  }, [generatedRows]);

  const exportFetched = useCallback(() => {
    if (!fetchedRows.length) return;
    const csv = candidatesToCsv(
      fetchedRows.map((r) => ({
        ip: r.host,
        host: r.host,
        port: r.port,
        protocol_guess: r.protocol_guess,
        status: r.status || "unverified",
        source_strategy: "",
        source: r.source || "fetcher",
      }))
    );
    downloadTextFile(`vortex-proxy-fetched-${Date.now()}.csv`, csv);
  }, [fetchedRows]);

  const normalizeFetcherInputs = useCallback(() => {
    const opts = { validatePublicIp: fetchValidateIp };
    const fromPaste = parseProxyText(fetchPaste, "manual_paste", opts);
    let merged = [...fromPaste];
    if (fetchDedupe) merged = dedupeCandidates(merged, candidateKey);
    if (fetchProtoFilter !== "All") merged = merged.filter((r) => matchesProtocolFilter(r, fetchProtoFilter));
    const lim = Math.min(Math.max(Number(fetchQtyLimit) || 0, 1), 50000);
    merged = merged.slice(0, lim);
    merged = merged.map((r) => ({ ...r, status: "unverified" }));
    setFetchedRows(merged);
    setFetchBackendMsg(`Normalized ${merged.length} candidate(s) locally.`);
  }, [fetchPaste, fetchDedupe, fetchProtoFilter, fetchQtyLimit, fetchValidateIp]);

  const handleFetchFromUrls = useCallback(async () => {
    const urls = fetchUrls.split(/\r?\n/).map((u) => u.trim()).filter(Boolean);
    setFetchCorsNote(false);
    if (!urls.length) {
      setFetchBackendMsg("Add at least one URL (one per line) to fetch remotely.");
      return;
    }
    setFetchBackendMsg("");
    const res = await fetchProxiesViaApi({
      urls,
      quantityLimit: fetchQtyLimit,
      timeoutMs: fetchTimeout,
      protocolFilter: fetchProtoFilter,
      dedupe: fetchDedupe,
      validateIpRanges: fetchValidateIp,
    });
    if (!res.ok) {
      if (res.missing) {
        setFetchCorsNote(true);
        setFetchedRows([]);
        setFetchBackendMsg("Configure POST /api/proxy/fetch on your server. See contract in src/api/proxyApi.js.");
      } else {
        setFetchBackendMsg(res.error || "Fetch failed.");
      }
      return;
    }
    const list = (res.data?.candidates || []).map((c) => ({
      ...c,
      status: c.status || "unverified",
    }));
    setFetchedRows(list);
    setFetchBackendMsg(`Fetched ${list.length} candidate(s) from backend.`);
  }, [fetchUrls, fetchQtyLimit, fetchTimeout, fetchProtoFilter, fetchDedupe, fetchValidateIp]);

  const toggleQueueKey = useCallback((key) => {
    setSelectedQueueKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const stopChecker = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = null;
    setCheckerWorking(false);
  }, []);

  const runChecker = useCallback(
    async (onlySelected) => {
      if (!checkerQueue.length) {
        setCheckerBanner("Add at least one parseable proxy line (for example host:port).");
        return;
      }

      const payloadList = onlySelected ? checkerQueue.filter((q) => selectedQueueKeys.has(q.lineKey)) : checkerQueue;

      if (!payloadList.length) {
        setCheckerBanner("Select at least one queued line to check.");
        return;
      }

      setCheckerBanner("Real connectivity checks require a backend. Rows show pending_backend until POST /api/proxy/check returns live results.");
      setCheckerWorking(true);
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const { signal } = abortRef.current;

      const protoPayload = checkerProtoMode === "Auto" ? "Auto" : checkerProtoMode;

      let res = { ok: false, error: "Request failed before response." };
      try {
        res = await checkProxiesViaApi(
          {
            proxies: payloadList.map((p) => ({
              host: p.host,
              port: p.port,
              protocol: p.protocol,
              username: p.username,
              password: p.password,
            })),
            concurrency: checkerConcurrency,
            timeoutMs: checkerTimeout,
            protocolMode: protoPayload,
          },
          { signal }
        );
      } finally {
        setCheckerWorking(false);
      }

      if (res.aborted || signal.aborted) return;

      if (!res.ok) {
        setCheckerResults(
          payloadList.map((p, i) => ({
            key: `${p.host}:${p.port}:${p.lineKey}:${i}`,
            host: p.host,
            port: p.port,
            detectedProtocol: "",
            status: "pending_backend",
            country: "",
            city: "",
            isp: "",
            asn: "",
            latencyMs: "",
            anonymity: "",
            lastChecked: "",
            error: res.error || "Backend unavailable",
          }))
        );
        return;
      }

      const rows = Array.isArray(res.data?.results) ? res.data.results : [];
      setCheckerResults(
        rows.map((r, i) => ({
          key: `${r.host}:${r.port}:${i}`,
          host: r.host,
          port: r.port,
          detectedProtocol: r.detectedProtocol ?? r.detected_protocol ?? "",
          status: r.status || "unknown",
          country: r.country ?? "",
          city: r.city ?? "",
          isp: r.isp ?? "",
          asn: r.asn ?? "",
          latencyMs: r.latencyMs ?? "",
          anonymity: r.anonymity ?? "",
          lastChecked: r.lastChecked ?? "",
          error: r.error ?? "",
        }))
      );
    },
    [checkerConcurrency, checkerProtoMode, checkerQueue, checkerTimeout, selectedQueueKeys]
  );

  const copyWorking = useCallback(async () => {
    const lines = checkerResults.filter(isWorkingRow).map((r) => `${r.host}:${r.port}`);
    if (!lines.length) {
      setCheckerBanner("No working proxies to copy.");
      return;
    }
    await navigator.clipboard.writeText(lines.join("\n"));
    setCheckerBanner("Working proxies copied.");
  }, [checkerResults]);

  const exportWorking = useCallback(() => {
    const rows = checkerResults.filter(isWorkingRow);
    if (!rows.length) return;
    const csv = candidatesToCsv(
      rows.map((r) => ({
        host: r.host,
        ip: r.host,
        port: r.port,
        status: r.status,
        country: r.country,
        city: r.city,
        isp: r.isp,
        asn: r.asn,
        latencyMs: r.latencyMs,
      })),
      ["host", "port", "status", "country", "city", "isp", "asn", "latencyMs"]
    );
    downloadTextFile(`vortex-working-proxies-${Date.now()}.csv`, csv);
  }, [checkerResults]);

  const clearDead = useCallback(() => {
    const drop = new Set(["dead", "timeout", "invalid", "unknown_protocol"]);
    setCheckerResults((prev) => prev.filter((r) => !drop.has(String(r.status).toLowerCase())));
  }, []);

  return (
    <div className="flex max-h-[85vh] w-full max-w-[1100px] flex-col overflow-hidden rounded-2xl border border-blue-400/25 bg-[#141a22] shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
      <div className="shrink-0 border-b border-white/10 px-5 py-4 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-2xl font-black text-blue-200">Proxy Tools</h3>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">Generate, fetch, normalize, and verify proxy candidates.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-300">
            {closeLabel}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {/* Card 1 — Smart Generator */}
          <div className="xl:col-span-1">
            {cardShell(
              "Smart Generator",
              <>
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Quantity</div>
                  <div className="flex flex-wrap gap-2">
                    {QUANTITY_PRESETS.map((q) => (
                      <button key={q} type="button" className={chipClass(genQuantityPreset === q && !genQuantityCustom.trim())} onClick={() => { setGenQuantityPreset(q); setGenQuantityCustom(""); }}>
                        {q}
                      </button>
                    ))}
                  </div>
                  <label className="mt-2 block text-xs text-slate-400">
                    Custom
                    <input value={genQuantityCustom} onChange={(e) => setGenQuantityCustom(e.target.value)} placeholder="e.g. 2500" className="mt-1 w-full rounded-xl border border-blue-400/15 bg-black/25 px-3 py-2 text-sm text-slate-100" />
                  </label>
                </div>

                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Mode</div>
                  <div className="flex flex-wrap gap-2">
                    {["Conservative", "Balanced", "Aggressive"].map((m) => (
                      <button key={m} type="button" className={chipClass(genMode === m)} onClick={() => setGenMode(m)}>
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Protocol guess</div>
                  <div className="flex flex-wrap gap-2">
                    {PROTOCOL_MODES.map((p) => (
                      <button key={p} type="button" className={chipClass(genProtocolUi === p)} onClick={() => setGenProtocolUi(p)}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ports</span>
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
                      <input type="checkbox" checked={genAllowRandomHigh} onChange={(e) => setGenAllowRandomHigh(e.target.checked)} />
                      Allow random high ports (low confidence)
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {COMMON_PROXY_PORTS.map((p) => (
                      <button key={p} type="button" className={chipClass(genSelectedPorts.has(p))} onClick={() => toggleGenPort(p)}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <p className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-100/90">Generated candidates are not working proxies until checked.</p>

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={handleGenerate} className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-bold text-white">
                    Generate
                  </button>
                  <button type="button" onClick={sendGeneratedToChecker} className="rounded-xl border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-100">
                    Send to Checker
                  </button>
                  <button type="button" onClick={exportGenerated} className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200">
                    Export Candidates
                  </button>
                  <button type="button" onClick={() => setGeneratedRows([])} className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200">
                    Clear
                  </button>
                </div>

                <div className="max-h-52 overflow-auto rounded-xl border border-blue-400/15 bg-black/20">
                  <table className="w-full min-w-[420px] text-left text-[11px] text-slate-200">
                    <thead className="sticky top-0 bg-[#151c24] text-slate-400">
                      <tr>
                        <th className="px-2 py-2">IP</th>
                        <th className="px-2 py-2">Port</th>
                        <th className="px-2 py-2">Protocol</th>
                        <th className="px-2 py-2">Score</th>
                        <th className="px-2 py-2">Status</th>
                        <th className="px-2 py-2"> </th>
                      </tr>
                    </thead>
                    <tbody>
                      {generatedRows.slice(0, 400).map((r) => (
                        <tr key={r.id} className="border-t border-white/5">
                          <td className="px-2 py-1 font-mono">{r.ip}</td>
                          <td className="px-2 py-1 font-mono">{r.port}</td>
                          <td className="px-2 py-1">{r.protocol_guess}</td>
                          <td className="px-2 py-1">{r.score}</td>
                          <td className="px-2 py-1 text-slate-400">{r.status}</td>
                          <td className="px-2 py-1">
                            <button type="button" className="text-[10px] text-red-300 hover:text-red-200" onClick={() => setGeneratedRows((prev) => prev.filter((x) => x.id !== r.id))}>
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {generatedRows.length > 400 && <div className="border-t border-white/10 px-2 py-1 text-[10px] text-slate-500">Showing first 400 rows ({generatedRows.length} total).</div>}
                </div>
              </>
            )}
          </div>

          {/* Card 2 — Proxy Fetcher */}
          <div className="xl:col-span-1">
            {cardShell(
              "Proxy Fetcher",
              <>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Public URLs (one per line)
                  <textarea value={fetchUrls} onChange={(e) => setFetchUrls(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-blue-400/15 bg-black/25 px-3 py-2 text-xs text-slate-100" placeholder={"https://example.com/list.txt"} />
                </label>

                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Manual paste
                  <textarea value={fetchPaste} onChange={(e) => setFetchPaste(e.target.value)} rows={4} className="mt-1 w-full rounded-xl border border-blue-400/15 bg-black/25 px-3 py-2 text-xs text-slate-100" placeholder={"203.0.113.10:8080\nsocks5://user:pass@198.51.100.2:1080"} />
                </label>

                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
                  <label className="flex flex-col gap-1">
                    File import (.txt)
                    <input
                      type="file"
                      accept=".txt"
                      className="text-[11px]"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => setFetchPaste((p) => `${p}\n${reader.result}`.trim());
                        reader.readAsText(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-slate-400">
                    Quantity limit
                    <input type="number" min={1} value={fetchQtyLimit} onChange={(e) => setFetchQtyLimit(e.target.value)} className="mt-1 w-full rounded-xl border border-blue-400/15 bg-black/25 px-3 py-2 text-sm text-slate-100" />
                  </label>
                  <label className="text-xs text-slate-400">
                    Timeout (ms)
                    <input type="number" min={1000} value={fetchTimeout} onChange={(e) => setFetchTimeout(e.target.value)} className="mt-1 w-full rounded-xl border border-blue-400/15 bg-black/25 px-3 py-2 text-sm text-slate-100" />
                  </label>
                </div>

                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Protocol filter</div>
                  <select value={fetchProtoFilter} onChange={(e) => setFetchProtoFilter(e.target.value)} className="w-full rounded-xl border border-blue-400/15 bg-black/25 px-3 py-2 text-sm text-slate-100">
                    {FETCH_PROTOCOL_FILTERS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap gap-4 text-xs text-slate-300">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={fetchDedupe} onChange={(e) => setFetchDedupe(e.target.checked)} />
                    Deduplicate
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={fetchValidateIp} onChange={(e) => setFetchValidateIp(e.target.checked)} />
                    Validate public IPv4 ranges
                  </label>
                </div>

                {fetchCorsNote && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                    External fetching requires a backend proxy/API route because browsers block many public sources by CORS.
                  </div>
                )}
                {fetchBackendMsg && <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs text-blue-100">{fetchBackendMsg}</div>}

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={handleFetchFromUrls} className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-bold text-white">
                    Fetch Candidates
                  </button>
                  <button type="button" onClick={normalizeFetcherInputs} className="rounded-xl border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-100">
                    Normalize &amp; Clean
                  </button>
                  <button type="button" onClick={sendFetchedToChecker} className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-semibold text-green-100">
                    Send to Checker
                  </button>
                  <button type="button" onClick={exportFetched} className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200">
                    Export Fetched Candidates
                  </button>
                </div>

                <div className="max-h-40 overflow-auto rounded-xl border border-blue-400/15 bg-black/20 p-2 text-[11px] text-slate-300">
                  {fetchedRows.length === 0 ? <div className="text-slate-500">No fetched candidates yet.</div> : fetchedRows.slice(0, 120).map((r, idx) => (
                    <div key={`${candidateKey(r)}-${idx}`} className="border-b border-white/5 py-1 font-mono text-[10px]">
                      {formatCandidateLine(r)} · {r.status}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Card 3 — Proxy Checker */}
          <div className="md:col-span-2 xl:col-span-1">
            {cardShell(
              "Proxy Checker",
              <>
                <div className="rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
                  Backend required for real checking. The UI calls POST /api/proxy/check; without it, rows show pending_backend — browser-only TCP/SOCKS tests are not performed here.
                </div>
                {checkerBanner && <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs text-blue-100">{checkerBanner}</div>}

                <textarea value={checkerInput} onChange={(e) => setCheckerInput(e.target.value)} rows={5} className="w-full rounded-xl border border-blue-400/15 bg-black/25 px-3 py-2 text-xs text-slate-100" placeholder={"Host:port per line (paste from generator/fetcher)"} />

                {checkerQueue.length > 0 && (
                  <div className="max-h-28 overflow-y-auto rounded-xl border border-white/10 bg-black/20 px-2 py-2">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Queued lines (Check Selected uses ticks)</div>
                    <div className="space-y-1">
                      {checkerQueue.map((q) => (
                        <label key={`${q.lineKey}-${q.raw}`} className="flex cursor-pointer items-start gap-2 text-[10px] text-slate-300">
                          <input type="checkbox" className="mt-0.5" checked={selectedQueueKeys.has(q.lineKey)} onChange={() => toggleQueueKey(q.lineKey)} />
                          <span className="font-mono leading-snug">{q.raw}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <label className="text-xs text-slate-400">
                    Concurrency
                    <input type="number" min={1} max={50} value={checkerConcurrency} onChange={(e) => setCheckerConcurrency(e.target.value)} className="mt-1 w-full rounded-xl border border-blue-400/15 bg-black/25 px-2 py-2 text-sm" />
                  </label>
                  <label className="text-xs text-slate-400">
                    Timeout (ms)
                    <input type="number" min={500} value={checkerTimeout} onChange={(e) => setCheckerTimeout(e.target.value)} className="mt-1 w-full rounded-xl border border-blue-400/15 bg-black/25 px-2 py-2 text-sm" />
                  </label>
                  <label className="text-xs text-slate-400">
                    Protocol mode
                    <select value={checkerProtoMode} onChange={(e) => setCheckerProtoMode(e.target.value)} className="mt-1 w-full rounded-xl border border-blue-400/15 bg-black/25 px-2 py-2 text-sm text-slate-100">
                      {PROTOCOL_MODES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={checkerWorking} onClick={() => runChecker(true)} className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                    Check Selected
                  </button>
                  <button type="button" disabled={checkerWorking} onClick={() => runChecker(false)} className="rounded-xl border border-blue-400/35 bg-blue-500/15 px-4 py-2 text-sm font-semibold text-blue-100 disabled:opacity-50">
                    Check All
                  </button>
                  <button type="button" onClick={stopChecker} className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200">
                    Stop
                  </button>
                  <button type="button" onClick={copyWorking} className="rounded-xl border border-green-500/35 bg-green-500/10 px-4 py-2 text-sm font-semibold text-green-100">
                    Copy Working
                  </button>
                  <button type="button" onClick={exportWorking} className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200">
                    Export Working
                  </button>
                  <button type="button" onClick={clearDead} className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200">
                    Clear Dead
                  </button>
                </div>

                <div className="max-h-56 overflow-auto rounded-xl border border-blue-400/15 bg-black/20">
                  <table className="w-full min-w-[640px] text-left text-[10px] text-slate-200">
                    <thead className="sticky top-0 bg-[#151c24] text-slate-400">
                      <tr>
                        <th className="px-1 py-2">Host</th>
                        <th className="px-1 py-2">Port</th>
                        <th className="px-1 py-2">Detected protocol</th>
                        <th className="px-1 py-2">Status</th>
                        <th className="px-1 py-2">Country</th>
                        <th className="px-1 py-2">City</th>
                        <th className="px-1 py-2">ISP/ASN</th>
                        <th className="px-1 py-2">Latency</th>
                        <th className="px-1 py-2">Anon</th>
                        <th className="px-1 py-2">Checked</th>
                        <th className="px-1 py-2">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {checkerResults.map((r) => (
                        <tr key={r.key} className="border-t border-white/5">
                          <td className="px-1 py-1 font-mono">{r.host}</td>
                          <td className="px-1 py-1 font-mono">{r.port}</td>
                          <td className="px-1 py-1">{r.detectedProtocol || "—"}</td>
                          <td className="px-1 py-1">{r.status}</td>
                          <td className="px-1 py-1">{r.country}</td>
                          <td className="px-1 py-1">{r.city}</td>
                          <td className="px-1 py-1">
                            {r.isp}
                            {r.asn ? ` / ${r.asn}` : ""}
                          </td>
                          <td className="px-1 py-1">{r.latencyMs}</td>
                          <td className="px-1 py-1">{r.anonymity}</td>
                          <td className="px-1 py-1">{r.lastChecked}</td>
                          <td className="px-1 py-1 text-red-300/90">{r.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!checkerResults.length && <div className="px-3 py-6 text-center text-xs text-slate-500">No check results yet.</div>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

ProxyToolsModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  closeLabel: PropTypes.string.isRequired,
};
