import React, { useState, useEffect, useRef } from 'react';
import { transcriptsAPI } from '../services/api';
import { PullToRefresh } from './PullToRefresh';

function Transcripts() {
  const [transcripts, setTranscripts] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [showPasteForm, setShowPasteForm] = useState(false);
  const [showRecording, setShowRecording] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const [pasteData, setPasteData] = useState({
    filename: '',
    content: '',
    source: 'manual',
    meetingDate: ''
  });
  const [fileMeetingDate, setFileMeetingDate] = useState('');
  const [processingTranscriptId, setProcessingTranscriptId] = useState(null);
  const [processingProgress, setProcessingProgress] = useState(0);

  useEffect(() => {
    loadTranscripts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadTranscripts = async () => {
    try {
      const response = await transcriptsAPI.getAll();
      const loadedTranscripts = response.data;
      setTranscripts(loadedTranscripts);
      
      // Check if any transcripts are processing and start polling if needed
      const processingTranscript = loadedTranscripts.find(t => 
        t.processing_status === 'processing' && t.id !== processingTranscriptId
      );
      
      if (processingTranscript && !processingTranscriptId) {
        setProcessingTranscriptId(processingTranscript.id);
        setProcessingProgress(processingTranscript.processing_progress || 0);
        pollProcessingStatus(processingTranscript.id);
      }
    } catch (err) {
      setError('Failed to load transcripts');
    }
  };

  const handleRefresh = async () => {
    await loadTranscripts();
  };

  // Poll for processing status
  const pollProcessingStatus = async (transcriptId) => {
    const maxAttempts = 120; // 2 minutes max (1 second intervals)
    let attempts = 0;
    
    const poll = async () => {
      try {
        const response = await transcriptsAPI.getById(transcriptId);
        const transcript = response.data;
        
        if (transcript.processing_status === 'completed') {
          setProcessingTranscriptId(null);
          setProcessingProgress(100);
          setSuccessMessage(`✓ Processing complete: ${transcript.filename}`);
          loadTranscripts();
          setTimeout(() => {
            setSuccessMessage(null);
            setProcessingProgress(0);
          }, 5000);
          return;
        } else if (transcript.processing_status === 'failed') {
          setProcessingTranscriptId(null);
          setProcessingProgress(0);
          setError(`Processing failed for: ${transcript.filename}`);
          loadTranscripts();
          return;
        } else if (transcript.processing_status === 'processing') {
          setProcessingProgress(transcript.processing_progress || 0);
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(poll, 1000); // Poll every second
          } else {
            setProcessingTranscriptId(null);
            setProcessingProgress(0);
            setError('Processing is taking longer than expected. Check back later.');
            loadTranscripts();
          }
        }
      } catch (err) {
        console.error('Error polling status:', err);
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 1000);
        } else {
          setProcessingTranscriptId(null);
          setProcessingProgress(0);
          setError('Unable to check processing status');
        }
      }
    };
    
    poll();
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setSuccessMessage(null);

    const formData = new FormData();
    formData.append('transcript', file);
    if (fileMeetingDate) {
      formData.append('meetingDate', fileMeetingDate);
    }

    try {
      const response = await transcriptsAPI.upload(formData);
      const data = response.data;
      
      if (data.success && data.status === 'processing') {
        // Processing in background
        setSuccessMessage(`✓ Uploaded: ${file.name}\n⏳ Processing in background...`);
        setProcessingTranscriptId(data.transcriptId);
        setProcessingProgress(0);
        loadTranscripts(); // Reload to show new transcript
        event.target.value = ''; // Clear the input
        setFileMeetingDate(''); // Clear meeting date
        setUploading(false); // Allow user to continue
        
        // Start polling for status
        setTimeout(() => pollProcessingStatus(data.transcriptId), 1000);
      } else {
        // Legacy response format (shouldn't happen with new backend)
        setSuccessMessage(`Successfully uploaded: ${file.name}`);
        loadTranscripts();
        event.target.value = '';
        setFileMeetingDate('');
        setUploading(false);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to upload transcript');
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
      const response = await transcriptsAPI.uploadText({
        ...pasteData,
        meetingDate: pasteData.meetingDate || undefined
      });
      const data = response.data;
      
      if (data.success && data.status === 'processing') {
        // Processing in background
        setSuccessMessage(`✓ Saved: ${pasteData.filename}\n⏳ Processing in background...`);
        setProcessingTranscriptId(data.transcriptId);
        setProcessingProgress(0);
        setPasteData({ filename: '', content: '', source: 'manual', meetingDate: '' });
        setShowPasteForm(false);
        loadTranscripts(); // Reload to show new transcript
        setUploading(false); // Allow user to continue
        
        // Start polling for status
        setTimeout(() => pollProcessingStatus(data.transcriptId), 1000);
      } else {
        // Legacy response format (shouldn't happen with new backend)
        setSuccessMessage(`Successfully saved: ${pasteData.filename}`);
        setPasteData({ filename: '', content: '', source: 'manual', meetingDate: '' });
        setShowPasteForm(false);
        loadTranscripts();
        setUploading(false);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save transcript');
      setUploading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { 
          type: mediaRecorder.mimeType 
        });
        setAudioBlob(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      setError('Failed to access microphone. Please check permissions.');
      console.error('Recording error:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  const cancelRecording = () => {
    stopRecording();
    setAudioBlob(null);
    setRecordingTime(0);
    setShowRecording(false);
    audioChunksRef.current = [];
  };

  const handleRecordingUpload = async () => {
    if (!audioBlob) return;

    setUploading(true);
    setError(null);
    setSuccessMessage(null);

    const formData = new FormData();
    const filename = `recording-${new Date().toISOString()}.${audioBlob.type.includes('webm') ? 'webm' : 'mp4'}`;
    formData.append('transcript', audioBlob, filename);
    if (fileMeetingDate) {
      formData.append('meetingDate', fileMeetingDate);
    }

    try {
      const response = await transcriptsAPI.upload(formData);
      const data = response.data;
      
      if (data.success && data.status === 'processing') {
        setSuccessMessage(`✓ Recording uploaded!\n⏳ Transcribing with AI...`);
        setProcessingTranscriptId(data.transcriptId);
        setProcessingProgress(0);
        setAudioBlob(null);
        setRecordingTime(0);
        setShowRecording(false);
        setFileMeetingDate('');
        loadTranscripts();
        setUploading(false);
        setTimeout(() => pollProcessingStatus(data.transcriptId), 1000);
      } else {
        setSuccessMessage(`Successfully uploaded recording`);
        setAudioBlob(null);
        setRecordingTime(0);
        setShowRecording(false);
        setFileMeetingDate('');
        loadTranscripts();
        setUploading(false);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to upload recording');
      setUploading(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="transcripts">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2>Upload Transcript</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              onClick={() => {
                setShowRecording(!showRecording);
                setShowPasteForm(false);
              }}
              className="secondary glass-button"
              style={{ 
                minWidth: '44px',
                width: '44px',
                height: '44px',
                padding: '0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.2rem'
              }}
            >
              {showRecording ? '📁' : '🎤'}
            </button>
            <button 
              onClick={() => {
                setShowPasteForm(!showPasteForm);
                setShowRecording(false);
              }}
              className="secondary glass-button"
              style={{ 
                minWidth: '44px',
                width: '44px',
                height: '44px',
                padding: '0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.2rem'
              }}
            >
              {showPasteForm ? '📁' : '📝'}
            </button>
          </div>
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

        {processingTranscriptId && (
          <div style={{ 
            backgroundColor: '#18181b', 
            border: '1px solid #3f3f46',
            padding: '1rem', 
            borderRadius: '8px', 
            marginBottom: '1rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ color: '#60a5fa', fontSize: '0.9rem', fontWeight: '500' }}>
                ⏳ Processing transcript...
              </span>
              <span style={{ color: '#a1a1aa', fontSize: '0.85rem' }}>
                {processingProgress}%
              </span>
            </div>
            <div style={{
              width: '100%',
              height: '8px',
              backgroundColor: '#27272a',
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${processingProgress}%`,
                height: '100%',
                backgroundColor: '#60a5fa',
                transition: 'width 0.3s ease',
                borderRadius: '4px'
              }} />
            </div>
            <p style={{ fontSize: '0.85rem', color: '#6e6e73', marginTop: '0.5rem', marginBottom: 0 }}>
              This may take 30-60 seconds. You can continue using the app.
            </p>
          </div>
        )}

        {showRecording ? (
          <div className="recording-panel glass-panel">
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div className="recording-visualizer">
                {isRecording && (
                  <>
                    <div className="pulse-ring"></div>
                    <div className="pulse-ring" style={{ animationDelay: '0.5s' }}></div>
                    <div className="pulse-ring" style={{ animationDelay: '1s' }}></div>
                  </>
                )}
                <div className={`recording-icon ${isRecording ? 'recording' : ''}`}>
                  🎤
                </div>
              </div>
              
              <div style={{ fontSize: '2rem', fontWeight: '600', color: '#60a5fa', marginTop: '1.5rem', marginBottom: '0.5rem' }}>
                {formatTime(recordingTime)}
              </div>
              
              {!isRecording && !audioBlob && (
                <p style={{ color: '#a1a1aa', marginBottom: '1.5rem' }}>
                  Record your meeting notes or voice memo
                </p>
              )}
              
              {audioBlob && !isRecording && (
                <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
                  <p style={{ color: '#34d399', marginBottom: '0.5rem', fontWeight: '500' }}>
                    ✓ Recording complete ({formatTime(recordingTime)})
                  </p>
                  <audio 
                    controls 
                    src={URL.createObjectURL(audioBlob)}
                    style={{ 
                      width: '100%', 
                      marginTop: '1rem',
                      borderRadius: '8px' 
                    }}
                  />
                </div>
              )}
              
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1.5rem' }}>
                {!isRecording && !audioBlob && (
                  <button 
                    onClick={startRecording}
                    className="primary glass-button-primary"
                    style={{ padding: '0.75rem 2rem', fontSize: '1rem' }}
                  >
                    <span style={{ fontSize: '1.2rem', marginRight: '0.5rem' }}>⏺</span>
                    Start Recording
                  </button>
                )}
                
                {isRecording && (
                  <button 
                    onClick={stopRecording}
                    className="glass-button-stop"
                    style={{ padding: '0.75rem 2rem', fontSize: '1rem' }}
                  >
                    <span style={{ fontSize: '1.2rem', marginRight: '0.5rem' }}>⏹</span>
                    Stop
                  </button>
                )}
                
                {audioBlob && !isRecording && (
                  <>
                    <button 
                      onClick={handleRecordingUpload}
                      disabled={uploading}
                      className="primary glass-button-primary"
                      style={{ padding: '0.75rem 2rem', fontSize: '1rem' }}
                    >
                      {uploading ? '⏳ Processing...' : '✓ Upload & Transcribe'}
                    </button>
                    <button 
                      onClick={cancelRecording}
                      className="secondary glass-button"
                      style={{ padding: '0.75rem 1.5rem' }}
                    >
                      ✕ Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : !showPasteForm ? (
          <>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
                Meeting Date (Optional)
              </label>
              <input
                type="date"
                value={fileMeetingDate}
                onChange={(e) => setFileMeetingDate(e.target.value)}
                style={{ marginBottom: '1rem' }}
                max={new Date().toISOString().split('T')[0]}
              />
              <p style={{ fontSize: '0.85rem', color: '#6e6e73', marginTop: '-0.5rem', marginBottom: '1rem' }}>
                Enter the date the meeting occurred (helps AI set accurate deadlines)
              </p>
            </div>
            
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
              Meeting Title *
            </label>
            <input
              type="text"
              value={pasteData.filename}
              onChange={(e) => setPasteData({ ...pasteData, filename: e.target.value })}
              placeholder="e.g., Team Standup - Q4 Planning"
              required
            />
            
            <label style={{ display: 'block', marginBottom: '0.5rem', marginTop: '1rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
              Meeting Date (Optional)
            </label>
            <input
              type="date"
              value={pasteData.meetingDate}
              onChange={(e) => setPasteData({ ...pasteData, meetingDate: e.target.value })}
              max={new Date().toISOString().split('T')[0]}
              style={{ marginBottom: '0.5rem' }}
            />
            <p style={{ fontSize: '0.85rem', color: '#6e6e73', marginTop: '-0.5rem', marginBottom: '1rem' }}>
              Enter the date the meeting occurred (helps AI set accurate deadlines)
            </p>

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
                  setPasteData({ filename: '', content: '', source: 'manual', meetingDate: '' });
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
          <>
            {/* Desktop table view */}
            <div className="transcripts-table-desktop" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #d2d2d7' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Filename</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Upload Date</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Source</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Status</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {transcripts.map((transcript) => {
                    const isProcessing = transcript.processing_status === 'processing';
                    const isFailed = transcript.processing_status === 'failed';
                    return (
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
                        <td style={{ padding: '0.75rem' }}>
                          {isProcessing ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ color: '#60a5fa', fontSize: '0.85rem' }}>⏳ Processing</span>
                              <div style={{
                                width: '60px',
                                height: '4px',
                                backgroundColor: '#27272a',
                                borderRadius: '2px',
                                overflow: 'hidden'
                              }}>
                                <div style={{
                                  width: `${transcript.processing_progress || 0}%`,
                                  height: '100%',
                                  backgroundColor: '#60a5fa',
                                  transition: 'width 0.3s ease'
                                }} />
                              </div>
                              <span style={{ color: '#a1a1aa', fontSize: '0.75rem' }}>
                                {transcript.processing_progress || 0}%
                              </span>
                            </div>
                          ) : isFailed ? (
                            <span style={{ color: '#ef4444', fontSize: '0.85rem' }}>❌ Failed</span>
                          ) : (
                            <span style={{ color: '#22c55e', fontSize: '0.85rem' }}>✓ Complete</span>
                          )}
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
                            disabled={uploading || isProcessing}
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
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile card view */}
            <div className="transcripts-table-mobile">
              {transcripts.map((transcript) => {
                const isProcessing = transcript.processing_status === 'processing';
                const isFailed = transcript.processing_status === 'failed';
                return (
                  <div
                    key={transcript.id}
                    style={{
                      backgroundColor: '#18181b',
                      border: '1px solid #3f3f46',
                      borderRadius: '8px',
                      padding: '1rem',
                      marginBottom: '1rem'
                    }}
                  >
                    <div style={{ marginBottom: '0.75rem' }}>
                      <h3 style={{ margin: 0, fontSize: '1rem', color: '#e5e5e7', wordBreak: 'break-word' }}>
                        {transcript.filename}
                      </h3>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.875rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#a1a1aa' }}>Upload Date:</span>
                        <span style={{ color: '#e5e5e7' }}>
                          {new Date(transcript.upload_date).toLocaleDateString()}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#a1a1aa' }}>Source:</span>
                        <span style={{ 
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.85rem',
                          backgroundColor: '#27272a',
                          color: '#a1a1aa'
                        }}>
                          {transcript.source}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#a1a1aa' }}>Status:</span>
                        {isProcessing ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, justifyContent: 'flex-end' }}>
                            <span style={{ color: '#60a5fa', fontSize: '0.85rem' }}>⏳ Processing</span>
                            <div style={{
                              width: '60px',
                              height: '4px',
                              backgroundColor: '#27272a',
                              borderRadius: '2px',
                              overflow: 'hidden'
                            }}>
                              <div style={{
                                width: `${transcript.processing_progress || 0}%`,
                                height: '100%',
                                backgroundColor: '#60a5fa',
                                transition: 'width 0.3s ease'
                              }} />
                            </div>
                            <span style={{ color: '#a1a1aa', fontSize: '0.75rem' }}>
                              {transcript.processing_progress || 0}%
                            </span>
                          </div>
                        ) : isFailed ? (
                          <span style={{ color: '#ef4444', fontSize: '0.85rem' }}>❌ Failed</span>
                        ) : (
                          <span style={{ color: '#22c55e', fontSize: '0.85rem' }}>✓ Complete</span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <button
                        className="secondary"
                        style={{ 
                          padding: '0.625rem 1rem', 
                          fontSize: '0.875rem',
                          width: '100%'
                        }}
                        onClick={() => handleViewTranscript(transcript.id)}
                      >
                        View
                      </button>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          className="secondary"
                          style={{ 
                            padding: '0.625rem 1rem', 
                            fontSize: '0.875rem',
                            flex: 1
                          }}
                          onClick={() => handleReprocess(transcript.id, transcript.filename)}
                          disabled={uploading || isProcessing}
                          title="Re-extract commitments and action items"
                        >
                          🔄 Reprocess
                        </button>
                        <button
                          className="secondary"
                          style={{ 
                            padding: '0.625rem 1rem', 
                            fontSize: '0.875rem',
                            flex: 1
                          }}
                          onClick={() => handleDelete(transcript.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
      </div>
    </PullToRefresh>
  );
}

export default Transcripts;
