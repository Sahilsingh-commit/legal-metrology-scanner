const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const cors = require('cors');
const { classifyDeclaration } = require('./classify');
const { estimateFontHeightMM } = require('./fontsize');
const { propagateRowClassification, propagateVerticalContinuation } = require('./rowGrouping');
const { checkCompliance } = require('./rulesEngine');
const sharp = require('sharp');
require('dotenv').config();

const app = express();
app.use(cors());

const upload = multer({ storage: multer.memoryStorage() });

app.post('/api/scan', upload.array('images', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No image files uploaded' });
    }

    const complianceOpts = {
      isImported: req.body.isImported === 'true',
      isPerishable: req.body.isPerishable !== 'false',
      isSizeRelevant: req.body.isSizeRelevant === 'true',
      pdpAreaCm2: req.body.pdpAreaCm2 ? parseFloat(req.body.pdpAreaCm2) : null,
      assumedCaptureWidthCm: 10,
    };

    // Process all uploaded images CONCURRENTLY instead of one-at-a-time —
    // each image's OCR call, resize, and classification is independent of
    // the others, so there's no need to wait for one to finish before
    // starting the next.
    const allImageBlocks = await Promise.all(
      req.files.map(async (file) => {
        const resizedBuffer = await sharp(file.buffer)
          .resize({ width: 1200, withoutEnlargement: true })
          .toBuffer();

        const form = new FormData();
        form.append('file', resizedBuffer, file.originalname);

        const ocrStart = Date.now();
        const ocrResponse = await axios.post(
          `${process.env.OCR_SERVICE_URL}/extract`,
          form,
          { headers: form.getHeaders() }
        );
        console.log(`OCR took ${Date.now() - ocrStart}ms for ${file.originalname}`);

        const rawBlocks = ocrResponse.data.text_blocks;

        const metadata = await sharp(resizedBuffer).metadata();
        const imageHeightPx = metadata.height;

        const enrichedBlocks = rawBlocks.map((block) => {
          const classification = classifyDeclaration(block.text);
          const fontHeightMM = estimateFontHeightMM(block.bbox, imageHeightPx);
          return {
            ...block,
            matched_declaration_hint: classification.category,
            match_confidence: classification.confidence,
            font_height_mm_est: fontHeightMM,
          };
        });

        // Row-grouping happens PER IMAGE — a value should only inherit a
        // category from a label on the SAME physical panel, not a different one.
        const rowGroupedBlocks = propagateRowClassification(enrichedBlocks);

        // Vertical continuation (multi-line addresses, composition lists, etc.)
        // also runs PER IMAGE, right after row-grouping.
        const finalBlocksForImage = propagateVerticalContinuation(rowGroupedBlocks);

        return {
          filename: file.originalname,
          blocks: finalBlocksForImage, // <-- was rowGroupedBlocks before; now correctly
                                        //     includes the vertical-continuation results
        };
      })
    );

    // Merge blocks from all images into one flat list for the rules engine —
    // the rules engine doesn't care which physical panel a declaration came
    // from, only whether it exists SOMEWHERE on the product.
    const mergedBlocks = allImageBlocks.flatMap((img) => img.blocks);

    const rulesEngineBlocks = mergedBlocks.map((b) => ({
      text: b.text,
      category: b.matched_declaration_hint,
      confidence: b.match_confidence,
      fontHeightMm: b.font_height_mm_est,
      bbox: b.bbox,
    }));

    const compliance = checkCompliance(rulesEngineBlocks, complianceOpts);

    res.json({
      images: allImageBlocks, // per-image breakdown, useful for showing which panel had what
      compliance,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'OCR service unreachable', detail: err.message });
  }
});

app.get('/', (req, res) => {
  res.send('Legal Metrology Scanner API is running');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});