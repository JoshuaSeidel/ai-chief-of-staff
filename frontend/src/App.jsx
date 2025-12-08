import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import Configuration from './components/Configuration';
import Transcripts from './components/Transcripts';
import Calendar from './components/Calendar';
import Tasks from './components/Tasks';
import Intelligence from './components/Intelligence';
import { useRegisterSW } from 'virtual:pwa-register/react';

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
  const [swRegistration, setSwRegistration] = useState(null);

  // Minimum swipe distance (in pixels)
  const minSwipeDistance = 50;

  // Service Worker update handling
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered:', r);
      setSwRegistration(r);
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  // Set up periodic update checks with proper cleanup
  useEffect(() => {
    if (!swRegistration) return;

    // Check for updates every 5 minutes
    const intervalId = setInterval(() => {
      swRegistration.update();
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(intervalId);
  }, [swRegistration]);

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

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <h1>AI Chief of Staff</h1>
          <button 
            className="mobile-menu-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            <span className={`hamburger ${mobileMenuOpen ? 'open' : ''}`}>
              <span></span>
              <span></span>
              <span></span>
            </span>
          </button>
        </div>
        <nav className={`nav ${mobileMenuOpen ? 'mobile-open' : ''}`}>
          {navItems.map(item => (
            <button 
              key={item.id}
              className={activeTab === item.id ? 'active' : ''}
              onClick={() => handleTabChange(item.id)}
              data-tab={item.id}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
      </header>

      <div 
        className={`mobile-menu-overlay ${mobileMenuOpen ? 'visible' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
      />

      <main 
        className="container"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ touchAction: 'pan-y' }}
      >
        {activeTab === 'dashboard' && <Dashboard setActiveTab={setActiveTab} />}
        {activeTab === 'transcripts' && <Transcripts />}
        {activeTab === 'tasks' && <Tasks />}
        {activeTab === 'calendar' && <Calendar />}
        {activeTab === 'intelligence' && <Intelligence />}
        {activeTab === 'config' && <Configuration />}
      </main>

      {/* Service Worker Update Notification */}
      {needRefresh && (
        <div className="update-notification">
          <div className="update-notification-content">
            <span>🔄 New version available!</span>
            <div className="update-notification-actions">
              <button 
                className="btn-update"
                onClick={() => updateServiceWorker(true)}
              >
                Update
              </button>
              <button 
                className="btn-dismiss"
                onClick={() => setNeedRefresh(false)}
              >
                Later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
