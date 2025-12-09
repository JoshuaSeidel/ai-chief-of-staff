import React, { useEffect, useCallback, useRef } from 'react';
import { Button } from './Button';

// Focusable element selectors for focus trap
const FOCUSABLE_SELECTORS = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  closeOnOverlay = true,
  closeOnEscape = true,
  showCloseButton = true,
  className = '',
  ariaDescribedBy
}) {
  const modalRef = useRef(null);
  const previousActiveElement = useRef(null);

  // Handle escape key
  const handleEscape = useCallback((e) => {
    if (e.key === 'Escape' && closeOnEscape) {
      onClose?.();
    }
  }, [closeOnEscape, onClose]);

  // Focus trap - keep focus within modal
  const handleTabKey = useCallback((e) => {
    if (e.key !== 'Tab' || !modalRef.current) return;

    const focusableElements = modalRef.current.querySelectorAll(FOCUSABLE_SELECTORS);
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // Shift + Tab
    if (e.shiftKey) {
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      }
    } else {
      // Tab
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      // Store current active element to restore focus later
      previousActiveElement.current = document.activeElement;

      // Add event listeners
      document.addEventListener('keydown', handleEscape);
      document.addEventListener('keydown', handleTabKey);
      document.body.style.overflow = 'hidden';

      // Focus the modal or first focusable element
      requestAnimationFrame(() => {
        if (modalRef.current) {
          const focusableElements = modalRef.current.querySelectorAll(FOCUSABLE_SELECTORS);
          if (focusableElements.length > 0) {
            focusableElements[0].focus();
          } else {
            modalRef.current.focus();
          }
        }
      });
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('keydown', handleTabKey);
      document.body.style.overflow = '';

      // Restore focus to previous element
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen, handleEscape, handleTabKey]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'modal-sm',
    md: 'modal-md',
    lg: 'modal-lg',
    xl: 'modal-xl',
    full: 'modal-full'
  };

  return (
    <div
      className="modal-overlay"
      onClick={closeOnOverlay ? onClose : undefined}
      role="presentation"
    >
      <div
        ref={modalRef}
        className={`modal ${sizeClasses[size]} ${className}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        aria-describedby={ariaDescribedBy}
        tabIndex={-1}
      >
        {(title || showCloseButton) && (
          <div className="modal-header">
            {title && <h2 id="modal-title" className="modal-title">{title}</h2>}
            {showCloseButton && (
              <button
                className="modal-close"
                onClick={onClose}
                aria-label="Close modal"
                type="button"
              >
                ×
              </button>
            )}
          </div>
        )}
        <div className="modal-body">
          {children}
        </div>
        {footer && (
          <div className="modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'primary',
  loading = false
}) {
  const handleConfirm = async () => {
    await onConfirm?.();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      ariaDescribedBy="confirm-modal-message"
      footer={
        <div className="modal-actions">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button variant={confirmVariant} size="sm" onClick={handleConfirm} loading={loading}>
            {confirmText}
          </Button>
        </div>
      }
    >
      <p id="confirm-modal-message" className="modal-message">{message}</p>
    </Modal>
  );
}

export default Modal;
