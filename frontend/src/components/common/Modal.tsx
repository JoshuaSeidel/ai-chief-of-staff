import React, { useEffect, useCallback, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button.tsx';
import type { ButtonVariant } from './Button.tsx';

// =============================================================================
// Types
// =============================================================================

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

interface ModalProps {
  /** Whether the modal is visible */
  isOpen: boolean;
  /** Callback when modal should close */
  onClose?: () => void;
  /** Modal title displayed in header */
  title?: string;
  /** Modal content */
  children: ReactNode;
  /** Footer content (typically buttons) */
  footer?: ReactNode;
  /** Size of the modal */
  size?: ModalSize;
  /** Close when clicking overlay backdrop */
  closeOnOverlay?: boolean;
  /** Close when pressing Escape key */
  closeOnEscape?: boolean;
  /** Show the X close button in header */
  showCloseButton?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** ID for aria-describedby */
  ariaDescribedBy?: string;
}

interface ConfirmModalProps {
  /** Whether the modal is visible */
  isOpen: boolean;
  /** Callback when modal should close */
  onClose: () => void;
  /** Callback when user confirms action */
  onConfirm?: () => void | Promise<void>;
  /** Modal title */
  title?: string;
  /** Confirmation message */
  message: ReactNode;
  /** Text for confirm button */
  confirmText?: string;
  /** Text for cancel button */
  cancelText?: string;
  /** Variant for confirm button */
  confirmVariant?: ButtonVariant;
  /** Whether confirm action is in progress */
  loading?: boolean;
  /** Optional checkbox label for suppressing this confirmation type */
  suppressLabel?: string;
  /** Whether the suppress checkbox is checked */
  suppressChecked?: boolean;
  /** Callback when suppress checkbox changes */
  onSuppressChange?: (checked: boolean) => void;
}

// =============================================================================
// Constants
// =============================================================================

// Focusable element selectors for focus trap
const FOCUSABLE_SELECTORS = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'modal-sm',
  md: 'modal-md',
  lg: 'modal-lg',
  xl: 'modal-xl',
  full: 'modal-full'
};

function focusWithoutScrolling(element: HTMLElement | null | undefined) {
  if (!element || typeof element.focus !== 'function') return;

  try {
    element.focus({ preventScroll: true });
  } catch (error) {
    element.focus();
  }
}

// =============================================================================
// Components
// =============================================================================

/**
 * Modal dialog with focus trap and keyboard navigation.
 *
 * @example
 * <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Settings">
 *   <p>Modal content here</p>
 * </Modal>
 */
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
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const previousScrollPosition = useRef({ x: 0, y: 0 });

  // Handle escape key
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && closeOnEscape) {
      onClose?.();
    }
  }, [closeOnEscape, onClose]);

  // Focus trap - keep focus within modal
  const handleTabKey = useCallback((e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !modalRef.current) return;

    const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS);
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
    if (!isOpen) return undefined;

    // Store current active element to restore focus later
    previousActiveElement.current = document.activeElement as HTMLElement;
    previousScrollPosition.current = {
      x: window.scrollX,
      y: window.scrollY
    };

    // Add event listeners
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('keydown', handleTabKey);
    document.body.style.overflow = 'hidden';

    // Focus the modal or first focusable element
    requestAnimationFrame(() => {
      if (modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS);
        if (focusableElements.length > 0) {
          focusWithoutScrolling(focusableElements[0]);
        } else {
          focusWithoutScrolling(modalRef.current);
        }
      }
    });

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('keydown', handleTabKey);
      document.body.style.overflow = '';

      // Restore focus to previous element
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        focusWithoutScrolling(previousActiveElement.current);
      }
      window.scrollTo(previousScrollPosition.current.x, previousScrollPosition.current.y);
    };
  }, [isOpen, handleEscape, handleTabKey]);

  if (!isOpen || typeof document === 'undefined') return null;

  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;

  const modalNode = (
    <div
      className="modal-overlay"
      onClick={closeOnOverlay ? onClose : undefined}
      role="presentation"
    >
      <div
        ref={modalRef}
        className={`modal ${sizeClass} ${className}`}
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

  return createPortal(modalNode, document.body);
}

/**
 * Specialized modal for confirmation dialogs.
 *
 * @example
 * <ConfirmModal
 *   isOpen={showConfirm}
 *   onClose={() => setShowConfirm(false)}
 *   onConfirm={handleDelete}
 *   title="Delete Task"
 *   message="Are you sure you want to delete this task?"
 *   confirmText="Delete"
 *   confirmVariant="error"
 * />
 */
export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'primary',
  loading = false,
  suppressLabel,
  suppressChecked = false,
  onSuppressChange
}: ConfirmModalProps) {
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
      {suppressLabel && (
        <label className="modal-checkbox-row">
          <input
            type="checkbox"
            checked={suppressChecked}
            onChange={(event) => onSuppressChange?.(event.target.checked)}
            disabled={loading}
          />
          <span>{suppressLabel}</span>
        </label>
      )}
    </Modal>
  );
}

export default Modal;
