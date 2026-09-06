const NON_PROPAGATING_PATTERNS = [
  /see\s*below/i,
  /seal\s*area/i,
  /for\s*net\s*weight/i,
  /use\s*by\s*&?\s*batch\s*no/i,
];

function shouldExcludeFromPropagation(text) {
  const digitsOnly = (text || '').replace(/[^\d]/g, '');
  const isBarcodeLike = digitsOnly.length >= 8 && digitsOnly.length / (text || ' ').length > 0.6;
  const isReferenceText = NON_PROPAGATING_PATTERNS.some((p) => p.test(text || ''));
  return isBarcodeLike || isReferenceText;
}

function verticalOverlap(boxA, boxB) {
  const [_, aY1, __, aY2] = boxA.bbox;
  const [___, bY1, ____, bY2] = boxB.bbox;

  const overlapStart = Math.max(aY1, bY1);
  const overlapEnd = Math.min(aY2, bY2);
  const overlap = Math.max(0, overlapEnd - overlapStart);

  const aHeight = aY2 - aY1;
  const bHeight = bY2 - bY1;
  const smallerHeight = Math.min(aHeight, bHeight);

  if (smallerHeight === 0) return 0;
  return overlap / smallerHeight; // fraction of the shorter box that overlaps
}

function horizontalGap(boxA, boxB) {
  // distance between the nearest edges of the two boxes; 0 if they overlap horizontally
  if (boxA[2] < boxB[0]) return boxB[0] - boxA[2];
  if (boxB[2] < boxA[0]) return boxA[0] - boxB[2];
  return 0;
}

function groupIntoRows(blocks, overlapThreshold = 0.4, maxHorizontalGapPx = 150) {
  const rows = [];

  for (const block of blocks) {
    let placedInRow = null;

    for (const row of rows) {
      const fitsRow = row.blocks.some((b) => {
        const vOverlap = verticalOverlap(b, block) >= overlapThreshold;
        const hGap = horizontalGap(b.bbox, block.bbox) <= maxHorizontalGapPx;
        return vOverlap && hGap;
      });
      if (fitsRow) {
        placedInRow = row;
        break;
      }
    }

    if (placedInRow) {
      placedInRow.blocks.push(block);
    } else {
      rows.push({ blocks: [block] });
    }
  }

  return rows;
}

function propagateRowClassification(blocks, imageWidthPx) {
  const maxHorizontalGapPx = imageWidthPx ? imageWidthPx * 0.3 : 150;
  const rows = groupIntoRows(blocks, 0.3, maxHorizontalGapPx);

  for (const row of rows) {
    const known = row.blocks.find(
      (b) => b.matched_declaration_hint !== 'unclassified'
    );
    if (known) {
      for (const b of row.blocks) {
          if (b.matched_declaration_hint === 'unclassified' && !shouldExcludeFromPropagation(b.text)) {
          b.matched_declaration_hint = known.matched_declaration_hint;
          b.match_confidence = known.match_confidence;
          b.inferred_from_position = true;
        }
      }
    }
  }

  return rows.flatMap((r) => r.blocks);
}
// Categories where a declaration is commonly split across several
// vertically-stacked lines (a multi-line address, for example) rather
// than a single label:value row.
const MULTILINE_CATEGORIES = new Set(['manufacturer_address', 'consumer_care', 'generic_name']);

function horizontalOverlapFraction(bboxA, bboxB) {
  const overlapStart = Math.max(bboxA[0], bboxB[0]);
  const overlapEnd = Math.min(bboxA[2], bboxB[2]);
  const overlap = Math.max(0, overlapEnd - overlapStart);
  const smallerWidth = Math.min(bboxA[2] - bboxA[0], bboxB[2] - bboxB[0]);
  if (smallerWidth === 0) return 0;
  return overlap / smallerWidth;
}

// After row-grouping, walk top-to-bottom and let a confidently-classified
// multiline-category label (e.g. "Marketed by:") absorb subsequent
// unclassified lines directly beneath it, as long as they roughly line up
// horizontally and aren't too far below — stops as soon as a new
// classified block or a big gap appears.
function propagateVerticalContinuation(blocks, opts = {}) {
  const { maxGapPx = 60, xOverlapThreshold = 0.3 } = opts;
  const sorted = [...blocks].sort((a, b) => a.bbox[1] - b.bbox[1]);

  let active = null;

  for (const block of sorted) {
    const isFreshMultilineLabel =
      MULTILINE_CATEGORIES.has(block.matched_declaration_hint) &&
      !block.inferred_from_vertical_continuation;

    if (isFreshMultilineLabel) {
      active = { category: block.matched_declaration_hint, bbox: block.bbox, confidence: block.match_confidence };
      continue;
    }

        if (active && block.matched_declaration_hint === 'unclassified' && !shouldExcludeFromPropagation(block.text)){
      const verticalGap = block.bbox[1] - active.bbox[3];
      const hOverlap = horizontalOverlapFraction(active.bbox, block.bbox);

      if (verticalGap <= maxGapPx && hOverlap >= xOverlapThreshold) {
        block.matched_declaration_hint = active.category;
        block.match_confidence = Math.min(active.confidence, 70); // lower — this is inferred, not directly matched
        block.inferred_from_vertical_continuation = true;
        active.bbox = block.bbox; // extend the active region downward
        continue;
      }
    }

    // Any other classified block breaks the chain
    if (block.matched_declaration_hint !== 'unclassified') {
      active = null;
    }
  }

  return blocks;
}

module.exports = { propagateRowClassification, propagateVerticalContinuation };