import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import Configuration from './components/Configuration';
import Transcripts from './components/Transcripts';
import Calendar from './components/Calendar';
import Tasks from './components/Tasks';

function App() {
  // Get initial tab from URL hash or default to dashboard
  const getInitialTab = () => {
    const hash = window.location.hash.replace('#', '');
    const validTabs = ['dashboard', 'transcripts', 'tasks', 'calendar', 'config'];
    return validTabs.includes(hash) ? hash : 'dashboard';
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
      const validTabs = ['dashboard', 'transcripts', 'tasks', 'calendar', 'config'];
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
    { id: 'config', label: 'Settings', icon: '⚙️' }
  ];

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

      <main className="container">
        {activeTab === 'dashboard' && <Dashboard setActiveTab={setActiveTab} />}
        {activeTab === 'transcripts' && <Transcripts />}
        {activeTab === 'tasks' && <Tasks />}
        {activeTab === 'calendar' && <Calendar />}
        {activeTab === 'config' && <Configuration />}
      </main>
    </div>
  );
}

export default App;
