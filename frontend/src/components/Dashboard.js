import React, { useState, useEffect } from 'react';
import { briefAPI } from '../services/api';
import ReactMarkdown from 'react-markdown';

function Dashboard({ setActiveTab }) {
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastGenerated, setLastGenerated] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    loadTodaysBrief();
  }, []);

  const loadTodaysBrief = async () => {
    const today = new Date().toISOString().split('T')[0];
    try {
      const response = await briefAPI.getByDate(today);
      setBrief(response.data.content);
      setLastGenerated(response.data.created_date);
    } catch (err) {
      // No brief for today yet, that's okay
      console.log('No brief for today yet');
    }
  };

  const generateBrief = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await briefAPI.generate();
      setBrief(response.data.brief);
      setLastGenerated(response.data.generatedAt);
      setStats(response.data.stats);
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to generate brief';
      setError(errorMessage);
      console.error('Brief generation error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewTranscripts = () => {
    // Navigate to transcripts tab
    if (setActiveTab) {
      setActiveTab('transcripts');
    }
  };

  const handleGenerateWeeklyReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await briefAPI.generateWeeklyReport();
      // Show the report in a modal or new section
      const reportWindow = window.open('', '_blank', 'width=800,height=600');
      reportWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Weekly Report - ${new Date().toLocaleDateString()}</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
              max-width: 800px;
              margin: 2rem auto;
              padding: 2rem;
              background: #1a1a1a;
              color: #e4e4e7;
              line-height: 1.6;
            }
            h1, h2, h3 { color: #60a5fa; }
            ul { margin-left: 1.5rem; }
            strong { color: #fbbf24; }
            .stats {
              display: flex;
              gap: 1rem;
              margin: 1rem 0;
              padding: 1rem;
              background: #27272a;
              border-radius: 8px;
            }
            .stat {
              flex: 1;
              text-align: center;
            }
            .stat-value {
              font-size: 2rem;
              font-weight: bold;
              color: #60a5fa;
            }
            .stat-label {
              font-size: 0.9rem;
              color: #a1a1aa;
            }
            pre {
              background: #27272a;
              padding: 1rem;
              border-radius: 8px;
              overflow-x: auto;
              white-space: pre-wrap;
            }
          </style>
        </head>
        <body>
          <h1>📊 Weekly Report</h1>
          <p><em>Generated: ${new Date(response.data.generatedAt).toLocaleString()}</em></p>
          
          ${response.data.stats ? `
          <div class="stats">
            <div class="stat">
              <div class="stat-value">${response.data.stats.totalTranscripts || 0}</div>
              <div class="stat-label">Transcripts</div>
            </div>
            <div class="stat">
              <div class="stat-value">${response.data.stats.completedCommitments || 0}</div>
              <div class="stat-label">Completed</div>
            </div>
            <div class="stat">
              <div class="stat-value">${response.data.stats.pendingCommitments || 0}</div>
              <div class="stat-label">Pending</div>
            </div>
          </div>
          ` : ''}
          
          <pre>${response.data.report}</pre>
          
          <button onclick="window.print()" style="
            margin-top: 1rem;
            padding: 0.75rem 1.5rem;
            background: #3b82f6;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 1rem;
          ">🖨️ Print Report</button>
        </body>
        </html>
      `);
      reportWindow.document.close();
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to generate weekly report';
      setError(errorMessage);
      console.error('Weekly report generation error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewCalendar = () => {
    // Navigate to calendar tab
    if (setActiveTab) {
      setActiveTab('calendar');
    }
  };

  return (
    <div className="dashboard">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2>Morning Dashboard</h2>
          <button onClick={generateBrief} disabled={loading}>
            {loading ? 'Generating...' : '🔄 Generate Brief'}
          </button>
        </div>

        {lastGenerated && (
          <p style={{ color: '#6e6e73', fontSize: '0.9rem', marginBottom: '1rem' }}>
            Last generated: {new Date(lastGenerated).toLocaleString()}
          </p>
        )}

        {stats && (
          <div style={{ 
            display: 'flex', 
            gap: '1rem', 
            marginBottom: '1rem', 
            padding: '1rem', 
            backgroundColor: '#f5f5f7', 
            borderRadius: '8px' 
          }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#007aff' }}>
                {stats.contextCount || 0}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#6e6e73' }}>Context Items</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ff9500' }}>
                {stats.commitmentCount || 0}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#6e6e73' }}>Commitments</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#34c759' }}>
                {stats.transcriptCount || 0}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#6e6e73' }}>Transcripts</div>
            </div>
          </div>
        )}

        {error && (
          <div className="error" style={{ 
            backgroundColor: '#ffe5e5', 
            color: '#d70015', 
            padding: '1rem', 
            borderRadius: '8px', 
            marginBottom: '1rem' 
          }}>
            <strong>Error:</strong> {error}
            {error.includes('API key') && (
              <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                Please configure your Anthropic API key in the Configuration tab.
              </p>
            )}
          </div>
        )}

        {loading && (
          <div className="loading" style={{ 
            textAlign: 'center', 
            padding: '3rem', 
            color: '#6e6e73' 
          }}>
            <div style={{ 
              fontSize: '2rem', 
              marginBottom: '1rem',
              animation: 'spin 2s linear infinite',
              display: 'inline-block'
            }}>
              ⏳
            </div>
            <p>Generating your daily brief...</p>
            <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
              This may take 10-15 seconds
            </p>
          </div>
        )}

        {brief && !loading && (
          <div className="brief-content" style={{ 
            lineHeight: '1.6',
            color: '#e5e5e7'
          }}>
            <ReactMarkdown
              components={{
                h1: ({node, ...props}) => <h1 style={{color: '#fff', marginTop: '1.5rem', marginBottom: '0.5rem'}} {...props} />,
                h2: ({node, ...props}) => <h2 style={{color: '#60a5fa', marginTop: '1.5rem', marginBottom: '0.5rem'}} {...props} />,
                h3: ({node, ...props}) => <h3 style={{color: '#fbbf24', marginTop: '1rem', marginBottom: '0.5rem'}} {...props} />,
                strong: ({node, ...props}) => <strong style={{color: '#fbbf24'}} {...props} />,
                em: ({node, ...props}) => <em style={{color: '#a1a1aa'}} {...props} />,
                ul: ({node, ...props}) => <ul style={{marginLeft: '1.5rem', marginTop: '0.5rem', marginBottom: '0.5rem'}} {...props} />,
                ol: ({node, ...props}) => <ol style={{marginLeft: '1.5rem', marginTop: '0.5rem', marginBottom: '0.5rem'}} {...props} />,
                li: ({node, ...props}) => <li style={{marginBottom: '0.25rem', color: '#e5e5e7'}} {...props} />,
                p: ({node, ...props}) => <p style={{marginBottom: '0.75rem', color: '#e5e5e7'}} {...props} />
              }}
            >
              {brief}
            </ReactMarkdown>
          </div>
        )}

        {!brief && !loading && !error && (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6e6e73' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
            <p>No brief generated yet for today.</p>
            <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
              Click "Generate Brief" to create your daily priorities and action items.
            </p>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Quick Actions</h2>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button 
            className="secondary"
            onClick={handleViewTranscripts}
          >
            📝 View Recent Transcripts
          </button>
          <button 
            className="secondary"
            onClick={handleGenerateWeeklyReport}
          >
            📊 Generate Weekly Report
          </button>
          <button 
            className="secondary"
            onClick={handleViewCalendar}
          >
            📅 View Calendar
          </button>
          <button 
            className="secondary"
            onClick={() => setActiveTab && setActiveTab('tasks')}
          >
            📋 View All Tasks
          </button>
        </div>
        
        <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#f5f5f7', borderRadius: '8px' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>💡 Tips</h3>
          <ul style={{ fontSize: '0.9rem', color: '#6e6e73', lineHeight: '1.6', paddingLeft: '1.5rem' }}>
            <li>Upload transcripts regularly to keep your context fresh</li>
            <li>Generate your brief each morning for daily priorities</li>
            <li>Review tasks to stay on top of deadlines</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
