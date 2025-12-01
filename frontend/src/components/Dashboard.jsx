import React, { useState, useEffect } from 'react';
import { briefAPI, intelligenceAPI } from '../services/api';
import ReactMarkdown from 'react-markdown';
import { PullToRefresh } from './PullToRefresh';

function Dashboard({ setActiveTab }) {
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastGenerated, setLastGenerated] = useState(null);
  const [stats, setStats] = useState(null);
  const [productivityInsights, setProductivityInsights] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [lastInsightsDate, setLastInsightsDate] = useState(null);
  const [lastCompletedCount, setLastCompletedCount] = useState(null);

  useEffect(() => {
    loadTodaysBrief();
    loadProductivityInsights();
  }, []);

  const loadProductivityInsights = async (forceRefresh = false) => {
    const today = new Date().toISOString().split('T')[0];
    
    // Check if we need to refresh insights
    const cachedInsights = localStorage.getItem('productivityInsights');
    const cachedDate = localStorage.getItem('productivityInsightsDate');
    const cachedCompletedCount = localStorage.getItem('productivityCompletedCount');
    
    if (!forceRefresh && cachedInsights && cachedDate === today) {
      // Use cached insights if date hasn't changed
      try {
        const cached = JSON.parse(cachedInsights);
        setProductivityInsights(cached);
        setLastInsightsDate(cachedDate);
        setLastCompletedCount(parseInt(cachedCompletedCount || '0'));
        console.log('Using cached productivity insights from', cachedDate);
        return;
      } catch (err) {
        console.error('Error parsing cached insights:', err);
      }
    }
    
    setLoadingInsights(true);
    try {
      const response = await intelligenceAPI.analyzePatterns(null, '7d');
      console.log('Pattern analysis response:', response.data);
      if (response.data && response.data.success) {
        setProductivityInsights(response.data);
        // Cache the insights
        localStorage.setItem('productivityInsights', JSON.stringify(response.data));
        localStorage.setItem('productivityInsightsDate', today);
        localStorage.setItem('productivityCompletedCount', response.data.stats?.completed?.toString() || '0');
        setLastInsightsDate(today);
        setLastCompletedCount(response.data.stats?.completed || 0);
      } else if (response.data) {
        // Set error state with response data
        setProductivityInsights({ error: true, message: response.data.note || response.data.error || 'No data available' });
      }
    } catch (err) {
      console.error('Productivity insights error:', err);
      setProductivityInsights({ error: true, message: 'Failed to load insights' });
    } finally {
      setLoadingInsights(false);
    }
  };

  const loadTodaysBrief = async () => {
    const today = new Date().toISOString().split('T')[0];
    try {
      const response = await briefAPI.getByDate(today);
      setBrief(response.data.content);
      setLastGenerated(response.data.created_date);
    } catch (err) {
      // No brief for today yet - this is normal, don't log as error
      if (err.response?.status !== 404) {
        console.error('Error loading brief:', err);
      }
    }
  };

  const handleRefresh = async () => {
    await loadTodaysBrief();
  };

  const generateBrief = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await briefAPI.generate();
      setBrief(response.data.brief);
      setLastGenerated(response.data.generatedAt);
      setStats(response.data.stats);
      
      // Check if completed count changed - if so, refresh insights
      if (response.data.stats?.commitmentCount !== lastCompletedCount) {
        console.log('Completed task count changed, refreshing insights');
        loadProductivityInsights(true);
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to generate brief';
      setError(errorMessage);
      console.error('Brief generation error:', err);
    } finally {
      setLoading(false);
    }
  };


  // Parse deliverables table from brief - robust parser for markdown tables
  const parseDeliverablesTable = (briefText) => {
    if (!briefText) return null;
    
    // Find the deliverables section - be flexible with section numbering and formatting
    const deliverablesMatch = briefText.match(/##\s*2\.?\s*DELIVERABLES THIS WEEK[\s\S]*?(?=##\s*\d|$)/i);
    if (!deliverablesMatch) return null;
    
    const deliverablesSection = deliverablesMatch[0];
    
    // Split into lines and find table rows
    const lines = deliverablesSection.split('\n').map(line => line.trim()).filter(line => line);
    
    // Find all lines that contain pipe characters (markdown table rows)
    const tableLines = lines.filter(line => line.includes('|') && line.split('|').length >= 3);
    
    if (tableLines.length < 2) {
      // Try to find table without pipes (spaced columns)
      const spacedTableLines = lines.filter(line => {
        // Check if line has multiple columns separated by 2+ spaces
        const parts = line.split(/\s{2,}/);
        return parts.length >= 3 && line.length > 20;
      });
      
      if (spacedTableLines.length >= 2) {
        // Parse spaced table
        const headerLine = spacedTableLines[0];
        const headerRow = headerLine.split(/\s{2,}/).map(h => h.trim());
        const dataRows = spacedTableLines.slice(1).map(line => 
          line.split(/\s{2,}/).map(cell => cell.trim())
        );
        
        if (headerRow.length >= 4 && dataRows.length > 0) {
          return { headerRow, dataRows };
        }
      }
      return null;
    }
    
    // Parse markdown table with pipes
    let headerRow = null;
    let headerIndex = -1;
    
    // Find header row (contains keywords like "Deliverable", "Owner", "Status")
    for (let i = 0; i < tableLines.length; i++) {
      const line = tableLines[i];
      const cells = line.split('|').map(cell => cell.trim()).filter(cell => cell);
      
      // Skip separator rows (all dashes)
      if (line.match(/^[\s|]*[-:|\s]+[\s|]*$/)) continue;
      
      // Check if this looks like a header
      const headerKeywords = ['deliverable', 'owner', 'status', 'deadline', 'blocker', 'note'];
      const hasHeaderKeywords = cells.some(cell => 
        headerKeywords.some(keyword => cell.toLowerCase().includes(keyword))
      );
      
      if (hasHeaderKeywords && cells.length >= 4) {
        headerRow = cells;
        headerIndex = i;
        break;
      }
    }
    
    // If no header found with keywords, use first non-separator row
    if (!headerRow) {
      for (let i = 0; i < tableLines.length; i++) {
        const line = tableLines[i];
        if (line.match(/^[\s|]*[-:|\s]+[\s|]*$/)) continue;
        
        const cells = line.split('|').map(cell => cell.trim()).filter(cell => cell);
        if (cells.length >= 4) {
          headerRow = cells;
          headerIndex = i;
          break;
        }
      }
    }
    
    if (!headerRow || headerRow.length < 4) return null;
    
    // Parse data rows (skip separator row after header)
    const dataRows = [];
    for (let i = headerIndex + 1; i < tableLines.length; i++) {
      const line = tableLines[i];
      
      // Skip separator rows
      if (line.match(/^[\s|]*[-:|\s]+[\s|]*$/)) continue;
      
      const cells = line.split('|').map(cell => cell.trim()).filter(cell => cell);
      
      // Only include rows that have at least 3 cells
      if (cells.length >= 3) {
        // Pad or trim cells to match header length
        const paddedCells = [...cells];
        while (paddedCells.length < headerRow.length) {
          paddedCells.push('');
        }
        dataRows.push(paddedCells.slice(0, headerRow.length));
      }
    }
    
    if (dataRows.length === 0) return null;
    
    return { headerRow, dataRows };
  };

  const deliverablesData = brief ? parseDeliverablesTable(brief) : null;

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="dashboard">
      {/* Daily Brief Section */}
      <div className="card">
        <div className="flex-between mb-lg flex-wrap gap-lg">
          <h2 className="mt-0 mb-0">Morning Dashboard</h2>
                    <button 
            onClick={generateBrief} 
            disabled={loading}
            className="glass-button-primary btn-generate"
            style={{
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.backgroundColor = '#52525b';
                e.currentTarget.style.borderColor = '#60a5fa';
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.backgroundColor = '#3f3f46';
                e.currentTarget.style.borderColor = '#52525b';
              }
            }}
          >
            <span>{loading ? '⏳' : '🔄'}</span>
            {loading ? 'Generating...' : 'Generate Brief'}
          </button>
        </div>

        {lastGenerated && (
          <p className="text-base color-muted mb-lg">
            Last generated: {new Date(lastGenerated).toLocaleString()}
          </p>
        )}

        {stats && (
          <div className="stats-container" style={{ 
            display: 'flex', 
            gap: '1rem', 
            marginBottom: '1rem', 
            padding: '1rem', 
            backgroundColor: '#f5f5f7', 
            borderRadius: '8px' 
          }}>
            <div className="stat-container">
              <div className="stat-number-primary">
                {stats.contextCount || 0}
              </div>
              <div className="stat-label">Context Items</div>
            </div>
            <div className="stat-container">
              <div className="stat-number-warning-lg">
                {stats.commitmentCount || 0}
              </div>
              <div className="stat-label">Commitments</div>
            </div>
            <div className="stat-container">
              <div className="stat-number-success-lg">
                {stats.transcriptCount || 0}
              </div>
              <div className="stat-label">Transcripts</div>
            </div>
          </div>
        )}
        
        {/* Productivity Insights Widget */}
        {productivityInsights && !productivityInsights.error && productivityInsights.success && (
          <div className="insights-widget">
            <h3 className="insights-title">
              📊 Productivity Insights ({productivityInsights.time_range})
            </h3>
            <div className="grid-auto">
              <div className="stat-card">
                <div className="stat-number-success-xl">
                  {productivityInsights.stats.completion_rate}%
                </div>
                <div className="stat-label-sm">Completion Rate</div>
              </div>
              <div className="stat-card">
                <div className="stat-number-primary-xl">
                  {productivityInsights.stats.completed}
                </div>
                <div className="stat-label-sm">Completed</div>
              </div>
              {productivityInsights.stats.overdue > 0 && (
                <div className="stat-card">
                  <div className="stat-number-error-xl">
                    {productivityInsights.stats.overdue}
                  </div>
                  <div className="stat-label-sm">Overdue</div>
                </div>
              )}
              {productivityInsights.stats.most_productive_day && (
                <div className="stat-card">
                  <div className="stat-number-warning-md">
                    {productivityInsights.stats.most_productive_day}
                  </div>
                  <div className="stat-label-sm">Best Day</div>
                </div>
              )}
            </div>
            {productivityInsights.insights && (
              <details open className="mt-sm">
                <summary className="insights-summary">
                  {productivityInsights.insights === 'Generating AI insights...' ? '🤖 Generating AI insights...' : 'View AI insights'}
                </summary>
                <div className="insights-content">
                  {productivityInsights.insights === 'Generating AI insights...' ? (
                    <div className="insights-item-success">
                      <span>🔄</span>
                      <span>Analyzing your patterns with AI...</span>
                    </div>
                  ) : (
                    productivityInsights.insights.length > 500 
                      ? `${productivityInsights.insights.substring(0, 500)}...` 
                      : productivityInsights.insights
                  )}
                </div>
              </details>
            )}
          </div>
        )}
        {loadingInsights && !productivityInsights && (
          <div style={{ 
            textAlign: 'center', 
            padding: '1rem', 
            color: '#22c55e', 
            fontSize: '0.85rem',
            backgroundColor: '#18181b',
            borderRadius: '8px',
            marginBottom: '1rem'
          }}>
            <div>🔄 Loading productivity insights...</div>
          </div>
        )}
        {productivityInsights && productivityInsights.error && (
          <div style={{ 
            padding: '1rem', 
            color: '#fbbf24', 
            fontSize: '0.85rem',
            backgroundColor: '#18181b',
            border: '1px solid #fbbf24',
            borderRadius: '8px',
            marginBottom: '1rem'
          }}>
            <div>⚠️ {productivityInsights.message}</div>
          </div>
        )}
        {productivityInsights && !productivityInsights.success && !productivityInsights.error && (
          <div style={{ 
            padding: '1.5rem', 
            textAlign: 'center',
            color: '#a1a1aa', 
            fontSize: '0.9rem',
            backgroundColor: '#18181b',
            border: '1px solid #3f3f46',
            borderRadius: '8px',
            marginBottom: '1rem'
          }}>
            <div className="icon-xl-mb-sm">📊</div>
            <div>{productivityInsights.note || productivityInsights.message || 'Complete some tasks to see pattern analysis'}</div>
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
              <p className="text-md-mt-sm">
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
            <p className="text-sm-gray-mt-sm">
              This may take 10-15 seconds
            </p>
          </div>
        )}

        {brief && !loading && (
          <div className="brief-content">
            {deliverablesData && deliverablesData.dataRows.length > 0 ? (
              <>
                {/* Render brief with deliverables section replaced */}
                {brief.split(/##\s*2\.?\s*DELIVERABLES THIS WEEK[\s\S]*?(?=##\s*\d|$)/i).map((section, index) => {
                  // If parsing failed, fall back to markdown rendering
                  if (!deliverablesData || deliverablesData.dataRows.length === 0) {
                    return null;
                  }
                  if (index === 0) {
                    return (
                      <ReactMarkdown key={index}
                        components={{
                          h1: ({node, children, ...props}) => <h1 className="md-h1" {...props}>{children || ''}</h1>,
                          h2: ({node, children, ...props}) => <h2 className="md-h2" {...props}>{children || ''}</h2>,
                          h3: ({node, children, ...props}) => <h3 className="md-h3" {...props}>{children || ''}</h3>,
                          strong: ({node, ...props}) => <strong className="md-strong" {...props} />,
                          em: ({node, ...props}) => <em className="md-em" {...props} />,
                          ul: ({node, ...props}) => <ul className="md-list" {...props} />,
                          ol: ({node, ...props}) => <ol className="md-list" {...props} />,
                          li: ({node, ...props}) => <li className="md-li" {...props} />,
                          p: ({node, ...props}) => <p className="md-p" {...props} />
                        }}
                      >
                        {section}
                      </ReactMarkdown>
                    );
                  } else if (index === 1) {
                    return (
                      <div key={index}>
                        <h2 className="md-h2">2. DELIVERABLES THIS WEEK</h2>
                        <div className="table-scroll">
                          <table style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            backgroundColor: '#18181b',
                            border: '1px solid #3f3f46',
                            minWidth: '700px',
                            tableLayout: 'auto'
                          }}>
                            <thead style={{
                              backgroundColor: '#27272a',
                              borderBottom: '2px solid #60a5fa',
                              position: 'sticky',
                              top: 0,
                              zIndex: 10
                            }}>
                              <tr>
                                {deliverablesData.headerRow.map((header, i) => (
                                  <th key={i} style={{
                                    padding: '0.875rem 1rem',
                                    textAlign: 'left',
                                    color: '#fff',
                                    fontWeight: '600',
                                    fontSize: '0.875rem',
                                    whiteSpace: 'nowrap',
                                    borderRight: i < deliverablesData.headerRow.length - 1 ? '1px solid #3f3f46' : 'none'
                                  }}>
                                    {header}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {deliverablesData.dataRows.map((row, rowIndex) => {
                                // Find status column index
                                const statusIndex = deliverablesData.headerRow.findIndex(h => 
                                  h.toLowerCase().includes('status')
                                );
                                const status = statusIndex >= 0 ? row[statusIndex] : '';
                                
                                // Determine row background based on status
                                const isAtRisk = status && (status.includes('AT RISK') || status.includes('⚠️'));
                                const isOnTrack = status && (status.includes('ON TRACK') || status.includes('🟢'));
                                const isBehind = status && (status.includes('BEHIND') || status.includes('🔴'));
                                
                                return (
                                  <tr key={rowIndex} style={{
                                    borderBottom: '1px solid #3f3f46',
                                    backgroundColor: isAtRisk ? 'rgba(251, 191, 36, 0.05)' : 
                                                     isBehind ? 'rgba(239, 68, 68, 0.05)' :
                                                     isOnTrack ? 'rgba(34, 197, 94, 0.05)' : 'transparent'
                                  }}>
                                    {row.map((cell, cellIndex) => {
                                      const isStatusCell = cellIndex === statusIndex;
                                      const isDeliverableCell = deliverablesData.headerRow[cellIndex]?.toLowerCase().includes('deliverable');
                                      
                                      return (
                                        <td key={cellIndex} style={{
                                          padding: '0.875rem 1rem',
                                          color: isStatusCell ? 
                                            (isAtRisk ? '#fbbf24' : isBehind ? '#ef4444' : isOnTrack ? '#22c55e' : '#e5e5e7') :
                                            '#e5e5e7',
                                          fontSize: '0.875rem',
                                          verticalAlign: 'top',
                                          wordBreak: 'break-word',
                                          lineHeight: '1.5',
                                          borderRight: cellIndex < row.length - 1 ? '1px solid #3f3f46' : 'none',
                                          fontWeight: isStatusCell ? '500' : 'normal',
                                          maxWidth: isDeliverableCell ? '300px' : 'auto'
                                        }}>
                                          {cell}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        {/* Render rest of brief after deliverables section */}
                        {brief.split(/##\s*2\.?\s*DELIVERABLES THIS WEEK[\s\S]*?(?=##\s*\d|$)/i)[1] && (
                          <ReactMarkdown
                            components={{
                              h1: ({node, children, ...props}) => <h1 style={{color: '#fff', marginTop: '1.5rem', marginBottom: '0.5rem'}} {...props}>{children || ''}</h1>,
                              h2: ({node, children, ...props}) => <h2 style={{color: '#60a5fa', marginTop: '1.5rem', marginBottom: '0.5rem'}} {...props}>{children || ''}</h2>,
                              h3: ({node, children, ...props}) => <h3 style={{color: '#fbbf24', marginTop: '1rem', marginBottom: '0.5rem'}} {...props}>{children || ''}</h3>,
                              strong: ({node, ...props}) => <strong style={{color: '#fbbf24'}} {...props} />,
                              em: ({node, ...props}) => <em style={{color: '#a1a1aa'}} {...props} />,
                              ul: ({node, ...props}) => <ul style={{marginLeft: '1.5rem', marginTop: '0.5rem', marginBottom: '0.5rem'}} {...props} />,
                              ol: ({node, ...props}) => <ol style={{marginLeft: '1.5rem', marginTop: '0.5rem', marginBottom: '0.5rem'}} {...props} />,
                              li: ({node, ...props}) => <li style={{marginBottom: '0.25rem', color: '#e5e5e7'}} {...props} />,
                              p: ({node, ...props}) => <p style={{marginBottom: '0.75rem', color: '#e5e5e7'}} {...props} />,
                              table: ({node, ...props}) => (
                                <div style={{ overflowX: 'auto', marginTop: '1rem', marginBottom: '1rem' }}>
                                  <table style={{
                                    width: '100%',
                                    borderCollapse: 'collapse',
                                    backgroundColor: '#18181b',
                                    border: '1px solid #3f3f46',
                                    minWidth: '600px'
                                  }} {...props} />
                                </div>
                              ),
                              thead: ({node, ...props}) => <thead style={{ backgroundColor: '#27272a', borderBottom: '2px solid #60a5fa' }} {...props} />,
                              tbody: ({node, ...props}) => <tbody {...props} />,
                              tr: ({node, ...props}) => <tr style={{ borderBottom: '1px solid #3f3f46' }} {...props} />,
                              th: ({node, ...props}) => (
                                <th style={{
                                  padding: '0.875rem 1rem',
                                  textAlign: 'left',
                                  color: '#fff',
                                  fontWeight: '600',
                                  fontSize: '0.875rem',
                                  whiteSpace: 'nowrap',
                                  borderRight: '1px solid #3f3f46'
                                }} {...props} />
                              ),
                              td: ({node, ...props}) => (
                                <td style={{
                                  padding: '0.875rem 1rem',
                                  color: '#e5e5e7',
                                  fontSize: '0.875rem',
                                  verticalAlign: 'top',
                                  wordBreak: 'break-word',
                                  lineHeight: '1.5',
                                  borderRight: '1px solid #3f3f46'
                                }} {...props} />
                              )
                            }}
                          >
                            {brief.split(/##\s*2\.?\s*DELIVERABLES THIS WEEK[\s\S]*?(?=##\s*\d|$)/i)[1]}
                          </ReactMarkdown>
                        )}
                      </div>
                    );
                  }
                  return null;
                })}
              </>
            ) : (
              // Fallback: Render entire brief with markdown (if table parsing failed)
              <ReactMarkdown
                components={{
                  h1: ({node, children, ...props}) => <h1 className="md-h1" {...props}>{children || ''}</h1>,
                  h2: ({node, children, ...props}) => <h2 className="md-h2" {...props}>{children || ''}</h2>,
                  h3: ({node, children, ...props}) => <h3 className="md-h3" {...props}>{children || ''}</h3>,
                  strong: ({node, ...props}) => <strong className="md-strong" {...props} />,
                  em: ({node, ...props}) => <em className="md-em" {...props} />,
                  ul: ({node, ...props}) => <ul className="md-list" {...props} />,
                  ol: ({node, ...props}) => <ol className="md-list" {...props} />,
                  li: ({node, ...props}) => <li className="md-li" {...props} />,
                  p: ({node, ...props}) => <p className="md-p" {...props} />,
                  table: ({node, ...props}) => (
                    <div className="md-table-wrapper">
                      <table className="md-table" {...props} />
                    </div>
                  ),
                  thead: ({node, ...props}) => <thead className="md-thead" {...props} />,
                  tbody: ({node, ...props}) => <tbody {...props} />,
                  tr: ({node, ...props}) => <tr className="md-tr" {...props} />,
                  th: ({node, ...props}) => <th className="md-th" {...props} />,
                  td: ({node, ...props}) => <td className="md-td" {...props} />
                }}
              >
                {brief}
              </ReactMarkdown>
            )}
          </div>
        )}
      </div>

      {/* Quick Actions Section */}
      <div className="card">
        <h2 className="mb-md">Quick Actions</h2>
        <div className="quick-actions-grid">
          <button 
            onClick={() => setActiveTab('tasks')}
            className="quick-action-button"
          >
            <span className="stat-large-icon">📋</span>
            <div>
              <div className="quick-action-title">View All Tasks</div>
              <div className="quick-action-subtitle">Manage commitments & actions</div>
            </div>
          </button>

          <button 
            onClick={() => setActiveTab('transcripts')}
            className="quick-action-button"
          >
            <span className="stat-large-icon">📝</span>
            <div>
              <div className="quick-action-title">Upload Transcript</div>
              <div className="quick-action-subtitle">Add meeting notes</div>
            </div>
          </button>

          <button 
            onClick={() => setActiveTab('calendar')}
            className="quick-action-button"
          >
            <span className="stat-large-icon">📅</span>
            <div>
              <div className="quick-action-title">View Calendar</div>
              <div className="quick-action-subtitle">See upcoming events</div>
            </div>
          </button>

          <button 
            onClick={() => setActiveTab('config')}
            className="quick-action-button"
          >
            <span className="stat-large-icon">⚙️</span>
            <div>
              <div className="quick-action-title">Settings</div>
              <div className="quick-action-subtitle">Configure app</div>
            </div>
          </button>
        </div>
      </div>
      </div>
    </PullToRefresh>
  );
}

export default Dashboard;
