/**
 * rulesEngine.js
 * -------------------------------------------------------------------------
 * SIH26034 — Legal Metrology Scanner — Module D (Rules Engine)
 *
 * Consumes the classified, row-grouped OCR blocks produced by your existing
 * classify.js + rowGrouping.js pipeline, and checks them against:
 *
 *   - Rule 6, Legal Metrology (Packaged Commodities) Rules, 2011
 *     -> WHICH declarations must be present, and whether their content is
 *        well-formed (Rule 6(1)(a)/(aa)/(b)/(c)/(d)/(da)/(e)/(f), Rule 6(2))
 *
 *   - Rule 7, Legal Metrology (Packaged Commodities) Rules, 2011
 *     -> minimum font HEIGHT for declarations, scaled to the Principal
 *        Display Panel (PDP) area (Table-I)
 *
 * INPUT SHAPE EXPECTED (matches what your classify.js + rowGrouping.js
 * already produce — adjust field names if yours differ slightly):
 *
 *   blocks: [
 *     {
 *       text: "MRP Rs. 45.00 (incl. of all taxes)",
 *       category: "mrp",              // one of your existing categories
 *       confidence: 92,                // 0-100, from classify.js
 *       fontHeightMm: 2.1,              // from your Module A estimator
 *       bbox: { x, y, width, height }   // pixel bbox, optional but useful
 *     },
 *     ...
 *   ]
 *
 * OPTIONS (things the OCR pipeline genuinely cannot know from the photo
 * alone — ask the user/officer at upload time via 2-3 quick form fields,
 * this is a FEATURE not a limitation: real inspectors already triage by
 * product type):
 *
 *   {
 *     isImported: false,        // -> makes country_of_origin mandatory
 *     isPerishable: true,       // -> makes expiry_date mandatory
 *     isSizeRelevant: false,    // -> makes dimensions mandatory
 *     pdpAreaCm2: null,         // known PDP area in cm^2, if measured/entered
 *     imageWidthPx, imageHeightPx, assumedCaptureWidthCm  // fallback estimate
 *   }
 *
 * OUTPUT SHAPE:
 *
 *   {
 *     summary: { total, passed, hardViolations, formatViolations,
 *                fontViolations, warnings, notApplicable, compliancePct },
 *     results: [ { ruleRef, category, label, status, severity, message,
 *                  evidence } , ... ]
 *   }
 *
 * Severity levels:
 *   HARD        -> declaration completely missing (Rule 6 presence failure)
 *   FORMAT      -> present but malformed / incomplete content
 *   FONT        -> present & well-formed, but below Rule 7 minimum height
 *   WARNING     -> present, plausible, but low OCR confidence — needs human
 *                  review, not auto-flagged as a violation
 *   NOT_APPLICABLE -> conditional declaration not required for this product
 * -------------------------------------------------------------------------
 */

// ---------------------------------------------------------------------
// Rule 7, Table-I — minimum numeral/letter height (mm) by PDP area (cm^2)
// ---------------------------------------------------------------------
const PDP_FONT_TABLE = [
  { maxArea: 50, normal: 1.0, molded: 1.5 },
  { maxArea: 100, normal: 1.5, molded: 3.0 },
  { maxArea: 500, normal: 2.5, molded: 4.0 },
  { maxArea: 2500, normal: 4.0, molded: 6.0 },
  { maxArea: Infinity, normal: 6.0, molded: 6.0 },
];

function getMinFontHeightMm(pdpAreaCm2, isMolded = false) {
  const row = PDP_FONT_TABLE.find((r) => pdpAreaCm2 < r.maxArea);
  return isMolded ? row.molded : row.normal;
}

// Rule 7(5): the font-size requirement is scoped to these declaration
// categories specifically (net qty, MRP, date, consumer care) — this
// matches the "numerals" the Act actually cares about enforcing on size.
const FONT_CHECKED_CATEGORIES = new Set([
  "mrp",
  "net_quantity",
  "mfg_date",
  "expiry_date",
  "consumer_care",
]);

