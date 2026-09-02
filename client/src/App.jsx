import { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setPreview(URL.createObjectURL(selected));
      setResults(null);
      setError(null);
    }
  };

  const handleScan = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('image', file);

    try {
      const response = await axios.post('http://localhost:5000/api/scan', formData);
      setResults(response.data.text_blocks);
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Legal Metrology Scanner</h1>
      <p>Upload a product label image to extract declarations.</p>

      <input type="file" accept="image/*" onChange={handleFileChange} />
      <button onClick={handleScan} disabled={!file || loading} style={{ marginLeft: '1rem' }}>
        {loading ? 'Scanning...' : 'Scan'}
      </button>

      {preview && (
        <div style={{ marginTop: '1rem' }}>
          <img src={preview} alt="preview" style={{ maxWidth: '300px', border: '1px solid #ccc' }} />
        </div>
      )}

      {error && (
        <p style={{ color: 'red', marginTop: '1rem' }}>Error: {error}</p>
      )}

      {results && (
        <table style={{ marginTop: '2rem', width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #333', textAlign: 'left' }}>
              <th>Text</th>
              <th>Declaration</th>
              <th>Match Confidence</th>
              <th>OCR Confidence</th>
              <th>Font Height (mm)</th>
            </tr>
          </thead>
          <tbody>
            {results.map((block, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                <td>{block.text || <em>(empty)</em>}</td>
                <td>{block.matched_declaration_hint}</td>
                <td>{block.match_confidence}</td>
                <td>{block.confidence}</td>
                <td>{block.font_height_mm_est}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default App;