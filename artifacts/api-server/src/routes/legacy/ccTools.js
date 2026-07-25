/**
 * Vortex CC Tools — BIN Checker proxy
 * Tries multiple sources and normalises to one shape.
 */
import { Router } from "express";

const router = Router();

/** Normalise binlist.net shape → our shape */
function normaliseBinlist(d, bin) {
  return {
    bin,
    scheme:  d.scheme  || null,
    type:    d.type    || null,
    brand:   d.brand   || null,
    prepaid: d.prepaid != null ? d.prepaid : null,
    country: d.country ? {
      name:     d.country.name     || null,
      alpha2:   d.country.alpha2   || null,
      emoji:    d.country.emoji    || null,
      currency: d.country.currency || null,
      latitude: d.country.latitude || null,
      longitude:d.country.longitude|| null,
    } : null,
    bank: d.bank ? {
      name:  d.bank.name  || null,
      phone: d.bank.phone || null,
      city:  d.bank.city  || null,
      url:   d.bank.url   || null,
    } : null,
    number: d.number ? {
      length: d.number.length || null,
      luhn:   d.number.luhn   != null ? d.number.luhn : null,
    } : null,
  };
}

/** Normalise handyapi.com shape → our shape */
function normaliseHandyapi(d, bin) {
  const country = d.Country || {};
  return {
    bin,
    scheme:  d.Scheme  ? d.Scheme.toLowerCase()  : null,
    type:    d.Type    ? d.Type.toLowerCase()    : null,
    brand:   d.CardTier || d.Scheme || null,
    prepaid: null,
    country: country.Name ? {
      name:     country.Name  || null,
      alpha2:   country.A2    || null,
      emoji:    null,
      currency: null,
      latitude: null,
      longitude:null,
    } : null,
    bank: d.Issuer ? {
      name:  d.Issuer || null,
      phone: null,
      city:  null,
      url:   null,
    } : null,
    number: null,
  };
}

// ── BIN Checker ────────────────────────────────────────────────────────────
router.get("/bin/:bin", async (req, res) => {
  const bin = req.params.bin.replace(/\D/g, "").slice(0, 8);
  if (bin.length < 6) return res.status(400).json({ error: "BIN must be at least 6 digits" });

  // ── 1. Try binlist.net ───────────────────────────────────────────────────
  try {
    const r = await fetch(`https://lookup.binlist.net/${bin}`, {
      headers: {
        "Accept-Version": "3",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; VortexTools/1.0)",
      },
    });

    if (r.ok) {
      const d = await r.json();
      return res.json(normaliseBinlist(d, bin));
    }
    // 429 rate-limit or 404 → fall through to next source
  } catch (_) { /* network error → fall through */ }

  // ── 2. Try handyapi.com ─────────────────────────────────────────────────
  try {
    const r = await fetch(`https://data.handyapi.com/bin/${bin}`, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (r.ok) {
      const d = await r.json();
      if (d.Status === "SUCCESS") {
        return res.json(normaliseHandyapi(d, bin));
      }
    }
  } catch (_) { /* fall through */ }

  // ── 3. Try bincheck.io ──────────────────────────────────────────────────
  try {
    const r = await fetch(`https://api.bintable.com/v1/${bin}?api_key=`, {
      headers: { "Accept": "application/json" },
    });
    if (r.ok) {
      const d = await r.json();
      if (d && d.result) {
        const result = d.result;
        return res.json({
          bin,
          scheme:  result.scheme   ? result.scheme.toLowerCase()  : null,
          type:    result.type     ? result.type.toLowerCase()    : null,
          brand:   result.brand    || null,
          prepaid: result.prepaid  != null ? result.prepaid === "1" : null,
          country: result.country_name ? {
            name:     result.country_name || null,
            alpha2:   result.iso_code     || null,
            emoji:    null,
            currency: result.currency     || null,
            latitude: null,
            longitude:null,
          } : null,
          bank: result.bank ? {
            name:  result.bank  || null,
            phone: null,
            city:  null,
            url:   null,
          } : null,
          number: null,
        });
      }
    }
  } catch (_) { /* fall through */ }

  return res.status(404).json({ error: "BIN not found in any database. Try a different BIN." });
});

export default router;
