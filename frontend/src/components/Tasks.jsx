import React, { useState, useEffect } from 'react';
import { commitmentsAPI, intelligenceAPI, plannerAPI } from '../services/api';
import { PullToRefresh } from './PullToRefresh';
import CompletionModal from './CompletionModal';
import { useToast } from '../contexts/ToastContext';
import { TaskTypeBadge, ClusterBadge, NoTasksEmpty } from './common';
import { Modal, ConfirmModal } from './common/Modal';
import { Button } from './common/Button';
import { QuickAddBar } from './common/QuickAddBar';
import { TaskListSkeleton } from './common/LoadingSkeleton';
import { formatRelativeTime, DeadlineTime } from './common/RelativeTime';

function Commitments() {
  const [commitments, setCommitments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncingMicrosoft, setSyncingMicrosoft] = useState(false);
  const [microsoftConnected, setMicrosoftConnected] = useState(false);
  const [syncingJira, setSyncingJira] = useState(false);
  const [jiraConnected, setJiraConnected] = useState(false);
  const [hasFailedSyncs, setHasFailedSyncs] = useState(false);
  const [filter, setFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
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
  const [completingTask, setCompletingTask] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [syncConfirm, setSyncConfirm] = useState(null);

  const toast = useToast();

  useEffect(() => {
    loadCommitments();
    checkMicrosoftPlannerStatus();
    checkJiraStatus();
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Cmd/Ctrl + N to create task
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        setShowCreateModal(true);
      }
      // Escape to close modals
      if (e.key === 'Escape') {
        setShowCreateModal(false);
        setShowClusters(false);
        setDeleteConfirm(null);
        setSyncConfirm(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const checkMicrosoftPlannerStatus = async () => {
    try {
      const response = await plannerAPI.getMicrosoftStatus();
      setMicrosoftConnected(response.data.connected);
    } catch (err) {
      console.error('Failed to check Microsoft Planner status:', err);
      setMicrosoftConnected(false);
    }
  };

  const checkJiraStatus = async () => {
    try {
      const response = await plannerAPI.getJiraStatus();
      setJiraConnected(response.data.connected);
    } catch (err) {
      console.error('Failed to check Jira status:', err);
      setJiraConnected(false);
    }
  };

  const handleSyncToMicrosoft = async () => {
    if (!microsoftConnected) {
      toast.warning('Please connect Microsoft Planner in Settings first');
      return;
    }
    setSyncConfirm({
      type: 'microsoft',
      message: 'This will create Microsoft To Do tasks for all pending tasks that don\'t already have one. Continue?'
    });
  };

  const executeMicrosoftSync = async () => {
    setSyncConfirm(null);
    setSyncingMicrosoft(true);
    try {
      const response = await plannerAPI.syncMicrosoft();
      const data = response.data;

      if (data.success) {
        toast.success(`Synced ${data.synced} tasks to Microsoft Planner${data.failed > 0 ? `. ${data.failed} failed.` : ''}`);
        loadCommitments();
      } else {
        toast.error(`Sync failed: ${data.message || 'Unknown error'}`);
      }
    } catch (err) {
      toast.error(`Error syncing: ${err.message}`);
    } finally {
      setSyncingMicrosoft(false);
    }
  };

  const handleSyncToJira = async () => {
    if (!jiraConnected) {
      toast.warning('Please connect Jira in Settings first');
      return;
    }
    setSyncConfirm({
      type: 'jira',
      message: 'This will create Jira issues for all pending tasks that don\'t already have one. Continue?'
    });
  };

  const executeJiraSync = async () => {
    setSyncConfirm(null);
    setSyncingJira(true);
    try {
      const response = await plannerAPI.syncJira();
      const data = response.data;

      if (data.success) {
        toast.success(`Synced ${data.synced} tasks to Jira${data.failed > 0 ? `. ${data.failed} failed.` : ''}`);
        await loadCommitments();
        if (data.failed === 0) {
          setHasFailedSyncs(false);
        }
      } else {
        toast.error(`Sync failed: ${data.message || 'Unknown error'}`);
      }
    } catch (err) {
      toast.error(`Error syncing: ${err.message}`);
    } finally {
      setSyncingJira(false);
    }
  };

  const handleSyncFailedToJira = async () => {
    if (!jiraConnected) {
      toast.warning('Please connect Jira in Settings first');
      return;
    }
    setSyncConfirm({
      type: 'jira-failed',
      message: 'This will retry syncing all failed/pending tasks to Jira. Continue?'
    });
  };

  const executeFailedJiraSync = async () => {
    setSyncConfirm(null);
    setSyncingJira(true);
    try {
      const response = await plannerAPI.syncJiraFailed();
      const data = response.data;

      if (data.success) {
        toast.success(`Synced ${data.synced} tasks to Jira${data.failed > 0 ? `. ${data.failed} failed.` : ''}`);
        if (data.errors && data.errors.length > 0) {
          console.error('Sync errors:', data.errors);
        }
        await loadCommitments();
        if (data.failed === 0) {
          setHasFailedSyncs(false);
        }
      } else {
        toast.error(`Sync failed: ${data.message || 'Unknown error'}`);
      }
    } catch (err) {
      toast.error(`Error syncing: ${err.message}`);
    } finally {
      setSyncingJira(false);
    }
  };

  const handleCreateTask = async () => {
    if (!newTask.description.trim()) {
      toast.warning('Please enter a description');
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
        toast.success('Task created successfully!');
      } else {
        toast.error(`Failed to create task: ${response.data.message || 'Unknown error'}`);
      }
    } catch (err) {
      toast.error(`Error creating task: ${err.response?.data?.message || err.message}`);
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
      toast.error('Failed to load tasks');
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
      toast.warning('Need at least 2 pending tasks to group');
      return;
    }

    setClusteringTasks(true);
    try {
      const tasks = pendingTasks.map((c, i) => ({
        id: i + 1,
        description: c.description,
        deadline: c.deadline,
        commitment_id: c.id
      }));

      const response = await intelligenceAPI.clusterTasks(tasks);
      if (response.data && response.data.clusters) {
        setClusters(response.data);

        let updatedCount = 0;
        for (const cluster of response.data.clusters) {
          for (const taskIndex of cluster.task_indices) {
            const task = tasks[taskIndex - 1];
            if (task && task.commitment_id) {
              try {
                await commitmentsAPI.update(task.commitment_id, {
                  cluster_group: cluster.name
                });
                updatedCount++;
              } catch (updateErr) {
                console.error(`Failed to update cluster for task ${task.commitment_id}:`, updateErr);
              }
            }
          }
        }

        await loadCommitments();
        setShowClusters(true);
        toast.success(`Grouped ${updatedCount} tasks into ${response.data.clusters.length} clusters!`);
      } else {
        toast.info('No clusters identified - tasks are too different to group');
      }
    } catch (err) {
      console.error('Clustering failed:', err);
      toast.error('Smart grouping unavailable: ' + err.message);
    } finally {
      setClusteringTasks(false);
    }
  };

  const updateStatus = async (id, newStatus) => {
    if (newStatus === 'completed') {
      const task = commitments.find(c => c.id === id);
      if (task) {
        setCompletingTask(task);
        return;
      }
    }

    try {
      await commitmentsAPI.update(id, { status: newStatus });
      loadCommitments();
      toast.success(newStatus === 'pending' ? 'Task reopened' : 'Task status updated');
    } catch (err) {
      toast.error('Failed to update task status');
    }
  };

  const handleCompleteTask = async (completionNote) => {
    if (!completingTask) return;

    try {
      await commitmentsAPI.update(completingTask.id, {
        status: 'completed',
        completion_note: completionNote || null
      });
      setCompletingTask(null);
      loadCommitments();
      toast.success('Task completed!');
    } catch (err) {
      toast.error('Failed to complete task');
      throw err;
    }
  };

  const confirmTask = async (id, confirmed) => {
    try {
      await commitmentsAPI.confirm(id, confirmed);
      loadCommitments();
      toast.success(confirmed ? 'Task confirmed' : 'Task rejected');
    } catch (err) {
      toast.error('Failed to confirm/reject task');
    }
  };

  const deleteTask = async (id, description) => {
    setDeleteConfirm({ id, description });
  };

  const executeDelete = async () => {
    if (!deleteConfirm) return;

    const { id } = deleteConfirm;
    setDeleteConfirm(null);

    try {
      const response = await commitmentsAPI.delete(id);

      let message = 'Task deleted';
      if (response.data?.deletionResults) {
        const results = response.data.deletionResults;
        const extras = [];
        if (results.calendar === 'success') extras.push('calendar');
        if (results.jira === 'success') extras.push('Jira');
        if (results.microsoft === 'success') extras.push('Microsoft');
        if (extras.length > 0) {
          message += ` (also removed from ${extras.join(', ')})`;
        }
      }

      toast.success(message);
      loadCommitments();
    } catch (err) {
      toast.error('Failed to delete task: ' + (err.response?.data?.message || err.message));
    }
  };

  const isOverdue = (commitment) => {
    if (!commitment.deadline || commitment.status === 'completed') return false;
    return new Date(commitment.deadline) < new Date();
  };

  const groupByStatus = () => {
    const overdue = commitments.filter(c => isOverdue(c));
    const pending = commitments.filter(c => c.status === 'pending' && !isOverdue(c));
    const completed = commitments.filter(c => c.status === 'completed');
    return { overdue, pending, completed };
  };

  const groupByConfirmation = () => {
    let filtered = commitments;
    if (filter === 'overdue') {
      filtered = commitments.filter(c => isOverdue(c));
    } else if (filter === 'pending') {
      filtered = commitments.filter(c => c.status === 'pending' && !isOverdue(c));
    } else if (filter === 'completed') {
      filtered = commitments.filter(c => c.status === 'completed');
    }

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

  const getFilteredCommitments = () => {
    let filtered = commitments;

    if (filter === 'overdue') {
      filtered = filtered.filter(c => isOverdue(c));
    } else if (filter === 'pending') {
      filtered = filtered.filter(c => c.status === 'pending' && !isOverdue(c));
    } else if (filter === 'completed') {
      filtered = filtered.filter(c => c.status === 'completed');
    }

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

  // Task Card Component
  const TaskCard = ({ commitment, variant = 'default' }) => {
    const cardStyles = {
      overdue: { backgroundColor: '#3f1a1a', border: '2px solid #ff3b30' },
      pending: { backgroundColor: '#18181b', border: '1px solid #3f3f46' },
      completed: { backgroundColor: '#18181b', border: '1px solid #3f3f46', opacity: 0.7 },
      confirmation: { backgroundColor: '#2a1f0a', border: '1px solid #f59e0b40' }
    };

    const style = cardStyles[variant] || cardStyles.pending;

    return (
      <div className="task-card" style={{ ...style, padding: '1rem', borderRadius: '8px', marginBottom: '0.75rem' }}>
        <div className="task-card-layout task-layout">
          <div className="task-card-content task-content-flex">
            <div className="flex gap-sm items-center mb-sm flex-wrap">
              <TaskTypeBadge type={commitment.task_type} />
              {commitment.cluster_group && <ClusterBadge name={commitment.cluster_group} />}
            </div>
            <p className={`task-description ${variant === 'completed' ? 'line-through' : ''}`} style={{ fontSize: '1rem', marginBottom: '0.5rem', wordWrap: 'break-word' }}>
              {commitment.description}
            </p>
            <div className="task-metadata-wrap text-muted" style={{ fontSize: '0.875rem' }}>
              {commitment.assignee && <span>👤 {commitment.assignee} • </span>}
              {variant === 'completed' ? (
                <span>✓ Completed: {formatRelativeTime(commitment.completed_date)}</span>
              ) : (
                <DeadlineTime date={commitment.deadline} />
              )}
            </div>
          </div>
          <div className="flex gap-sm flex-wrap" style={{ marginTop: '0.5rem' }}>
            {variant === 'completed' ? (
              <Button variant="secondary" size="sm" onClick={() => updateStatus(commitment.id, 'pending')} icon="↩️">
                Reopen
              </Button>
            ) : (
              <Button variant="success" size="sm" onClick={() => updateStatus(commitment.id, 'completed')} icon="✅">
                Complete
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => deleteTask(commitment.id, commitment.description)} icon="🗑️">
              Delete
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <PullToRefresh onRefresh={handleRefresh}>
        <div className="commitments">
          <div className="card">
            <div className="flex-between mb-lg flex-wrap gap-lg">
              <h2 className="mt-0 mb-0">Task Management</h2>
              <div className="flex gap-sm flex-wrap">
                <Button variant="success" onClick={() => setShowCreateModal(true)} icon="➕" title="Create a new task (Cmd+N)">
                  Create Task
                </Button>
                <Button
                  onClick={handleSmartGroup}
                  disabled={clusteringTasks || loading || filteredCommitments.filter(c => c.status !== 'completed').length < 2}
                  loading={clusteringTasks}
                  icon="🤖"
                  style={{ backgroundColor: '#8b5cf6' }}
                  title="AI-powered task grouping"
                >
                  {clusteringTasks ? 'Analyzing...' : 'Group Tasks'}
                </Button>
                {microsoftConnected && (
                  <Button
                    onClick={handleSyncToMicrosoft}
                    disabled={syncingMicrosoft || loading}
                    loading={syncingMicrosoft}
                    icon="📋"
                    style={{ backgroundColor: '#0078d4' }}
                    title="Sync tasks to Microsoft Planner"
                  >
                    {syncingMicrosoft ? 'Syncing...' : 'Sync to Microsoft'}
                  </Button>
                )}
                {jiraConnected && (
                  <>
                    <Button
                      onClick={handleSyncToJira}
                      disabled={syncingJira || loading}
                      loading={syncingJira}
                      icon="🎯"
                      style={{ backgroundColor: '#0052CC' }}
                      title="Sync tasks to Jira"
                    >
                      {syncingJira ? 'Syncing...' : 'Sync to Jira'}
                    </Button>
                    {hasFailedSyncs && (
                      <Button
                        onClick={handleSyncFailedToJira}
                        disabled={syncingJira || loading}
                        variant="warning"
                        icon="🔄"
                        title="Retry syncing failed/pending tasks to Jira"
                      >
                        Retry Failed
                      </Button>
                    )}
                  </>
                )}
                <Button variant="secondary" onClick={loadCommitments} disabled={loading} icon="🔄">
                  {loading ? 'Loading...' : 'Refresh'}
                </Button>
              </div>
            </div>

            {/* Quick Add Bar */}
            <QuickAddBar
              onTaskCreated={() => loadCommitments()}
              placeholder="Quick add: 'Follow up with John about budget by Friday'"
            />

            {error && <div className="message-error">{error}</div>}

            {/* Stats */}
            <div className="grid-auto-fit">
              <div className="stat-box-bordered">
                <div className="stat-number-error">{grouped.overdue.length}</div>
                <div className="stat-caption">⚠️ Overdue</div>
              </div>
              <div className="stat-box-bordered">
                <div className="stat-number-warning">{grouped.pending.length}</div>
                <div className="stat-caption">⏳ Pending</div>
              </div>
              <div className="stat-box-bordered">
                <div className="stat-number-success">{grouped.completed.length}</div>
                <div className="stat-caption">✅ Completed</div>
              </div>
            </div>

            {/* Task Type Stats */}
            <div className="grid-auto-fit-sm">
              <div className="stat-box-bordered text-center">
                <div className="stat-large-icon">📋</div>
                <div className="stat-title">{byType.commitments.length}</div>
                <div className="text-xs text-muted">Commitments</div>
              </div>
              <div className="stat-box-bordered text-center">
                <div className="stat-large-icon">⚡</div>
                <div className="stat-title">{byType.actions.length}</div>
                <div className="text-xs text-muted">Actions</div>
              </div>
              <div className="stat-box-bordered text-center">
                <div className="stat-large-icon">🔄</div>
                <div className="stat-title">{byType.followUps.length}</div>
                <div className="text-xs text-muted">Follow-ups</div>
              </div>
              <div className="stat-box-bordered text-center">
                <div className="stat-large-icon">⚠️</div>
                <div className="stat-title">{byType.risks.length}</div>
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

          {/* Loading State */}
          {loading && commitments.length === 0 && (
            <div className="card">
              <TaskListSkeleton count={3} />
            </div>
          )}

          {/* Confirmation Section */}
          {(() => {
            const confirmationGroup = groupByConfirmation();
            return confirmationGroup.needsConfirmation.length > 0 && (
              <div className="card card-warning-border">
                <h3 className="heading-warning-mb-md">🔔 Tasks Needing Confirmation</h3>
                <p className="text-sm-muted-mb-md">
                  These tasks have unclear assignees. Confirm if they&apos;re yours, or reject to remove them.
                </p>
                {confirmationGroup.needsConfirmation.map(commitment => (
                  <div key={commitment.id} className="task-card" style={{ backgroundColor: '#2a1f0a', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', border: '1px solid #f59e0b40' }}>
                    <div className="flex gap-sm items-center mb-sm flex-wrap">
                      <TaskTypeBadge type={commitment.task_type} />
                      {commitment.cluster_group && <ClusterBadge name={commitment.cluster_group} />}
                    </div>
                    <p className="task-description">{commitment.description}</p>
                    <div className="task-metadata">
                      <div>👤 Assignee: <strong>{commitment.assignee || 'Unknown'}</strong></div>
                      {commitment.deadline && <DeadlineTime date={commitment.deadline} />}
                    </div>
                    <div className="flex gap-sm mt-md flex-wrap">
                      <Button variant="success" size="sm" onClick={() => confirmTask(commitment.id, true)} icon="✅">Confirm</Button>
                      <Button variant="error" size="sm" onClick={() => confirmTask(commitment.id, false)} icon="❌">Reject</Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteTask(commitment.id, commitment.description)} icon="🗑️">Delete</Button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Overdue Commitments */}
          {grouped.overdue.length > 0 && (filter === 'all' || filter === 'overdue') && (
            <div className="card">
              <h3 className="heading-error-mb-md">⚠️ Overdue Commitments</h3>
              {grouped.overdue.map(commitment => (
                <TaskCard key={commitment.id} commitment={commitment} variant="overdue" />
              ))}
            </div>
          )}

          {/* Pending Commitments */}
          {grouped.pending.length > 0 && (filter === 'all' || filter === 'pending') && (
            <div className="card">
              <h3 className="text-warning-mb">⏳ Pending Commitments</h3>
              {grouped.pending.map(commitment => (
                <TaskCard key={commitment.id} commitment={commitment} variant="pending" />
              ))}
            </div>
          )}

          {/* Completed Commitments */}
          {grouped.completed.length > 0 && (filter === 'all' || filter === 'completed') && (
            <div className="card">
              <h3 style={{ color: '#34c759', marginBottom: '1rem' }}>✅ Completed Commitments</h3>
              {grouped.completed.map(commitment => (
                <TaskCard key={commitment.id} commitment={commitment} variant="completed" />
              ))}
            </div>
          )}

          {/* Empty State */}
          {commitments.length === 0 && !loading && (
            <div className="card">
              <NoTasksEmpty onCreateTask={() => setShowCreateModal(true)} />
            </div>
          )}
        </div>
      </PullToRefresh>

      {/* Create Task Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => !creating && setShowCreateModal(false)}
        title="Create New Task"
        size="md"
        footer={
          <div className="modal-actions">
            <Button
              variant="secondary"
              onClick={() => {
                setShowCreateModal(false);
                setNewTask({ description: '', task_type: 'commitment', assignee: '', deadline: '', priority: 'medium' });
              }}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              variant="success"
              onClick={handleCreateTask}
              disabled={creating || !newTask.description.trim()}
              loading={creating}
            >
              Create Task
            </Button>
          </div>
        }
      >
        <div className="mb-md">
          <label className="form-label">Task Type *</label>
          <select
            value={newTask.task_type}
            onChange={(e) => setNewTask({ ...newTask, task_type: e.target.value })}
            className="form-select"
            disabled={creating}
          >
            <option value="commitment">📋 Commitment</option>
            <option value="action">⚡ Action Item</option>
            <option value="follow-up">🔄 Follow-up</option>
            <option value="risk">⚠️ Risk</option>
          </select>
        </div>

        <div className="mb-md">
          <label className="form-label">Description *</label>
          <textarea
            value={newTask.description}
            onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
            placeholder="Enter task description..."
            rows={4}
            className="form-textarea"
            disabled={creating}
          />
        </div>

        <div className="mb-md">
          <label className="form-label">Assignee (optional)</label>
          <input
            type="text"
            value={newTask.assignee}
            onChange={(e) => setNewTask({ ...newTask, assignee: e.target.value })}
            placeholder="Enter assignee name"
            className="form-input"
            disabled={creating}
          />
        </div>

        <div className="mb-md">
          <label className="form-label">Deadline (optional)</label>
          <input
            type="datetime-local"
            value={newTask.deadline}
            onChange={(e) => setNewTask({ ...newTask, deadline: e.target.value })}
            className="form-input"
            disabled={creating}
          />
        </div>

        <div className="mb-md">
          <label className="form-label">Priority</label>
          <select
            value={newTask.priority}
            onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
            className="form-select"
            disabled={creating}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="highest">Highest</option>
          </select>
        </div>
      </Modal>

      {/* Smart Groups Modal */}
      <Modal
        isOpen={showClusters && clusters}
        onClose={() => setShowClusters(false)}
        title="🤖 AI-Grouped Tasks"
        size="lg"
      >
        {clusters?.clusters?.map((cluster, idx) => (
          <div key={idx} className="cluster-card mb-md" style={{ padding: '1rem', backgroundColor: '#09090b', borderRadius: '8px', border: '1px solid #3f3f46' }}>
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

        {clusters?.recommendations && (
          <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#1a2e1a', borderRadius: '8px', border: '1px solid #22c55e' }}>
            <h4 style={{ color: '#22c55e', marginTop: 0, marginBottom: '0.5rem' }}>💡 Recommendations</h4>
            <p style={{ color: '#e5e5e7', fontSize: '0.9rem', margin: 0 }}>{clusters.recommendations}</p>
          </div>
        )}

        <Button fullWidth onClick={() => setShowClusters(false)} className="mt-lg">
          Close
        </Button>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={executeDelete}
        title="Delete Task"
        message={deleteConfirm ? `Are you sure you want to delete this task?\n\n"${deleteConfirm.description}"\n\nThis will also remove it from connected services if synced.` : ''}
        confirmText="Delete"
        confirmVariant="error"
      />

      {/* Sync Confirmation Modal */}
      <ConfirmModal
        isOpen={!!syncConfirm}
        onClose={() => setSyncConfirm(null)}
        onConfirm={() => {
          if (syncConfirm?.type === 'microsoft') executeMicrosoftSync();
          else if (syncConfirm?.type === 'jira') executeJiraSync();
          else if (syncConfirm?.type === 'jira-failed') executeFailedJiraSync();
        }}
        title="Sync Tasks"
        message={syncConfirm?.message || ''}
        confirmText="Sync"
      />

      {/* Completion Modal */}
      {completingTask && (
        <CompletionModal
          task={completingTask}
          onComplete={handleCompleteTask}
          onCancel={() => setCompletingTask(null)}
        />
      )}
    </>
  );
}

export default Commitments;
