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
  net_quantity: ['g', 'kg', 'ml', 'l', 'gm', 'gms', 'tablet', 'tablets', 'capsule', 'capsules', 'tab', 'tabs'],
};

const PHRASE_KEYWORDS = {
  net_quantity: ['net wt', 'net weight', 'net qty', 'net quantity'],
  mrp: ['mrp', 'rs.', 'inclusive of all taxes', 'inclusiveofalltaxes', 'incl of all taxes', 'maximum retail price', 'max retail price'],
  mfg_date: ['mfg date', 'manufactured on', 'pkd', 'packed on', 'date of manufacture', 'mfd', 'month & year of manufactur'],
  manufacturer_address: ['manufactured by', 'manufactured & marketed by', 'marketed by', 'packed by', 'mfd by', 'address'],
    consumer_care: ['consumer care', 'customer care', 'helpline', 'contact us', 'for consumer complaints', 'toll-free', 'toll free', 'contact:'],
  batch_no: ['batch no', 'lot no', 'b.no', 'batch:'],
  expiry_date: ['expiry date', 'exp date', 'use before', 'best before', 'use by'],
  generic_name: ['generic name', 'common name', 'composition', 'each tablet contains', 'each uncoated tablet contains', 'each capsule contains'],
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

function checkPriorityExactMatch(normalizedText) {
  const compactText = normalizedText.replace(/\s+/g, '');
  for (const [category, phrases] of Object.entries(PRIORITY_EXACT_CATEGORIES)) {
    for (const phrase of phrases) {
      const compactPhrase = phrase.replace(/\s+/g, '');
      if (compactText.includes(compactPhrase)) {
        return category;
      }
    }
  }
  return null;
}

const NUTRITION_CONTEXT_KEYWORDS = [
  'protein', 'carbohydrate', 'carbohydrates', 'fat', 'energy', 'kcal',
  'sodium', 'cholesterol', 'sugar', 'sugars', 'fibre', 'fiber', 'vitamin', 'rda',
];

function isNutritionTableValue(normalizedText) {
  return NUTRITION_CONTEXT_KEYWORDS.some((kw) => new RegExp(`\\b${kw}\\b`, 'i').test(normalizedText));
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

const REFERENCE_TEXT_PATTERNS = [
  /see\s*below/i,
  /see\s*seal/i,
  /seal\s*area/i,
  /printed\s*below/i,
  /refer\s*(to\s*)?below/i,
  /mentioned\s*below/i,
  /for\s*net\s*weight/i,
  /use\s*by\s*&?\s*batch\s*no/i,
];

function isReferenceText(text) {
  return REFERENCE_TEXT_PATTERNS.some((pattern) => pattern.test(text));
}

function isBarcodeLike(text) {
  const digitsOnly = text.replace(/[^\d]/g, '');
  return digitsOnly.length >= 8 && digitsOnly.length / text.length > 0.6;
}

const PRIORITY_EXACT_CATEGORIES = {
  expiry_date: ['best before', 'use before', 'expiry date', 'exp date', 'use by date'],
};

function classifyDeclaration(text) {
  if (isReferenceText(text) || isBarcodeLike(text)) {
    return { category: 'unclassified', confidence: 0 };
  }
  const normalized = normalizeText(text);
  let bestCategory = 'unclassified';
  let bestScore = 0;

  // ...rest of the function stays the same

  // 1. Exact whole-word unit matches (highest trust)
    // 1. Check unit matches — require a digit immediately before the unit,
  // since real quantities are always "500g"/"250 ml", never a bare letter.
  // This avoids false positives like "K.G. Marg" (a street name) matching "g".
    for (const [category, units] of Object.entries(UNIT_KEYWORDS)) {
    for (const unit of units) {
      const escaped = unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const digitPrefixedRegex = new RegExp(`\\d+\\s*${escaped}\\b`, 'i');
      if (digitPrefixedRegex.test(normalized) && !isNutritionTableValue(normalized)) {
        return { category, confidence: 100 };
      }
    }
  }

  const priorityMatch = checkPriorityExactMatch(normalized);
  if (priorityMatch) {
    return { category: priorityMatch, confidence: 100 };
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