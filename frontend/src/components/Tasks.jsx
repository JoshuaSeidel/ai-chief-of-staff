import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Bot,
  CalendarPlus,
  CheckCircle2,
  ClipboardList,
  EyeOff,
  Plus,
  RefreshCw,
  SquareCheckBig,
  Target,
  Trash2,
  Undo2,
  X,
  Zap
} from 'lucide-react';
import { calendarAPI, commitmentsAPI, intelligenceAPI, plannerAPI } from '../services/api';
import { PullToRefresh } from './PullToRefresh';
import CompletionModal from './CompletionModal';
import { useToast } from '../contexts/ToastContext';
import { TaskTypeBadge, ClusterBadge, NoTasksEmpty } from './common';
import { Modal, ConfirmModal } from './common/Modal';
import { Button } from './common/Button';
import { QuickAddBar } from './common/QuickAddBar';
import { TaskListSkeleton } from './common/LoadingSkeleton';
import { formatRelativeTime, DeadlineTime } from './common/RelativeTime';

const CONFIRMATION_PREFS_KEY = 'aicos.taskConfirmationPreferences';

const readConfirmationPreferences = () => {
  if (typeof window === 'undefined') return {};

  try {
    return JSON.parse(window.localStorage.getItem(CONFIRMATION_PREFS_KEY) || '{}') || {};
  } catch (error) {
    return {};
  }
};

