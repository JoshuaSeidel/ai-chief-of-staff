import React, { useState, useEffect } from 'react';
import { commitmentsAPI } from '../services/api';

function Commitments() {
  const [commitments, setCommitments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all'); // all, pending, completed, overdue
  const [typeFilter, setTypeFilter] = useState('all'); // all, commitment, action, follow-up, risk

  useEffect(() => {
    loadCommitments();
  }, [filter]);

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

  const updateStatus = async (id, newStatus) => {
    try {
      await commitmentsAPI.update(id, { status: newStatus });
      loadCommitments();
    } catch (err) {
      setError('Failed to update commitment status');
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

  const getStatusColor = (commitment) => {
    if (commitment.status === 'completed') return '#34c759';
    if (isOverdue(commitment)) return '#ff3b30';
    return '#ff9500';
  };

  const groupByStatus = () => {
    const overdue = commitments.filter(c => isOverdue(c));
    const pending = commitments.filter(c => c.status === 'pending' && !isOverdue(c));
    const completed = commitments.filter(c => c.status === 'completed');
    
    return { overdue, pending, completed };
  };

  const grouped = groupByStatus();

  return (
    <div className="commitments">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2>📋 Tasks</h2>
          <button onClick={loadCommitments} disabled={loading} className="secondary">
            {loading ? 'Loading...' : '🔄 Refresh'}
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

        {/* Stats */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
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

        {/* Filters */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
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

      {/* Overdue Commitments */}
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
  );
}

export default Commitments;

