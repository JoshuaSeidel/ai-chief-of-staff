import React, { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { CardSkeleton } from '../common/LoadingSkeleton';

export function PromptsSettings() {
  const toast = useToast();

  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingPrompt, setEditingPrompt] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPrompts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPrompts = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/prompts');
      if (response.ok) {
        const data = await response.json();
        setPrompts(data);
      }
    } catch (err) {
      console.error('Failed to load prompts:', err);
      toast.error('Failed to load prompts');
    } finally {
      setLoading(false);
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
      const response = await fetch(`/api/prompts/${editingPrompt.key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: editValue })
      });

      if (response.ok) {
        toast.success('Prompt updated successfully');
        setEditingPrompt(null);
        loadPrompts();
      } else {
        toast.error('Failed to update prompt');
      }
    } catch (err) {
      toast.error('Error updating prompt');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async (key) => {
    const confirmed = await toast.confirm('Reset this prompt to default? Your custom changes will be lost.');
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/prompts/${key}/reset`, {
        method: 'POST'
      });

      if (response.ok) {
        toast.success('Prompt reset to default');
        loadPrompts();
      } else {
        toast.error('Failed to reset prompt');
      }
    } catch (err) {
      toast.error('Error resetting prompt');
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
                  icon="✏️"
                >
                  Edit
                </Button>
                {prompt.is_custom && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleReset(prompt.key)}
                    icon="↺"
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
