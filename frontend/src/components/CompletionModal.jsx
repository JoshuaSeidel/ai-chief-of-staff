import React, { useState, useEffect, useRef } from 'react';

/**
 * Modal for capturing completion notes when marking tasks complete
 * Syncs to Jira/Microsoft Planner as closing comments
 */
function CompletionModal({ task, onComplete, onCancel }) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    // Focus textarea when modal opens
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      await onComplete(note);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    // Submit on Cmd/Ctrl+Enter
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      handleSubmit(e);
    }
    // Cancel on Escape
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">✅ Complete Task</h3>
          <button 
            className="modal-close-btn" 
            onClick={onCancel}
            disabled={submitting}
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-task-description">
            {task.description}
          </p>

          <form onSubmit={handleSubmit}>
            <label htmlFor="completion-note" className="form-label">
              Completion Note (Optional)
            </label>
            <p className="form-help-text">
              Add a note about how this task was completed. This will be synced to Jira/Microsoft Planner as a closing comment.
            </p>
            
            <textarea
              id="completion-note"
              ref={textareaRef}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe what was done, any blockers resolved, or next steps..."
              className="form-textarea"
              rows={4}
              disabled={submitting}
            />

            <div className="modal-footer">
              <button
                type="button"
                onClick={onCancel}
                className="btn-secondary"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-success"
                disabled={submitting}
              >
                {submitting ? 'Completing...' : 'Mark Complete'}
              </button>
            </div>
          </form>

          <p className="text-xs color-muted mt-sm">
            💡 Tip: Press {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+Enter to submit
          </p>
        </div>
      </div>
    </div>
  );
}

export default CompletionModal;
