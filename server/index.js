const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const cors = require('cors');
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

    res.json(ocrResponse.data);
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