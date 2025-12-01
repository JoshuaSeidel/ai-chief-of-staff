import React, { useState, useEffect } from 'react';
import { commitmentsAPI, intelligenceAPI } from '../services/api';
import { PullToRefresh } from './PullToRefresh';

function Commitments() {
  const [commitments, setCommitments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [syncingMicrosoft, setSyncingMicrosoft] = useState(false);
  const [microsoftConnected, setMicrosoftConnected] = useState(false);
  const [syncingJira, setSyncingJira] = useState(false);
  const [jiraConnected, setJiraConnected] = useState(false);
  const [hasFailedSyncs, setHasFailedSyncs] = useState(false);
  const [filter, setFilter] = useState('all'); // all, pending, completed, overdue
  const [typeFilter, setTypeFilter] = useState('all'); // all, commitment, action, follow-up, risk
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTask, setNewTask] = useState({
    description: '',
    task_type: 'commitment',
    assignee: '',
    deadline: '',
    priority: 'medium'
  });
  const [showClusters, setShowClusters] = useState(false);
  const [clusters, setClusters] = useState(null);
  const [clusteringTasks, setClusteringTasks] = useState(false);

  useEffect(() => {
    loadCommitments();
    checkMicrosoftPlannerStatus();
    checkJiraStatus();
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check for failed syncs (tasks without jira_task_id when Jira is connected)
  useEffect(() => {
    if (jiraConnected && commitments.length > 0) {
      const pendingWithoutJira = commitments.filter(c => 
        c.status !== 'completed' && 
        (!c.jira_task_id || c.jira_task_id === '')
      );
      setHasFailedSyncs(pendingWithoutJira.length > 0);
    } else {
      setHasFailedSyncs(false);
    }
  }, [jiraConnected, commitments]);

  const checkMicrosoftPlannerStatus = async () => {
    try {
      const response = await fetch('/api/planner/microsoft/status');
      const data = await response.json();
      setMicrosoftConnected(data.connected);
    } catch (err) {
      console.error('Failed to check Microsoft Planner status:', err);
    }
  };

  const checkJiraStatus = async () => {
    try {
      const response = await fetch('/api/planner/jira/status');
      const data = await response.json();
      setJiraConnected(data.connected);
    } catch (err) {
      console.error('Failed to check Jira status:', err);
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

  const handleSyncToJira = async () => {
    if (!jiraConnected) {
      alert('Please connect Jira in Configuration first');
      return;
    }
    
    if (!window.confirm('This will create Jira issues for all pending tasks that don\'t already have one. Continue?')) {
      return;
    }
    
    setSyncingJira(true);
    try {
      const response = await fetch('/api/planner/jira/sync', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        alert(`✅ Synced ${data.synced} tasks to Jira${data.failed > 0 ? `\n⚠️ ${data.failed} failed` : ''}`);
        await loadCommitments(); // Reload to show updated task IDs
        // Update failed syncs state after reload
        if (data.failed === 0) {
          setHasFailedSyncs(false);
        }
      } else {
        alert(`❌ Sync failed: ${data.message || 'Unknown error'}`);
      }
    } catch (err) {
      alert(`❌ Error syncing: ${err.message}`);
    } finally {
      setSyncingJira(false);
    }
  };

  const handleSyncFailedToJira = async () => {
    if (!jiraConnected) {
      alert('Please connect Jira in Configuration first');
      return;
    }
    
    if (!window.confirm('This will retry syncing all failed/pending tasks to Jira. Continue?')) {
      return;
    }
    
    setSyncingJira(true);
    try {
      const response = await fetch('/api/planner/jira/sync-failed', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        alert(`✅ Synced ${data.synced} tasks to Jira${data.failed > 0 ? `\n⚠️ ${data.failed} failed` : ''}`);
        if (data.errors && data.errors.length > 0) {
          console.error('Sync errors:', data.errors);
        }
        await loadCommitments(); // Reload to show updated task IDs
        // Update failed syncs state after reload
        if (data.failed === 0) {
          setHasFailedSyncs(false);
        }
      } else {
        alert(`❌ Sync failed: ${data.message || 'Unknown error'}`);
      }
    } catch (err) {
      alert(`❌ Error syncing: ${err.message}`);
    } finally {
      setSyncingJira(false);
    }
  };

  const handleCreateTask = async () => {
    if (!newTask.description.trim()) {
      alert('Please enter a description');
      return;
    }
    
    setCreating(true);
    try {
      const taskData = {
        description: newTask.description.trim(),
        task_type: newTask.task_type,
        assignee: newTask.assignee.trim() || null,
        deadline: newTask.deadline || null,
        priority: newTask.priority,
        urgency: newTask.priority
      };
      
      const response = await commitmentsAPI.create(taskData);
      
      if (response.data.success) {
        setShowCreateModal(false);
        setNewTask({
          description: '',
          task_type: 'commitment',
          assignee: '',
          deadline: '',
          priority: 'medium'
        });
        await loadCommitments();
        alert('✅ Task created successfully!');
      } else {
        alert(`❌ Failed to create task: ${response.data.message || 'Unknown error'}`);
      }
    } catch (err) {
      alert(`❌ Error creating task: ${err.response?.data?.message || err.message}`);
    } finally {
      setCreating(false);
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

  const handleSmartGroup = async () => {
    const pendingTasks = filteredCommitments.filter(c => c.status !== 'completed');
    if (pendingTasks.length < 2) {
      alert('Need at least 2 pending tasks to group');
      return;
    }
    
    setClusteringTasks(true);
    try {
      const tasks = pendingTasks.map((c, i) => ({
        id: i + 1,
        description: c.description,
        deadline: c.deadline,
        commitment_id: c.id  // Keep track of actual DB ID
      }));
      
      const response = await intelligenceAPI.clusterTasks(tasks);
      if (response.data && response.data.clusters) {
        setClusters(response.data);
        
        // Save cluster assignments to database
        let updatedCount = 0;
        for (const cluster of response.data.clusters) {
          for (const taskIndex of cluster.task_indices) {
            const task = tasks[taskIndex - 1];  // task_indices are 1-based
            if (task && task.commitment_id) {
              try {
                await commitmentsAPI.update(task.commitment_id, { 
                  cluster_group: cluster.name 
                });
                updatedCount++;
                console.log(`Updated task ${task.commitment_id} with cluster: ${cluster.name}`);
              } catch (updateErr) {
                console.error(`Failed to update cluster for task ${task.commitment_id}:`, updateErr);
              }
            }
          }
        }
        
        // Reload commitments to show updated groups
        await loadCommitments();
        
        // Show success message with cluster info
        setShowClusters(true);
        alert(`✅ Grouped ${updatedCount} tasks into ${response.data.clusters.length} clusters!\n\nCheck the task list to see group labels.`);
      } else {
        alert('No clusters identified - tasks are too different to group');
      }
    } catch (err) {
      console.error('Clustering failed:', err);
      alert('Smart grouping unavailable: ' + err.message);
    } finally {
      setClusteringTasks(false);
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

  const confirmTask = async (id, confirmed) => {
    try {
      await commitmentsAPI.confirm(id, confirmed);
      loadCommitments();
    } catch (err) {
      setError('Failed to confirm/reject task');
    }
  };

  const deleteTask = async (id, description) => {
    if (!window.confirm(`Are you sure you want to delete this task?\n\n"${description}"\n\nThis will also remove it from Google Calendar, Jira, and Microsoft Planner if synced.`)) {
      return;
    }
    
    try {
      const response = await commitmentsAPI.delete(id);
      
      // Show detailed results if available
      if (response.data?.deletionResults) {
        const results = response.data.deletionResults;
        let message = '✅ Task deleted successfully';
        
        if (results.calendar === 'success') message += '\n📅 Calendar event removed';
        if (results.jira === 'success') message += '\n🎫 Jira issue deleted';
        if (results.microsoft === 'success') message += '\n📋 Microsoft task deleted';
        
        if (results.calendar === 'failed' || results.jira === 'failed' || results.microsoft === 'failed') {
          message += '\n\n⚠️ Some external deletions failed (check logs)';
        }
        
        alert(message);
      }
      
      loadCommitments();
    } catch (err) {
      setError('Failed to delete task: ' + (err.response?.data?.message || err.message));
      alert('❌ Failed to delete task: ' + (err.response?.data?.message || err.message));
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
      <span 
        className="task-badge-inline"
        style={{
          backgroundColor: colors[type] + '20',
          color: colors[type]
        }}
      >
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

  // Apply filters to get filtered commitments
  const getFilteredCommitments = () => {
    let filtered = commitments;
    
    // Apply status filter
    if (filter === 'overdue') {
      filtered = filtered.filter(c => isOverdue(c));
    } else if (filter === 'pending') {
      filtered = filtered.filter(c => c.status === 'pending' && !isOverdue(c));
    } else if (filter === 'completed') {
      filtered = filtered.filter(c => c.status === 'completed');
    }
    
    // Apply type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(c => (c.task_type || 'commitment') === typeFilter);
    }
    
    return filtered;
  };

  const filteredCommitments = getFilteredCommitments();
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
    <>
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="commitments">
            <div className="card">
        <div className="flex-between mb-lg flex-wrap gap-lg">
          <h2 className="mt-0 mb-0">Task Management</h2>
          <div className="flex gap-sm flex-wrap">
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn btn-success text-nowrap"
              title="Create a new task"
            >
              ➕ Create Task
            </button>
            <button
              onClick={handleSmartGroup}
              disabled={clusteringTasks || loading || filteredCommitments.filter(c => c.status !== 'completed').length < 2}
              className="btn"
              style={{
                backgroundColor: clusteringTasks ? '#6e6e73' : '#8b5cf6',
                color: 'white',
                cursor: clusteringTasks || filteredCommitments.filter(c => c.status !== 'completed').length < 2 ? 'not-allowed' : 'pointer',
                textAlign: 'center',
                wordBreak: 'break-word'
              }}
              title="AI-powered task grouping"
            >
              {clusteringTasks ? '⏳ Analyzing Tasks...' : '🤖 Analyze & Group Tasks'}
            </button>
            {microsoftConnected && (
              <button 
                onClick={handleSyncToMicrosoft} 
                disabled={syncingMicrosoft || loading}
                className="btn"
                style={{
                  backgroundColor: syncingMicrosoft ? '#6e6e73' : '#0078d4',
                  color: 'white',
                  cursor: syncingMicrosoft ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap'
                }}
                title="Sync tasks to Microsoft Planner"
              >
                {syncingMicrosoft ? '⏳ Syncing...' : '📋 Sync to Microsoft Planner'}
              </button>
            )}
            {jiraConnected && (
              <>
                <button 
                  onClick={handleSyncToJira} 
                  disabled={syncingJira || loading}
                  className="btn"
                  style={{
                    backgroundColor: syncingJira ? '#6e6e73' : '#0052CC',
                    color: 'white',
                    cursor: syncingJira ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                  title="Sync tasks to Jira"
                >
                  {syncingJira ? '⏳ Syncing...' : '🎯 Sync to Jira'}
                </button>
                {hasFailedSyncs && (
                  <button 
                    onClick={handleSyncFailedToJira} 
                    disabled={syncingJira || loading}
                    className="btn btn-warning"
                    style={{
                      backgroundColor: syncingJira ? '#6e6e73' : undefined,
                      cursor: syncingJira ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                    title="Retry syncing failed/pending tasks to Jira"
                  >
                    {syncingJira ? '⏳ Syncing...' : '🔄 Retry Failed'}
                  </button>
                )}
              </>
            )}
            <button onClick={loadCommitments} disabled={loading} className="secondary">
              {loading ? 'Loading...' : '🔄 Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="message-error">
            {error}
          </div>
        )}

        {/* Stats */}
        <div className="grid-auto-fit">
          <div className="stat-box-bordered">
            <div className="stat-number-error">
              {grouped.overdue.length}
            </div>
            <div className="stat-caption">⚠️ Overdue</div>
          </div>
          <div className="stat-box-bordered">
            <div className="stat-number-warning">
              {grouped.pending.length}
            </div>
            <div className="stat-caption">⏳ Pending</div>
          </div>
          <div style={{ 
            backgroundColor: '#18181b', 
            padding: '1rem', 
            borderRadius: '8px',
            border: '1px solid #3f3f46'
          }}>
            <div className="stat-number-success">
              {grouped.completed.length}
            </div>
            <div className="stat-caption">✅ Completed</div>
          </div>
        </div>

        {/* Task Type Stats */}
        <div className="grid-auto-fit-sm">
          <div className="stat-box-bordered text-center">
            <div className="stat-large-icon">📋</div>
            <div className="stat-title">
              {byType.commitments.length}
            </div>
            <div className="text-xs text-muted">Commitments</div>
          </div>
          <div style={{ 
            backgroundColor: '#18181b', 
            padding: '0.75rem', 
            borderRadius: '8px',
            border: '1px solid #3f3f46',
            textAlign: 'center'
          }}>
            <div className="stat-large-icon">⚡</div>
            <div className="stat-title">
              {byType.actions.length}
            </div>
            <div className="text-xs text-muted">Actions</div>
          </div>
          <div style={{ 
            backgroundColor: '#18181b', 
            padding: '0.75rem', 
            borderRadius: '8px',
            border: '1px solid #3f3f46',
            textAlign: 'center'
          }}>
            <div className="stat-large-icon">🔄</div>
            <div className="stat-title">
              {byType.followUps.length}
            </div>
            <div className="text-xs text-muted">Follow-ups</div>
          </div>
          <div style={{ 
            backgroundColor: '#18181b', 
            padding: '0.75rem', 
            borderRadius: '8px',
            border: '1px solid #3f3f46',
            textAlign: 'center'
          }}>
            <div className="stat-large-icon">⚠️</div>
            <div className="stat-title">
              {byType.risks.length}
            </div>
            <div className="text-xs text-muted">Risks</div>
          </div>
        </div>

        {/* Status Filters */}
        <div className="mb-md">
          <div className="text-sm-muted-mb-sm">Filter by Status:</div>
          <div className="flex gap-sm flex-wrap">
            {['all', 'overdue', 'pending', 'completed'].map(status => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={filter === status ? 'btn-filter' : 'secondary btn-filter'}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Task Type Filters */}
        <div className="mb-lg">
          <div className="text-sm-muted-mb-sm">Filter by Type:</div>
          <div className="flex gap-sm flex-wrap">
            {['all', 'commitment', 'action', 'follow-up', 'risk'].map(type => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={typeFilter === type ? 'btn-filter' : 'secondary btn-filter'}
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
          <div className="card card-warning-border">
            <h3 className="heading-warning-mb-md">🔔 Tasks Needing Confirmation</h3>
            <p className="text-sm-muted-mb-md">
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
                <div className="task-header">
                  <div className="task-badges">
                    {renderTaskTypeBadge(commitment.task_type)}
                    {commitment.cluster_group && (
                      <span className="task-badge">
                        📁 {commitment.cluster_group}
                      </span>
                    )}
                  </div>
                </div>
                <p className="task-description">
                  {commitment.description}
                </p>
                <div className="task-metadata">
                  <div>👤 Assignee: <strong>{commitment.assignee || 'Unknown'}</strong></div>
                  {commitment.deadline && (
                    <div>📅 Deadline: {formatDate(commitment.deadline)}</div>
                  )}
                  {commitment.suggested_approach && (
                    <div className="task-metadata-row">
                      💡 {commitment.suggested_approach}
                    </div>
                  )}
                </div>
                <div className="task-actions">
                  <button
                    onClick={() => confirmTask(commitment.id, true)}
                    className="btn btn-success btn-full"
                  >
                    ✅ Confirm
                  </button>
                  <button
                    onClick={() => confirmTask(commitment.id, false)}
                    className="btn btn-error btn-full"
                  >
                    ❌ Reject
                  </button>
                  <button
                    onClick={() => deleteTask(commitment.id, commitment.description)}
                    className="btn"
                    style={{ 
                      backgroundColor: '#71717a',
                      color: 'white',
                      minWidth: '80px'
                    }}
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {grouped.overdue.length > 0 && (filter === 'all' || filter === 'overdue') && (
        <div className="card">
          <h3 className="heading-error-mb-md">⚠️ Overdue Commitments</h3>
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
              <div className="task-card-layout task-layout">
                <div className="task-card-content task-content-flex">
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                    {renderTaskTypeBadge(commitment.task_type)}
                    {commitment.cluster_group && (
                      <span style={{ 
                        backgroundColor: '#3b82f6', 
                        color: 'white', 
                        padding: '0.35rem 0.65rem', 
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: '600',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}>
                        📁 {commitment.cluster_group}
                      </span>
                    )}
                  </div>
                  <p className="task-description-error">
                    {commitment.description}
                  </p>
                  <div className="task-metadata-wrap">
                    {commitment.assignee && <span>👤 {commitment.assignee} • </span>}
                    <span>📅 Due: {formatDate(commitment.deadline)}</span>
                  </div>
                </div>
                <div className="flex gap-sm flex-wrap">
                  <button
                    onClick={() => updateStatus(commitment.id, 'completed')}
                    className="task-card-button"
                    style={{ 
                      padding: '0.5rem 1rem', 
                      fontSize: '0.85rem',
                      whiteSpace: 'nowrap',
                      flexShrink: 0
                    }}
                  >
                    ✅ Complete
                  </button>
                  <button
                    onClick={() => deleteTask(commitment.id, commitment.description)}
                    style={{ 
                      padding: '0.5rem 1rem', 
                      fontSize: '0.85rem',
                      backgroundColor: '#71717a',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      flexShrink: 0
                    }}
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pending Commitments */}
      {grouped.pending.length > 0 && (filter === 'all' || filter === 'pending') && (
        <div className="card">
          <h3 className="text-warning-mb">⏳ Pending Commitments</h3>
          {grouped.pending.map(commitment => (
            <div
              key={commitment.id}
              className="task-card-dark"
            >
              <div className="task-card-layout task-layout">
                <div className="task-card-content task-content-flex">
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                    {renderTaskTypeBadge(commitment.task_type)}
                    {commitment.cluster_group && (
                      <span style={{ 
                        backgroundColor: '#3b82f6', 
                        color: 'white', 
                        padding: '0.35rem 0.65rem', 
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: '600',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}>
                        📁 {commitment.cluster_group}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '1rem', marginBottom: '0.5rem', wordWrap: 'break-word', overflowWrap: 'break-word' }}>
                    {commitment.description}
                  </p>
                  <div className="task-metadata-wrap">
                    {commitment.assignee && <span>👤 {commitment.assignee} • </span>}
                    <span>📅 {formatDate(commitment.deadline)}</span>
                  </div>
                </div>
                <div className="flex gap-sm flex-wrap">
                  <button
                    onClick={() => updateStatus(commitment.id, 'completed')}
                    className="secondary task-card-button"
                    style={{ 
                      padding: '0.5rem 1rem', 
                      fontSize: '0.85rem',
                      whiteSpace: 'nowrap',
                      flexShrink: 0
                    }}
                  >
                    ✅ Complete
                  </button>
                  <button
                    onClick={() => deleteTask(commitment.id, commitment.description)}
                    style={{ 
                      padding: '0.5rem 1rem', 
                      fontSize: '0.85rem',
                      backgroundColor: '#71717a',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      flexShrink: 0
                    }}
                  >
                    🗑️ Delete
                  </button>
                </div>
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
              <div className="task-card-layout task-layout">
                <div className="task-card-content task-content-flex">
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                    {renderTaskTypeBadge(commitment.task_type)}
                    {commitment.cluster_group && (
                      <span style={{ 
                        backgroundColor: '#3b82f6', 
                        color: 'white', 
                        padding: '0.35rem 0.65rem', 
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: '600',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}>
                        📁 {commitment.cluster_group}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '1rem', marginBottom: '0.5rem', textDecoration: 'line-through', wordWrap: 'break-word', overflowWrap: 'break-word' }}>
                    {commitment.description}
                  </p>
                  <div className="task-metadata-wrap">
                    {commitment.assignee && <span>👤 {commitment.assignee} • </span>}
                    <span>✓ Completed: {formatDate(commitment.completed_date)}</span>
                  </div>
                </div>
                <div className="flex gap-sm flex-wrap">
                  <button
                    onClick={() => updateStatus(commitment.id, 'pending')}
                    className="secondary task-card-button"
                    style={{ 
                      padding: '0.5rem 1rem', 
                      fontSize: '0.85rem',
                      whiteSpace: 'nowrap',
                      flexShrink: 0
                    }}
                  >
                    ↩️ Reopen
                  </button>
                  <button
                    onClick={() => deleteTask(commitment.id, commitment.description)}
                    style={{ 
                      padding: '0.5rem 1rem', 
                      fontSize: '0.85rem',
                      backgroundColor: '#71717a',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      flexShrink: 0
                    }}
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {commitments.length === 0 && !loading && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <p>No commitments found.</p>
            <p className="text-sm-gray-mt-sm">
              Upload transcripts to automatically extract commitments, or create a task manually.
            </p>
          </div>
        </div>
      )}
      </div>
    </PullToRefresh>

      {/* Create Task Modal - Outside PullToRefresh for proper positioning */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem',
          overflow: 'auto'
        }} onClick={() => !creating && setShowCreateModal(false)}>
          <div className="card" style={{
            maxWidth: '500px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto',
            backgroundColor: '#27272a',
            border: '1px solid #3f3f46',
            margin: 'auto'
          }} onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-lg">Create New Task</h2>
            
            <div className="mb-md">
              <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e5e7', fontSize: '0.9rem' }}>
                Task Type *
              </label>
              <select
                value={newTask.task_type}
                onChange={(e) => setNewTask({ ...newTask, task_type: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: '#18181b',
                  border: '1px solid #3f3f46',
                  borderRadius: '6px',
                  color: '#e5e5e7',
                  fontSize: '1rem'
                }}
                disabled={creating}
              >
                <option value="commitment">📋 Commitment</option>
                <option value="action">⚡ Action Item</option>
                <option value="follow-up">🔄 Follow-up</option>
                <option value="risk">⚠️ Risk</option>
              </select>
            </div>

            <div className="mb-md">
              <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e5e7', fontSize: '0.9rem' }}>
                Description *
              </label>
              <textarea
                value={newTask.description}
                onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                placeholder="Enter task description..."
                rows={4}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: '#18181b',
                  border: '1px solid #3f3f46',
                  borderRadius: '6px',
                  color: '#e5e5e7',
                  fontSize: '1rem',
                  fontFamily: 'inherit',
                  resize: 'vertical'
                }}
                disabled={creating}
              />
            </div>

            <div className="mb-md">
              <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e5e7', fontSize: '0.9rem' }}>
                Assignee (optional)
              </label>
              <input
                type="text"
                value={newTask.assignee}
                onChange={(e) => setNewTask({ ...newTask, assignee: e.target.value })}
                placeholder="Enter assignee name"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: '#18181b',
                  border: '1px solid #3f3f46',
                  borderRadius: '6px',
                  color: '#e5e5e7',
                  fontSize: '1rem'
                }}
                disabled={creating}
              />
            </div>

            <div className="mb-md">
              <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e5e7', fontSize: '0.9rem' }}>
                Deadline (optional)
              </label>
              <input
                type="datetime-local"
                value={newTask.deadline}
                onChange={(e) => setNewTask({ ...newTask, deadline: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: '#18181b',
                  border: '1px solid #3f3f46',
                  borderRadius: '6px',
                  color: '#e5e5e7',
                  fontSize: '1rem'
                }}
                disabled={creating}
              />
            </div>

            <div className="mb-lg">
              <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e5e7', fontSize: '0.9rem' }}>
                Priority
              </label>
              <select
                value={newTask.priority}
                onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: '#18181b',
                  border: '1px solid #3f3f46',
                  borderRadius: '6px',
                  color: '#e5e5e7',
                  fontSize: '1rem'
                }}
                disabled={creating}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="highest">Highest</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewTask({
                    description: '',
                    task_type: 'commitment',
                    assignee: '',
                    deadline: '',
                    priority: 'medium'
                  });
                }}
                disabled={creating}
                className="secondary btn-padding-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTask}
                disabled={creating || !newTask.description.trim()}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: creating ? '#6e6e73' : '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: creating || !newTask.description.trim() ? 'not-allowed' : 'pointer',
                  fontSize: '1rem'
                }}
              >
                {creating ? 'Creating...' : 'Create Task'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Smart Groups Modal */}
      {showClusters && clusters && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: '#18181b',
            borderRadius: '12px',
            padding: '2rem',
            maxWidth: '600px',
            width: '100%',
            maxHeight: '80vh',
            overflow: 'auto',
            color: '#e5e5e7'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, color: '#e5e5e7' }}>🤖 AI-Grouped Tasks</h3>
              <button
                onClick={() => setShowClusters(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#a1a1aa'
                }}
              >
                ×
              </button>
            </div>
            
            {clusters.clusters && clusters.clusters.map((cluster, idx) => (
              <div key={idx} style={{
                marginBottom: '1rem',
                padding: '1rem',
                backgroundColor: '#09090b',
                borderRadius: '8px',
                border: '1px solid #3f3f46'
              }}>
                <h4 style={{ color: '#3b82f6', marginTop: 0, marginBottom: '0.5rem' }}>{cluster.name}</h4>
                {cluster.reasoning && (
                  <p style={{ color: '#a1a1aa', fontSize: '0.9rem', marginBottom: '0.5rem' }}>{cluster.reasoning}</p>
                )}
                {cluster.suggested_order && (
                  <p style={{ color: '#22c55e', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                    <strong>Order:</strong> {cluster.suggested_order}
                  </p>
                )}
                <p style={{ color: '#71717a', fontSize: '0.85rem', margin: 0 }}>
                  Tasks: {(cluster.tasks || cluster.task_indices || []).join(', ')}
                </p>
              </div>
            ))}
            
            {clusters.recommendations && (
              <div style={{
                marginTop: '1.5rem',
                padding: '1rem',
                backgroundColor: '#1a2e1a',
                borderRadius: '8px',
                border: '1px solid #22c55e'
              }}>
                <h4 style={{ color: '#22c55e', marginTop: 0, marginBottom: '0.5rem' }}>💡 Recommendations</h4>
                <p style={{ color: '#e5e5e7', fontSize: '0.9rem', margin: 0 }}>{clusters.recommendations}</p>
              </div>
            )}
            
            <button
              onClick={() => setShowClusters(false)}
              style={{
                marginTop: '1.5rem',
                padding: '0.75rem 1.5rem',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                width: '100%',
                fontSize: '1rem'
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default Commitments;

