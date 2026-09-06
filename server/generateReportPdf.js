const PDFDocument = require('pdfkit');

const COLORS = {
  ink: '#1B2A4A',
  textMuted: '#6B7280',
  hardRed: '#8C2F26',
  warnAmber: '#8A5A17',
  passGreen: '#2A6B4C',
  border: '#E2E4E8',
};

const SEVERITY_LABELS = {
  HARD: { label: 'MISSING', color: COLORS.hardRed },
  FORMAT: { label: 'MALFORMED', color: COLORS.hardRed },
  FONT: { label: 'FONT TOO SMALL', color: COLORS.hardRed },
  WARNING: { label: 'NEEDS REVIEW', color: COLORS.warnAmber },
  PASS: { label: 'COMPLIANT', color: COLORS.passGreen },
  NOT_APPLICABLE: { label: 'NOT APPLICABLE', color: COLORS.textMuted },
};

/**
 * Generates a Legal Metrology compliance PDF report and streams it
 * directly to the given response object.
 *
 * @param {object} complianceResult - the { summary, results } object
 *   already produced by rulesEngine.js's checkCompliance()
 * @param {object} meta - { productName, scannedAt, imageCount }
 * @param {import('express').Response} res
 */
function generateReportPdf(complianceResult,meta, images, res) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="compliance-report-${Date.now()}.pdf"`
  );
  doc.pipe(res);

  // ---- Header ----

    // ---- Photo evidence thumbnails, top-right corner ----
  const imageCount = Math.min(images?.length || 0, 4);
  const thumbSize = imageCount <= 2 ? 90 : 55;
  const thumbGap = 6;
  const pageRightEdge = doc.page.width - doc.page.margins.right;
  const thumbStartX = imageCount === 1 ? pageRightEdge - thumbSize : pageRightEdge - (thumbSize * 2 + thumbGap);
  const thumbStartY = doc.y;

  if (images && images.length > 0) {
    images.slice(0, 4).forEach((imgDataUrl, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = thumbStartX + col * (thumbSize + thumbGap);
      const y = thumbStartY + row * (thumbSize + thumbGap);
      try {
        doc.image(imgDataUrl, x, y, { fit: [thumbSize, thumbSize] });
      } catch (e) {
        console.error('Failed to embed thumbnail', i, e.message);
      }
    });
  }

  // ---- Header text (narrower width, leaves room for thumbnails on the right) ----
  const headerTextWidth = thumbStartX - doc.page.margins.left - 15;

  const reportId = `LMS-${Date.now().toString(36).toUpperCase()}`;
  doc.fontSize(10).fillColor(COLORS.textMuted).font('Helvetica')
    .text(`Report ID: ${reportId}`, doc.page.margins.left, thumbStartY, { width: headerTextWidth });

  doc
    .fillColor(COLORS.ink)
    .fontSize(20)
    .font('Helvetica-Bold')
    .text('Legal Metrology Compliance Report', doc.page.margins.left, doc.y, { width: headerTextWidth });

  doc
    .fontSize(10)
    .fillColor(COLORS.textMuted)
    .font('Helvetica')
    .text(`Generated ${new Date(meta.scannedAt || Date.now()).toLocaleString('en-IN')}`, { width: headerTextWidth });

  if (meta.productName) {
    doc.text(`Product: ${meta.productName}`, { width: headerTextWidth });
  }
  doc.text(`Photos scanned: ${meta.imageCount || 1}`, { width: headerTextWidth });

  if (meta.location) {
    doc.text(`Scan location: ${meta.location}`, { continued: true, width: headerTextWidth });
    doc.fillColor('#2E4270').text('  (View on map)', {
      link: `https://www.google.com/maps?q=${meta.location}`,
      underline: true,
    });
    doc.fillColor(COLORS.textMuted);
  }

  // Make sure we're below both the text block AND the thumbnail grid before continuing
  const thumbnailGridBottom = thumbStartY + (Math.ceil(Math.min(images?.length || 0, 4) / 2) * (thumbSize + thumbGap));
  doc.y = Math.max(doc.y, thumbnailGridBottom) + 10;

  doc.moveDown(1);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(COLORS.border).stroke();
  doc.moveDown(1);

  // ---- Score summary ----
  const { summary } = complianceResult;
  doc
    .fontSize(32)
    .fillColor(COLORS.ink)
    .font('Helvetica-Bold')
    .text(`${summary.compliancePct}%`, { continued: false });

  doc
    .fontSize(10)
    .fillColor(COLORS.textMuted)
    .font('Helvetica')
    .text('Overall compliance score');

  doc.moveDown(0.5);
  doc
    .fontSize(10)
    .fillColor(COLORS.textMuted)
    .text(
      `${summary.passed} passed   ${summary.hardViolations} missing   ${summary.formatViolations} malformed   ${summary.fontViolations} font too small   ${summary.warnings} need review`
    );

  doc.moveDown(1.5);

  // ---- Violations section (the part an officer needs to act on) ----
  const violations = complianceResult.results.filter(
    (r) => ['HARD', 'FORMAT', 'FONT'].includes(r.severity)
  );

  doc
    .fontSize(14)
    .fillColor(COLORS.hardRed)
    .font('Helvetica-Bold')
    .text('Violations Requiring Action');
  doc.moveDown(0.5);

  if (violations.length === 0) {
    doc
      .fontSize(10)
      .fillColor(COLORS.textMuted)
      .font('Helvetica')
      .text('No hard violations detected.');
  } else {
    violations.forEach((v) => {
      renderResultRow(doc, v);
    });
  }

  doc.moveDown(1);

  // ---- Needs-review section ----
  const warnings = complianceResult.results.filter((r) => r.severity === 'WARNING');
  if (warnings.length > 0) {
    doc
      .fontSize(14)
      .fillColor(COLORS.warnAmber)
      .font('Helvetica-Bold')
      .text('Needs Manual Review');
    doc.moveDown(0.5);
    warnings.forEach((w) => renderResultRow(doc, w));
    doc.moveDown(1);
  }

    // ---- Passed section ----
  const passed = complianceResult.results.filter((r) => r.severity === 'PASS');
  if (passed.length > 0) {
    doc
      .fontSize(14)
      .fillColor(COLORS.passGreen)
      .font('Helvetica-Bold')
      .text('Compliant Declarations');
    doc.moveDown(0.5);
    passed.forEach((p) => renderResultRow(doc, p));
  }
  // ---- Footer disclaimer ----
  doc.moveDown(2);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(COLORS.border).stroke();
  doc.moveDown(0.5);
  doc
    .fontSize(8)
    .fillColor(COLORS.textMuted)
    .font('Helvetica-Oblique')
    .text(
      'This report is generated by an automated pre-screening tool based on OCR text extraction and rule-based analysis. ' +
        'It is intended to assist, not replace, manual verification by a Legal Metrology enforcement official. ' +
        'Font-size and PDP-area measurements are estimated from photographs unless independently calibrated.'
    );

  doc.end();
}

function renderResultRow(doc, result) {
  const sev = SEVERITY_LABELS[result.severity] || SEVERITY_LABELS.NOT_APPLICABLE;

  const startY = doc.y;

  doc
    .fontSize(9)
    .fillColor(sev.color)
    .font('Helvetica-Bold')
    .text(sev.label, 50, startY, { width: 90, continued: false });

  doc
    .fontSize(9)
    .fillColor(COLORS.ink)
    .font('Helvetica-Bold')
    .text(`${result.ruleRef}`, 145, startY, { width: 90 });

  doc
    .fontSize(9)
    .fillColor('#2B2F38')
    .font('Helvetica')
    .text(result.label, 240, startY, { width: 305 });

  doc.moveDown(0.15);
  doc
    .fontSize(8)
    .fillColor(COLORS.textMuted)
    .font('Helvetica-Oblique')
    .text(result.message, 145, doc.y, { width: 400 });

  doc.moveDown(0.6);
}

module.exports = { generateReportPdf };