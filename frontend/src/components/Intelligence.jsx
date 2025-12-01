import React, { useState } from 'react';
import { intelligenceAPI } from '../services/api';
import { PullToRefresh } from './PullToRefresh';

function Intelligence() {
  // AI Intelligence Service
  const [effortDescription, setEffortDescription] = useState('');
  const [effortContext, setEffortContext] = useState('');
  const [effortResult, setEffortResult] = useState(null);
  const [effortLoading, setEffortLoading] = useState(false);
  
  const [energyDescription, setEnergyDescription] = useState('');
  const [energyResult, setEnergyResult] = useState(null);
  const [energyLoading, setEnergyLoading] = useState(false);
  
  const [clusterTasks, setClusterTasks] = useState('');
  const [clusterResult, setClusterResult] = useState(null);
  const [clusterLoading, setClusterLoading] = useState(false);
  
  // NL Parser Service
  const [parseText, setParseText] = useState('');
  const [parseContext, setParseContext] = useState('');
  const [parseResult, setParseResult] = useState(null);
  const [parseLoading, setParseLoading] = useState(false);
  
  const [quickAddText, setQuickAddText] = useState('');
  const [quickAddResult, setQuickAddResult] = useState(null);
  const [quickAddLoading, setQuickAddLoading] = useState(false);
  
  const [extractText, setExtractText] = useState('');
  const [extractResult, setExtractResult] = useState(null);
  const [extractLoading, setExtractLoading] = useState(false);
  
  // Voice Processor Service
  const [audioFile, setAudioFile] = useState(null);
  const [audioLanguage, setAudioLanguage] = useState('');
  const [transcriptionResult, setTranscriptionResult] = useState(null);
  const [transcriptionLoading, setTranscriptionLoading] = useState(false);
  
  // Context Service
  const [contextCategory, setContextCategory] = useState('');
  const [contextSource, setContextSource] = useState('');
  const [contextResult, setContextResult] = useState(null);
  const [contextLoading, setContextLoading] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  
  // Pattern Recognition Service
  const [patternResult, setPatternResult] = useState(null);
  const [patternLoading, setPatternLoading] = useState(false);
  
  // AI Intelligence Service Functions
  const handleEstimateEffort = async () => {
    if (!effortDescription.trim()) return;
    setEffortLoading(true);
    setEffortResult(null);
    try {
      const response = await intelligenceAPI.estimateEffort(effortDescription, effortContext);
      setEffortResult(response.data);
    } catch (err) {
      setEffortResult({ error: err.message || 'Failed to estimate effort' });
    } finally {
      setEffortLoading(false);
    }
  };
  
  const handleClassifyEnergy = async () => {
    if (!energyDescription.trim()) return;
    setEnergyLoading(true);
    setEnergyResult(null);
    try {
      const response = await intelligenceAPI.classifyEnergy(energyDescription);
      setEnergyResult(response.data);
    } catch (err) {
      setEnergyResult({ error: err.message || 'Failed to classify energy' });
    } finally {
      setEnergyLoading(false);
    }
  };
  
  const handleClusterTasks = async () => {
    if (!clusterTasks.trim()) return;
    setClusterLoading(true);
    setClusterResult(null);
    try {
      // Parse tasks from text (one per line)
      const taskLines = clusterTasks.split('\n').filter(line => line.trim());
      const tasks = taskLines.map((line, idx) => ({
        id: idx + 1,
        description: line.trim(),
        deadline: null
      }));
      const response = await intelligenceAPI.clusterTasks(tasks);
      setClusterResult(response.data);
    } catch (err) {
      setClusterResult({ error: err.message || 'Failed to cluster tasks' });
    } finally {
      setClusterLoading(false);
    }
  };
  
  // NL Parser Service Functions
  const handleParseTask = async () => {
    if (!parseText.trim()) return;
    setParseLoading(true);
    setParseResult(null);
    try {
      const response = await intelligenceAPI.parseTask(parseText);
      setParseResult(response.data);
    } catch (err) {
      setParseResult({ error: err.message || 'Failed to parse task' });
    } finally {
      setParseLoading(false);
    }
  };
  
  const handleQuickAdd = async () => {
    if (!quickAddText.trim()) return;
    setQuickAddLoading(true);
    setQuickAddResult(null);
    try {
      const response = await intelligenceAPI.parseTask(quickAddText);
      setQuickAddResult(response.data);
    } catch (err) {
      setQuickAddResult({ error: err.message || 'Failed to quick add' });
    } finally {
      setQuickAddLoading(false);
    }
  };
  
  const handleExtractCommitments = async () => {
    if (!extractText.trim()) return;
    setExtractLoading(true);
    setExtractResult(null);
    try {
      // Use parse-bulk endpoint for commitment extraction
      const response = await intelligenceAPI.parseTask(extractText);
      setExtractResult(response.data);
    } catch (err) {
      setExtractResult({ error: err.message || 'Failed to extract commitments' });
    } finally {
      setExtractLoading(false);
    }
  };
  
  // Voice Processor Service Functions
  const handleTranscribe = async () => {
    if (!audioFile) return;
    setTranscriptionLoading(true);
    setTranscriptionResult(null);
    try {
      const response = await intelligenceAPI.transcribe(audioFile, audioLanguage || null);
      setTranscriptionResult(response.data);
    } catch (err) {
      setTranscriptionResult({ error: err.message || 'Failed to transcribe audio' });
    } finally {
      setTranscriptionLoading(false);
    }
  };
  
  // Context Service Functions
  const handleGetContext = async () => {
    setContextLoading(true);
    setContextResult(null);
    try {
      const response = await intelligenceAPI.getContext(
        contextCategory || null,
        contextSource || null,
        50,
        true
      );
      setContextResult(response.data);
    } catch (err) {
      setContextResult({ error: err.message || 'Failed to get context' });
    } finally {
      setContextLoading(false);
    }
  };
  
  const handleSearchContext = async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    setSearchResult(null);
    try {
      const response = await intelligenceAPI.searchContext(searchQuery, null, 20);
      setSearchResult(response.data);
    } catch (err) {
      setSearchResult({ error: err.message || 'Failed to search context' });
    } finally {
      setSearchLoading(false);
    }
  };
  
  // Pattern Recognition Service Functions
  const handleAnalyzePatterns = async () => {
    setPatternLoading(true);
    setPatternResult(null);
    try {
      const response = await intelligenceAPI.analyzePatterns(null, '30d');
      setPatternResult(response.data);
    } catch (err) {
      setPatternResult({ error: err.message || 'Failed to analyze patterns' });
    } finally {
      setPatternLoading(false);
    }
  };
  
  const handleRefresh = async () => {
    // Refresh any active results
  };
  
  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="intelligence">
        <div className="card">
          <h2>🤖 AI Intelligence Services</h2>
          <p style={{ color: '#a1a1aa', marginBottom: '2rem' }}>
            Advanced AI-powered tools for task analysis, natural language processing, audio transcription, and productivity insights.
          </p>
          
          {/* AI Intelligence Service */}
          <details style={{ marginBottom: '2rem' }}>
            <summary style={{ 
              cursor: 'pointer', 
              fontWeight: 'bold',
              padding: '1rem',
              backgroundColor: '#18181b',
              borderRadius: '8px',
              border: '1px solid #3f3f46',
              fontSize: '1.125rem',
              color: '#e5e5e7'
            }}>
              🧠 AI Intelligence Service - Task Analysis
            </summary>
            <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#18181b', borderRadius: '8px' }}>
              {/* Effort Estimation */}
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ marginBottom: '1rem' }}>⏱️ Effort Estimation</h3>
                <p style={{ fontSize: '0.9rem', color: '#a1a1aa', marginBottom: '1rem' }}>
                  Estimate how long a task will take based on its description.
                </p>
                <textarea
                  value={effortDescription}
                  onChange={(e) => setEffortDescription(e.target.value)}
                  placeholder="e.g., Write Q4 strategic plan"
                  style={{ width: '100%', minHeight: '80px', marginBottom: '0.5rem', padding: '0.75rem', backgroundColor: '#09090b', color: '#fff', border: '1px solid #3f3f46', borderRadius: '8px' }}
                />
                <input
                  type="text"
                  value={effortContext}
                  onChange={(e) => setEffortContext(e.target.value)}
                  placeholder="Context (optional): e.g., Similar reports usually take 2-3 hours"
                  style={{ width: '100%', marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#09090b', color: '#fff', border: '1px solid #3f3f46', borderRadius: '8px' }}
                />
                <button 
                  onClick={handleEstimateEffort}
                  disabled={effortLoading || !effortDescription.trim()}
                  style={{ padding: '0.75rem 1.5rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                >
                  {effortLoading ? 'Estimating...' : 'Estimate Effort'}
                </button>
                {effortResult && (
                  <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: effortResult.error ? '#2a1a1a' : '#1a2e1a', borderRadius: '8px', border: `1px solid ${effortResult.error ? '#ef4444' : '#22c55e'}` }}>
                    {effortResult.error ? (
                      <p style={{ color: '#ef4444' }}>❌ {effortResult.error}</p>
                    ) : (
                      <div>
                        <p style={{ color: '#22c55e', fontWeight: 'bold' }}>
                          Estimated: {effortResult.estimated_time || (effortResult.estimated_hours ? `${effortResult.estimated_hours} hours` : 'N/A')}
                        </p>
                        {effortResult.complexity && <p style={{ color: '#a1a1aa', fontSize: '0.9rem' }}>Complexity: {effortResult.complexity}</p>}
                        {effortResult.confidence && <p style={{ color: '#a1a1aa', fontSize: '0.9rem' }}>Confidence: {(effortResult.confidence * 100).toFixed(0)}%</p>}
                        {effortResult.reasoning && <p style={{ color: '#a1a1aa', marginTop: '0.5rem' }}>{effortResult.reasoning}</p>}
                        {effortResult.breakdown && effortResult.breakdown.length > 0 && (
                          <div style={{ marginTop: '0.5rem' }}>
                            <p style={{ color: '#e5e5e7', fontSize: '0.9rem', fontWeight: 'bold' }}>Breakdown:</p>
                            <ul style={{ marginTop: '0.25rem', color: '#a1a1aa', fontSize: '0.85rem' }}>
                              {effortResult.breakdown.map((item, idx) => <li key={idx}>{item}</li>)}
                            </ul>
                          </div>
                        )}
                        {effortResult.risks && effortResult.risks.length > 0 && (
                          <div style={{ marginTop: '0.5rem' }}>
                            <p style={{ color: '#fbbf24', fontSize: '0.9rem', fontWeight: 'bold' }}>⚠️ Risks:</p>
                            <ul style={{ marginTop: '0.25rem', color: '#a1a1aa', fontSize: '0.85rem' }}>
                              {effortResult.risks.map((item, idx) => <li key={idx}>{item}</li>)}
                            </ul>
                          </div>
                        )}
                        {effortResult.raw_response && (
                          <details style={{ marginTop: '0.5rem' }}>
                            <summary style={{ cursor: 'pointer', color: '#71717a', fontSize: '0.85rem' }}>Show raw response</summary>
                            <pre style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: '#09090b', borderRadius: '4px', fontSize: '0.75rem', color: '#a1a1aa', whiteSpace: 'pre-wrap' }}>
                              {effortResult.raw_response}
                            </pre>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Energy Classification */}
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ marginBottom: '1rem' }}>⚡ Energy Classification</h3>
                <p style={{ fontSize: '0.9rem', color: '#a1a1aa', marginBottom: '1rem' }}>
                  Classify tasks by cognitive load and energy requirements.
                </p>
                <textarea
                  value={energyDescription}
                  onChange={(e) => setEnergyDescription(e.target.value)}
                  placeholder="e.g., Update team spreadsheet with Q3 numbers"
                  style={{ width: '100%', minHeight: '80px', marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#09090b', color: '#fff', border: '1px solid #3f3f46', borderRadius: '8px' }}
                />
                <button 
                  onClick={handleClassifyEnergy}
                  disabled={energyLoading || !energyDescription.trim()}
                  style={{ padding: '0.75rem 1.5rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                >
                  {energyLoading ? 'Classifying...' : 'Classify Energy'}
                </button>
                {energyResult && (
                  <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: energyResult.error ? '#2a1a1a' : '#1a2e1a', borderRadius: '8px', border: `1px solid ${energyResult.error ? '#ef4444' : '#22c55e'}` }}>
                    {energyResult.error ? (
                      <p style={{ color: '#ef4444' }}>❌ {energyResult.error}</p>
                    ) : (
                      <div>
                        <p style={{ color: '#22c55e', fontWeight: 'bold' }}>
                          Energy Level: {energyResult.energy_level}
                          {energyResult.energy_level === 'High' && ' 🔥'}
                          {energyResult.energy_level === 'Medium' && ' ⚡'}
                          {energyResult.energy_level === 'Low' && ' 💤'}
                        </p>
                        {energyResult.confidence && <p style={{ color: '#a1a1aa', fontSize: '0.9rem' }}>Confidence: {(energyResult.confidence * 100).toFixed(0)}%</p>}
                        {energyResult.reasoning && <p style={{ color: '#a1a1aa', marginTop: '0.5rem' }}>{energyResult.reasoning}</p>}
                        {energyResult.best_time && (
                          <p style={{ color: '#3b82f6', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                            <strong>Best time:</strong> {energyResult.best_time}
                          </p>
                        )}
                        {energyResult.duration_recommendation && (
                          <p style={{ color: '#3b82f6', fontSize: '0.9rem' }}>
                            <strong>Recommended duration:</strong> {energyResult.duration_recommendation}
                          </p>
                        )}
                        {energyResult.description && <p style={{ color: '#a1a1aa', marginTop: '0.5rem' }}>{energyResult.description}</p>}
                        {energyResult.raw_response && (
                          <details style={{ marginTop: '0.5rem' }}>
                            <summary style={{ cursor: 'pointer', color: '#71717a', fontSize: '0.85rem' }}>Show raw response</summary>
                            <pre style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: '#09090b', borderRadius: '4px', fontSize: '0.75rem', color: '#a1a1aa', whiteSpace: 'pre-wrap' }}>
                              {energyResult.raw_response}
                            </pre>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Task Clustering */}
              <div>
                <h3 style={{ marginBottom: '1rem' }}>🔗 Task Clustering</h3>
                <p style={{ fontSize: '0.9rem', color: '#a1a1aa', marginBottom: '1rem' }}>
                  Group related tasks together semantically.
                </p>
                <textarea
                  value={clusterTasks}
                  onChange={(e) => setClusterTasks(e.target.value)}
                  placeholder="Enter tasks, one per line:&#10;Review Q4 budget&#10;Prepare Q4 presentation&#10;Send weekly email"
                  style={{ width: '100%', minHeight: '120px', marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#09090b', color: '#fff', border: '1px solid #3f3f46', borderRadius: '8px' }}
                />
                <button 
                  onClick={handleClusterTasks}
                  disabled={clusterLoading || !clusterTasks.trim()}
                  style={{ padding: '0.75rem 1.5rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                >
                  {clusterLoading ? 'Clustering...' : 'Cluster Tasks'}
                </button>
                {clusterResult && (
                  <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: clusterResult.error ? '#2a1a1a' : '#1a2e1a', borderRadius: '8px', border: `1px solid ${clusterResult.error ? '#ef4444' : '#22c55e'}` }}>
                    {clusterResult.error ? (
                      <p style={{ color: '#ef4444' }}>❌ {clusterResult.error}</p>
                    ) : (
                      <div>
                        {clusterResult.clusters && clusterResult.clusters.length > 0 ? (
                          clusterResult.clusters.map((cluster, idx) => (
                            <div key={idx} style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#09090b', borderRadius: '6px' }}>
                              <p style={{ color: '#22c55e', fontWeight: 'bold' }}>{cluster.name}</p>
                              {cluster.reasoning && <p style={{ color: '#a1a1aa', fontSize: '0.9rem' }}>{cluster.reasoning}</p>}
                              {cluster.description && <p style={{ color: '#a1a1aa', fontSize: '0.9rem' }}>{cluster.description}</p>}
                              {cluster.suggested_order && (
                                <p style={{ color: '#3b82f6', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                                  <strong>Order:</strong> {cluster.suggested_order}
                                </p>
                              )}
                              <p style={{ color: '#71717a', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                                Tasks: {(cluster.tasks || cluster.task_indices || []).join(', ')}
                              </p>
                            </div>
                          ))
                        ) : (
                          <p style={{ color: '#a1a1aa' }}>No clusters identified</p>
                        )}
                        {clusterResult.recommendations && (
                          <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#09090b', borderRadius: '6px' }}>
                            <p style={{ color: '#e5e5e7', fontWeight: 'bold' }}>💡 Recommendations:</p>
                            <p style={{ color: '#a1a1aa', fontSize: '0.9rem', marginTop: '0.25rem' }}>{clusterResult.recommendations}</p>
                          </div>
                        )}
                        {clusterResult.raw_response && (
                          <details style={{ marginTop: '0.5rem' }}>
                            <summary style={{ cursor: 'pointer', color: '#71717a', fontSize: '0.85rem' }}>Show raw response</summary>
                            <pre style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: '#09090b', borderRadius: '4px', fontSize: '0.75rem', color: '#a1a1aa', whiteSpace: 'pre-wrap' }}>
                              {clusterResult.raw_response}
                            </pre>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </details>
          
          {/* NL Parser Service */}
          <details style={{ marginBottom: '2rem' }}>
            <summary style={{ 
              cursor: 'pointer', 
              fontWeight: 'bold',
              padding: '1rem',
              backgroundColor: '#18181b',
              borderRadius: '8px',
              border: '1px solid #3f3f46',
              fontSize: '1.125rem',
              color: '#e5e5e7'
            }}>
              📝 Natural Language Parser - Task Parsing
            </summary>
            <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#18181b', borderRadius: '8px' }}>
              {/* Parse Task */}
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ marginBottom: '1rem' }}>🔍 Parse Task</h3>
                <p style={{ fontSize: '0.9rem', color: '#a1a1aa', marginBottom: '1rem' }}>
                  Convert natural language into structured task data.
                </p>
                <textarea
                  value={parseText}
                  onChange={(e) => setParseText(e.target.value)}
                  placeholder="e.g., Write quarterly report by Friday 5pm #reports"
                  style={{ width: '100%', minHeight: '80px', marginBottom: '0.5rem', padding: '0.75rem', backgroundColor: '#09090b', color: '#fff', border: '1px solid #3f3f46', borderRadius: '8px' }}
                />
                <input
                  type="text"
                  value={parseContext}
                  onChange={(e) => setParseContext(e.target.value)}
                  placeholder="Context (optional)"
                  style={{ width: '100%', marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#09090b', color: '#fff', border: '1px solid #3f3f46', borderRadius: '8px' }}
                />
                <button 
                  onClick={handleParseTask}
                  disabled={parseLoading || !parseText.trim()}
                  style={{ padding: '0.75rem 1.5rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                >
                  {parseLoading ? 'Parsing...' : 'Parse Task'}
                </button>
                {parseResult && (
                  <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: parseResult.error ? '#2a1a1a' : '#1a2e1a', borderRadius: '8px', border: `1px solid ${parseResult.error ? '#ef4444' : '#22c55e'}` }}>
                    {parseResult.error ? (
                      <p style={{ color: '#ef4444' }}>❌ {parseResult.error}</p>
                    ) : (
                      <div>
                        {parseResult.title && <p style={{ color: '#22c55e', fontWeight: 'bold' }}>Title: {parseResult.title}</p>}
                        {parseResult.description && parseResult.description !== parseResult.title && (
                          <p style={{ color: '#a1a1aa', fontSize: '0.9rem', marginTop: '0.5rem' }}>{parseResult.description}</p>
                        )}
                        {parseResult.deadline && parseResult.deadline !== 'none' && (
                          <p style={{ color: '#a1a1aa' }}>📅 Deadline: {parseResult.deadline}</p>
                        )}
                        {parseResult.priority && <p style={{ color: '#a1a1aa' }}>🎯 Priority: {parseResult.priority}</p>}
                        {parseResult.assignee && parseResult.assignee !== 'unassigned' && (
                          <p style={{ color: '#a1a1aa' }}>👤 Assignee: {parseResult.assignee}</p>
                        )}
                        {parseResult.estimated_hours && <p style={{ color: '#a1a1aa' }}>⏱️ Estimated: {parseResult.estimated_hours} hours</p>}
                        {parseResult.tags && parseResult.tags.length > 0 && (
                          <p style={{ color: '#a1a1aa' }}>🏷️ Tags: {parseResult.tags.join(', ')}</p>
                        )}
                        {parseResult.confidence && <p style={{ color: '#71717a', fontSize: '0.85rem' }}>Confidence: {(parseResult.confidence * 100).toFixed(0)}%</p>}
                        {parseResult.raw_response && (
                          <details style={{ marginTop: '0.5rem' }}>
                            <summary style={{ cursor: 'pointer', color: '#71717a', fontSize: '0.85rem' }}>Show raw response</summary>
                            <pre style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: '#09090b', borderRadius: '4px', fontSize: '0.75rem', color: '#a1a1aa', whiteSpace: 'pre-wrap' }}>
                              {parseResult.raw_response}
                            </pre>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Quick Add */}
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ marginBottom: '1rem' }}>⚡ Quick Add</h3>
                <p style={{ fontSize: '0.9rem', color: '#a1a1aa', marginBottom: '1rem' }}>
                  Ultra-fast parsing for minimal input.
                </p>
                <input
                  type="text"
                  value={quickAddText}
                  onChange={(e) => setQuickAddText(e.target.value)}
                  placeholder="e.g., coffee 2pm tomorrow"
                  style={{ width: '100%', marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#09090b', color: '#fff', border: '1px solid #3f3f46', borderRadius: '8px' }}
                />
                <button 
                  onClick={handleQuickAdd}
                  disabled={quickAddLoading || !quickAddText.trim()}
                  style={{ padding: '0.75rem 1.5rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                >
                  {quickAddLoading ? 'Parsing...' : 'Quick Add'}
                </button>
                {quickAddResult && (
                  <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: quickAddResult.error ? '#2a1a1a' : '#1a2e1a', borderRadius: '8px', border: `1px solid ${quickAddResult.error ? '#ef4444' : '#22c55e'}` }}>
                    {quickAddResult.error ? (
                      <p style={{ color: '#ef4444' }}>❌ {quickAddResult.error}</p>
                    ) : (
                      <div>
                        <p style={{ color: '#22c55e', fontWeight: 'bold' }}>Title: {quickAddResult.title}</p>
                        {quickAddResult.deadline && <p style={{ color: '#a1a1aa' }}>Deadline: {new Date(quickAddResult.deadline).toLocaleString()}</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Extract Commitments */}
              <div>
                <h3 style={{ marginBottom: '1rem' }}>📋 Extract Commitments</h3>
                <p style={{ fontSize: '0.9rem', color: '#a1a1aa', marginBottom: '1rem' }}>
                  Extract action items from meeting notes or emails.
                </p>
                <textarea
                  value={extractText}
                  onChange={(e) => setExtractText(e.target.value)}
                  placeholder="Meeting notes: John will complete the proposal by Dec 1st. Sarah needs to review the design by next Tuesday."
                  style={{ width: '100%', minHeight: '120px', marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#09090b', color: '#fff', border: '1px solid #3f3f46', borderRadius: '8px' }}
                />
                <button 
                  onClick={handleExtractCommitments}
                  disabled={extractLoading || !extractText.trim()}
                  style={{ padding: '0.75rem 1.5rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                >
                  {extractLoading ? 'Extracting...' : 'Extract Commitments'}
                </button>
                {extractResult && (
                  <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: extractResult.error ? '#2a1a1a' : '#1a2e1a', borderRadius: '8px', border: `1px solid ${extractResult.error ? '#ef4444' : '#22c55e'}` }}>
                    {extractResult.error ? (
                      <p style={{ color: '#ef4444' }}>❌ {extractResult.error}</p>
                    ) : (
                      <div>
                        <p style={{ color: '#22c55e', fontWeight: 'bold' }}>Extracted Task</p>
                        <p style={{ color: '#a1a1aa' }}>Title: {extractResult.title}</p>
                        {extractResult.deadline && <p style={{ color: '#a1a1aa' }}>Deadline: {new Date(extractResult.deadline).toLocaleString()}</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </details>
          
          {/* Voice Processor Service */}
          <details style={{ marginBottom: '2rem' }}>
            <summary style={{ 
              cursor: 'pointer', 
              fontWeight: 'bold',
              padding: '1rem',
              backgroundColor: '#18181b',
              borderRadius: '8px',
              border: '1px solid #3f3f46',
              fontSize: '1.125rem',
              color: '#e5e5e7'
            }}>
              🎤 Voice Processor - Audio Transcription
            </summary>
            <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#18181b', borderRadius: '8px' }}>
              <p style={{ fontSize: '0.9rem', color: '#a1a1aa', marginBottom: '1rem' }}>
                Transcribe audio files using OpenAI Whisper. Supports mp3, mp4, mpeg, mpga, m4a, wav, webm (max 25MB).
              </p>
              <input
                type="file"
                accept="audio/*,video/*"
                onChange={(e) => setAudioFile(e.target.files[0])}
                style={{ marginBottom: '0.5rem' }}
              />
              <input
                type="text"
                value={audioLanguage}
                onChange={(e) => setAudioLanguage(e.target.value)}
                placeholder="Language code (optional, e.g., en, es, fr) - auto-detected if blank"
                style={{ width: '100%', marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#09090b', color: '#fff', border: '1px solid #3f3f46', borderRadius: '8px' }}
              />
              <button 
                onClick={handleTranscribe}
                disabled={transcriptionLoading || !audioFile}
                style={{ padding: '0.75rem 1.5rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
              >
                {transcriptionLoading ? 'Transcribing...' : 'Transcribe Audio'}
              </button>
              {transcriptionResult && (
                <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: transcriptionResult.error ? '#2a1a1a' : '#1a2e1a', borderRadius: '8px', border: `1px solid ${transcriptionResult.error ? '#ef4444' : '#22c55e'}` }}>
                  {transcriptionResult.error ? (
                    <p style={{ color: '#ef4444' }}>❌ {transcriptionResult.error}</p>
                  ) : (
                    <div>
                      <p style={{ color: '#22c55e', fontWeight: 'bold', marginBottom: '0.5rem' }}>Transcription:</p>
                      <p style={{ color: '#a1a1aa', whiteSpace: 'pre-wrap' }}>{transcriptionResult.text}</p>
                      {transcriptionResult.language && <p style={{ color: '#71717a', fontSize: '0.85rem', marginTop: '0.5rem' }}>Language: {transcriptionResult.language}</p>}
                      {transcriptionResult.duration && <p style={{ color: '#71717a', fontSize: '0.85rem' }}>Duration: {transcriptionResult.duration.toFixed(1)}s</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </details>
          
          {/* Context Service */}
          <details style={{ marginBottom: '2rem' }}>
            <summary style={{ 
              cursor: 'pointer', 
              fontWeight: 'bold',
              padding: '1rem',
              backgroundColor: '#18181b',
              borderRadius: '8px',
              border: '1px solid #3f3f46',
              fontSize: '1.125rem',
              color: '#e5e5e7'
            }}>
              🗄️ Context Service - Context Retrieval
            </summary>
            <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#18181b', borderRadius: '8px' }}>
              {/* Get Context */}
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ marginBottom: '1rem' }}>📖 Get Context</h3>
                <p style={{ fontSize: '0.9rem', color: '#a1a1aa', marginBottom: '1rem' }}>
                  Retrieve context entries with filtering options.
                </p>
                <input
                  type="text"
                  value={contextCategory}
                  onChange={(e) => setContextCategory(e.target.value)}
                  placeholder="Category (optional, e.g., meeting, commitment)"
                  style={{ width: '100%', marginBottom: '0.5rem', padding: '0.75rem', backgroundColor: '#09090b', color: '#fff', border: '1px solid #3f3f46', borderRadius: '8px' }}
                />
                <input
                  type="text"
                  value={contextSource}
                  onChange={(e) => setContextSource(e.target.value)}
                  placeholder="Source (optional, e.g., transcript, email)"
                  style={{ width: '100%', marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#09090b', color: '#fff', border: '1px solid #3f3f46', borderRadius: '8px' }}
                />
                <button 
                  onClick={handleGetContext}
                  disabled={contextLoading}
                  style={{ padding: '0.75rem 1.5rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                >
                  {contextLoading ? 'Loading...' : 'Get Context'}
                </button>
                {contextResult && (
                  <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: contextResult.error ? '#2a1a1a' : '#1a2e1a', borderRadius: '8px', border: `1px solid ${contextResult.error ? '#ef4444' : '#22c55e'}` }}>
                    {contextResult.error ? (
                      <p style={{ color: '#ef4444' }}>❌ {contextResult.error}</p>
                    ) : (
                      <div>
                        <p style={{ color: '#22c55e', fontWeight: 'bold' }}>Found {contextResult.count || 0} context entries</p>
                        {contextResult.contexts && contextResult.contexts.slice(0, 5).map((ctx, idx) => (
                          <div key={idx} style={{ marginTop: '0.75rem', padding: '0.75rem', backgroundColor: '#09090b', borderRadius: '6px' }}>
                            <p style={{ color: '#a1a1aa', fontSize: '0.9rem' }}>{ctx.content.substring(0, 100)}...</p>
                            <p style={{ color: '#71717a', fontSize: '0.75rem' }}>{ctx.category} • {ctx.source}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Search Context */}
              <div>
                <h3 style={{ marginBottom: '1rem' }}>🔍 Search Context</h3>
                <p style={{ fontSize: '0.9rem', color: '#a1a1aa', marginBottom: '1rem' }}>
                  Search context entries by text query.
                </p>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search query (e.g., budget, Q4 planning)"
                  style={{ width: '100%', marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#09090b', color: '#fff', border: '1px solid #3f3f46', borderRadius: '8px' }}
                />
                <button 
                  onClick={handleSearchContext}
                  disabled={searchLoading || !searchQuery.trim()}
                  style={{ padding: '0.75rem 1.5rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                >
                  {searchLoading ? 'Searching...' : 'Search'}
                </button>
                {searchResult && (
                  <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: searchResult.error ? '#2a1a1a' : '#1a2e1a', borderRadius: '8px', border: `1px solid ${searchResult.error ? '#ef4444' : '#22c55e'}` }}>
                    {searchResult.error ? (
                      <p style={{ color: '#ef4444' }}>❌ {searchResult.error}</p>
                    ) : (
                      <div>
                        <p style={{ color: '#22c55e', fontWeight: 'bold' }}>Found {searchResult.count || 0} results</p>
                        {searchResult.contexts && searchResult.contexts.map((ctx, idx) => (
                          <div key={idx} style={{ marginTop: '0.75rem', padding: '0.75rem', backgroundColor: '#09090b', borderRadius: '6px' }}>
                            <p style={{ color: '#a1a1aa', fontSize: '0.9rem' }}>{ctx.content.substring(0, 150)}...</p>
                            <p style={{ color: '#71717a', fontSize: '0.75rem' }}>{ctx.category} • {ctx.source}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </details>
          
          {/* Pattern Recognition Service */}
          <details style={{ marginBottom: '2rem' }}>
            <summary style={{ 
              cursor: 'pointer', 
              fontWeight: 'bold',
              padding: '1rem',
              backgroundColor: '#18181b',
              borderRadius: '8px',
              border: '1px solid #3f3f46',
              fontSize: '1.125rem',
              color: '#e5e5e7'
            }}>
              📊 Pattern Recognition - Productivity Insights
            </summary>
            <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#18181b', borderRadius: '8px' }}>
              <p style={{ fontSize: '0.9rem', color: '#a1a1aa', marginBottom: '1rem' }}>
                Analyze your productivity patterns, detect working hours, focus time, anomalies, and completion streaks.
              </p>
              <button 
                onClick={handleAnalyzePatterns}
                disabled={patternLoading}
                style={{ padding: '0.75rem 1.5rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
              >
                {patternLoading ? 'Analyzing...' : 'Analyze Patterns'}
              </button>
              {patternResult && (
                <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: patternResult.error ? '#2a1a1a' : '#1a2e1a', borderRadius: '8px', border: `1px solid ${patternResult.error ? '#ef4444' : '#22c55e'}` }}>
                  {patternResult.error ? (
                    <div>
                      <p style={{ color: '#ef4444', fontWeight: 'bold' }}>❌ {patternResult.error}</p>
                      {patternResult.note && <p style={{ color: '#a1a1aa', marginTop: '0.5rem', fontSize: '0.9rem' }}>{patternResult.note}</p>}
                      {patternResult.stats && (
                        <div style={{ marginTop: '1rem', color: '#a1a1aa', fontSize: '0.85rem' }}>
                          <p>📊 Current Stats:</p>
                          <ul style={{ marginTop: '0.5rem' }}>
                            <li>Total tasks: {patternResult.stats.total_tasks}</li>
                            <li>Completed: {patternResult.stats.completed}</li>
                            <li>Pending: {patternResult.stats.pending}</li>
                            <li>Overdue: {patternResult.stats.overdue}</li>
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : patternResult.success ? (
                    <div>
                      <h4 style={{ color: '#22c55e', marginTop: 0, marginBottom: '1rem' }}>✅ Pattern Analysis Complete</h4>
                      
                      {patternResult.stats && (
                        <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#18181b', borderRadius: '8px' }}>
                          <h5 style={{ color: '#e5e5e7', marginTop: 0, marginBottom: '0.75rem' }}>📊 Statistics ({patternResult.time_range})</h5>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', fontSize: '0.85rem', color: '#a1a1aa' }}>
                            <div>
                              <strong style={{ color: '#e5e5e7' }}>Total Tasks:</strong> {patternResult.stats.total_tasks}
                            </div>
                            <div>
                              <strong style={{ color: '#22c55e' }}>Completed:</strong> {patternResult.stats.completed}
                            </div>
                            <div>
                              <strong style={{ color: '#fbbf24' }}>Pending:</strong> {patternResult.stats.pending}
                            </div>
                            <div>
                              <strong style={{ color: '#ef4444' }}>Overdue:</strong> {patternResult.stats.overdue}
                            </div>
                            <div>
                              <strong style={{ color: '#e5e5e7' }}>Completion Rate:</strong> {patternResult.stats.completion_rate}%
                            </div>
                            <div>
                              <strong style={{ color: '#e5e5e7' }}>Avg Time:</strong> {patternResult.stats.avg_completion_days} days
                            </div>
                            {patternResult.stats.most_productive_day && (
                              <div>
                                <strong style={{ color: '#3b82f6' }}>Most Productive:</strong> {patternResult.stats.most_productive_day}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {patternResult.insights && (
                        <div style={{ color: '#e5e5e7', fontSize: '0.9rem', lineHeight: '1.6' }}>
                          <div dangerouslySetInnerHTML={{ 
                            __html: patternResult.insights
                              .replace(/\n/g, '<br/>')
                              .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                              .replace(/## (.+?)(<br\/>|$)/g, '<h4 style="color: #3b82f6; margin-top: 1rem; margin-bottom: 0.5rem;">$1</h4>')
                              .replace(/\* (.+?)(<br\/>|$)/g, '<li style="margin-left: 1.5rem;">$1</li>')
                          }} />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      {patternResult.message && <p style={{ color: '#22c55e', fontWeight: 'bold' }}>{patternResult.message}</p>}
                      {patternResult.note && <p style={{ color: '#a1a1aa', marginTop: '0.5rem' }}>{patternResult.note}</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </details>
        </div>
      </div>
    </PullToRefresh>
  );
}

export default Intelligence;

