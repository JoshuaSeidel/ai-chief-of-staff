import React, { useState, useRef, useEffect } from 'react';
import { intelligenceAPI, commitmentsAPI } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';

export function QuickAddBar({ onTaskCreated, placeholder = "Quick add: 'Follow up with John about budget by Friday'" }) {
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
                <span className="preview-value">📅 {new Date(parsedTask.deadline).toLocaleDateString()}</span>
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