// ---------------------------------------------------------------------
// Rule 6(1) — declaration checklist. Each entry maps a legal requirement
// to your classify.js category name(s) and a content validator.
// ---------------------------------------------------------------------
const DECLARATION_RULES = [
  {
    ruleRef: "Rule 6(1)(a)",
    label: "Manufacturer / packer / importer name & address",
    categories: ["manufacturer_address"],
    required: () => true,
    validate: (text) => {
      const trimmed = text.trim();
      // A real address is rarely under ~15 chars and usually has a pincode.
      const hasPincode = /\b\d{6}\b/.test(trimmed);
      if (trimmed.length < 15) {
        return { ok: false, reason: "Address text too short to be a real address" };
      }
      if (!hasPincode) {
        return { ok: "warn", reason: "No 6-digit PIN code detected — verify manually" };
      }
      return { ok: true };
    },
  },
  {
    ruleRef: "Rule 6(1)(aa)",
    label: "Country of origin",
    categories: ["country_of_origin"],
    required: (opts) => !!opts.isImported,
    validate: (text) => ({ ok: text.trim().length > 1 }),
  },
  {
    ruleRef: "Rule 6(1)(b)",
    label: "Common / generic name of commodity",
    categories: ["generic_name", "product_name"],
    required: () => true,
    validate: (text) => ({ ok: text.trim().length > 1 }),
  },
  {
    ruleRef: "Rule 6(1)(c)",
    label: "Net quantity (weight / volume / number)",
    categories: ["net_quantity"],
    required: () => true,
    validate: (text) => {
      // Must have a number AND a recognized unit (or be a plain count).
      const unitMatch = /(\d+(\.\d+)?)\s*(g|kg|ml|l|gm|gms|kgs|mg|litre|litres|pieces?|pcs?)\b/i.test(text);
      if (!unitMatch) {
        return { ok: false, reason: "No numeric value + recognized unit found" };
      }
      // Rule (Numeration) also bars vague words like 'approx', 'about'.
      if (/\b(approx|about|around|min\.?|minimum)\b/i.test(text)) {
        return { ok: "warn", reason: "Contains a vague quantity qualifier — possible violation" };
      }
      return { ok: true };
    },
  },
  {
    ruleRef: "Rule 6(1)(d)",
    label: "Month & year of manufacture / packing / import",
    categories: ["mfg_date"],
    required: () => true,
    validate: (text) => {
      const hasMonthYear =
        /\b(0?[1-9]|1[0-2])[\/\-.](\d{2,4})\b/.test(text) || // 03/2026
        /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*'?\d{2,4}\b/i.test(text);
      return hasMonthYear
        ? { ok: true }
        : { ok: false, reason: "No recognizable month/year pattern found" };
    },
  },
  {
    ruleRef: "Rule 6(1)(da)",
    label: "Best before / use-by / expiry date",
    categories: ["expiry_date"],
    required: (opts) => opts.isPerishable !== false, // default: assume required unless told otherwise
    validate: (text) => {
      const hasDate =
        /\b(0?[1-9]|[12]\d|3[01])[\/\-.](0?[1-9]|1[0-2])[\/\-.](\d{2,4})\b/.test(text) ||
        /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*'?\d{2,4}\b/i.test(text);
      return hasDate ? { ok: true } : { ok: false, reason: "No recognizable expiry date pattern found" };
    },
  },
  {
    ruleRef: "Rule 6(1)(e)",
    label: "Retail sale price (MRP, inclusive of all taxes)",
    categories: ["mrp"],
    required: () => true,
    validate: (text) => {
      const hasCurrency = /(rs\.?|inr|₹)\s*\d+(\.\d{1,2})?/i.test(text);
      if (!hasCurrency) {
        return { ok: false, reason: "No currency symbol/value detected" };
      }
      const hasInclOfTax = /(incl\.?|inclusive)\s*(of)?\s*(all)?\s*tax(es)?/i.test(text);
      if (!hasInclOfTax) {
        return { ok: "warn", reason: "Missing required 'inclusive of all taxes' wording" };
      }
      return { ok: true };
    },
  },
  {
    ruleRef: "Rule 6(1)(f)",
    label: "Dimensions of the commodity",
    categories: ["dimensions"],
    required: (opts) => !!opts.isSizeRelevant,
    validate: (text) => ({ ok: /\d/.test(text) }),
  },
  {
    ruleRef: "Rule 6(2)",
    label: "Consumer care name, address, phone/email",
    categories: ["consumer_care"],
    required: () => true,
    validate: (text) => {
      const hasPhone = /\b(\+?91[-\s]?)?[6-9]\d{9}\b/.test(text) || /1800[\d\s-]{6,}/.test(text);
      const hasEmail = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(text);
      if (!hasPhone && !hasEmail) {
        return { ok: false, reason: "No phone number or email address detected" };
      }
      return { ok: true };
    },
  },
];

// ---------------------------------------------------------------------
// PDP area estimation fallback (only used if opts.pdpAreaCm2 not given).
// Documented assumption, same spirit as your existing font-height math:
// treats the *photographed frame* as an approximation of the PDP, using
// an assumed real-world capture width. Flag this clearly in the report.
// ---------------------------------------------------------------------
function estimatePdpAreaCm2(opts) {
  if (opts.pdpAreaCm2) return { value: opts.pdpAreaCm2, estimated: false };
  if (!opts.imageWidthPx || !opts.imageHeightPx || !opts.assumedCaptureWidthCm) {
    // Safe fallback: assume a small/medium package (100-500 cm^2 bracket)
    return { value: 100, estimated: true, lowConfidence: true };
  }
  const pxPerCm = opts.imageWidthPx / opts.assumedCaptureWidthCm;
  const widthCm = opts.imageWidthPx / pxPerCm;
  const heightCm = opts.imageHeightPx / pxPerCm;
  return { value: widthCm * heightCm, estimated: true, lowConfidence: false };
}

