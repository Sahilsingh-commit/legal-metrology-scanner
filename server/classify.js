const fuzz = require('fuzzball');

const OCR_FIXES = [
  [/\bR5\.?\b/gi, 'Rs.'],
  [/\bVvt\b/gi, 'Wt'],
  [/\bN0\b/gi, 'No'],
];

// Any keyword this short or shorter is matched as an EXACT substring/word only.
// Fuzzy partial_ratio on very short strings gives unreliable false-positive matches.
const SHORT_KEYWORD_MAX_LENGTH = 5;

const UNIT_KEYWORDS = {
  net_quantity: ['g', 'kg', 'ml', 'l', 'gm', 'gms'],
};

const PHRASE_KEYWORDS = {
  net_quantity: ['net wt', 'net weight', 'net qty', 'net quantity'],
  mrp: ['mrp', 'rs.', 'inclusive of all taxes', 'inclusiveofalltaxes', 'incl of all taxes', 'maximum retail price', 'max retail price'],
  mfg_date: ['mfg date', 'manufactured on', 'pkd', 'packed on', 'date of manufacture', 'mfd', 'month & year of manufactur'],
  manufacturer_address: ['manufactured by', 'manufactured & marketed by', 'marketed by', 'packed by', 'mfd by', 'address'],
  consumer_care: ['consumer care', 'customer care', 'helpline', 'contact us', 'for consumer complaints', 'toll-free', 'toll free'],
  country_of_origin: ['country of origin', 'made in', 'product of'],
  batch_no: ['batch no', 'lot no', 'b.no'],
  expiry_date: ['expiry date', 'exp date', 'use before', 'best before', 'use by'],
  generic_name: ['generic name', 'common name'],
  product_name: ['item name', 'product name', 'brand name'],
  item_code: ['item code', 'model no', 'model number', 'sku'],
};

function normalizeText(text) {
  let cleaned = text;
  for (const [pattern, fix] of OCR_FIXES) {
    cleaned = cleaned.replace(pattern, fix);
  }
  return cleaned.toLowerCase();
}

function scoreKeywordMatch(keyword, normalizedText) {
  if (keyword.length <= SHORT_KEYWORD_MAX_LENGTH) {
    // exact word-boundary match only — no fuzziness for short/risky keywords
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    return regex.test(normalizedText) ? 100 : 0;
  }
  return fuzz.partial_ratio(keyword, normalizedText);
}

function classifyDeclaration(text) {
  const normalized = normalizeText(text);
  let bestCategory = 'unclassified';
  let bestScore = 0;

  // 1. Exact whole-word unit matches (highest trust)
  for (const [category, units] of Object.entries(UNIT_KEYWORDS)) {
    for (const unit of units) {
      const escaped = unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      if (regex.test(normalized)) {
        return { category, confidence: 100 };
      }
    }
  }

  // 2. Phrase matching — short phrases exact, longer phrases fuzzy
  for (const [category, keywords] of Object.entries(PHRASE_KEYWORDS)) {
    for (const keyword of keywords) {
      const score = scoreKeywordMatch(keyword, normalized);
      if (score > bestScore) {
        bestScore = score;
        bestCategory = category;
      }
    }
  }

  // Raised threshold from 75 to 85 — reduces false positives on borderline fuzzy matches
  if (bestScore < 85) {
    return { category: 'unclassified', confidence: bestScore };
  }
  return { category: bestCategory, confidence: bestScore };
}

module.exports = { classifyDeclaration };