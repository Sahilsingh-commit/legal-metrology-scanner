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

function groupIntoRows(blocks, overlapThreshold = 0.4) {
  const rows = [];

  for (const block of blocks) {
    let placedInRow = null;

    for (const row of rows) {
      const overlapsWithRow = row.blocks.some(
        (b) => verticalOverlap(b, block) >= overlapThreshold
      );
      if (overlapsWithRow) {
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

function propagateRowClassification(blocks) {
  const rows = groupIntoRows(blocks);

  for (const row of rows) {
    const known = row.blocks.find(
      (b) => b.matched_declaration_hint !== 'unclassified'
    );
    if (known) {
      for (const b of row.blocks) {
        if (b.matched_declaration_hint === 'unclassified') {
          b.matched_declaration_hint = known.matched_declaration_hint;
          b.match_confidence = known.match_confidence;
          b.inferred_from_position = true;
        }
      }
    }
  }

  return rows.flatMap((r) => r.blocks);
}

module.exports = { propagateRowClassification };