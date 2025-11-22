import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import Configuration from './components/Configuration';
import Transcripts from './components/Transcripts';
import Calendar from './components/Calendar';
import Commitments from './components/Commitments';

function App() {
  // Get initial tab from URL hash or default to dashboard
  const getInitialTab = () => {
    const hash = window.location.hash.replace('#', '');
    const validTabs = ['dashboard', 'transcripts', 'commitments', 'calendar', 'config'];
    return validTabs.includes(hash) ? hash : 'dashboard';
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);

  // Update URL when tab changes
  useEffect(() => {
    window.location.hash = activeTab;
  }, [activeTab]);

  // Listen for hash changes (back/forward browser buttons)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      const validTabs = ['dashboard', 'transcripts', 'commitments', 'calendar', 'config'];
      if (validTabs.includes(hash)) {
        setActiveTab(hash);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return (
    <div className="app">
      <header className="header">
        <h1>AI Chief of Staff</h1>
        <nav className="nav">
          <button 
            className={activeTab === 'dashboard' ? 'active' : ''}
            onClick={() => setActiveTab('dashboard')}
            data-tab="dashboard"
          >
            Dashboard
          </button>
          <button 
            className={activeTab === 'transcripts' ? 'active' : ''}
            onClick={() => setActiveTab('transcripts')}
            data-tab="transcripts"
          >
            Transcripts
          </button>
          <button 
            className={activeTab === 'commitments' ? 'active' : ''}
            onClick={() => setActiveTab('commitments')}
            data-tab="commitments"
          >
            Tasks
          </button>
          <button 
            className={activeTab === 'calendar' ? 'active' : ''}
            onClick={() => setActiveTab('calendar')}
            data-tab="calendar"
          >
            Calendar
          </button>
          <button 
            className={activeTab === 'config' ? 'active' : ''}
            onClick={() => setActiveTab('config')}
            data-tab="config"
          >
            Configuration
          </button>
        </nav>
      </header>

      <main className="container">
        {activeTab === 'dashboard' && <Dashboard setActiveTab={setActiveTab} />}
        {activeTab === 'transcripts' && <Transcripts />}
        {activeTab === 'commitments' && <Commitments />}
        {activeTab === 'calendar' && <Calendar />}
        {activeTab === 'config' && <Configuration />}
      </main>
    </div>
  );
}

export default App;
