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
    alert('Weekly Report feature coming soon! This will generate a summary of the past week\'s activities.');
  };

  const handleViewCalendar = () => {
    alert('Calendar integration coming soon! This will show your upcoming events and allow you to create time blocks.');
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
            color: '#1d1d1f'
          }}>
            <ReactMarkdown>{brief}</ReactMarkdown>
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
        </div>
        
        <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#f5f5f7', borderRadius: '8px' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>💡 Tips</h3>
          <ul style={{ fontSize: '0.9rem', color: '#6e6e73', lineHeight: '1.6', paddingLeft: '1.5rem' }}>
            <li>Upload transcripts regularly to keep your context fresh</li>
            <li>Generate your brief each morning for daily priorities</li>
            <li>Review commitments to stay on top of deadlines</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
