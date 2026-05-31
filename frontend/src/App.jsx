import React, { useState, useEffect, Suspense, lazy } from 'react';
import {
  AlertTriangle,
  BrainCircuit,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  CircleOff,
  Command,
  FileText,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Loader2,
  Mail,
  Menu,
  Moon,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  X
} from 'lucide-react';
import ProfileSelector from './components/ProfileSelector';
import { ProfileProvider, useProfile } from './contexts/ProfileContext';
import { ToastProvider } from './contexts/ToastContext';
import { THEMES, useTheme } from './contexts/ThemeContext';
import { KeyboardShortcutsHelp, OnboardingTutorial, useOnboarding } from './components/common';
import { API_TOKEN_STORAGE_KEY, connectivityAPI } from './services/api';

// Lazy load route components for code splitting
// This reduces initial bundle size by only loading components when needed
const Dashboard = lazy(() => import('./components/Dashboard'));
const Configuration = lazy(() => import('./components/Configuration'));
const Transcripts = lazy(() => import('./components/Transcripts'));
const EmailIntake = lazy(() => import('./components/EmailIntake'));
const Calendar = lazy(() => import('./components/Calendar'));
const Tasks = lazy(() => import('./components/Tasks'));
const Intelligence = lazy(() => import('./components/Intelligence'));

// Loading fallback component
function LoadingFallback() {
  return (
    <div className="loading-fallback" role="status" aria-label="Loading">
      <div className="loading-spinner" aria-hidden="true">
        <div className="spinner" />
      </div>
      <p className="loading-text">Preparing workspace</p>
    </div>
  );
}

const navItems = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    title: 'Morning Dashboard',
    description: 'Brief, insights, quick actions',
    icon: LayoutDashboard,
    badge: 'Live'
  },
  {
    id: 'transcripts',
    label: 'Transcripts',
    title: 'Transcript Intake',
    description: 'Upload, record, and process notes',
    icon: FileText
  },
  {
    id: 'email',
    label: 'Email',
    title: 'Email & Meeting Intake',
    description: 'Messages and system meetings',
    icon: Mail,
    badge: 'New'
  },
  {
    id: 'tasks',
    label: 'Tasks',
    title: 'Task Command Center',
    description: 'Commitments, risks, follow-ups',
    icon: CheckSquare,
    badge: 'Core'
  },
  {
    id: 'calendar',
    label: 'Calendar',
    title: 'Calendar Planning',
    description: 'Events and time blocks',
    icon: CalendarDays
  },
  {
    id: 'intelligence',
    label: 'AI Tools',
    title: 'AI Intelligence',
    description: 'Analysis and automation tools',
    icon: BrainCircuit,
    badge: 'AI'
  },
  {
    id: 'config',
    label: 'Settings',
    title: 'Workspace Settings',
    description: 'Providers, profiles, integrations',
    icon: Settings
  }
];

function ThemeSwitch() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="theme-switch" aria-label="Theme mode">
      <button
        className={theme === THEMES.DARK ? 'active' : ''}
        onClick={() => setTheme(THEMES.DARK)}
        aria-pressed={theme === THEMES.DARK}
        title="Dark mode"
      >
        <Moon size={15} />
        <span>Dark</span>
      </button>
      <button
        className={theme === THEMES.LIGHT ? 'active' : ''}
        onClick={() => setTheme(THEMES.LIGHT)}
        aria-pressed={theme === THEMES.LIGHT}
        title="Light mode"
      >
        <Sun size={15} />
        <span>Light</span>
      </button>
    </div>
  );
}

const connectivityItems = [
  { key: 'meetings', label: 'Meetings', icon: CalendarCheck },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'jira', label: 'Jira', icon: CheckSquare },
  { key: 'planner', label: 'Planner', icon: ListChecks }
];

const stateIcons = {
  connected: CheckCircle2,
  warning: AlertTriangle,
  disconnected: CircleOff,
  checking: Loader2
};

const validTabs = ['dashboard', 'transcripts', 'email', 'tasks', 'calendar', 'intelligence', 'config'];

