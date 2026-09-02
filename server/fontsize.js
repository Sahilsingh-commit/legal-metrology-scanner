// bbox format from your OCR service: [x1, y1, x2, y2]
// Estimates real-world font height in mm, assuming the photographed
// label roughly fills a frame of known physical height (documented assumption).

function estimateFontHeightMM(bbox, imageHeightPx, assumedFrameHeightCM = 15) {
  const boxHeightPx = bbox[3] - bbox[1]; // y2 - y1
  const pxPerCM = imageHeightPx / assumedFrameHeightCM;
  const heightCM = boxHeightPx / pxPerCM;
  return Math.round(heightCM * 10 * 100) / 100; // convert to mm, round to 2 decimals
}

module.exports = { estimateFontHeightMM };