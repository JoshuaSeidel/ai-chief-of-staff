import React, { useState, useEffect } from 'react';
import { commitmentsAPI } from '../services/api';
import { PullToRefresh } from './PullToRefresh';

function Commitments() {
  const [commitments, setCommitments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [syncingMicrosoft, setSyncingMicrosoft] = useState(false);
  const [microsoftConnected, setMicrosoftConnected] = useState(false);
  const [filter, setFilter] = useState('all'); // all, pending, completed, overdue
  const [typeFilter, setTypeFilter] = useState('all'); // all, commitment, action, follow-up, risk

  useEffect(() => {
    loadCommitments();
    checkMicrosoftPlannerStatus();
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const checkMicrosoftPlannerStatus = async () => {
    try {
      const response = await fetch('/api/planner/microsoft/status');
      const data = await response.json();
      setMicrosoftConnected(data.connected);
    } catch (err) {
      console.error('Failed to check Microsoft Planner status:', err);
    }
  };

  const handleSyncToMicrosoft = async () => {
    if (!microsoftConnected) {
      alert('Please connect Microsoft Planner in Configuration first');
      return;
    }
    
    if (!window.confirm('This will create Microsoft To Do tasks for all pending tasks that don\'t already have one. Continue?')) {
      return;
    }
    
    setSyncingMicrosoft(true);
    try {
      const response = await fetch('/api/planner/microsoft/sync', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        alert(`✅ Synced ${data.synced} tasks to Microsoft Planner${data.failed > 0 ? `\n⚠️ ${data.failed} failed` : ''}`);
        loadCommitments(); // Reload to show updated task IDs
      } else {
        alert(`❌ Sync failed: ${data.message || 'Unknown error'}`);
      }
    } catch (err) {
      alert(`❌ Error syncing: ${err.message}`);
    } finally {
      setSyncingMicrosoft(false);
    }
  };

  const loadCommitments = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await commitmentsAPI.getAll(filter);
      setCommitments(response.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load commitments');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    await loadCommitments();
  };

  const updateStatus = async (id, newStatus) => {
    try {
      await commitmentsAPI.update(id, { status: newStatus });
      loadCommitments();
    } catch (err) {
      setError('Failed to update commitment status');
    }
  };

  const confirmTask = async (id, confirmed) => {
    try {
      await commitmentsAPI.confirm(id, confirmed);
      loadCommitments();
    } catch (err) {
      setError('Failed to confirm/reject task');
    }
  };

  const isOverdue = (commitment) => {
    if (!commitment.deadline || commitment.status === 'completed') return false;
    return new Date(commitment.deadline) < new Date();
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'No deadline';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const renderTaskTypeBadge = (taskType) => {
    const type = taskType || 'commitment';
    const emoji = typeEmojis[type];
    const label = typeLabels[type] || 'Task';
    
    const colors = {
      'commitment': '#3b82f6',
      'action': '#10b981',
      'follow-up': '#f59e0b',
      'risk': '#ef4444'
    };
    
    return (
      <span style={{
        display: 'inline-block',
        padding: '0.25rem 0.5rem',
        borderRadius: '4px',
        fontSize: '0.75rem',
        fontWeight: '600',
        backgroundColor: colors[type] + '20',
        color: colors[type],
        marginRight: '0.5rem'
      }}>
        {emoji} {label}
      </span>
    );
  };

  const groupByStatus = () => {
    const overdue = commitments.filter(c => isOverdue(c));
    const pending = commitments.filter(c => c.status === 'pending' && !isOverdue(c));
    const completed = commitments.filter(c => c.status === 'completed');
    
    return { overdue, pending, completed };
  };

  const groupByConfirmation = () => {
    // Apply current filters first
    let filtered = commitments;
    if (filter === 'overdue') {
      filtered = commitments.filter(c => isOverdue(c));
    } else if (filter === 'pending') {
      filtered = commitments.filter(c => c.status === 'pending' && !isOverdue(c));
    } else if (filter === 'completed') {
      filtered = commitments.filter(c => c.status === 'completed');
    }
    
    // Apply type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(c => (c.task_type || 'commitment') === typeFilter);
    }
    
    const needsConfirmation = filtered.filter(c => c.needs_confirmation === 1 || c.needs_confirmation === true);
    const confirmed = filtered.filter(c => !c.needs_confirmation || c.needs_confirmation === 0 || c.needs_confirmation === false);
    
    return { needsConfirmation, confirmed };
  };

  const groupByType = () => {
    const filtered = typeFilter === 'all' 
      ? commitments 
      : commitments.filter(c => (c.task_type || 'commitment') === typeFilter);
    
    return {
      commitments: filtered.filter(c => (c.task_type || 'commitment') === 'commitment'),
      actions: filtered.filter(c => c.task_type === 'action'),
      followUps: filtered.filter(c => c.task_type === 'follow-up'),
      risks: filtered.filter(c => c.task_type === 'risk')
    };
  };

  const grouped = groupByStatus();
  const byType = groupByType();
  
  const typeEmojis = {
    'all': '📋',
    'commitment': '📋',
    'action': '⚡',
    'follow-up': '🔄',
    'risk': '⚠️'
  };
  
  const typeLabels = {
    'commitment': 'Commitments',
    'action': 'Action Items',
    'follow-up': 'Follow-ups',
    'risk': 'Risks'
  };

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="commitments">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2>📋 Tasks</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {microsoftConnected && (
              <button 
                onClick={handleSyncToMicrosoft} 
                disabled={syncingMicrosoft || loading}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: syncingMicrosoft ? '#6e6e73' : '#0078d4',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: syncingMicrosoft ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                {syncingMicrosoft ? '⏳ Syncing...' : '📋 Sync to Microsoft Planner'}
              </button>
            )}
            <button onClick={loadCommitments} disabled={loading} className="secondary">
              {loading ? 'Loading...' : '🔄 Refresh'}
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

        {/* Stats */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
          gap: '1rem', 
          marginBottom: '2rem' 
        }}>
          <div style={{ 
            backgroundColor: '#18181b', 
            padding: '1rem', 
            borderRadius: '8px',
            border: '1px solid #3f3f46'
          }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#ff3b30' }}>
              {grouped.overdue.length}
            </div>
            <div style={{ fontSize: '0.9rem', color: '#a1a1aa' }}>⚠️ Overdue</div>
          </div>
          <div style={{ 
            backgroundColor: '#18181b', 
            padding: '1rem', 
            borderRadius: '8px',
            border: '1px solid #3f3f46'
          }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#ff9500' }}>
              {grouped.pending.length}
            </div>
            <div style={{ fontSize: '0.9rem', color: '#a1a1aa' }}>⏳ Pending</div>
          </div>
          <div style={{ 
            backgroundColor: '#18181b', 
            padding: '1rem', 
            borderRadius: '8px',
            border: '1px solid #3f3f46'
          }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#34c759' }}>
              {grouped.completed.length}
            </div>
            <div style={{ fontSize: '0.9rem', color: '#a1a1aa' }}>✅ Completed</div>
          </div>
        </div>

        {/* Task Type Stats */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', 
          gap: '0.75rem', 
          marginBottom: '1.5rem' 
        }}>
          <div style={{ 
            backgroundColor: '#18181b', 
            padding: '0.75rem', 
            borderRadius: '8px',
            border: '1px solid #3f3f46',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '1.5rem' }}>📋</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#fff' }}>
              {byType.commitments.length}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>Commitments</div>
          </div>
          <div style={{ 
            backgroundColor: '#18181b', 
            padding: '0.75rem', 
            borderRadius: '8px',
            border: '1px solid #3f3f46',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '1.5rem' }}>⚡</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#fff' }}>
              {byType.actions.length}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>Actions</div>
          </div>
          <div style={{ 
            backgroundColor: '#18181b', 
            padding: '0.75rem', 
            borderRadius: '8px',
            border: '1px solid #3f3f46',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '1.5rem' }}>🔄</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#fff' }}>
              {byType.followUps.length}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>Follow-ups</div>
          </div>
          <div style={{ 
            backgroundColor: '#18181b', 
            padding: '0.75rem', 
            borderRadius: '8px',
            border: '1px solid #3f3f46',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '1.5rem' }}>⚠️</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#fff' }}>
              {byType.risks.length}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>Risks</div>
          </div>
        </div>

        {/* Status Filters */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.85rem', color: '#a1a1aa', marginBottom: '0.5rem' }}>Filter by Status:</div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {['all', 'overdue', 'pending', 'completed'].map(status => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={filter === status ? '' : 'secondary'}
                style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Task Type Filters */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.85rem', color: '#a1a1aa', marginBottom: '0.5rem' }}>Filter by Type:</div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {['all', 'commitment', 'action', 'follow-up', 'risk'].map(type => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={typeFilter === type ? '' : 'secondary'}
                style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
              >
                {typeEmojis[type]} {type === 'all' ? 'All Types' : typeLabels[type]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Overdue Commitments */}
      {/* Confirmation Section */}
      {(() => {
        const confirmationGroup = groupByConfirmation();
        return confirmationGroup.needsConfirmation.length > 0 && (
          <div className="card" style={{ border: '2px solid #f59e0b', marginBottom: '1.5rem' }}>
            <h3 style={{ color: '#f59e0b', marginBottom: '1rem' }}>🔔 Tasks Needing Confirmation</h3>
            <p style={{ fontSize: '0.9rem', color: '#a1a1aa', marginBottom: '1rem' }}>
              These tasks have unclear assignees. Confirm if they're yours, or reject to remove them.
            </p>
            {confirmationGroup.needsConfirmation.map(commitment => (
              <div
                key={commitment.id}
                style={{
                  backgroundColor: '#2a1f0a',
                  padding: '1rem',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                  border: '1px solid #f59e0b40'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <div style={{ flex: 1 }}>
                    {renderTaskTypeBadge(commitment.task_type)}
                  </div>
                </div>
                <p style={{ fontSize: '1rem', marginBottom: '0.5rem', color: '#fbbf24' }}>
                  {commitment.description}
                </p>
                <div style={{ fontSize: '0.85rem', color: '#a1a1aa', marginBottom: '1rem' }}>
                  <div>👤 Assignee: <strong>{commitment.assignee || 'Unknown'}</strong></div>
                  {commitment.deadline && (
                    <div>📅 Deadline: {formatDate(commitment.deadline)}</div>
                  )}
                  {commitment.suggested_approach && (
                    <div style={{ marginTop: '0.5rem', fontStyle: 'italic' }}>
                      💡 {commitment.suggested_approach}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => confirmTask(commitment.id, true)}
                    style={{ 
                      padding: '0.5rem 1rem', 
                      fontSize: '0.85rem',
                      backgroundColor: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      flex: 1
                    }}
                  >
                    ✅ Confirm (It's Mine)
                  </button>
                  <button
                    onClick={() => confirmTask(commitment.id, false)}
                    style={{ 
                      padding: '0.5rem 1rem', 
                      fontSize: '0.85rem',
                      backgroundColor: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      flex: 1
                    }}
                  >
                    ❌ Reject (Not Mine)
                  </button>
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {grouped.overdue.length > 0 && (filter === 'all' || filter === 'overdue') && (
        <div className="card">
          <h3 style={{ color: '#ff3b30', marginBottom: '1rem' }}>⚠️ Overdue Commitments</h3>
          {grouped.overdue.map(commitment => (
            <div
              key={commitment.id}
              style={{
                backgroundColor: '#3f1a1a',
                padding: '1rem',
                borderRadius: '8px',
                marginBottom: '0.75rem',
                border: '2px solid #ff3b30'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ marginBottom: '0.5rem' }}>
                    {renderTaskTypeBadge(commitment.task_type)}
                  </div>
                  <p style={{ fontSize: '1rem', marginBottom: '0.5rem', color: '#fca5a5' }}>
                    {commitment.description}
                  </p>
                  <div style={{ fontSize: '0.85rem', color: '#a1a1aa' }}>
                    {commitment.assignee && <span>👤 {commitment.assignee} • </span>}
                    <span>📅 Due: {formatDate(commitment.deadline)}</span>
                  </div>
                </div>
                <button
                  onClick={() => updateStatus(commitment.id, 'completed')}
                  style={{ 
                    padding: '0.5rem 1rem', 
                    fontSize: '0.85rem',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Mark Complete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pending Commitments */}
      {grouped.pending.length > 0 && (filter === 'all' || filter === 'pending') && (
        <div className="card">
          <h3 style={{ color: '#ff9500', marginBottom: '1rem' }}>⏳ Pending Commitments</h3>
          {grouped.pending.map(commitment => (
            <div
              key={commitment.id}
              style={{
                backgroundColor: '#18181b',
                padding: '1rem',
                borderRadius: '8px',
                marginBottom: '0.75rem',
                border: '1px solid #3f3f46'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ marginBottom: '0.5rem' }}>
                    {renderTaskTypeBadge(commitment.task_type)}
                  </div>
                  <p style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>
                    {commitment.description}
                  </p>
                  <div style={{ fontSize: '0.85rem', color: '#a1a1aa' }}>
                    {commitment.assignee && <span>👤 {commitment.assignee} • </span>}
                    <span>📅 {formatDate(commitment.deadline)}</span>
                  </div>
                </div>
                <button
                  onClick={() => updateStatus(commitment.id, 'completed')}
                  className="secondary"
                  style={{ 
                    padding: '0.5rem 1rem', 
                    fontSize: '0.85rem',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Mark Complete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Completed Commitments */}
      {grouped.completed.length > 0 && (filter === 'all' || filter === 'completed') && (
        <div className="card">
          <h3 style={{ color: '#34c759', marginBottom: '1rem' }}>✅ Completed Commitments</h3>
          {grouped.completed.map(commitment => (
            <div
              key={commitment.id}
              style={{
                backgroundColor: '#18181b',
                padding: '1rem',
                borderRadius: '8px',
                marginBottom: '0.75rem',
                border: '1px solid #3f3f46',
                opacity: 0.7
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ marginBottom: '0.5rem' }}>
                    {renderTaskTypeBadge(commitment.task_type)}
                  </div>
                  <p style={{ fontSize: '1rem', marginBottom: '0.5rem', textDecoration: 'line-through' }}>
                    {commitment.description}
                  </p>
                  <div style={{ fontSize: '0.85rem', color: '#a1a1aa' }}>
                    {commitment.assignee && <span>👤 {commitment.assignee} • </span>}
                    <span>✓ Completed: {formatDate(commitment.completed_date)}</span>
                  </div>
                </div>
                <button
                  onClick={() => updateStatus(commitment.id, 'pending')}
                  className="secondary"
                  style={{ 
                    padding: '0.5rem 1rem', 
                    fontSize: '0.85rem',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Reopen
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {commitments.length === 0 && !loading && (
        <div className="card">
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6e6e73' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
            <p>No commitments found.</p>
            <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
              Upload transcripts to automatically extract commitments.
            </p>
          </div>
        </div>
      )}
      </div>
    </PullToRefresh>
  );
}

export default Commitments;