function getTabFromHash(hash) {
  return hash.replace(/^#/, '').split('?')[0];
}

function ConnectivityStrip() {
  const { currentProfile } = useProfile();
  const [services, setServices] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const loadConnectivity = async () => {
      try {
        const response = await connectivityAPI.getStatus(currentProfile?.id);
        if (!cancelled) {
          setServices(response.data?.services || {});
        }
      } catch {
        if (!cancelled) {
          setServices({
            meetings: { state: 'warning', detail: 'Unable to check meeting connectivity' },
            email: { state: 'warning', detail: 'Unable to check email connectivity' },
            jira: { state: 'warning', detail: 'Unable to check Jira connectivity' },
            planner: { state: 'warning', detail: 'Unable to check Planner connectivity' }
          });
        }
      }
    };

    const handleFocus = () => loadConnectivity();

    loadConnectivity();
    const intervalId = window.setInterval(loadConnectivity, 60000);
    window.addEventListener('focus', handleFocus);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [currentProfile?.id]);

  if (!services) return null;

  const visibleItems = connectivityItems.filter((item) => services?.[item.key]?.configured);

  if (visibleItems.length === 0) return null;

  return (
    <div className="connectivity-strip" aria-label="Integration connectivity">
      {visibleItems.map((item) => {
        const status = services?.[item.key] || {};
        const state = status.state || 'disconnected';
        const ItemIcon = item.icon;
        const StateIcon = stateIcons[state] || CircleOff;
        const detail = status.detail || 'Not connected';
        const stateLabel = state === 'connected'
          ? 'Connected'
          : status.reconnectRequired
            ? 'Reconnect'
            : state === 'warning'
              ? 'Check'
              : 'Offline';
        const title = `${item.label}: ${detail}${status.provider ? ` (${status.provider})` : ''}`;

        return (
          <div
            key={item.key}
            className={`connection-pill ${state}`}
            role="status"
            title={title}
            aria-label={title}
          >
            <ItemIcon size={14} aria-hidden="true" />
            <span className="connection-copy">
              <span className="connection-label">{item.label}</span>
              <span className="connection-text">{stateLabel}</span>
            </span>
            <StateIcon className={state === 'checking' ? 'spin' : ''} size={13} aria-hidden="true" />
          </div>
        );
      })}
    </div>
  );
}

function ApiTokenGate() {
  const [visible, setVisible] = useState(false);
  const [token, setToken] = useState('');

  useEffect(() => {
    const handleAuthRequired = () => {
      setVisible(true);
    };

    window.addEventListener('aicos:auth-required', handleAuthRequired);
    return () => window.removeEventListener('aicos:auth-required', handleAuthRequired);
  }, []);

  if (!visible) return null;

  const saveToken = (event) => {
    event.preventDefault();
    const trimmed = token.trim();
    if (!trimmed) return;
    localStorage.setItem(API_TOKEN_STORAGE_KEY, trimmed);
    window.location.reload();
  };

  const clearToken = () => {
    localStorage.removeItem(API_TOKEN_STORAGE_KEY);
    setToken('');
  };

  return (
    <div className="modal-overlay auth-overlay" role="presentation">
      <form
        className="modal-content auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-token-title"
        onSubmit={saveToken}
      >
        <div className="auth-modal-icon" aria-hidden="true">
          <ShieldCheck size={24} />
        </div>
        <div className="auth-modal-copy">
          <span className="page-eyebrow">
            <KeyRound size={15} />
            Secure API
          </span>
          <h2 id="api-token-title">API token required</h2>
        </div>
        <label className="auth-token-field">
          <span>Access token</span>
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            autoComplete="current-password"
            autoFocus
          />
        </label>
        <div className="auth-modal-actions">
          <button type="button" className="btn-secondary" onClick={clearToken}>
            Clear
          </button>
          <button type="submit" className="btn-primary" disabled={!token.trim()}>
            Save token
          </button>
        </div>
      </form>
    </div>
  );
}

