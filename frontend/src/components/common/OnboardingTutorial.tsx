import React, { useState, useEffect, useCallback, type ReactNode } from 'react';
import { Button } from './Button.tsx';

// =============================================================================
// Types
// =============================================================================

interface TutorialStep {
  /** Unique step identifier */
  id: string;
  /** Step title */
  title: string;
  /** Step description */
  description: string | ReactNode;
  /** Target element selector to highlight (optional) */
  target?: string;
  /** Position of tooltip relative to target */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Icon or illustration for the step */
  icon?: string;
}

interface OnboardingTutorialProps {
  /** Whether tutorial should show */
  isOpen: boolean;
  /** Callback when tutorial completes or is skipped */
  onComplete: () => void;
  /** Optional callback when step changes */
  onStepChange?: (stepIndex: number) => void;
}

// =============================================================================
// Tutorial Steps Data
// =============================================================================

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to AI Chief of Staff',
    description: 'Your intelligent executive assistant for tracking tasks, commitments, and meeting insights. Let\'s take a quick tour to get you started.',
    icon: '👋'
  },
  {
    id: 'dashboard',
    title: 'Dashboard Overview',
    description: 'The Dashboard gives you a complete view of your day at a glance. See your upcoming meetings, pending tasks, and AI-generated insights all in one place.',
    target: '[data-tab="dashboard"]',
    position: 'bottom',
    icon: '📊'
  },
  {
    id: 'transcripts',
    title: 'Meeting Transcripts',
    description: 'Upload meeting transcripts or record audio directly. AI will automatically extract action items, commitments, and key decisions.',
    target: '[data-tab="transcripts"]',
    position: 'bottom',
    icon: '📝'
  },
  {
    id: 'tasks',
    title: 'Task Management',
    description: 'View and manage all your commitments in one place. Tasks extracted from meetings appear here for confirmation. Sync with Microsoft Planner, Jira, Trello, and more.',
    target: '[data-tab="tasks"]',
    position: 'bottom',
    icon: '📋'
  },
  {
    id: 'calendar',
    title: 'Calendar Integration',
    description: 'Connect your Google or Microsoft calendar to see upcoming events and automatically schedule tasks based on your availability.',
    target: '[data-tab="calendar"]',
    position: 'bottom',
    icon: '📅'
  },
  {
    id: 'intelligence',
    title: 'AI Tools',
    description: 'Powerful AI tools to help you work smarter: estimate effort, classify energy levels, cluster related tasks, and parse natural language commands.',
    target: '[data-tab="intelligence"]',
    position: 'bottom',
    icon: '🤖'
  },
  {
    id: 'settings',
    title: 'Settings & Integrations',
    description: 'Configure your AI provider, connect external services, customize prompts, and manage your profile preferences.',
    target: '[data-tab="config"]',
    position: 'bottom',
    icon: '⚙️'
  },
  {
    id: 'keyboard',
    title: 'Keyboard Shortcuts',
    description: 'Press "?" at any time to see available keyboard shortcuts. Use Tab to navigate between sections and Escape to close modals.',
    icon: '⌨️'
  },
  {
    id: 'complete',
    title: 'You\'re All Set!',
    description: 'You now know the basics. Start by uploading a meeting transcript or creating a quick task. We\'re here to help you stay on top of your commitments.',
    icon: '🎉'
  }
];

const STORAGE_KEY = 'aicos_onboarding_complete';

// =============================================================================
// Hook for onboarding state
// =============================================================================

export function useOnboarding() {
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    // Show tutorial for first-time users after a brief delay
    if (!hasCompletedOnboarding) {
      const timer = setTimeout(() => {
        setShowTutorial(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [hasCompletedOnboarding]);

  const completeTutorial = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // Ignore localStorage errors
    }
    setHasCompletedOnboarding(true);
    setShowTutorial(false);
  }, []);

  const restartTutorial = useCallback(() => {
    setShowTutorial(true);
  }, []);

  return {
    showTutorial,
    hasCompletedOnboarding,
    completeTutorial,
    restartTutorial,
    setShowTutorial
  };
}

// =============================================================================
// Components
// =============================================================================

/**
 * Progress indicator dots for tutorial steps
 */
function StepIndicator({
  totalSteps,
  currentStep
}: {
  totalSteps: number;
  currentStep: number;
}) {
  return (
    <div className="onboarding-steps" aria-label={`Step ${currentStep + 1} of ${totalSteps}`}>
      {Array.from({ length: totalSteps }, (_, i) => (
        <span
          key={i}
          className={`onboarding-step-dot ${i === currentStep ? 'active' : ''} ${i < currentStep ? 'completed' : ''}`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

/**
 * Onboarding tutorial modal with step-by-step walkthrough.
 *
 * @example
 * function App() {
 *   const { showTutorial, completeTutorial } = useOnboarding();
 *   return (
 *     <>
 *       <OnboardingTutorial isOpen={showTutorial} onComplete={completeTutorial} />
 *       {...rest of app}
 *     </>
 *   );
 * }
 */
export function OnboardingTutorial({
  isOpen,
  onComplete,
  onStepChange
}: OnboardingTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const step = TUTORIAL_STEPS[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === TUTORIAL_STEPS.length - 1;

  // Reset step when reopening
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
    }
  }, [isOpen]);

  // Notify parent of step changes
  useEffect(() => {
    onStepChange?.(currentStep);
  }, [currentStep, onStepChange]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
        case 'Enter':
          if (!isLastStep) {
            setCurrentStep(prev => prev + 1);
          } else {
            onComplete();
          }
          break;
        case 'ArrowLeft':
          if (!isFirstStep) {
            setCurrentStep(prev => prev - 1);
          }
          break;
        case 'Escape':
          onComplete();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isFirstStep, isLastStep, onComplete]);

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirstStep) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  if (!isOpen) return null;

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="onboarding-modal">
        <div className="onboarding-content">
          {step.icon && (
            <div className="onboarding-icon" aria-hidden="true">
              {step.icon}
            </div>
          )}

          <h2 id="onboarding-title" className="onboarding-title">
            {step.title}
          </h2>

          <div className="onboarding-description">
            {typeof step.description === 'string' ? (
              <p>{step.description}</p>
            ) : (
              step.description
            )}
          </div>

          <StepIndicator
            totalSteps={TUTORIAL_STEPS.length}
            currentStep={currentStep}
          />
        </div>

        <div className="onboarding-actions">
          {!isFirstStep && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrev}
              className="onboarding-btn-prev"
            >
              ← Back
            </Button>
          )}

          {isFirstStep && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              className="onboarding-btn-skip"
            >
              Skip Tutorial
            </Button>
          )}

          <Button
            variant="primary"
            size="md"
            onClick={handleNext}
            className="onboarding-btn-next"
          >
            {isLastStep ? 'Get Started' : 'Next →'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Small link to restart the tutorial from settings or help menu.
 */
export function RestartTutorialButton({
  onClick
}: {
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="restart-tutorial-link"
      type="button"
    >
      🎓 Restart Tutorial
    </button>
  );
}

export default OnboardingTutorial;
