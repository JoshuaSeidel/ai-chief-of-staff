import React, { useState, useEffect } from 'react';
import { transcriptsAPI } from '../services/api';

function Transcripts() {
  const [transcripts, setTranscripts] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [showPasteForm, setShowPasteForm] = useState(false);
  const [pasteData, setPasteData] = useState({
    filename: '',
    content: '',
    source: 'manual'
  });

  useEffect(() => {
    loadTranscripts();
  }, []);

  const loadTranscripts = async () => {
    try {
      const response = await transcriptsAPI.getAll();
      setTranscripts(response.data);
    } catch (err) {
      setError('Failed to load transcripts');
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setSuccessMessage(null);

    const formData = new FormData();
    formData.append('transcript', file);

    try {
      const response = await transcriptsAPI.upload(formData);
      const data = response.data;
      
      let message = `Successfully uploaded: ${file.name}`;
      if (data.extracted) {
        message += `\n✓ Extracted ${data.extracted.commitments?.length || 0} commitments`;
        message += `\n✓ Extracted ${data.extracted.actionItems?.length || 0} action items`;
      }
      
      setSuccessMessage(message);
      loadTranscripts(); // Reload the list
      event.target.value = ''; // Clear the input
      
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to upload transcript');
    } finally {
      setUploading(false);
    }
  };

  const handlePasteSubmit = async (e) => {
    e.preventDefault();
    
    if (!pasteData.filename || !pasteData.content) {
      setError('Please provide both a filename and transcript content');
      return;
    }

    setUploading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await transcriptsAPI.uploadText(pasteData);
      const data = response.data;
      
      let message = `Successfully saved: ${pasteData.filename}`;
      if (data.extracted) {
        message += `\n✓ Extracted ${data.extracted.commitments?.length || 0} commitments`;
        message += `\n✓ Extracted ${data.extracted.actionItems?.length || 0} action items`;
      }
      
      setSuccessMessage(message);
      setPasteData({ filename: '', content: '', source: 'manual' });
      setShowPasteForm(false);
      loadTranscripts();
      
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save transcript');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this transcript?')) {
      return;
    }

    try {
      await transcriptsAPI.delete(id);
      setSuccessMessage('Transcript deleted successfully');
      loadTranscripts();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError('Failed to delete transcript');
    }
  };

  const handleReprocess = async (id, filename) => {
    if (!window.confirm(`Reprocess "${filename}"?\n\nThis will re-extract commitments and action items using Claude AI.`)) {
      return;
    }

    setUploading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await transcriptsAPI.reprocess(id);
      const data = response.data;
      
      if (data.success) {
        let message = `Successfully reprocessed: ${filename}`;
        if (data.extracted) {
          message += `\n✓ Extracted ${data.extracted.commitments || 0} commitments`;
          message += `\n✓ Extracted ${data.extracted.actionItems || 0} action items`;
          message += `\n✓ Extracted ${data.extracted.followUps || 0} follow-ups`;
          message += `\n✓ Extracted ${data.extracted.risks || 0} risks`;
        }
        setSuccessMessage(message);
      } else {
        setError(data.message || 'Reprocessing failed');
      }
      
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reprocess transcript');
    } finally {
      setUploading(false);
    }
  };

  const handleViewTranscript = async (id) => {
    try {
      const response = await transcriptsAPI.getById(id);
      const transcript = response.data;
      
      // Open in a modal/new window
      const viewWindow = window.open('', '_blank', 'width=800,height=600');
      viewWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${transcript.filename}</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              max-width: 800px;
              margin: 2rem auto;
              padding: 2rem;
              background: #1a1a1a;
              color: #e4e4e7;
              line-height: 1.6;
            }
            h1 { color: #60a5fa; }
            .meta {
              color: #a1a1aa;
              font-size: 0.9rem;
              margin-bottom: 2rem;
              padding-bottom: 1rem;
              border-bottom: 1px solid #3f3f46;
            }
            pre {
              white-space: pre-wrap;
              word-wrap: break-word;
              background: #27272a;
              padding: 1.5rem;
              border-radius: 8px;
              line-height: 1.8;
            }
          </style>
        </head>
        <body>
          <h1>📄 ${transcript.filename}</h1>
          <div class="meta">
            <div>Uploaded: ${new Date(transcript.upload_date).toLocaleString()}</div>
            <div>Source: ${transcript.source}</div>
          </div>
          <pre>${transcript.content}</pre>
        </body>
        </html>
      `);
      viewWindow.document.close();
    } catch (err) {
      setError('Failed to view transcript');
    }
  };

  return (
    <div className="transcripts">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2>Upload Transcript</h2>
          <button 
            onClick={() => setShowPasteForm(!showPasteForm)}
            className="secondary"
          >
            {showPasteForm ? 'Upload File' : '📝 Paste Text'}
          </button>
        </div>
        
        {error && (
          <div style={{ 
            backgroundColor: '#ffe5e5', 
            color: '#d70015', 
            padding: '1rem', 
            borderRadius: '8px', 
            marginBottom: '1rem' 
          }}>
            {error}
          </div>
        )}
        
        {successMessage && (
          <div style={{ 
            backgroundColor: '#e5ffe5', 
            color: '#00a000', 
            padding: '1rem', 
            borderRadius: '8px', 
            marginBottom: '1rem',
            whiteSpace: 'pre-line'
          }}>
            {successMessage}
          </div>
        )}

        {!showPasteForm ? (
          <>
            <div 
              className="file-upload" 
              onClick={() => document.getElementById('file-input').click()}
            >
              <input
                id="file-input"
                type="file"
                accept=".txt,.doc,.docx,.pdf"
                onChange={handleFileUpload}
                disabled={uploading}
              />
              <div>
                <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                  {uploading ? '⏳ Uploading & Processing...' : '📁 Click to upload transcript file'}
                </p>
                <p style={{ fontSize: '0.9rem', color: '#6e6e73' }}>
                  Supports .txt, .doc, .docx, .pdf files (max 10MB)
                </p>
              </div>
            </div>

            <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#6e6e73' }}>
              Upload meeting transcripts from Plaud, Microsoft Teams, or any other source. 
              The system will automatically extract commitments and action items using Claude AI.
            </p>
          </>
        ) : (
          <form onSubmit={handlePasteSubmit} style={{ 
            backgroundColor: '#18181b', 
            padding: '1.5rem', 
            borderRadius: '8px',
            border: '1px solid #3f3f46'
          }}>
            <h3 style={{ marginTop: 0 }}>Paste Transcript Text</h3>
            
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
              Filename *
            </label>
            <input
              type="text"
              value={pasteData.filename}
              onChange={(e) => setPasteData({ ...pasteData, filename: e.target.value })}
              placeholder="e.g., Team Meeting 2024-01-15.txt"
              required
            />

            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
              Source
            </label>
            <select
              value={pasteData.source}
              onChange={(e) => setPasteData({ ...pasteData, source: e.target.value })}
              style={{ marginBottom: '1rem' }}
            >
              <option value="manual">Manual Entry</option>
              <option value="plaud">Plaud Note</option>
              <option value="teams">Microsoft Teams</option>
              <option value="zoom">Zoom</option>
              <option value="other">Other</option>
            </select>

            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
              Transcript Content *
            </label>
            <textarea
              value={pasteData.content}
              onChange={(e) => setPasteData({ ...pasteData, content: e.target.value })}
              placeholder="Paste your meeting transcript here..."
              rows="15"
              required
              style={{ 
                resize: 'vertical',
                fontFamily: 'monospace',
                fontSize: '0.9rem'
              }}
            />

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button type="submit" disabled={uploading}>
                {uploading ? '⏳ Processing...' : '💾 Save & Process'}
              </button>
              <button 
                type="button" 
                className="secondary"
                onClick={() => {
                  setShowPasteForm(false);
                  setPasteData({ filename: '', content: '', source: 'manual' });
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="card">
        <h2>Recent Transcripts</h2>
        
        {transcripts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6e6e73' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📝</div>
            <p>No transcripts uploaded yet.</p>
            <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
              Upload a file or paste transcript text to get started.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #d2d2d7' }}>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>Filename</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>Upload Date</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>Source</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {transcripts.map((transcript) => (
                  <tr key={transcript.id} style={{ borderBottom: '1px solid #f5f5f7' }}>
                    <td style={{ padding: '0.75rem' }}>{transcript.filename}</td>
                    <td style={{ padding: '0.75rem' }}>
                      {new Date(transcript.upload_date).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <span style={{ 
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.85rem',
                        backgroundColor: '#18181b',
                        color: '#a1a1aa'
                      }}>
                        {transcript.source}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                      <button
                        className="secondary"
                        style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', marginRight: '0.5rem' }}
                        onClick={() => handleViewTranscript(transcript.id)}
                      >
                        View
                      </button>
                      <button
                        className="secondary"
                        style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', marginRight: '0.5rem' }}
                        onClick={() => handleReprocess(transcript.id, transcript.filename)}
                        disabled={uploading}
                        title="Re-extract commitments and action items"
                      >
                        🔄 Reprocess
                      </button>
                      <button
                        className="secondary"
                        style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                        onClick={() => handleDelete(transcript.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Transcripts;