function App() {
  // Get initial tab from URL hash or default to dashboard
  const getInitialTab = () => {
    const hashTab = getTabFromHash(window.location.hash);
    return validTabs.includes(hashTab) ? hashTab : 'dashboard';
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
    if (getTabFromHash(window.location.hash) !== activeTab) {
      window.location.hash = activeTab;
    }
    // Close mobile menu when tab changes
    setMobileMenuOpen(false);
  }, [activeTab]);

  // Listen for hash changes (back/forward browser buttons)
  useEffect(() => {
    const handleHashChange = () => {
      const hashTab = getTabFromHash(window.location.hash);
      if (validTabs.includes(hashTab)) {
        setActiveTab(hashTab);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        mobileMenuOpen &&
        !e.target.closest('.mobile-drawer') &&
        !e.target.closest('.mobile-menu-toggle')
      ) {
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
      case 'email':
        return <EmailIntake />;
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

  const activeItem = navItems.find(item => item.id === activeTab) || navItems[0];
  const ActiveIcon = activeItem.icon;

  const renderNavItem = (item) => {
    const Icon = item.icon;
    const isActive = activeTab === item.id;

    return (
      <button
        key={item.id}
        className={`nav-item ${isActive ? 'active' : ''}`}
        onClick={() => handleTabChange(item.id)}
        data-tab={item.id}
        aria-current={isActive ? 'page' : undefined}
      >
        <span className="nav-icon" aria-hidden="true">
          <Icon size={20} strokeWidth={2} />
        </span>
        <span className="nav-copy">
          <span className="nav-label">{item.label}</span>
          <span className="nav-description">{item.description}</span>
        </span>
        {item.badge && <span className="nav-badge">{item.badge}</span>}
      </button>
    );
  };

  return (
    <ProfileProvider>
      <ToastProvider>
        <div className="app app-shell">
          <a href="#main-content" className="skip-link">
            Skip to main content
          </a>

          <aside className="app-sidebar" aria-label="Workspace navigation">
            <div className="brand-panel">
              <div className="brand-mark" aria-hidden="true">
                <Sparkles size={22} />
              </div>
              <div className="brand-copy">
                <span className="brand-kicker">Executive OS</span>
                <h1>AI Chief of Staff</h1>
              </div>
            </div>

            <div className="sidebar-profile">
              <ProfileSelector />
            </div>

            <nav className="nav side-nav" aria-label="Main navigation">
              {navItems.map(renderNavItem)}
            </nav>

            <div className="sidebar-footer">
              <ThemeSwitch />
              <div className="system-card">
                <div className="system-card-icon" aria-hidden="true">
                  <Command size={18} />
                </div>
                <div>
                  <span className="system-card-label">Command layer</span>
                  <strong>Keyboard ready</strong>
                </div>
              </div>
            </div>
          </aside>

          <div className="app-workspace">
            <header className="topbar">
              <button
                className="mobile-menu-toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  setMobileMenuOpen(!mobileMenuOpen);
                }}
                aria-label="Toggle menu"
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? <X size={21} /> : <Menu size={21} />}
              </button>

              <div className="topbar-title">
                <span className="page-eyebrow">
                  <ActiveIcon size={15} aria-hidden="true" />
                  {activeItem.label}
                </span>
                <h2>{activeItem.title}</h2>
              </div>

              <div className="topbar-status">
                <ConnectivityStrip />
              </div>

              <div className="topbar-actions">
                <ThemeSwitch />
                <ProfileSelector />
              </div>
            </header>

            <main
              id="main-content"
              className="container app-main"
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              style={{ touchAction: 'pan-y' }}
            >
              <div className="page-transition" key={activeTab}>
                <Suspense fallback={<LoadingFallback />}>
                  {renderActiveTab()}
                </Suspense>
              </div>
            </main>
          </div>

          <div
            className={`mobile-menu-overlay ${mobileMenuOpen ? 'visible' : ''}`}
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

          <aside
            className={`mobile-drawer ${mobileMenuOpen ? 'visible' : ''}`}
            aria-label="Mobile navigation"
            aria-hidden={!mobileMenuOpen}
          >
            <div className="mobile-drawer-header">
              <div className="brand-panel compact">
                <div className="brand-mark" aria-hidden="true">
                  <Sparkles size={20} />
                </div>
                <div className="brand-copy">
                  <span className="brand-kicker">Executive OS</span>
                  <h1>AI Chief of Staff</h1>
                </div>
              </div>
              <button
                className="mobile-menu-toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  setMobileMenuOpen(false);
                }}
                aria-label="Close menu"
              >
                <X size={21} />
              </button>
            </div>
            <div className="sidebar-profile mobile-profile">
              <ProfileSelector />
            </div>
            <nav className="nav mobile-nav" aria-label="Mobile main navigation">
              {navItems.map(renderNavItem)}
            </nav>
          </aside>

          <KeyboardShortcutsHelp />

          <OnboardingTutorial isOpen={showTutorial} onComplete={completeTutorial} />
          <ApiTokenGate />
        </div>
      </ToastProvider>
    </ProfileProvider>
  );
}

export default App;
