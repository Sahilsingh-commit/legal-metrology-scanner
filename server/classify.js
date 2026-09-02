const fuzz = require('fuzzball');

const OCR_FIXES = [
  [/\bR5\.?\b/gi, 'Rs.'],
  [/\bVvt\b/gi, 'Wt'],
  [/\bN0\b/gi, 'No'],
];

// Short, generic tokens — matched as EXACT WHOLE WORDS only (regex), never fuzzy
const UNIT_KEYWORDS = {
  net_quantity: ['g', 'kg', 'ml', 'l', 'gm', 'gms'],
};

// Longer, distinctive phrases — safe to fuzzy match
const PHRASE_KEYWORDS = {
  net_quantity: ['net wt', 'net weight', 'net qty', 'net quantity'],
  mrp: ['mrp', 'rs.', 'inclusive of all taxes', 'inclusiveofalltaxes', 'incl of all taxes', 'maximum retail price', 'max retail price'],
  mfg_date: ['mfg date', 'manufactured', 'pkd', 'packed on', 'date of manufacture', 'mfd'],
  manufacturer_address: ['mfd by', 'manufactured by', 'marketed by', 'packed by'],
  consumer_care: ['consumer care', 'customer care', 'helpline', 'contact us'],
  country_of_origin: ['country of origin', 'made in', 'product of'],
  batch_no: ['batch no', 'b.no', 'batch number'],
  expiry_date: ['expiry date', 'exp date', 'use before', 'best before'],
};

function normalizeText(text) {
  let cleaned = text;
  for (const [pattern, fix] of OCR_FIXES) {
    cleaned = cleaned.replace(pattern, fix);
  }
  return cleaned.toLowerCase();
}

function classifyDeclaration(text) {
  const normalized = normalizeText(text);
  let bestCategory = 'unclassified';
  let bestScore = 0;

  // 1. Check exact whole-word unit matches first (highest trust, no fuzziness)
  for (const [category, units] of Object.entries(UNIT_KEYWORDS)) {
    for (const unit of units) {
      const wordBoundaryRegex = new RegExp(`\\b${unit}\\b`, 'i');
      if (wordBoundaryRegex.test(normalized)) {
        return { category, confidence: 100 };
      }
    }
  }

  // 2. Fuzzy match longer phrases
  for (const [category, keywords] of Object.entries(PHRASE_KEYWORDS)) {
    for (const keyword of keywords) {
      const score = fuzz.partial_ratio(keyword, normalized);
      if (score > bestScore) {
        bestScore = score;
        bestCategory = category;
      }
    }
  }

  if (bestScore < 75) {
    return { category: 'unclassified', confidence: bestScore };
  }
  return { category: bestCategory, confidence: bestScore };
}

module.exports = { classifyDeclaration };