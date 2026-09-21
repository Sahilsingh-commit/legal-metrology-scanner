# Legal Metrology Compliance Scanner

**SIH26034** — Smart India Hackathon 2026

An AI-powered web application that scans packaged commodity labels and automatically checks compliance with the **Legal Metrology (Packaged Commodities) Rules, 2011** — detecting missing, incorrect, or undersized declarations, and generating a legally-referenced compliance report in seconds.

---

## 🎥 Demo

**Video walkthrough:** [Watch on YouTube](https://youtu.be/FHck3zMRWTE?si=d-eKOxjxxVOnY9gb)


> **Note on live deployment:** The OCR service depends on PaddleOCR, a deep-learning toolkit with a substantial native dependency footprint (framework binaries, model weights). Given our development timeline, we prioritized a stable, thoroughly-tested local deployment over the risk of a rushed cloud setup. The above demo video shows the complete system running end-to-end locally on our device; setup instructions are given below to let judges run it themselves.
---

## 📋 The Problem

Legal Metrology enforcement in India relies on manual inspection — officers physically check each product against 9+ mandatory declarations (MRP, net quantity, manufacturing/expiry dates, font-size requirements, and more). With millions of SKUs across retail and e-commerce, and a limited number of field inspectors (Maharashtra, for example, operates with just 261 field inspectors statewide), manual checking simply cannot scale — leading to widespread, undetected non-compliance.

## 💡 Our Solution

Photograph a product's label panels, and the system automatically:
1. Extracts every printed declaration using deep learning-based OCR
2. Classifies each declaration against Legal Metrology categories
3. Spatially reconstructs label:value pairs, exactly as they're printed on real packaging
4. Checks compliance against Rule 6 (mandatory declarations) and Rule 7 (font-size requirements)
5. Generates a scored, evidence-backed compliance report — downloadable as PDF

What used to take an officer several minutes of manual checklist work now takes a single scan.

## ✨ Key Features

- 📸 Multi-image upload — handles declarations split across multiple physical panels
- 🔍 AI-powered OCR extraction (PaddleOCR, deep learning-based, multilingual-capable)
- 🧩 Spatial reasoning — correctly pairs labels with values, not just isolated keyword matching
- ⚖️ Rule-based compliance engine — explainable, auditable verdicts citing exact Legal Metrology rules
- 📏 Font-size compliance checking against Rule 7's PDP-area-scaled minimum height table
- 📄 Automated PDF report generation with photo evidence and GPS location tagging
- 🌐 Fully offline-capable — no cloud API dependency, zero per-scan cost
- 📱 Mobile-responsive web interface

## 🏗️ Architecture

```
Client (React + Vite)
        │  REST / multipart
        ▼
Node.js / Express Backend
   ├── Preprocessing (sharp)
   ├── Declaration Classification (fuzzy matching + regex)
   ├── Spatial Grouping (row + multi-line pairing)
   ├── Font-Size Estimation
   ├── Rules Engine (Rule 6 & Rule 7)
   └── PDF Report Generation
        │  REST / multipart
        ▼
Python / FastAPI OCR Microservice
   └── PaddleOCR (PP-OCRv4 mobile models) + OpenCV
```

A database layer (PostgreSQL, for scan history/search/dashboard) is planned not yet implemented.

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite), Axios |
| Backend | Node.js, Express |
| OCR Service | Python, FastAPI, PaddleOCR, OpenCV |
| Classification | `fuzzball` (fuzzy matching), custom regex logic |
| Report Generation | PDFKit |
| Planned | PostgreSQL |


## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- Python 3.9–3.11
- npm

### 1. Clone the repository
```bash
git clone https://github.com/YOUR_USERNAME/legal-metrology-scanner.git
cd legal-metrology-scanner
```

### 2. Set up the OCR microservice
```bash
cd ocr_service
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Set up the backend
```bash
cd server
npm install
# create a .env file — see .env.example
node index.js
```

### 4. Set up the frontend
```bash
cd client
npm install
npm run dev
```

### 5. Open the app
Navigate to `http://localhost:5173` in your browser.

## 📖 API Overview

| Endpoint | Method | Description |

| `/api/scan` | POST | Accepts one or more images, returns extracted declarations + compliance report |
| `/api/report/pdf` | POST | Generates a downloadable PDF from a compliance report |
| `/extract` (OCR service) | POST | Accepts one image, returns raw OCR text blocks with bounding boxes |

## ⚠️ Known Limitations

We believe in documenting real, tested limitations rather than hiding them — full details in [`docs/known-limitations.md`](docs/known-limitations.md). Key ones:

- Dot-matrix/inkjet-printed dates (common on Indian FMCG packaging) can be difficult for OCR to read reliably
- Font-size compliance checks use an estimated panel area unless a physical reference measurement is provided
- Processing time scales with declaration density on CPU-only deployment

## 🗺️ Roadmap

-  PostgreSQL-backed repository for scan history and search
-  Officer dashboard with inspection trends and violation analytics
-  Role-based authentication (field officer / supervisor / admin)
-  GPU-accelerated deployment for high-volume production use
-  Reference-marker calibration for precise physical font-size measurement
-  Extended classification for Hindi/regional-language declarations
-  API for e-commerce platform integration (pre-listing compliance checks)

## 👥 Team members

Sahil, Puneet kumar, Aditya ray, Neeraj kumar Rana, Akshat gautam and Yashita Bijlani.

## 📚 References

- [The Legal Metrology (Packaged Commodities) Rules, 2011](https://consumeraffairs.nic.in/legalmetrologyactsandrules/legal-metrology-packaged-commodities-rules-2011) — Ministry of Consumer Affairs, Government of India

- [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) — PaddlePaddle Team, Baidu Inc.

[1]: https://legalmetrology.maharashtra.gov.in/en/role-of-the-organization/ "Government of Maharashtra, Legal Metrology Organisation"

---

*Built for Smart India Hackathon 2026 — Problem Statement SIH26034*