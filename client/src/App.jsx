import { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [productOpts, setProductOpts] = useState({
    isImported: false,
    isPerishable: true,
    isSizeRelevant: false,
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
  const newFiles = Array.from(e.target.files);
  const combined = [...files, ...newFiles];
  setFiles(combined);
  setPreviews(combined.map((f) => URL.createObjectURL(f)));
  setData(null);
  setError(null);
  e.target.value = ''; // reset so choosing the same file again still fires onChange
};


const removeFile = (index) => {
  const updatedFiles = files.filter((_, i) => i !== index);
  setFiles(updatedFiles);
  setPreviews(updatedFiles.map((f) => URL.createObjectURL(f)));
};

const handleDownloadPdf = async () => {
  if (!data) return;
  try {
    const response = await axios.post(
      'http://localhost:5000/api/report/pdf',
      {
        compliance: data.compliance,
        meta: { scannedAt: new Date().toISOString(), imageCount: files.length },
      },
      { responseType: 'blob' }
    );
    const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'compliance-report.pdf';
    link.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    setError('Failed to generate PDF: ' + err.message);
  }
};

  const handleScan = async () => {
    if (files.length === 0) return;
    setLoading(true);
    setError(null);

    const formData = new FormData();
    files.forEach((f) => formData.append('images', f));
    formData.append('isImported', productOpts.isImported);
    formData.append('isPerishable', productOpts.isPerishable);
    formData.append('isSizeRelevant', productOpts.isSizeRelevant);

    try {
      const response = await axios.post('http://localhost:5000/api/scan', formData);
      setData(response.data);
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const severityStyles = {
  HARD: { color: '#8C2F26', bg: '#FBEAE8', label: 'Missing', icon: '✕' },
  FORMAT: { color: '#8C2F26', bg: '#FBEAE8', label: 'Malformed', icon: '✕' },
  FONT: { color: '#8C2F26', bg: '#FBEAE8', label: 'Font too small', icon: '✕' },
  WARNING: { color: '#8A5A17', bg: '#FCF3E3', label: 'Needs review', icon: '!' },
  PASS: { color: '#2A6B4C', bg: '#E9F5EF', label: 'Compliant', icon: '✓' },
  NOT_APPLICABLE: { color: '#5C6470', bg: '#F1F2F4', label: 'Not applicable', icon: '–' },
};

  return (
    <div className="page">
      <header className="page-header">
        <h1>Legal Metrology Scanner</h1>
        <p>Upload photos of every panel showing declarations, then scan for compliance.</p>
      </header>

      <section className="upload-panel">
        <div className="upload-row">
          <label className="file-input-label">
            Choose photos
            <input type="file" accept="image/*" multiple onChange={handleFileChange} />
          </label>
          <button onClick={handleScan} disabled={files.length === 0 || loading} className="scan-button">
            {loading ? 'Scanning…' : `Scan ${files.length > 0 ? `(${files.length} photo${files.length > 1 ? 's' : ''})` : ''}`}
          </button>
        </div>

        <div className="product-opts">
          <label>
            <input
              type="checkbox"
              checked={productOpts.isImported}
              onChange={(e) => setProductOpts({ ...productOpts, isImported: e.target.checked })}
            />
            Imported product
          </label>
          <label>
            <input
              type="checkbox"
              checked={productOpts.isPerishable}
              onChange={(e) => setProductOpts({ ...productOpts, isPerishable: e.target.checked })}
            />
            Has expiry / best-before date
          </label>
          <label>
            <input
              type="checkbox"
              checked={productOpts.isSizeRelevant}
              onChange={(e) => setProductOpts({ ...productOpts, isSizeRelevant: e.target.checked })}
            />
            Dimensions are a required declaration
          </label>
        </div>

        {previews.length > 0 && (
  <div className="preview-strip">
    {previews.map((src, i) => (
      <div key={i} className="preview-thumb-wrapper">
        <img src={src} alt={`panel ${i + 1}`} className="preview-thumb" />
        <button className="remove-thumb" onClick={() => removeFile(i)}>×</button>
      </div>
    ))}
  </div>
)}

        {error && <p className="error-text">Error: {error}</p>}
      </section>

      {data && (
        <>
          <section className="summary-panel">
            <div className="score-block">
              <span className="score-number">{data.compliance.summary.compliancePct}%</span>
              <span className="score-label">Compliance</span>
            </div>
            <div className="summary-counts">
              <div><strong>{data.compliance.summary.passed}</strong> passed</div>
              <div><strong>{data.compliance.summary.hardViolations}</strong> missing</div>
              <div><strong>{data.compliance.summary.formatViolations}</strong> malformed</div>
              <div><strong>{data.compliance.summary.fontViolations}</strong> font too small</div>
              <div><strong>{data.compliance.summary.warnings}</strong> need review</div>
            </div>
            <button onClick={handleDownloadPdf} className="pdf-button">Download PDF Report</button>
          </section>

          <section className="results-panel">
            <h2>Declaration checklist</h2>
            <table className="results-table">
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Declaration</th>
                  <th>Status</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {data.compliance.results.map((r, i) => {
                  const style = severityStyles[r.severity] || severityStyles.NOT_APPLICABLE;
                  return (
                    <tr key={i}>
                      <td className="rule-ref">{r.ruleRef}</td>
                      <td>{r.label}</td>
                      <td>
                        <span className="status-pill" style={{ color: style.color, background: style.bg }}>
                          {style.label}
                        </span>
                      </td>
                      <td className="detail-text">
                        {r.message}
                        {r.evidence?.text && <span className="evidence"> — "{r.evidence.text}"</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="raw-panel">
            <details>
              <summary>Raw extracted text by photo</summary>
              {data.images.map((img, i) => (
                <div key={i} className="raw-image-block">
                  <h3>{img.filename}</h3>
                  <ul>
                    {img.blocks.map((b, j) => (
                      <li key={j}>
                        <span className="raw-text">{b.text || '(empty)'}</span>
                        <span className="raw-tag">{b.matched_declaration_hint}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </details>
          </section>
        </>
      )}
    </div>
  );
}

export default App;