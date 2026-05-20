import React, { createContext, useContext, useState, useCallback } from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle, Info, X, XCircle } from 'lucide-react';

const ToastContext = createContext(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random();
    const toast = { id, message, type, duration };

    setToasts(prev => [...prev, toast]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }

    return id;
  }, [removeToast]);

  const success = useCallback((message, duration) => {
    return addToast(message, 'success', duration);
  }, [addToast]);

  const error = useCallback((message, duration = 6000) => {
    return addToast(message, 'error', duration);
  }, [addToast]);

  const warning = useCallback((message, duration = 5000) => {
    return addToast(message, 'warning', duration);
  }, [addToast]);

  const info = useCallback((message, duration) => {
    return addToast(message, 'info', duration);
  }, [addToast]);

  // Confirmation dialog replacement
  const confirm = useCallback((message) => {
    return new Promise((resolve) => {
      const id = Date.now() + Math.random();
      const toast = {
        id,
        message,
        type: 'confirm',
        duration: 0,
        onConfirm: () => {
          removeToast(id);
          resolve(true);
        },
        onCancel: () => {
          removeToast(id);
          resolve(false);
        }
      };
      setToasts(prev => [...prev, toast]);
    });
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, success, error, warning, info, confirm }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ toasts, removeToast }) {
  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}

function Toast({ toast, onClose }) {
  const icons = {
    success: CheckCircle2,
    error: XCircle,
    warning: AlertTriangle,
    info: Info,
    confirm: HelpCircle
  };
  const Icon = icons[toast.type] || Info;

  if (toast.type === 'confirm') {
    return (
      <div className={`toast toast-confirm`}>
        <div className="toast-icon"><Icon size={16} /></div>
        <div className="toast-content">
          <p className="toast-message">{toast.message}</p>
          <div className="toast-actions">
            <button className="toast-btn toast-btn-cancel" onClick={toast.onCancel}>
              Cancel
            </button>
            <button className="toast-btn toast-btn-confirm" onClick={toast.onConfirm}>
              Confirm
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`toast toast-${toast.type}`}>
      <div className="toast-icon"><Icon size={16} /></div>
      <p className="toast-message">{toast.message}</p>
      <button className="toast-close" onClick={onClose} aria-label="Close notification"><X size={15} /></button>
    </div>
  );
}

export default ToastContext;