function Commitments() {
  const [commitments, setCommitments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncingMicrosoft, setSyncingMicrosoft] = useState(false);
  const [microsoftConnected, setMicrosoftConnected] = useState(false);
  const [microsoftSyncTarget, setMicrosoftSyncTarget] = useState('Microsoft');
  const [syncingJira, setSyncingJira] = useState(false);
  const [jiraConnected, setJiraConnected] = useState(false);
  const [hasFailedSyncs, setHasFailedSyncs] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [addingToCalendarId, setAddingToCalendarId] = useState(null);
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
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [syncConfirm, setSyncConfirm] = useState(null);
  const [ignoreConfirm, setIgnoreConfirm] = useState(null);
  const [ignoringTaskId, setIgnoringTaskId] = useState(null);
  const [confirmationPreferences, setConfirmationPreferences] = useState(readConfirmationPreferences);

  const toast = useToast();

  useEffect(() => {
    loadCommitments();
    checkCalendarStatus();
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
        setBulkDeleteConfirm(null);
        setSyncConfirm(null);
        setIgnoreConfirm(null);
        if (selectionMode) {
          clearSelection();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectionMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const existingIds = new Set(commitments.map(task => task.id));
    setSelectedTaskIds(previous => previous.filter(id => existingIds.has(id)));
  }, [commitments]);

  const checkMicrosoftPlannerStatus = async () => {
    try {
      const response = await plannerAPI.getMicrosoftStatus();
      setMicrosoftConnected(Boolean(response.data.connected && response.data.sync_enabled));
      setMicrosoftSyncTarget(response.data.target_type === 'planner' ? 'Microsoft Planner' : 'Microsoft To Do');
    } catch (err) {
      console.error('Failed to check Microsoft Planner status:', err);
      setMicrosoftConnected(false);
    }
  };

  const checkCalendarStatus = async () => {
    try {
      const [googleResponse, microsoftResponse] = await Promise.allSettled([
        calendarAPI.getGoogleStatus(),
        calendarAPI.getMicrosoftStatus()
      ]);
      const googleConnected = googleResponse.status === 'fulfilled' && googleResponse.value.data.connected;
      const microsoftConnectedValue = microsoftResponse.status === 'fulfilled' && microsoftResponse.value.data.connected;
      setCalendarConnected(Boolean(googleConnected || microsoftConnectedValue));
    } catch (err) {
      console.error('Failed to check calendar status:', err);
      setCalendarConnected(false);
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

  const isConfirmationSuppressed = (type) => confirmationPreferences[type] === true;

  const suppressConfirmationType = (type) => {
    setConfirmationPreferences(previous => {
      const next = { ...previous, [type]: true };
      window.localStorage.setItem(CONFIRMATION_PREFS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleSyncToMicrosoft = async () => {
    if (!microsoftConnected) {
      toast.warning('Enable Microsoft task sync in Settings first');
      return;
    }
    if (isConfirmationSuppressed('syncMicrosoft')) {
      executeMicrosoftSync();
      return;
    }
    setSyncConfirm({
      type: 'microsoft',
      confirmationType: 'syncMicrosoft',
      dontAskAgain: false,
      message: `This will create ${microsoftSyncTarget} tasks for all pending tasks that don't already have one. Continue?`
    });
  };

  const executeMicrosoftSync = async () => {
    setSyncConfirm(null);
    setSyncingMicrosoft(true);
    try {
      const response = await plannerAPI.syncMicrosoft();
      const data = response.data;

      if (data.success) {
        toast.success(`Synced ${data.synced} tasks to ${microsoftSyncTarget}${data.failed > 0 ? `. ${data.failed} failed.` : ''}`);
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
    if (isConfirmationSuppressed('syncJira')) {
      executeJiraSync();
      return;
    }
    setSyncConfirm({
      type: 'jira',
      confirmationType: 'syncJira',
      dontAskAgain: false,
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
    if (isConfirmationSuppressed('syncJiraFailed')) {
      executeFailedJiraSync();
      return;
    }
    setSyncConfirm({
      type: 'jira-failed',
      confirmationType: 'syncJiraFailed',
      dontAskAgain: false,
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
      if (err.response?.status === 409) {
        toast.warning(err.response?.data?.message || 'A similar task already exists');
      } else {
        toast.error(`Error creating task: ${err.response?.data?.message || err.message}`);
      }
    } finally {
      setCreating(false);
    }
  };

  const addTaskToCalendar = async (task) => {
    if (!calendarConnected) {
      toast.warning('Connect Google or Microsoft Calendar in Settings first');
      return;
    }

    if (!task.deadline) {
      toast.warning('Add a deadline before placing this task on the calendar');
      return;
    }

    setAddingToCalendarId(task.id);
    try {
      await commitmentsAPI.addToCalendar(task.id);
      await loadCommitments();
      toast.success('Task added to calendar');
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to add task to calendar');
    } finally {
      setAddingToCalendarId(null);
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
    if (isConfirmationSuppressed('deleteTask')) {
      executeDeleteById(id);
      return;
    }
    setDeleteConfirm({ id, description, dontAskAgain: false });
  };

  const ignoreTask = async (id, description) => {
    if (isConfirmationSuppressed('ignoreSimilar')) {
      executeIgnoreById(id);
      return;
    }
    setIgnoreConfirm({ id, description, dontAskAgain: false });
  };

  const toggleTaskSelection = (id) => {
    setSelectedTaskIds(previous => (
      previous.includes(id)
        ? previous.filter(selectedId => selectedId !== id)
        : [...previous, id]
    ));
  };

  const clearSelection = () => {
    setSelectedTaskIds([]);
    setSelectionMode(false);
  };

  const toggleSelectVisible = () => {
    const visibleIds = filteredCommitments.map(task => task.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedTaskIds.includes(id));

    if (allVisibleSelected) {
      setSelectedTaskIds(previous => previous.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedTaskIds(previous => Array.from(new Set([...previous, ...visibleIds])));
    }
  };

  const requestBulkDelete = () => {
    if (selectedTaskIds.length === 0) return;
    if (isConfirmationSuppressed('bulkDelete')) {
      executeBulkDelete();
      return;
    }
    setBulkDeleteConfirm({ dontAskAgain: false });
  };

  const executeBulkDelete = async () => {
    if (selectedTaskIds.length === 0) return;

    if (bulkDeleteConfirm?.dontAskAgain) {
      suppressConfirmationType('bulkDelete');
    }

    setBulkDeleting(true);
    try {
      const response = await commitmentsAPI.bulkDelete(selectedTaskIds);
      const data = response.data || {};
      const externalSummary = data.externalSummary || {};
      const removedFrom = [];

      if (externalSummary.calendar?.success) removedFrom.push(`${externalSummary.calendar.success} calendar`);
      if (externalSummary.jira?.success) removedFrom.push(`${externalSummary.jira.success} Jira`);
      if (externalSummary.microsoft?.success) removedFrom.push(`${externalSummary.microsoft.success} Microsoft`);

      const suffix = removedFrom.length > 0 ? ` (also removed from ${removedFrom.join(', ')})` : '';
      toast.success(`Deleted ${data.deleted || selectedTaskIds.length} tasks${suffix}`);
      setBulkDeleteConfirm(null);
      clearSelection();
      await loadCommitments();
    } catch (err) {
      toast.error('Failed to delete selected tasks: ' + (err.response?.data?.message || err.response?.data?.error || err.message));
    } finally {
      setBulkDeleting(false);
    }
  };

  const executeDeleteById = async (id) => {
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

  const executeDelete = async () => {
    if (!deleteConfirm) return;

    const { id, dontAskAgain } = deleteConfirm;
    if (dontAskAgain) {
      suppressConfirmationType('deleteTask');
    }
    setDeleteConfirm(null);
    await executeDeleteById(id);
  };

  const executeIgnoreById = async (id) => {
    setIgnoringTaskId(id);
    try {
      const response = await commitmentsAPI.ignore(id);

      let message = response.data?.message || 'Task ignored';
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
      toast.error('Failed to ignore task: ' + (err.response?.data?.message || err.message));
    } finally {
      setIgnoringTaskId(null);
    }
  };

  const executeIgnore = async () => {
    if (!ignoreConfirm) return;

    const { id, dontAskAgain } = ignoreConfirm;
    if (dontAskAgain) {
      suppressConfirmationType('ignoreSimilar');
    }
    setIgnoreConfirm(null);
    await executeIgnoreById(id);
  };

  const isOverdue = (commitment) => {
    if (!commitment.deadline || commitment.status === 'completed') return false;
    return new Date(commitment.deadline) < new Date();
  };

  const applyStatusFilter = (items, statusFilter = filter) => {
    if (statusFilter === 'overdue') {
      return items.filter(c => isOverdue(c));
    }
    if (statusFilter === 'pending') {
      return items.filter(c => c.status === 'pending' && !isOverdue(c));
    }
    if (statusFilter === 'completed') {
      return items.filter(c => c.status === 'completed');
    }
    return items;
  };

  const applyTypeFilter = (items, selectedType = typeFilter) => {
    if (selectedType === 'all') return items;
    return items.filter(c => (c.task_type || 'commitment') === selectedType);
  };

  const groupByStatus = (items) => {
    const overdue = items.filter(c => isOverdue(c));
    const pending = items.filter(c => c.status === 'pending' && !isOverdue(c));
    const completed = items.filter(c => c.status === 'completed');
    return { overdue, pending, completed };
  };

  const groupByConfirmation = (items) => {
    const needsConfirmation = items.filter(c => c.needs_confirmation === 1 || c.needs_confirmation === true);
    const confirmed = items.filter(c => !c.needs_confirmation || c.needs_confirmation === 0 || c.needs_confirmation === false);

    return { needsConfirmation, confirmed };
  };

  const groupByType = (items) => {
    return {
      commitments: items.filter(c => (c.task_type || 'commitment') === 'commitment'),
      actions: items.filter(c => c.task_type === 'action'),
      followUps: items.filter(c => c.task_type === 'follow-up'),
      risks: items.filter(c => c.task_type === 'risk')
    };
  };

  const statusFilteredCommitments = applyStatusFilter(commitments);
  const typeFilteredCommitments = applyTypeFilter(commitments);
  const filteredCommitments = applyTypeFilter(statusFilteredCommitments);
  const grouped = groupByStatus(typeFilteredCommitments);
  const displayedGrouped = groupByStatus(filteredCommitments);
  const byType = groupByType(statusFilteredCommitments);
  const visibleIds = filteredCommitments.map(task => task.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedTaskIds.includes(id));

  const typeLabels = {
    'all': 'All Types',
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
              {selectionMode && (
                <label
                  className="task-select-control"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={selectedTaskIds.includes(commitment.id)}
                    onChange={() => toggleTaskSelection(commitment.id)}
                    aria-label={`Select task: ${commitment.description}`}
                  />
                </label>
              )}
              <TaskTypeBadge type={commitment.task_type} />
              {commitment.cluster_group && <ClusterBadge name={commitment.cluster_group} />}
            </div>
            <p className={`task-description ${variant === 'completed' ? 'line-through' : ''}`} style={{ fontSize: '1rem', marginBottom: '0.5rem', wordWrap: 'break-word' }}>
              {commitment.description}
            </p>
            <div className="task-metadata-wrap text-muted" style={{ fontSize: '0.875rem' }}>
              {commitment.assignee && <span>{commitment.assignee} • </span>}
              {variant === 'completed' ? (
                <span>Completed: {formatRelativeTime(commitment.completed_date)}</span>
              ) : (
                <DeadlineTime date={commitment.deadline} />
              )}
              {commitment.calendar_event_id && <span> • On calendar</span>}
            </div>
            {commitment.system_notes && (
              <details className="task-system-notes" style={{ marginTop: '0.5rem', fontSize: '0.82rem', color: '#a1a1aa' }}>
                <summary>AI update notes</summary>
                <pre style={{ whiteSpace: 'pre-wrap', margin: '0.5rem 0 0', fontFamily: 'inherit' }}>{commitment.system_notes}</pre>
              </details>
            )}
          </div>
          <div className="flex gap-sm flex-wrap" style={{ marginTop: '0.5rem' }}>
            {variant !== 'completed' && commitment.deadline && !commitment.calendar_event_id && (commitment.task_type || 'commitment') !== 'risk' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => addTaskToCalendar(commitment)}
                disabled={addingToCalendarId === commitment.id}
                loading={addingToCalendarId === commitment.id}
                icon={<CalendarPlus size={15} />}
              >
                Add to Calendar
              </Button>
            )}
            {variant === 'completed' ? (
              <Button variant="secondary" size="sm" onClick={() => updateStatus(commitment.id, 'pending')} icon={<Undo2 size={15} />}>
                Reopen
              </Button>
            ) : (
              <Button variant="success" size="sm" onClick={() => updateStatus(commitment.id, 'completed')} icon={<CheckCircle2 size={15} />}>
                Complete
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => deleteTask(commitment.id, commitment.description)} icon={<Trash2 size={15} />}>
              Delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => ignoreTask(commitment.id, commitment.description)}
              disabled={ignoringTaskId === commitment.id}
              loading={ignoringTaskId === commitment.id}
              icon={<EyeOff size={15} />}
            >
              Ignore Similar
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
                <Button variant="success" onClick={() => setShowCreateModal(true)} icon={<Plus size={16} />} title="Create a new task (Cmd+N)">
                  Create Task
                </Button>
                <Button
                  onClick={handleSmartGroup}
                  disabled={clusteringTasks || loading || filteredCommitments.filter(c => c.status !== 'completed').length < 2}
                  loading={clusteringTasks}
                  icon={<Bot size={16} />}
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
                    icon={<ClipboardList size={16} />}
                    style={{ backgroundColor: '#0078d4' }}
                    title={`Sync tasks to ${microsoftSyncTarget}`}
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
                      icon={<Target size={16} />}
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
                        icon={<RefreshCw size={16} />}
                        title="Retry syncing failed/pending tasks to Jira"
                      >
                        Retry Failed
                      </Button>
                    )}
                  </>
                )}
                <Button variant="secondary" onClick={loadCommitments} disabled={loading} icon={<RefreshCw size={16} />}>
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
                <div className="stat-caption">Overdue</div>
              </div>
              <div className="stat-box-bordered">
                <div className="stat-number-warning">{grouped.pending.length}</div>
                <div className="stat-caption">Pending</div>
              </div>
              <div className="stat-box-bordered">
                <div className="stat-number-success">{grouped.completed.length}</div>
                <div className="stat-caption">Completed</div>
              </div>
            </div>

            {/* Task Type Stats */}
            <div className="grid-auto-fit-sm">
              <div className="stat-box-bordered text-center">
                <div className="stat-large-icon"><ClipboardList size={20} /></div>
                <div className="stat-title">{byType.commitments.length}</div>
                <div className="text-xs text-muted">Commitments</div>
              </div>
              <div className="stat-box-bordered text-center">
                <div className="stat-large-icon"><Zap size={20} /></div>
                <div className="stat-title">{byType.actions.length}</div>
                <div className="text-xs text-muted">Actions</div>
              </div>
              <div className="stat-box-bordered text-center">
                <div className="stat-large-icon"><RefreshCw size={20} /></div>
                <div className="stat-title">{byType.followUps.length}</div>
                <div className="text-xs text-muted">Follow-ups</div>
              </div>
              <div className="stat-box-bordered text-center">
                <div className="stat-large-icon"><AlertTriangle size={20} /></div>
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
              <div className="task-filter-toolbar">
                <div className="flex gap-sm flex-wrap">
                  {['all', 'commitment', 'action', 'follow-up', 'risk'].map(type => (
                    <button
                      key={type}
                      onClick={() => setTypeFilter(type)}
                      className={typeFilter === type ? 'btn-filter' : 'secondary btn-filter'}
                    >
                      {typeLabels[type]}
                    </button>
                  ))}
                </div>
                <div className="task-select-actions">
                  <Button
                    variant={selectionMode ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => {
                      if (selectionMode) {
                        clearSelection();
                      } else {
                        setSelectionMode(true);
                      }
                    }}
                    icon={selectionMode ? <X size={16} /> : <SquareCheckBig size={16} />}
                  >
                    {selectionMode ? 'Cancel Select' : 'Select'}
                  </Button>
                  {selectionMode && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={toggleSelectVisible}
                        disabled={filteredCommitments.length === 0}
                        icon={<SquareCheckBig size={16} />}
                      >
                        {allVisibleSelected ? 'Clear Visible' : 'Select Visible'}
                      </Button>
                      <Button
                        variant="error"
                        size="sm"
                        onClick={requestBulkDelete}
                        disabled={selectedTaskIds.length === 0}
                        icon={<Trash2 size={16} />}
                      >
                        Delete Selected ({selectedTaskIds.length})
                      </Button>
                    </>
                  )}
                </div>
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
            const confirmationGroup = groupByConfirmation(filteredCommitments);
            return confirmationGroup.needsConfirmation.length > 0 && (
              <div className="card card-warning-border">
                <h3 className="heading-warning-mb-md">Tasks Needing Confirmation</h3>
                <p className="text-sm-muted-mb-md">
                  These tasks have unclear assignees. Confirm if they&apos;re yours, or reject to remove them.
                </p>
                {confirmationGroup.needsConfirmation.map(commitment => (
                  <div key={commitment.id} className="task-card" style={{ backgroundColor: '#2a1f0a', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', border: '1px solid #f59e0b40' }}>
                    <div className="flex gap-sm items-center mb-sm flex-wrap">
                      {selectionMode && (
                        <label
                          className="task-select-control"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={selectedTaskIds.includes(commitment.id)}
                            onChange={() => toggleTaskSelection(commitment.id)}
                            aria-label={`Select task: ${commitment.description}`}
                          />
                        </label>
                      )}
                      <TaskTypeBadge type={commitment.task_type} />
                      {commitment.cluster_group && <ClusterBadge name={commitment.cluster_group} />}
                    </div>
                    <p className="task-description">{commitment.description}</p>
                    <div className="task-metadata">
                      <div>Assignee: <strong>{commitment.assignee || 'Unknown'}</strong></div>
                      {commitment.deadline && <DeadlineTime date={commitment.deadline} />}
                    </div>
                    <div className="flex gap-sm mt-md flex-wrap">
                      <Button variant="success" size="sm" onClick={() => confirmTask(commitment.id, true)} icon={<CheckCircle2 size={15} />}>Confirm</Button>
                      <Button variant="error" size="sm" onClick={() => confirmTask(commitment.id, false)} icon={<Trash2 size={15} />}>Reject</Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteTask(commitment.id, commitment.description)} icon={<Trash2 size={15} />}>Delete</Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => ignoreTask(commitment.id, commitment.description)}
                        disabled={ignoringTaskId === commitment.id}
                        loading={ignoringTaskId === commitment.id}
                        icon={<EyeOff size={15} />}
                      >
                        Ignore Similar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Overdue Tasks */}
          {displayedGrouped.overdue.length > 0 && (filter === 'all' || filter === 'overdue') && (
            <div className="card">
              <h3 className="heading-error-mb-md">Overdue Tasks</h3>
              {displayedGrouped.overdue.map(commitment => (
                <TaskCard key={commitment.id} commitment={commitment} variant="overdue" />
              ))}
            </div>
          )}

          {/* Pending Tasks */}
          {displayedGrouped.pending.length > 0 && (filter === 'all' || filter === 'pending') && (
            <div className="card">
              <h3 className="text-warning-mb">Pending Tasks</h3>
              {displayedGrouped.pending.map(commitment => (
                <TaskCard key={commitment.id} commitment={commitment} variant="pending" />
              ))}
            </div>
          )}

          {/* Completed Tasks */}
          {displayedGrouped.completed.length > 0 && (filter === 'all' || filter === 'completed') && (
            <div className="card">
              <h3 style={{ color: '#34c759', marginBottom: '1rem' }}>Completed Tasks</h3>
              {displayedGrouped.completed.map(commitment => (
                <TaskCard key={commitment.id} commitment={commitment} variant="completed" />
              ))}
            </div>
          )}

          {commitments.length > 0 && filteredCommitments.length === 0 && !loading && (
            <div className="card task-empty-filter-state">
              No tasks match the current filters.
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
            <option value="commitment">Commitment</option>
            <option value="action">Action Item</option>
            <option value="follow-up">Follow-up</option>
            <option value="risk">Risk</option>
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
        title="AI-Grouped Tasks"
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
            <h4 style={{ color: '#22c55e', marginTop: 0, marginBottom: '0.5rem' }}>Recommendations</h4>
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
        suppressLabel="Don't ask again for task deletes"
        suppressChecked={deleteConfirm?.dontAskAgain || false}
        onSuppressChange={(checked) => setDeleteConfirm(previous => previous ? { ...previous, dontAskAgain: checked } : previous)}
      />

      {/* Bulk Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!bulkDeleteConfirm}
        onClose={() => !bulkDeleting && setBulkDeleteConfirm(null)}
        onConfirm={executeBulkDelete}
        title="Delete Selected Tasks"
        message={`Delete ${selectedTaskIds.length} selected task${selectedTaskIds.length === 1 ? '' : 's'}?\n\nThis will also remove synced items from connected calendar, Jira, and Microsoft services when possible.`}
        confirmText="Delete Selected"
        confirmVariant="error"
        loading={bulkDeleting}
        suppressLabel="Don't ask again for bulk deletes"
        suppressChecked={bulkDeleteConfirm?.dontAskAgain || false}
        onSuppressChange={(checked) => setBulkDeleteConfirm(previous => previous ? { ...previous, dontAskAgain: checked } : previous)}
      />

      {/* Ignore Similar Confirmation Modal */}
      <ConfirmModal
        isOpen={!!ignoreConfirm}
        onClose={() => setIgnoreConfirm(null)}
        onConfirm={executeIgnore}
        title="Ignore Similar Tasks"
        message={ignoreConfirm ? `Ignore this task and suppress similar future tasks or emails?\n\n"${ignoreConfirm.description}"\n\nThis will remove the current task and teach extraction to skip similar items.` : ''}
        confirmText="Ignore Similar"
        confirmVariant="warning"
        loading={ignoringTaskId === ignoreConfirm?.id}
        suppressLabel="Don't ask again for ignore similar"
        suppressChecked={ignoreConfirm?.dontAskAgain || false}
        onSuppressChange={(checked) => setIgnoreConfirm(previous => previous ? { ...previous, dontAskAgain: checked } : previous)}
      />

      {/* Sync Confirmation Modal */}
      <ConfirmModal
        isOpen={!!syncConfirm}
        onClose={() => setSyncConfirm(null)}
        onConfirm={() => {
          if (syncConfirm?.dontAskAgain && syncConfirm?.confirmationType) {
            suppressConfirmationType(syncConfirm.confirmationType);
          }
          if (syncConfirm?.type === 'microsoft') executeMicrosoftSync();
          else if (syncConfirm?.type === 'jira') executeJiraSync();
          else if (syncConfirm?.type === 'jira-failed') executeFailedJiraSync();
        }}
        title="Sync Tasks"
        message={syncConfirm?.message || ''}
        confirmText="Sync"
        suppressLabel="Don't ask again for this sync"
        suppressChecked={syncConfirm?.dontAskAgain || false}
        onSuppressChange={(checked) => setSyncConfirm(previous => previous ? { ...previous, dontAskAgain: checked } : previous)}
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