// ---------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------
function checkCompliance(blocks, opts = {}) {
  const results = [];
  const byCategory = {};
  for (const b of blocks) {
    if (!byCategory[b.category]) byCategory[b.category] = [];
    byCategory[b.category].push(b);
  }

  const { value: pdpArea, estimated: pdpEstimated, lowConfidence } = estimatePdpAreaCm2(opts);

  for (const rule of DECLARATION_RULES) {
    const isRequired = rule.required(opts);
    const matches = rule.categories.flatMap((c) => byCategory[c] || []);

    if (!isRequired) {
      results.push({
        ruleRef: rule.ruleRef,
        label: rule.label,
        status: "NOT_APPLICABLE",
        severity: "NOT_APPLICABLE",
        message: "Not required for this product (per declared product type)",
        evidence: null,
      });
      continue;
    }

    if (matches.length === 0) {
      results.push({
        ruleRef: rule.ruleRef,
        label: rule.label,
        status: "MISSING",
        severity: "HARD",
        message: `${rule.label} not found on the label`,
        evidence: null,
      });
      continue;
    }

    // Use the highest-confidence match for content validation
    const best = matches.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
    const validation = rule.validate(best.text || "");

    if (validation.ok === true) {
      results.push({
        ruleRef: rule.ruleRef,
        label: rule.label,
        status: "PASS",
        severity: best.confidence < 70 ? "WARNING" : "PASS",
        message:
          best.confidence < 70
            ? `Present and well-formed, but OCR confidence is low (${best.confidence}%) — verify manually`
            : "Present and well-formed",
        evidence: { text: best.text, confidence: best.confidence },
      });
    } else if (validation.ok === "warn") {
      results.push({
        ruleRef: rule.ruleRef,
        label: rule.label,
        status: "WARNING",
        severity: "WARNING",
        message: validation.reason,
        evidence: { text: best.text, confidence: best.confidence },
      });
    } else {
      results.push({
        ruleRef: rule.ruleRef,
        label: rule.label,
        status: "MALFORMED",
        severity: "FORMAT",
        message: validation.reason,
        evidence: { text: best.text, confidence: best.confidence },
      });
    }

    // --- Rule 7 font-size check, only for the categories it governs ---
    if (rule.categories.some((c) => FONT_CHECKED_CATEGORIES.has(c)) && best.fontHeightMm != null) {
      const minHeight = getMinFontHeightMm(pdpArea, false);
      if (best.fontHeightMm < minHeight) {
        results.push({
          ruleRef: "Rule 7(2)/Table-I",
          label: `${rule.label} — font height`,
          status: "TOO_SMALL",
          severity: "FONT",
          message: `Estimated font height ${best.fontHeightMm.toFixed(2)}mm is below the Rule 7 minimum of ${minHeight}mm for a ${pdpArea.toFixed(0)}cm² panel${pdpEstimated ? " (PDP area estimated from image — not calibrated)" : ""}`,
          evidence: { fontHeightMm: best.fontHeightMm, minRequiredMm: minHeight, pdpAreaCm2: pdpArea },
        });
      } else {
        results.push({
          ruleRef: "Rule 7(2)/Table-I",
          label: `${rule.label} — font height`,
          status: "PASS",
          severity: lowConfidence ? "WARNING" : "PASS",
          message: lowConfidence
            ? `Font height OK vs. estimated minimum, but PDP area itself is a rough fallback estimate — verify manually`
            : `Font height meets Rule 7 minimum (${minHeight}mm)`,
          evidence: { fontHeightMm: best.fontHeightMm, minRequiredMm: minHeight, pdpAreaCm2: pdpArea },
        });
      }
    }
  }

  const summary = {
    total: results.length,
    passed: results.filter((r) => r.severity === "PASS").length,
    hardViolations: results.filter((r) => r.severity === "HARD").length,
    formatViolations: results.filter((r) => r.severity === "FORMAT").length,
    fontViolations: results.filter((r) => r.severity === "FONT").length,
    warnings: results.filter((r) => r.severity === "WARNING").length,
    notApplicable: results.filter((r) => r.severity === "NOT_APPLICABLE").length,
  };
  const scoredTotal = summary.total - summary.notApplicable;
  summary.compliancePct = scoredTotal > 0 ? Math.round((summary.passed / scoredTotal) * 100) : 100;

  return { summary, results };
}

module.exports = { checkCompliance, getMinFontHeightMm, PDP_FONT_TABLE, DECLARATION_RULES };
