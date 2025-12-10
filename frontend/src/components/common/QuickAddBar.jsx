import React, { useState, useRef, useEffect } from 'react';
import { intelligenceAPI, commitmentsAPI } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';

// Format date in a human-friendly way
function formatDeadline(isoDate) {
  if (!isoDate) return null;

  const date = new Date(isoDate);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  // Check if it's today
  if (date.toDateString() === now.toDateString()) {
    return `Today at ${timeStr}`;
  }

  // Check if it's tomorrow
  if (date.toDateString() === tomorrow.toDateString()) {
    return `Tomorrow at ${timeStr}`;
  }

  // Check if it's within 7 days
  const daysAway = Math.ceil((date - now) / (1000 * 60 * 60 * 24));
  if (daysAway > 0 && daysAway <= 7) {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    return `${dayName} at ${timeStr}`;
  }

  // Otherwise show full date
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

export function QuickAddBar({ onTaskCreated, placeholder = "Try: 'Call John tomorrow at 3pm' or 'Report due end of week'" }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [parsedTask, setParsedTask] = useState(null);
  const [parseError, setParseError] = useState(null);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const toast = useToast();

  // Parse input with debounce
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (input.trim().length < 5) {
      setParsedTask(null);
      setShowPreview(false);
      setParseError(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        setParseError(null);
        const response = await intelligenceAPI.parseTask(input);
        if (response.data) {
          setParsedTask(response.data);
          setShowPreview(true);
        }
      } catch (err) {
        console.error('Parse error:', err);
        setParseError('Could not parse task');
        setParsedTask(null);
      }
    }, 500);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [input]);

  const handleSubmit = async (e) => {
    e?.preventDefault();

    if (!input.trim()) return;

    setLoading(true);
    try {
      let taskData;

      if (parsedTask) {
        // Use parsed data
        taskData = {
          description: parsedTask.description || input.trim(),
          task_type: parsedTask.task_type || 'commitment',
          assignee: parsedTask.assignee || null,
          deadline: parsedTask.deadline || null,
          priority: parsedTask.priority || 'medium'
        };
      } else {
        // Fallback to raw input
        taskData = {
          description: input.trim(),
          task_type: 'commitment',
          priority: 'medium'
        };
      }

      const response = await commitmentsAPI.create(taskData);

      if (response.data.success) {
        toast.success('Task created successfully!');
        setInput('');
        setParsedTask(null);
        setShowPreview(false);
        onTaskCreated?.(response.data.commitment);
      } else {
        toast.error(response.data.message || 'Failed to create task');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      setInput('');
      setParsedTask(null);
      setShowPreview(false);
      inputRef.current?.blur();
    }
  };

  const [showDateHints, setShowDateHints] = useState(false);

  return (
    <div className="quick-add-container">
      <form onSubmit={handleSubmit} className="quick-add-form">
        <div className="quick-add-input-wrapper">
          <span className="quick-add-icon">⚡</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowDateHints(true)}
            onBlur={() => setTimeout(() => setShowDateHints(false), 200)}
            placeholder={placeholder}
            className="quick-add-input"
            disabled={loading}
          />
          {input && (
            <button
              type="button"
              className="quick-add-clear"
              onClick={() => {
                setInput('');
                setParsedTask(null);
                setShowPreview(false);
              }}
            >
              ×
            </button>
          )}
          <button
            type="submit"
            className="quick-add-submit"
            disabled={!input.trim() || loading}
          >
            {loading ? '...' : '→'}
          </button>
        </div>
      </form>

      {showDateHints && !input && (
        <div className="quick-add-hints">
          <div className="hints-header">Supported date formats:</div>
          <div className="hints-grid">
            <span className="hint-item">today, tomorrow</span>
            <span className="hint-item">next Tuesday</span>
            <span className="hint-item">in 3 days</span>
            <span className="hint-item">end of week</span>
            <span className="hint-item">3pm, 3:30pm</span>
            <span className="hint-item">tomorrow morning</span>
            <span className="hint-item">Friday afternoon</span>
            <span className="hint-item">end of month</span>
          </div>
        </div>
      )}

      {showPreview && parsedTask && (
        <div className="quick-add-preview">
          <div className="quick-add-preview-header">
            <span className="preview-label">Preview</span>
            {parseError && <span className="preview-error">{parseError}</span>}
          </div>
          <div className="quick-add-preview-content">
            <div className="preview-row">
              <span className="preview-key">Task:</span>
              <span className="preview-value">{parsedTask.description || input}</span>
            </div>
            {parsedTask.task_type && (
              <div className="preview-row">
                <span className="preview-key">Type:</span>
                <span className={`preview-badge preview-badge-${parsedTask.task_type}`}>
                  {parsedTask.task_type}
                </span>
              </div>
            )}
            {parsedTask.assignee && (
              <div className="preview-row">
                <span className="preview-key">Assignee:</span>
                <span className="preview-value">👤 {parsedTask.assignee}</span>
              </div>
            )}
            {parsedTask.deadline && (
              <div className="preview-row">
                <span className="preview-key">Deadline:</span>
                <span className="preview-value">📅 {formatDeadline(parsedTask.deadline)}</span>
              </div>
            )}
            {parsedTask.priority && (
              <div className="preview-row">
                <span className="preview-key">Priority:</span>
                <span className={`preview-badge preview-priority-${parsedTask.priority}`}>
                  {parsedTask.priority}
                </span>
              </div>
            )}
          </div>
          <div className="quick-add-preview-hint">
            Press <kbd>Enter</kbd> to create or <kbd>Esc</kbd> to cancel
          </div>
        </div>
      )}
    </div>
  );
}

export default QuickAddBar;
