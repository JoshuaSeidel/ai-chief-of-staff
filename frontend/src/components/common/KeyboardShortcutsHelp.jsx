import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';

/**
 * KeyboardShortcutsHelp - A modal component that displays keyboard shortcuts
 * Triggered by pressing "?" key
 */
export function KeyboardShortcutsHelp() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Open help modal when "?" is pressed (Shift + /)
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // Don't trigger if user is typing in an input field
        const target = e.target;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
        e.preventDefault();
        setIsOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const shortcuts = {
    navigation: [
      { keys: ['Tab'], description: 'Navigate between sections and interactive elements' },
      { keys: ['Shift', 'Tab'], description: 'Navigate backwards through sections' },
      { keys: ['Escape'], description: 'Close modals and dialogs' }
    ],
    tasks: [
      { keys: ['Cmd', 'N'], description: 'Create a new task', mac: true },
      { keys: ['Ctrl', 'N'], description: 'Create a new task', windows: true },
      { keys: ['Escape'], description: 'Close task creation modal' }
    ],
    general: [
      { keys: ['?'], description: 'Show keyboard shortcuts (this dialog)' },
      { keys: ['Escape'], description: 'Close modals and cancel actions' }
    ]
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      title="Keyboard Shortcuts"
      size="lg"
      className="keyboard-shortcuts-modal"
    >
      <div className="keyboard-shortcuts-content">
        <p className="keyboard-shortcuts-intro">
          Use these keyboard shortcuts to navigate and interact with the AI Chief of Staff more efficiently.
        </p>

        {/* Navigation Shortcuts */}
        <section className="shortcuts-section">
          <h3 className="shortcuts-section-title">Navigation</h3>
          <div className="shortcuts-list">
            {shortcuts.navigation.map((shortcut, index) => (
              <div key={index} className="shortcut-item">
                <div className="shortcut-keys">
                  {shortcut.keys.map((key, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && <span className="shortcut-separator">+</span>}
                      <kbd className="keycap">{key}</kbd>
                    </React.Fragment>
                  ))}
                </div>
                <div className="shortcut-description">{shortcut.description}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Task Management Shortcuts */}
        <section className="shortcuts-section">
          <h3 className="shortcuts-section-title">Task Management</h3>
          <div className="shortcuts-list">
            {shortcuts.tasks
              .filter(shortcut => {
                // Show Mac shortcuts on Mac, Windows shortcuts on Windows/Linux
                const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
                if (shortcut.mac) return isMac;
                if (shortcut.windows) return !isMac;
                return true;
              })
              .map((shortcut, index) => (
                <div key={index} className="shortcut-item">
                  <div className="shortcut-keys">
                    {shortcut.keys.map((key, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && <span className="shortcut-separator">+</span>}
                        <kbd className="keycap">{key}</kbd>
                      </React.Fragment>
                    ))}
                  </div>
                  <div className="shortcut-description">{shortcut.description}</div>
                </div>
              ))}
          </div>
        </section>

        {/* General Shortcuts */}
        <section className="shortcuts-section">
          <h3 className="shortcuts-section-title">General</h3>
          <div className="shortcuts-list">
            {shortcuts.general.map((shortcut, index) => (
              <div key={index} className="shortcut-item">
                <div className="shortcut-keys">
                  {shortcut.keys.map((key, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && <span className="shortcut-separator">+</span>}
                      <kbd className="keycap">{key}</kbd>
                    </React.Fragment>
                  ))}
                </div>
                <div className="shortcut-description">{shortcut.description}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="keyboard-shortcuts-footer">
          <p className="keyboard-shortcuts-tip">
            <strong>Tip:</strong> Press <kbd className="keycap keycap-inline">?</kbd> anytime to view these shortcuts.
          </p>
        </div>
      </div>
    </Modal>
  );
}

export default KeyboardShortcutsHelp;
