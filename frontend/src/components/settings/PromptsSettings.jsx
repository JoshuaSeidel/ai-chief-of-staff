import React, { useState, useEffect } from 'react';
import { CalendarPlus, Edit3, RotateCcw, Save } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { CardSkeleton } from '../common/LoadingSkeleton';
import { profilesAPI, promptsAPI } from '../../services/api';
import { useProfile } from '../../contexts/ProfileContext';

const DEFAULT_TASK_INSTRUCTIONS = [
  'Only create commitments and action items when the configured user is explicitly responsible for the work.',
  'Skip tasks assigned to other people, teams, or ambiguous owners.',
  'Create follow-ups when the configured user should check status, unblock, request, or verify work that matters to their role.',
  'Skip duplicates and near-duplicates, even when wording, deadline, or task type differs slightly.',
  'When uncertain, skip the item instead of creating a task.'
].join('\n');

function parsePreferences(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return {};
  }
}

export function PromptsSettings() {
  const toast = useToast();
  const { currentProfile, refreshProfiles } = useProfile();

  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingPrompt, setEditingPrompt] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [taskPreferences, setTaskPreferences] = useState({
    userAliases: '',
    jobTitle: '',
    companyName: '',
    department: '',
    taskExtractionInstructions: DEFAULT_TASK_INSTRUCTIONS,
    taskCalendarAutoCreate: false
  });
  const [rawPreferences, setRawPreferences] = useState({});
  const [savingTaskPreferences, setSavingTaskPreferences] = useState(false);

  useEffect(() => {
    loadPrompts();
    loadTaskPreferences();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProfile?.id]);

  const loadPrompts = async () => {
    setLoading(true);
    try {
      const response = await promptsAPI.getAll();
      setPrompts(response.data || []);
    } catch (err) {
      console.error('Failed to load prompts:', err);
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to load prompts');
      setPrompts([]);
    } finally {
      setLoading(false);
    }
  };

  const loadTaskPreferences = async () => {
    if (!currentProfile?.id) return;

    try {
      const response = await profilesAPI.getById(currentProfile.id);
      const profile = response.data.profile || response.data;
      const preferences = parsePreferences(profile.preferences);
      setRawPreferences(preferences);
      setTaskPreferences({
        userAliases: (preferences.userAliases || []).join(', '),
        jobTitle: preferences.jobTitle || '',
        companyName: preferences.companyName || '',
        department: preferences.department || '',
        taskExtractionInstructions: preferences.taskExtractionInstructions || DEFAULT_TASK_INSTRUCTIONS,
        taskCalendarAutoCreate: preferences.taskCalendarAutoCreate === true
      });
    } catch (err) {
      console.error('Failed to load task learning preferences:', err);
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to load task learning settings');
    }
  };

  const handleEdit = (prompt) => {
    setEditingPrompt(prompt);
    setEditValue(prompt.prompt);
  };

  const handleSave = async () => {
    if (!editingPrompt) return;

    setSaving(true);
    try {
      await promptsAPI.update(editingPrompt.key, editValue);
      toast.success('Prompt updated successfully');
      setEditingPrompt(null);
      loadPrompts();
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Error updating prompt');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async (key) => {
    const confirmed = await toast.confirm('Reset this prompt to default? Your custom changes will be lost.');
    if (!confirmed) return;

    try {
      await promptsAPI.reset(key);
      toast.success('Prompt reset to default');
      loadPrompts();
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Error resetting prompt');
    }
  };

  const handleSaveTaskPreferences = async () => {
    if (!currentProfile?.id) return;

    setSavingTaskPreferences(true);
    try {
      const aliases = taskPreferences.userAliases
        .split(',')
        .map(alias => alias.trim())
        .filter(Boolean);

      const nextPreferences = {
        ...rawPreferences,
        userAliases: aliases,
        jobTitle: taskPreferences.jobTitle.trim(),
        companyName: taskPreferences.companyName.trim(),
        department: taskPreferences.department.trim(),
        taskExtractionInstructions: taskPreferences.taskExtractionInstructions.trim() || DEFAULT_TASK_INSTRUCTIONS,
        taskCalendarAutoCreate: taskPreferences.taskCalendarAutoCreate === true
      };

      await profilesAPI.update(currentProfile.id, { preferences: nextPreferences });
      setRawPreferences(nextPreferences);
      await refreshProfiles?.();
      toast.success('Task learning settings saved');
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Error saving task learning settings');
    } finally {
      setSavingTaskPreferences(false);
    }
  };

  const formatPromptName = (key) => {
    return key
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  if (loading) {
    return (
      <div className="settings-section">
        <CardSkeleton lines={3} />
        <CardSkeleton lines={3} />
        <CardSkeleton lines={3} />
      </div>
    );
  }

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <h3>Task Learning</h3>
        <p className="settings-section-description">
          Tune task ownership, deduplication, and where generated work is sent
        </p>
      </div>

      <div className="prompt-card">
        <div className="prompt-header">
          <div>
            <h4 className="prompt-title">Task Creation Rules</h4>
            <span className="prompt-custom-badge">Profile-specific</span>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSaveTaskPreferences}
            loading={savingTaskPreferences}
            icon={<Save size={15} />}
          >
            Save
          </Button>
        </div>

        <div className="grid-auto-fit-sm mt-md">
          <div className="form-group">
            <label className="form-label">User aliases</label>
            <input
              type="text"
              className="form-input"
              value={taskPreferences.userAliases}
              onChange={(e) => setTaskPreferences({ ...taskPreferences, userAliases: e.target.value })}
              placeholder="Josh, Joshua Seidel, jseidel@edgeconnex.com"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Job title</label>
            <input
              type="text"
              className="form-input"
              value={taskPreferences.jobTitle}
              onChange={(e) => setTaskPreferences({ ...taskPreferences, jobTitle: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Company</label>
            <input
              type="text"
              className="form-input"
              value={taskPreferences.companyName}
              onChange={(e) => setTaskPreferences({ ...taskPreferences, companyName: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Department</label>
            <input
              type="text"
              className="form-input"
              value={taskPreferences.department}
              onChange={(e) => setTaskPreferences({ ...taskPreferences, department: e.target.value })}
            />
          </div>
        </div>

        <label className="notification-toggle-item mt-md">
          <div className="notification-toggle-info">
            <span className="notification-toggle-label"><CalendarPlus size={16} /> Auto-create calendar events</span>
            <span className="notification-toggle-desc">Generated tasks stay out of your calendar unless this is enabled</span>
          </div>
          <input
            type="checkbox"
            className="toggle-checkbox"
            checked={taskPreferences.taskCalendarAutoCreate}
            onChange={(e) => setTaskPreferences({ ...taskPreferences, taskCalendarAutoCreate: e.target.checked })}
          />
        </label>

        <div className="form-group mt-md">
          <label className="form-label">Editable task extraction instructions</label>
          <textarea
            value={taskPreferences.taskExtractionInstructions}
            onChange={(e) => setTaskPreferences({ ...taskPreferences, taskExtractionInstructions: e.target.value })}
            className="form-textarea"
            rows={8}
          />
        </div>
      </div>

      <div className="settings-section-header mt-lg">
        <h3>AI Prompts</h3>
        <p className="settings-section-description">
          Customize the prompts used by the AI to generate briefs and analyze tasks
        </p>
      </div>

      <div className="prompts-list">
        {prompts.map(prompt => (
          <div key={prompt.key} className="prompt-card">
            <div className="prompt-header">
              <div>
                <h4 className="prompt-title">{formatPromptName(prompt.key)}</h4>
                {prompt.is_custom && (
                  <span className="prompt-custom-badge">Customized</span>
                )}
              </div>
              <div className="prompt-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEdit(prompt)}
                  icon={<Edit3 size={15} />}
                >
                  Edit
                </Button>
                {prompt.is_custom && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleReset(prompt.key)}
                    icon={<RotateCcw size={15} />}
                  >
                    Reset
                  </Button>
                )}
              </div>
            </div>
            <p className="prompt-preview">
              {prompt.prompt.substring(0, 200)}
              {prompt.prompt.length > 200 && '...'}
            </p>
          </div>
        ))}
      </div>

      {prompts.length === 0 && (
        <div className="empty-state">
          <p className="text-muted">No prompts available</p>
        </div>
      )}

      {/* Edit Modal */}
      <Modal
        isOpen={!!editingPrompt}
        onClose={() => setEditingPrompt(null)}
        title={`Edit: ${editingPrompt ? formatPromptName(editingPrompt.key) : ''}`}
        size="lg"
        footer={
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setEditingPrompt(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave} loading={saving}>
              Save Changes
            </Button>
          </div>
        }
      >
        <div className="form-group">
          <label className="form-label">Prompt Text</label>
          <textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="form-textarea"
            rows={15}
            style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}
          />
          <span className="form-hint">
            Use {'{'}variable{'}'} syntax for dynamic values. Available variables depend on the prompt type.
          </span>
        </div>
      </Modal>
    </div>
  );
}

export default PromptsSettings;
