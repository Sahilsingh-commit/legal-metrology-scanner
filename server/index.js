const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const cors = require('cors');
const { classifyDeclaration } = require('./classify');
const { estimateFontHeightMM } = require('./fontsize');
const { propagateRowClassification } = require('./rowGrouping');
require('dotenv').config();

const app = express();
app.use(cors());

const upload = multer({ storage: multer.memoryStorage() });

app.post('/api/scan', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    const form = new FormData();
    form.append('file', req.file.buffer, req.file.originalname);

    const ocrResponse = await axios.post(
      `${process.env.OCR_SERVICE_URL}/extract`,
      form,
      { headers: form.getHeaders() }
    );

        const rawBlocks = ocrResponse.data.text_blocks;

    // We need the image height in pixels for font-size math — get it from the uploaded image
    const sharp = require('sharp');
    const metadata = await sharp(req.file.buffer).metadata();
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

    const finalBlocks = propagateRowClassification(enrichedBlocks);

    res.json({ text_blocks: finalBlocks });

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