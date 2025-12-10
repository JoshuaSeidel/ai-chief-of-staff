import React, { useState, useEffect, Suspense, lazy } from 'react';
import ProfileSelector from './components/ProfileSelector';
import { ProfileProvider } from './contexts/ProfileContext';
import { ToastProvider } from './contexts/ToastContext';
import { KeyboardShortcutsHelp, OnboardingTutorial, useOnboarding } from './components/common';

// Lazy load route components for code splitting
// This reduces initial bundle size by only loading components when needed
const Dashboard = lazy(() => import('./components/Dashboard'));
const Configuration = lazy(() => import('./components/Configuration'));
const Transcripts = lazy(() => import('./components/Transcripts'));
const Calendar = lazy(() => import('./components/Calendar'));
const Tasks = lazy(() => import('./components/Tasks'));
const Intelligence = lazy(() => import('./components/Intelligence'));

// Loading fallback component
function LoadingFallback() {
  return (
    <div className="loading-fallback" role="status" aria-label="Loading">
      <div className="loading-spinner">
        <div className="spinner"></div>
      </div>
      <p className="loading-text">Loading...</p>
    </div>
  );
}

function App() {
  // Get initial tab from URL hash or default to dashboard
  const getInitialTab = () => {
    const hash = window.location.hash.replace('#', '');
    const validTabs = ['dashboard', 'transcripts', 'tasks', 'calendar', 'intelligence', 'config'];
    return validTabs.includes(hash) ? hash : 'dashboard';
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);

  // Onboarding tutorial state
  const { showTutorial, completeTutorial } = useOnboarding();

  // Minimum swipe distance (in pixels)
  const minSwipeDistance = 50;

  // Update URL when tab changes
  useEffect(() => {
    window.location.hash = activeTab;
    // Close mobile menu when tab changes
    setMobileMenuOpen(false);
  }, [activeTab]);

  // Listen for hash changes (back/forward browser buttons)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      const validTabs = ['dashboard', 'transcripts', 'tasks', 'calendar', 'intelligence', 'config'];
      if (validTabs.includes(hash)) {
        setActiveTab(hash);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (mobileMenuOpen && !e.target.closest('.header') && !e.target.closest('.mobile-menu-overlay')) {
        setMobileMenuOpen(false);
      }
    };

    if (mobileMenuOpen) {
      document.addEventListener('click', handleClickOutside);
      // Prevent body scroll when menu is open
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'transcripts', label: 'Transcripts', icon: '📝' },
    { id: 'tasks', label: 'Tasks', icon: '📋' },
    { id: 'calendar', label: 'Calendar', icon: '📅' },
    { id: 'intelligence', label: 'AI Tools', icon: '🤖' },
    { id: 'config', label: 'Settings', icon: '⚙️' }
  ];

  // Swipe navigation handlers
  const onTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe || isRightSwipe) {
      const currentIndex = navItems.findIndex(item => item.id === activeTab);
      let newIndex;

      if (isLeftSwipe) {
        // Swipe left - go to next tab
        newIndex = currentIndex < navItems.length - 1 ? currentIndex + 1 : currentIndex;
      } else {
        // Swipe right - go to previous tab
        newIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex;
      }

      if (newIndex !== currentIndex) {
        setActiveTab(navItems[newIndex].id);
      }
    }

    // Reset touch state
    setTouchStart(null);
    setTouchEnd(null);
  };

  // Render the active tab component
  const renderActiveTab = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard setActiveTab={setActiveTab} />;
      case 'transcripts':
        return <Transcripts />;
      case 'tasks':
        return <Tasks />;
      case 'calendar':
        return <Calendar />;
      case 'intelligence':
        return <Intelligence />;
      case 'config':
        return <Configuration />;
      default:
        return <Dashboard setActiveTab={setActiveTab} />;
    }
  };

  return (
    <ProfileProvider>
      <ToastProvider>
      <div className="app">
        {/* Skip Navigation Link for Accessibility */}
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>

        <header className="header">
          <div className="header-content">
            <h1>AI Chief of Staff</h1>
            <ProfileSelector />
            <button
              className="mobile-menu-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
            >
              <span className={`hamburger ${mobileMenuOpen ? 'open' : ''}`}>
                <span></span>
                <span></span>
                <span></span>
              </span>
            </button>
          </div>
        <nav className={`nav ${mobileMenuOpen ? 'mobile-open' : ''}`} aria-label="Main navigation">
          {navItems.map(item => (
            <button
              key={item.id}
              className={activeTab === item.id ? 'active' : ''}
              onClick={() => handleTabChange(item.id)}
              data-tab={item.id}
              aria-current={activeTab === item.id ? 'page' : undefined}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
      </header>

      <div
        className={`mobile-menu-overlay ${mobileMenuOpen ? 'visible' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
        aria-hidden="true"
      />

      <main
        id="main-content"
        className="container"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ touchAction: 'pan-y' }}
      >
        <Suspense fallback={<LoadingFallback />}>
          {renderActiveTab()}
        </Suspense>
      </main>

      {/* Global Keyboard Shortcuts Help - accessible via "?" key */}
      <KeyboardShortcutsHelp />

      {/* Onboarding Tutorial - shows for first-time users */}
      <OnboardingTutorial isOpen={showTutorial} onComplete={completeTutorial} />
      </div>
      </ToastProvider>
    </ProfileProvider>
  );
}

export default App;
