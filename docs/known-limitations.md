# Known Limitations — Legal Metrology Scanner

Documented honestly so evaluators and future contributors understand
what's been validated against real product photos vs. what's a known
gap. These aren't oversights — each was found through actual testing
against real packaging and is a reasonable scope decision for the
project timeline.

## 1. Multi-line declarations are validated on a single strongest line

**Issue:** Declarations that span multiple physical lines on the label
(e.g., a manufacturer address printed across 3-4 lines) are currently
validated using only the single highest-confidence OCR block in that
category, not the full concatenated address.

**Impact:** A pincode or other detail present on a *different* line of
a multi-line address can be missed, producing a false "incomplete"
warning even when the full address is actually present on the label.

**Planned fix:** Extend row-grouping with a second pass that clusters
vertically-stacked blocks within the same category into one combined
text block before validation, not just horizontally-adjacent
label:value pairs.

## 2. Row-grouping can misclassify dense paragraph-style text

**Issue:** The spatial row-grouping logic (built to correctly pair
short label:value declarations like "Batch No." → "DT251456") does not
yet distinguish structured label panels from dense paragraph text
(ingredient lists, warning statements). On products with large blocks
of running text, this can cause an incorrect classification to
propagate across multiple unrelated lines.

**Impact:** Confirmed on a topical-gel product with an ingredients
panel — several ingredient-name and warning-text blocks were
incorrectly tagged with an unrelated declaration category.

**Mitigation in place:** Row-propagation is currently restricted to
originate only from a direct high-confidence keyword match, not from
another already-inferred block, limiting (but not eliminating) how far
a single misclassification can cascade.

**Planned fix:** Detect "structured panel" vs. "paragraph panel"
regions before applying row-grouping, likely using block density and
average line-height variance as signals.

## 3. Dot-matrix / inkjet-printed dates are frequently unreadable

**Issue:** Batch and expiry dates printed via dot-matrix/inkjet coding
(very common on Indian FMCG packaging) print characters as sparse dot
patterns rather than solid strokes. OCR confidence on these regions
drops to ~0.40-0.50, versus ~0.93-0.99 on solid printed text on the
same label.

**Impact:** These declarations may be missed or misread, distinct from
any classification-logic bug — this is an OCR-engine-level limitation
common to general-purpose text recognition models.

**Planned fix:** A specialized dot-matrix/DMPI text recognition
approach, or a targeted preprocessing step (morphological closing to
merge dot clusters into solid strokes) as a lighter-weight partial
mitigation.

## 4. PDP (Principal Display Panel) area is estimated, not measured

**Issue:** Rule 7's minimum font-size requirement scales with the
package's PDP area in cm². Without a reference object or manual entry,
the system falls back to an assumed area bracket rather than a
measured one.

**Impact:** Font-size compliance checks against this fallback are
flagged as low-confidence in the report output and should be
manually verified rather than treated as a final legal determination.

**Planned fix:** Optional reference-marker (e.g., ArUco marker or
known-size object) calibration for accurate physical measurement, or
manual PDP-area entry at scan time.

## 5. Single-photo scans only reflect declarations on that panel

**Issue:** Legal Metrology declarations are frequently split across
multiple physical panels of one product (front/back/side). A single
photo will only capture whatever declarations are visible on that
panel.

**Status:** Resolved via multi-image upload — a scan session can
include multiple photos of the same product, merged into one combined
compliance report. Users should be encouraged to photograph all
relevant panels for an accurate result.