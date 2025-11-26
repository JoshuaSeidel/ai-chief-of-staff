import React, { useState, useEffect } from 'react';
import { briefAPI } from '../services/api';
import ReactMarkdown from 'react-markdown';
import { PullToRefresh } from './PullToRefresh';

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
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to generate brief';
      setError(errorMessage);
      console.error('Brief generation error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Removed unused handlers - Quick Actions section was removed

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

  // Removed unused handler

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h2 style={{ margin: 0 }}>Morning Dashboard</h2>
          <button 
            onClick={generateBrief} 
            disabled={loading}
            style={{
              padding: '0.75rem 1.25rem',
              backgroundColor: '#3f3f46',
              color: '#e4e4e7',
              border: '1px solid #52525b',
              borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '0.9375rem',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
              opacity: loading ? 0.6 : 1
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
          <p style={{ color: '#6e6e73', fontSize: '0.9rem', marginBottom: '1rem' }}>
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
            color: '#e5e5e7',
            overflowX: 'auto'
          }}>
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
                          h1: ({node, children, ...props}) => <h1 style={{color: '#fff', marginTop: '1.5rem', marginBottom: '0.5rem'}} {...props}>{children || ''}</h1>,
                          h2: ({node, children, ...props}) => <h2 style={{color: '#60a5fa', marginTop: '1.5rem', marginBottom: '0.5rem'}} {...props}>{children || ''}</h2>,
                          h3: ({node, children, ...props}) => <h3 style={{color: '#fbbf24', marginTop: '1rem', marginBottom: '0.5rem'}} {...props}>{children || ''}</h3>,
                          strong: ({node, ...props}) => <strong style={{color: '#fbbf24'}} {...props} />,
                          em: ({node, ...props}) => <em style={{color: '#a1a1aa'}} {...props} />,
                          ul: ({node, ...props}) => <ul style={{marginLeft: '1.5rem', marginTop: '0.5rem', marginBottom: '0.5rem'}} {...props} />,
                          ol: ({node, ...props}) => <ol style={{marginLeft: '1.5rem', marginTop: '0.5rem', marginBottom: '0.5rem'}} {...props} />,
                          li: ({node, ...props}) => <li style={{marginBottom: '0.25rem', color: '#e5e5e7'}} {...props} />,
                          p: ({node, ...props}) => <p style={{marginBottom: '0.75rem', color: '#e5e5e7'}} {...props} />
                        }}
                      >
                        {section}
                      </ReactMarkdown>
                    );
                  } else if (index === 1) {
                    return (
                      <div key={index}>
                        <h2 style={{color: '#60a5fa', marginTop: '1.5rem', marginBottom: '0.5rem'}}>2. DELIVERABLES THIS WEEK</h2>
                        <div style={{ 
                          overflowX: 'auto', 
                          marginTop: '1rem', 
                          marginBottom: '1rem',
                          WebkitOverflowScrolling: 'touch'
                        }}>
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
                {brief}
              </ReactMarkdown>
            )}
          </div>
        )}
      </div>

      {/* Quick Actions Section */}
      <div className="card">
        <h2 style={{ marginBottom: '1rem' }}>Quick Actions</h2>
        <div className="quick-actions-grid">
          <button 
            onClick={() => setActiveTab('tasks')}
            className="quick-action-button"
          >
            <span style={{ fontSize: '1.5rem' }}>📋</span>
            <div>
              <div style={{ fontWeight: '600' }}>View All Tasks</div>
              <div style={{ fontSize: '0.85rem', color: '#a1a1aa', marginTop: '0.25rem' }}>Manage commitments & actions</div>
            </div>
          </button>

          <button 
            onClick={() => setActiveTab('transcripts')}
            className="quick-action-button"
          >
            <span style={{ fontSize: '1.5rem' }}>📝</span>
            <div>
              <div style={{ fontWeight: '600' }}>Upload Transcript</div>
              <div style={{ fontSize: '0.85rem', color: '#a1a1aa', marginTop: '0.25rem' }}>Add meeting notes</div>
            </div>
          </button>

          <button 
            onClick={() => setActiveTab('calendar')}
            className="quick-action-button"
          >
            <span style={{ fontSize: '1.5rem' }}>📅</span>
            <div>
              <div style={{ fontWeight: '600' }}>View Calendar</div>
              <div style={{ fontSize: '0.85rem', color: '#a1a1aa', marginTop: '0.25rem' }}>See upcoming events</div>
            </div>
          </button>

          <button 
            onClick={() => setActiveTab('config')}
            className="quick-action-button"
          >
            <span style={{ fontSize: '1.5rem' }}>⚙️</span>
            <div>
              <div style={{ fontWeight: '600' }}>Settings</div>
              <div style={{ fontSize: '0.85rem', color: '#a1a1aa', marginTop: '0.25rem' }}>Configure app</div>
            </div>
          </button>
        </div>
      </div>
      </div>
    </PullToRefresh>
  );
}

export default Dashboard;
