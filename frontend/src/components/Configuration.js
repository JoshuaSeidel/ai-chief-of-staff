import React, { useState, useEffect } from 'react';
import { configAPI, intelligenceAPI } from '../services/api';
import { PullToRefresh } from './PullToRefresh';

// Version info component
function VersionInfo() {
  const [version, setVersion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/config/version')
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        setVersion(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch version:', err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#18181b', borderRadius: '8px', border: '1px solid #3f3f46' }}>
        <p style={{ color: '#6e6e73', fontSize: '0.85rem' }}>Loading version...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#18181b', borderRadius: '8px', border: '1px solid #3f3f46' }}>
        <p style={{ color: '#ef4444', fontSize: '0.85rem' }}>Failed to load version: {error}</p>
      </div>
    );
  }

  if (!version) {
    return (
      <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#18181b', borderRadius: '8px', border: '1px solid #3f3f46' }}>
        <p style={{ color: '#6e6e73', fontSize: '0.85rem' }}>Version information not available</p>
      </div>
    );
  }

  return (
    <div style={{ 
      marginTop: '0', 
      marginBottom: '1rem',
      padding: '1rem', 
      backgroundColor: '#18181b', 
      borderRadius: '8px', 
      border: '1px solid #3f3f46' 
    }}>
      <p style={{ color: '#e5e5e7', fontSize: '1rem', marginBottom: '0.75rem', fontWeight: '500' }}>
        Application Version
      </p>
      <p style={{ color: '#a1a1aa', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
        <strong style={{ color: '#e5e5e7' }}>Frontend:</strong> <span style={{ color: '#60a5fa', fontFamily: 'monospace' }}>{version.frontendVersion || version.version || 'Unknown'}</span>
      </p>
      <p style={{ color: '#a1a1aa', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
        <strong style={{ color: '#e5e5e7' }}>Backend:</strong> <span style={{ color: '#60a5fa', fontFamily: 'monospace' }}>{version.backendVersion || version.version || 'Unknown'}</span>
      </p>
      {version.microservices && Object.keys(version.microservices).length > 0 && (
        <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #3f3f46' }}>
          <p style={{ color: '#e5e5e7', fontSize: '0.9rem', marginBottom: '0.5rem', fontWeight: '500' }}>
            Microservices:
          </p>
          {Object.entries(version.microservices).map(([name, ver]) => (
            <p key={name} style={{ color: '#a1a1aa', fontSize: '0.85rem', marginBottom: '0.25rem', marginLeft: '1rem' }}>
              <strong style={{ color: '#e5e5e7' }}>{name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}:</strong>{' '}
              <span style={{ color: ver === 'unavailable' ? '#ef4444' : '#60a5fa', fontFamily: 'monospace' }}>
                {ver}
              </span>
            </p>
          ))}
        </div>
      )}
      {version.buildDate && (
        <p style={{ color: '#a1a1aa', fontSize: '0.85rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #3f3f46' }}>
          <strong style={{ color: '#e5e5e7' }}>Build Date:</strong> {new Date(version.buildDate).toLocaleString()}
        </p>
      )}
    </div>
  );
}

function Configuration() {
  const [config, setConfig] = useState({
    aiProvider: 'anthropic',
    anthropicApiKey: '',
    claudeModel: 'claude-sonnet-4-5-20250929',
    openaiApiKey: '',
    openaiModel: 'gpt-4o',
    ollamaBaseUrl: 'http://localhost:11434',
    ollamaModel: 'llama3.1',
    aiMaxTokens: '4096',
    plaudApiKey: '',
    plaudApiUrl: 'https://api.plaud.ai',
    googleClientId: '',
    googleClientSecret: '',
    googleRedirectUri: '',
    googleCalendarId: '',
    microsoftTenantId: '',
    microsoftClientId: '',
    microsoftClientSecret: '',
    microsoftRedirectUri: '',
    microsoftTaskListId: '',
    jiraBaseUrl: '',
    jiraEmail: '',
    jiraApiToken: '',
    jiraProjectKey: '',
    userNames: '',
    dbType: 'sqlite',
    postgresHost: '',
    postgresPort: '5432',
    postgresDb: '',
    postgresUser: '',
    postgresPassword: '',
  });
  
  // Track which fields have been loaded from server (to know which ones to skip on save)
  const [loadedFields, setLoadedFields] = useState({});
  
  // Integration toggles
  const [enabledIntegrations, setEnabledIntegrations] = useState({
    googleCalendar: true,
    microsoftPlanner: false,
    jira: false
  });
  
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [checkingGoogle, setCheckingGoogle] = useState(true);
  const [microsoftConnected, setMicrosoftConnected] = useState(false);
  const [checkingMicrosoft, setCheckingMicrosoft] = useState(true);
  const [jiraConnected, setJiraConnected] = useState(false);
  const [checkingJira, setCheckingJira] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [microsoftTaskLists, setMicrosoftTaskLists] = useState([]);
  const [loadingTaskLists, setLoadingTaskLists] = useState(false);
  const [prompts, setPrompts] = useState([]);
  const [loadingPrompts, setLoadingPrompts] = useState(true);
  const [editingPrompt, setEditingPrompt] = useState(null);
  const [servicesHealth, setServicesHealth] = useState(null);
  const [showServicesHealth, setShowServicesHealth] = useState(false);

  useEffect(() => {
    loadConfig();
    loadServicesHealth();
    checkGoogleCalendarStatus();
    checkMicrosoftPlannerStatus();
    checkJiraStatus();
    loadPrompts();
    
    // Set initial integration toggles based on configuration
    // This will be updated when status checks complete
    const hasJiraConfig = config.jiraBaseUrl && config.jiraEmail && config.jiraApiToken && config.jiraProjectKey;
    if (hasJiraConfig) {
      setEnabledIntegrations(prev => ({ ...prev, jira: true }));
    }
    
    // Check notification permission on load
    if (typeof Notification !== 'undefined') {
      setNotificationsEnabled(Notification.permission === 'granted');
    }
    
    // Check for URL parameters (success/error messages from OAuth redirects)
    const hash = window.location.hash;
    const hashParams = new URLSearchParams(hash.split('?')[1] || '');
    const error = hashParams.get('error');
    const success = hashParams.get('success');
    const errorDetails = hashParams.get('error_details');
    
    if (success === 'microsoft_planner_connected') {
      setMessage({ type: 'success', text: '✅ Microsoft Planner connected successfully!' });
      checkMicrosoftPlannerStatus(); // Refresh connection status
      // Clean up URL
      const cleanHash = hash.split('?')[0];
      window.history.replaceState({}, '', window.location.pathname + cleanHash);
    } else if (error === 'microsoft_oauth_failed') {
      setMessage({ type: 'error', text: '❌ Failed to connect Microsoft Planner. Please try again.' });
      // Clean up URL
      const cleanHash = hash.split('?')[0];
      window.history.replaceState({}, '', window.location.pathname + cleanHash);
    } else if (error === 'microsoft_oauth_access_denied') {
      setMessage({ type: 'error', text: '❌ Microsoft Planner connection was cancelled. Please try again if you want to connect.' });
      // Clean up URL
      const cleanHash = hash.split('?')[0];
      window.history.replaceState({}, '', window.location.pathname + cleanHash);
    } else if (error === 'microsoft_oauth_wrong_account_type') {
      const details = errorDetails ? decodeURIComponent(errorDetails) : '';
      setMessage({ 
        type: 'error', 
        text: `❌ Account type mismatch. You're trying to sign in with a work/school account, but the app is configured for personal Microsoft accounts only. Please sign in with a personal Microsoft account (@outlook.com, @hotmail.com) or update your Azure app registration to support work accounts. ${details ? `Details: ${details.substring(0, 150)}` : ''}` 
      });
      // Clean up URL
      const cleanHash = hash.split('?')[0];
      window.history.replaceState({}, '', window.location.pathname + cleanHash);
    } else if (error === 'microsoft_oauth_exchange_failed') {
      setMessage({ type: 'error', text: '❌ Failed to complete Microsoft Planner connection. Please check your credentials and try again.' });
      // Clean up URL
      const cleanHash = hash.split('?')[0];
      window.history.replaceState({}, '', window.location.pathname + cleanHash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  const loadServicesHealth = async () => {
    try {
      const response = await intelligenceAPI.checkHealth();
      console.log('Health check response:', response);
      if (response && response.data) {
        setServicesHealth(response.data);
      } else {
        console.warn('Health check response missing data:', response);
        setServicesHealth(null);
      }
    } catch (err) {
      console.error('Microservices health check error:', err);
      setServicesHealth(null);
    }
  };
  
  const loadPrompts = async () => {
    try {
      setLoadingPrompts(true);
      const response = await fetch('/api/prompts');
      if (response.ok) {
        const data = await response.json();
        console.log('Loaded prompts:', data);
        setPrompts(data);
      } else {
        console.error('Failed to load prompts:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error loading prompts:', error);
    } finally {
      setLoadingPrompts(false);
    }
  };
  
  const updatePrompt = async (key, newPrompt) => {
    try {
      const response = await fetch(`/api/prompts/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: newPrompt })
      });
      
      if (response.ok) {
        alert('✅ Prompt updated successfully!');
        setEditingPrompt(null);
        loadPrompts();
      } else {
        alert('❌ Failed to update prompt');
      }
    } catch (error) {
      console.error('Error updating prompt:', error);
      alert('❌ Error updating prompt');
    }
  };
  
  const resetPrompt = async (key) => {
    if (!window.confirm('Reset this prompt to default? Your custom changes will be lost.')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/prompts/${key}/reset`, {
        method: 'POST'
      });
      
      if (response.ok) {
        alert('✅ Prompt reset to default!');
        loadPrompts();
      } else {
        alert('❌ Failed to reset prompt');
      }
    } catch (error) {
      console.error('Error resetting prompt:', error);
      alert('❌ Error resetting prompt');
    }
  };

  const loadConfig = async () => {
    try {
      // Load app config from database
      console.log('Loading app config from database...');
      const appResponse = await configAPI.getAll();
      const appData = appResponse.data;
      console.log('App config loaded:', Object.keys(appData));
      
      // Load system config from file
      console.log('Loading system config...');
      const sysResponse = await fetch('/api/config/system');
      const sysData = await sysResponse.json();
      console.log('System config loaded:', { 
        dbType: sysData.dbType, 
        actualDbType: sysData._runtime?.actualDbType,
        hasPostgres: !!sysData.postgres 
      });
      
      // Track which fields were actually loaded (have values)
      const loaded = {
        anthropicApiKey: !!appData.anthropicApiKey,
        openaiApiKey: !!appData.openaiApiKey,
        microsoftClientSecret: !!appData.microsoftClientSecret,
        plaudApiKey: !!appData.plaudApiKey,
        googleClientSecret: !!appData.googleClientSecret,
        jiraApiToken: !!appData.jiraApiToken,
        postgresPassword: !!(sysData.postgres?.password && sysData.postgres.password !== '********')
      };
      
      setLoadedFields(loaded);
      
      // Use actual runtime DB type if available, otherwise use config file value
      const actualDbType = sysData._runtime?.actualDbType || sysData.dbType || 'sqlite';
      
      // Set Jira integration toggle if configured
      const hasJiraConfig = appData.jiraBaseUrl && appData.jiraEmail && appData.jiraApiToken && appData.jiraProjectKey;
      if (hasJiraConfig) {
        setEnabledIntegrations(prev => ({ ...prev, jira: true }));
      }
      
      setConfig({
        aiProvider: appData.aiProvider || 'anthropic',
        anthropicApiKey: appData.anthropicApiKey ? '••••••••' : '',
        claudeModel: appData.claudeModel || 'claude-sonnet-4-5-20250929',
        openaiApiKey: appData.openaiApiKey ? '••••••••' : '',
        openaiModel: appData.openaiModel || 'gpt-4o',
        ollamaBaseUrl: appData.ollamaBaseUrl || 'http://localhost:11434',
        ollamaModel: appData.ollamaModel || 'llama3.1',
        aiMaxTokens: appData.aiMaxTokens || appData.claudeMaxTokens || '4096',
        plaudApiKey: appData.plaudApiKey ? '••••••••' : '',
        plaudApiUrl: appData.plaudApiUrl || 'https://api.plaud.ai',
        googleClientId: appData.googleClientId || '',
        googleClientSecret: appData.googleClientSecret ? '••••••••' : '',
        googleRedirectUri: appData.googleRedirectUri || '',
        googleCalendarId: appData.googleCalendarId || '',
        userNames: appData.userNames || '',
        microsoftTenantId: appData.microsoftTenantId || '',
        microsoftClientId: appData.microsoftClientId || '',
        microsoftClientSecret: appData.microsoftClientSecret ? '••••••••' : '',
        microsoftRedirectUri: appData.microsoftRedirectUri || '',
        microsoftTaskListId: appData.microsoftTaskListId || '',
        jiraBaseUrl: appData.jiraBaseUrl || '',
        jiraEmail: appData.jiraEmail || '',
        jiraApiToken: appData.jiraApiToken ? '••••••••' : '',
        jiraProjectKey: appData.jiraProjectKey || '',
        dbType: actualDbType,
        postgresHost: sysData.postgres?.host || '',
        postgresPort: sysData.postgres?.port || '5432',
        postgresDb: sysData.postgres?.database || '',
        postgresUser: sysData.postgres?.user || '',
        postgresPassword: sysData.postgres?.password === '********' ? '••••••••' : '',
      });
    } catch (err) {
      console.error('Failed to load config:', err);
      setMessage({ 
        type: 'error', 
        text: 'Failed to load configuration. Check console for details.' 
      });
    }
  };

  const handleRefresh = async () => {
    await loadConfig();
    await checkGoogleCalendarStatus();
  };

  const checkGoogleCalendarStatus = async () => {
    try {
      const response = await fetch('/api/calendar/google/status');
      const data = await response.json();
      setGoogleConnected(data.connected);
    } catch (err) {
      console.error('Failed to check Google Calendar status:', err);
    } finally {
      setCheckingGoogle(false);
    }
  };

  const checkMicrosoftPlannerStatus = async () => {
    try {
      const response = await fetch('/api/planner/microsoft/status');
      const data = await response.json();
      setMicrosoftConnected(data.connected);
      
      // If connected, load available task lists
      if (data.connected) {
        loadMicrosoftTaskLists();
      }
    } catch (err) {
      console.error('Failed to check Microsoft Planner status:', err);
    } finally {
      setCheckingMicrosoft(false);
    }
  };

  const checkJiraStatus = async () => {
    try {
      setCheckingJira(true);
      const response = await fetch('/api/planner/jira/status');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      const isConnected = data.connected || false;
      setJiraConnected(isConnected);
      
      // If Jira is configured (has credentials), keep checkbox checked even if not connected
      const hasConfig = config.jiraBaseUrl && config.jiraEmail && config.jiraApiToken && config.jiraProjectKey;
      if (hasConfig || isConnected) {
        setEnabledIntegrations(prev => ({ ...prev, jira: true }));
      }
    } catch (err) {
      console.error('Failed to check Jira status:', err);
      setJiraConnected(false);
    } finally {
      setCheckingJira(false);
    }
  };

  const handleJiraDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect Jira? This will not delete any existing issues.')) {
      return;
    }
    
    try {
      const response = await fetch('/api/planner/jira/disconnect', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        setMessage({ type: 'success', text: '✅ Jira disconnected successfully' });
        await checkJiraStatus();
      } else {
        setMessage({ type: 'error', text: `❌ Failed to disconnect: ${data.message || 'Unknown error'}` });
      }
    } catch (err) {
      setMessage({ type: 'error', text: `❌ Error disconnecting: ${err.message}` });
    }
  };

  const loadMicrosoftTaskLists = async () => {
    if (!microsoftConnected) return;
    
    setLoadingTaskLists(true);
    try {
      const response = await fetch('/api/planner/microsoft/lists');
      const data = await response.json();
      setMicrosoftTaskLists(data.lists || []);
    } catch (err) {
      console.error('Failed to load Microsoft task lists:', err);
    } finally {
      setLoadingTaskLists(false);
    }
  };

  const handleGoogleConnect = async () => {
    try {
      const response = await fetch('/api/calendar/google/auth');
      const data = await response.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to initiate Google Calendar connection' });
    }
  };

  const handleGoogleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect Google Calendar?')) {
      return;
    }
    
    try {
      await fetch('/api/calendar/google/disconnect', { method: 'POST' });
      setGoogleConnected(false);
      setMessage({ type: 'success', text: 'Google Calendar disconnected successfully' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to disconnect Google Calendar' });
    }
  };

  const handleMicrosoftConnect = async () => {
    try {
      const response = await fetch('/api/planner/microsoft/auth');
      const data = await response.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to initiate Microsoft Planner connection' });
    }
  };

  const handleMicrosoftDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect Microsoft Planner?')) {
      return;
    }
    
    try {
      await fetch('/api/planner/microsoft/disconnect', { method: 'POST' });
      setMicrosoftConnected(false);
      setMessage({ type: 'success', text: 'Microsoft Planner disconnected successfully' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to disconnect Microsoft Planner' });
    }
  };

  const handleChange = (key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    // If user is typing in a field that was masked, mark it as changed
    if (value && !value.includes('•')) {
      setLoadedFields(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      console.log('Starting configuration save...');
      
      // Separate app config and system config
      const appUpdates = {};
      const sysUpdates = {
        dbType: config.dbType
      };
      
      // App configuration (stored in database)
      // Save API keys only if they've been changed (not masked anymore)
      if (config.anthropicApiKey && !config.anthropicApiKey.includes('•')) {
        appUpdates.anthropicApiKey = config.anthropicApiKey;
      } else if (!config.anthropicApiKey && loadedFields.anthropicApiKey) {
        // Key was cleared - save empty string
        appUpdates.anthropicApiKey = '';
      }
      
      if (config.plaudApiKey && !config.plaudApiKey.includes('•')) {
        appUpdates.plaudApiKey = config.plaudApiKey;
      } else if (!config.plaudApiKey && loadedFields.plaudApiKey) {
        // Key was cleared - save empty string
        appUpdates.plaudApiKey = '';
      }
      
      // Always save these fields (they're not masked)
      appUpdates.aiProvider = config.aiProvider;
      appUpdates.claudeModel = config.claudeModel;
      appUpdates.openaiModel = config.openaiModel;
      appUpdates.ollamaBaseUrl = config.ollamaBaseUrl;
      appUpdates.ollamaModel = config.ollamaModel;
      appUpdates.aiMaxTokens = config.aiMaxTokens;
      appUpdates.plaudApiUrl = config.plaudApiUrl;
      
      // Save API keys only if they've been changed (not masked anymore)
      if (config.openaiApiKey && !config.openaiApiKey.includes('•')) {
        appUpdates.openaiApiKey = config.openaiApiKey;
      } else if (!config.openaiApiKey && loadedFields.openaiApiKey) {
        appUpdates.openaiApiKey = '';
      }
      
      // Google OAuth credentials
      if (config.googleClientId) {
        appUpdates.googleClientId = config.googleClientId;
      }
      if (config.googleClientSecret && !config.googleClientSecret.includes('•')) {
        appUpdates.googleClientSecret = config.googleClientSecret;
      } else if (!config.googleClientSecret && loadedFields.googleClientSecret) {
        appUpdates.googleClientSecret = '';
      }
      if (config.googleRedirectUri) {
        appUpdates.googleRedirectUri = config.googleRedirectUri;
      }
      
      // Microsoft Planner OAuth credentials
      if (config.microsoftTenantId) {
        appUpdates.microsoftTenantId = config.microsoftTenantId;
      }
      if (config.microsoftClientId) {
        appUpdates.microsoftClientId = config.microsoftClientId;
      }
      if (config.microsoftClientSecret && !config.microsoftClientSecret.includes('•')) {
        appUpdates.microsoftClientSecret = config.microsoftClientSecret;
      } else if (!config.microsoftClientSecret && loadedFields.microsoftClientSecret) {
        appUpdates.microsoftClientSecret = '';
      }
      if (config.microsoftTaskListId) {
        appUpdates.microsoftTaskListId = config.microsoftTaskListId;
      } else if (!config.microsoftTaskListId && loadedFields.microsoftTaskListId) {
        appUpdates.microsoftTaskListId = '';
      }
      if (config.microsoftRedirectUri) {
        appUpdates.microsoftRedirectUri = config.microsoftRedirectUri;
      }
      if (config.googleCalendarId) {
        appUpdates.googleCalendarId = config.googleCalendarId;
      }
      if (config.userNames) {
        appUpdates.userNames = config.userNames;
      }
      
      // Jira configuration
      if (config.jiraBaseUrl) {
        appUpdates.jiraBaseUrl = config.jiraBaseUrl;
      }
      if (config.jiraEmail) {
        appUpdates.jiraEmail = config.jiraEmail;
      }
      if (config.jiraApiToken && !config.jiraApiToken.includes('•')) {
        appUpdates.jiraApiToken = config.jiraApiToken;
      } else if (!config.jiraApiToken && loadedFields.jiraApiToken) {
        appUpdates.jiraApiToken = '';
      }
      if (config.jiraProjectKey) {
        appUpdates.jiraProjectKey = config.jiraProjectKey;
      }
      
      // System configuration (stored in /app/data/config.json)
      if (config.dbType === 'postgres') {
        sysUpdates.postgres = {};
        if (config.postgresHost) sysUpdates.postgres.host = config.postgresHost;
        if (config.postgresPort) sysUpdates.postgres.port = parseInt(config.postgresPort);
        if (config.postgresDb) sysUpdates.postgres.database = config.postgresDb;
        if (config.postgresUser) sysUpdates.postgres.user = config.postgresUser;
        if (config.postgresPassword && !config.postgresPassword.includes('•')) {
          sysUpdates.postgres.password = config.postgresPassword;
        }
      }

      // Save app config
      console.log('Saving app config:', Object.keys(appUpdates));
      await configAPI.bulkUpdate(appUpdates);
      console.log('App config saved successfully');
      
      // Save system config
      const sysResponse = await fetch('/api/config/system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sysUpdates)
      });
      
      const sysResult = await sysResponse.json();
      
      if (sysResult.requiresRestart) {
        setMessage({ 
          type: 'warning', 
          text: 'Configuration saved! Please restart the container for database changes to take effect.' 
        });
      } else {
        setMessage({ type: 'success', text: 'Configuration saved successfully!' });
        setTimeout(() => {
          loadConfig();
          setMessage(null);
        }, 2000);
      }
    } catch (err) {
      console.error('Save error:', err);
      setMessage({ type: 'error', text: 'Failed to save configuration: ' + err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="configuration">
      <div className="card">
        <h2>Configuration</h2>
        <p style={{ color: '#a1a1aa', marginBottom: '1.5rem' }}>
          Configure your AI Chief of Staff application settings. All settings persist across container restarts.
        </p>

        {message && (
          <div style={{ 
            backgroundColor: message.type === 'success' ? '#e5ffe5' : message.type === 'warning' ? '#fff8e5' : '#ffe5e5',
            color: message.type === 'success' ? '#00a000' : message.type === 'warning' ? '#d78a00' : '#d70015',
            padding: '1rem',
            borderRadius: '8px',
            marginBottom: '1rem'
          }}>
            {message.text}
          </div>
        )}

        <details style={{ marginBottom: '2rem' }}>
          <summary style={{ 
            cursor: 'pointer', 
            fontWeight: 'bold',
            padding: '0.5rem',
            color: '#e5e5e7',
            fontSize: '1.125rem',
            marginBottom: '0.5rem'
          }}>
            🤖 AI Provider Configuration
          </summary>
          <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#18181b', borderRadius: '8px' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
            AI Provider
          </label>
          <select
            value={config.aiProvider}
            onChange={(e) => handleChange('aiProvider', e.target.value)}
            style={{ 
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #3f3f46',
              borderRadius: '8px',
              fontSize: '1rem',
              fontFamily: 'inherit',
              marginBottom: '1.5rem',
              backgroundColor: '#18181b',
              color: '#e5e5e7'
            }}
          >
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI (GPT)</option>
            <option value="ollama">Ollama (Local/Private)</option>
          </select>

          {/* Anthropic Configuration */}
          {config.aiProvider === 'anthropic' && (
            <>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
                Anthropic API Key (Required)
              </label>
              <input
                type="password"
                value={config.anthropicApiKey}
                onChange={(e) => handleChange('anthropicApiKey', e.target.value)}
                placeholder="sk-ant-..."
              />
              {config.anthropicApiKey.includes('•') && (
                <p style={{ fontSize: '0.85rem', color: '#22c55e', marginTop: '-0.5rem' }}>
                  ✓ API key is configured (change to update)
                </p>
              )}
              <p style={{ fontSize: '0.85rem', color: '#a1a1aa', marginTop: config.anthropicApiKey.includes('•') ? '0' : '-0.5rem', marginBottom: '1rem' }}>
                Get your API key from <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer">console.anthropic.com</a>
              </p>

              <label style={{ display: 'block', marginBottom: '0.5rem', marginTop: '1rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
                Claude Model
              </label>
              <select
                value={config.claudeModel}
                onChange={(e) => handleChange('claudeModel', e.target.value)}
                style={{ 
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #3f3f46',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  fontFamily: 'inherit',
                  marginBottom: '1rem',
                  backgroundColor: '#18181b',
                  color: '#e5e5e7'
                }}
              >
                <option value="claude-sonnet-4-5-20250929">Claude Sonnet 4.5 (Latest - Recommended)</option>
                <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                <option value="claude-3-opus-20240229">Claude 3 Opus</option>
              </select>
            </>
          )}

          {/* OpenAI Configuration */}
          {config.aiProvider === 'openai' && (
            <>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
                OpenAI API Key (Required)
              </label>
              <input
                type="password"
                value={config.openaiApiKey}
                onChange={(e) => handleChange('openaiApiKey', e.target.value)}
                placeholder="sk-..."
              />
              {config.openaiApiKey.includes('•') && (
                <p style={{ fontSize: '0.85rem', color: '#22c55e', marginTop: '-0.5rem' }}>
                  ✓ API key is configured (change to update)
                </p>
              )}
              <p style={{ fontSize: '0.85rem', color: '#a1a1aa', marginTop: config.openaiApiKey.includes('•') ? '0' : '-0.5rem', marginBottom: '1rem' }}>
                Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">platform.openai.com</a>
              </p>

              <label style={{ display: 'block', marginBottom: '0.5rem', marginTop: '1rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
                OpenAI Model
              </label>
              <select
                value={config.openaiModel}
                onChange={(e) => handleChange('openaiModel', e.target.value)}
                style={{ 
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #3f3f46',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  fontFamily: 'inherit',
                  marginBottom: '1rem',
                  backgroundColor: '#18181b',
                  color: '#e5e5e7'
                }}
              >
                <option value="gpt-4o">GPT-4o (Latest - Recommended)</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
                <option value="gpt-4">GPT-4</option>
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
              </select>
            </>
          )}

          {/* Ollama Configuration */}
          {config.aiProvider === 'ollama' && (
            <>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
                Ollama Base URL
              </label>
              <input
                type="url"
                value={config.ollamaBaseUrl}
                onChange={(e) => handleChange('ollamaBaseUrl', e.target.value)}
                placeholder="http://localhost:11434"
              />
              <p style={{ fontSize: '0.85rem', color: '#a1a1aa', marginTop: '-0.5rem', marginBottom: '1rem' }}>
                URL where your Ollama instance is running. Default: http://localhost:11434
              </p>

              <label style={{ display: 'block', marginBottom: '0.5rem', marginTop: '1rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
                Ollama Model
              </label>
              <input
                type="text"
                value={config.ollamaModel}
                onChange={(e) => handleChange('ollamaModel', e.target.value)}
                placeholder="llama3.1"
              />
              <p style={{ fontSize: '0.85rem', color: '#a1a1aa', marginTop: '-0.5rem', marginBottom: '1rem' }}>
                Model name as it appears in Ollama. Common: llama3.1, mistral, codellama, etc.
              </p>
            </>
          )}

          {/* Shared Max Tokens */}
          <label style={{ display: 'block', marginBottom: '0.5rem', marginTop: '1rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
            Max Tokens (Response Length)
          </label>
          <select
            value={config.aiMaxTokens}
            onChange={(e) => handleChange('aiMaxTokens', e.target.value)}
            style={{ 
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #3f3f46',
              borderRadius: '8px',
              fontSize: '1rem',
              fontFamily: 'inherit',
              marginBottom: '1rem',
              backgroundColor: '#18181b',
              color: '#e5e5e7'
            }}
          >
            <option value="2048">2048 - Short meetings (cheaper)</option>
            <option value="4096">4096 - Normal meetings (recommended)</option>
            <option value="6144">6144 - Long meetings</option>
            <option value="8192">8192 - Very long meetings (max)</option>
          </select>
          <p style={{ fontSize: '0.85rem', color: '#a1a1aa', marginTop: '-0.5rem', marginBottom: '1rem' }}>
            Maximum tokens for AI responses. Higher = longer/complete responses but more cost.
          </p>
          
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Your Name(s) (Comma-separated)
          </label>
          <input
            type="text"
            value={config.userNames}
            onChange={(e) => handleChange('userNames', e.target.value)}
            placeholder="John Smith"
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d2d2d7',
              borderRadius: '8px',
              fontSize: '1rem',
              fontFamily: 'inherit',
              marginBottom: '1rem'
            }}
          />
          <p style={{ fontSize: '0.85rem', color: '#a1a1aa', marginTop: '-0.5rem' }}>
            Enter your name(s) as they appear in meeting transcripts. Tasks assigned to you will be automatically added. Others will require confirmation.
          </p>
          </div>
        </details>

        {/* Plaud Integration - Hidden until implemented */}
        {false && (
          <div style={{ marginBottom: '2rem' }}>
            <h3>Plaud Integration</h3>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
              Plaud API Key (Optional)
            </label>
            <input
              type="password"
              value={config.plaudApiKey}
              onChange={(e) => handleChange('plaudApiKey', e.target.value)}
              placeholder="Your Plaud API key"
            />
            {config.plaudApiKey.includes('•') && (
              <p style={{ fontSize: '0.85rem', color: '#22c55e', marginTop: '-0.5rem' }}>
                ✓ API key is configured (change to update)
              </p>
            )}
            
            <label style={{ display: 'block', marginBottom: '0.5rem', marginTop: '1rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
              Plaud API URL
            </label>
            <input
              type="url"
              value={config.plaudApiUrl}
              onChange={(e) => handleChange('plaudApiUrl', e.target.value)}
              placeholder="https://api.plaud.ai"
            />
            <p style={{ fontSize: '0.85rem', color: '#a1a1aa', marginTop: '-0.5rem' }}>
              Configure to automatically pull transcripts from Plaud
            </p>
          </div>
        )}

        <div style={{ marginBottom: '2rem' }}>
          <h3>🔌 Integrations</h3>
          <p style={{ fontSize: '0.9rem', color: '#a1a1aa', marginBottom: '1rem' }}>
            Enable or disable integrations. Only enabled integrations will be shown below.
          </p>
          
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '0.75rem',
            marginBottom: '1.5rem',
            padding: '1rem',
            backgroundColor: '#18181b',
            borderRadius: '8px',
            border: '1px solid #3f3f46'
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={enabledIntegrations.googleCalendar}
                onChange={(e) => setEnabledIntegrations({ ...enabledIntegrations, googleCalendar: e.target.checked })}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.95rem', color: '#e5e5e7' }}>📅 Google Calendar</span>
            </label>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={enabledIntegrations.microsoftPlanner}
                onChange={(e) => setEnabledIntegrations({ ...enabledIntegrations, microsoftPlanner: e.target.checked })}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.95rem', color: '#e5e5e7' }}>📋 Microsoft Planner/To Do</span>
            </label>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={enabledIntegrations.jira}
                onChange={(e) => setEnabledIntegrations({ ...enabledIntegrations, jira: e.target.checked })}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.95rem', color: '#e5e5e7' }}>🎯 Jira</span>
            </label>
          </div>
        </div>

        {enabledIntegrations.googleCalendar && (
        <div style={{ marginBottom: '2rem' }}>
          <h3>📅 Calendar Integration</h3>
          
          <div style={{ 
            backgroundColor: '#18181b', 
            border: '2px solid #3f3f46', 
            borderRadius: '12px', 
            padding: '1.5rem',
            marginBottom: '1.5rem'
          }}>
            <h4 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: '1.5rem', marginRight: '0.5rem' }}>🗓️</span>
              Google Calendar (Recommended)
            </h4>
            
            {checkingGoogle ? (
              <p style={{ color: '#a1a1aa' }}>Checking connection status...</p>
            ) : googleConnected ? (
              <div>
                <div style={{ 
                  backgroundColor: '#e5ffe5', 
                  color: '#00a000',
                  padding: '1rem',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <span>
                    <strong>✓ Connected</strong> - Calendar events will be created automatically
                  </span>
                  <button 
                    onClick={handleGoogleDisconnect}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#ff4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.9rem'
                    }}
                  >
                    Disconnect
                  </button>
                </div>
                <p style={{ fontSize: '0.85rem', color: '#a1a1aa', marginBottom: '1rem' }}>
                  Commitments with deadlines will automatically create calendar events. Events sync across all your devices.
                </p>
                
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
                  Calendar ID (Optional)
                </label>
                <input
                  type="text"
                  value={config.googleCalendarId}
                  onChange={(e) => handleChange('googleCalendarId', e.target.value)}
                  placeholder="primary (default) or specific calendar ID"
                />
                <p style={{ fontSize: '0.85rem', color: '#a1a1aa', marginTop: '0.5rem' }}>
                  Leave blank to use your primary calendar. To find calendar IDs: <a href="https://calendar.google.com/calendar/u/0/r/settings" target="_blank" rel="noopener noreferrer">Calendar Settings</a> → Select calendar → Scroll to "Integrate calendar"
                </p>
              </div>
            ) : (
              <div>
                <p style={{ color: '#a1a1aa', marginBottom: '1rem', lineHeight: '1.6' }}>
                  Connect your Google Calendar to automatically create events for tasks with deadlines.
                  One-click setup with OAuth.
                </p>
                
                {!config.googleClientId || !config.googleClientSecret ? (
                  <div style={{ marginBottom: '1rem' }}>
                    <p style={{ fontSize: '0.9rem', color: '#fbbf24', marginBottom: '1rem' }}>
                      ⚠️ Setup required: Add your Google OAuth credentials below, then click Connect
                    </p>
                    
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
                      Google Client ID
                    </label>
                    <input
                      type="text"
                      value={config.googleClientId}
                      onChange={(e) => handleChange('googleClientId', e.target.value)}
                      placeholder="123456789-xxxxxxxx.apps.googleusercontent.com"
                      style={{ marginBottom: '1rem' }}
                    />
                    
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
                      Google Client Secret
                    </label>
                    <input
                      type="password"
                      value={config.googleClientSecret}
                      onChange={(e) => handleChange('googleClientSecret', e.target.value)}
                      placeholder="GOCSPX-xxxxxxxx"
                      style={{ marginBottom: '1rem' }}
                    />
                    {config.googleClientSecret.includes('•') && (
                      <p style={{ fontSize: '0.85rem', color: '#22c55e', marginTop: '-0.5rem', marginBottom: '1rem' }}>
                        ✓ Client secret is configured
                      </p>
                    )}
                    
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
                      Redirect URI (Optional)
                    </label>
                    <input
                      type="text"
                      value={config.googleRedirectUri}
                      onChange={(e) => handleChange('googleRedirectUri', e.target.value)}
                      placeholder="https://aicos.yourdomain.com/api/calendar/google/callback"
                    />
                    <p style={{ fontSize: '0.85rem', color: '#a1a1aa', marginTop: '0.5rem' }}>
                      Only needed if using SWAG/reverse proxy. Leave blank for local use.
                    </p>
                    
                    <details style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#a1a1aa' }}>
                      <summary style={{ cursor: 'pointer', marginBottom: '0.5rem' }}>
                        How to get Google OAuth credentials
                      </summary>
                      <ol style={{ marginLeft: '1.5rem', lineHeight: '1.8' }}>
                        <li>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">Google Cloud Console</a></li>
                        <li>Create a new project or select existing</li>
                        <li>Enable Google Calendar API</li>
                        <li>Create OAuth 2.0 Client ID (Web application)</li>
                        <li>Add authorized redirect URI:
                          <ul style={{ marginTop: '0.25rem', listStyleType: 'circle' }}>
                            <li>Local: <code style={{ fontSize: '0.8rem' }}>http://localhost:3001/api/calendar/google/callback</code></li>
                            <li>SWAG: <code style={{ fontSize: '0.8rem' }}>https://aicos.yourdomain.com/api/calendar/google/callback</code></li>
                          </ul>
                        </li>
                        <li>Copy Client ID and Client Secret here</li>
                        <li>If using SWAG, also paste your full redirect URI in the field above</li>
                      </ol>
                    </details>
                  </div>
                ) : (
                  <button 
                    onClick={handleGoogleConnect}
                    style={{
                      padding: '0.75rem 1.5rem',
                      backgroundColor: '#4285f4',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    <span style={{ fontSize: '1.2rem' }}>🔗</span>
                    Connect Google Calendar
                  </button>
                )}
              </div>
            )}
          </div>

        </div>
        )}

        {enabledIntegrations.microsoftPlanner && (
        <div style={{ marginBottom: '2rem' }}>
          <h3>📋 Microsoft Planner/To Do Integration</h3>
          
          <div style={{ 
            backgroundColor: '#18181b', 
            border: '2px solid #3f3f46', 
            borderRadius: '12px', 
            padding: '1.5rem',
            marginBottom: '1.5rem'
          }}>
            <h4 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: '1.5rem', marginRight: '0.5rem' }}>📋</span>
              Microsoft Planner (Recommended)
            </h4>
            
            {checkingMicrosoft ? (
              <p style={{ color: '#a1a1aa' }}>Checking connection status...</p>
            ) : microsoftConnected ? (
              <div>
                <div style={{ 
                  backgroundColor: '#e5ffe5', 
                  color: '#00a000',
                  padding: '1rem',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <span>
                    <strong>✓ Connected</strong> - Tasks will be created automatically in Microsoft To Do
                  </span>
                  <button 
                    onClick={handleMicrosoftDisconnect}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#ff4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.9rem'
                    }}
                  >
                    Disconnect
                  </button>
                </div>
                <p style={{ fontSize: '0.85rem', color: '#a1a1aa', marginBottom: '1rem' }}>
                  Tasks with deadlines will automatically create Microsoft To Do tasks. Tasks sync across all your devices.
                </p>
                
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
                  Task List (Optional)
                </label>
                {loadingTaskLists ? (
                  <p style={{ fontSize: '0.85rem', color: '#a1a1aa' }}>Loading task lists...</p>
                ) : microsoftTaskLists.length > 0 ? (
                  <select
                    value={config.microsoftTaskListId || ''}
                    onChange={(e) => handleChange('microsoftTaskListId', e.target.value)}
                    style={{ 
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #3f3f46',
                      borderRadius: '8px',
                      fontSize: '1rem',
                      fontFamily: 'inherit',
                      marginBottom: '1rem',
                      backgroundColor: '#18181b',
                      color: '#e5e5e7'
                    }}
                  >
                    <option value="">Default (My Tasks)</option>
                    {microsoftTaskLists.map(list => (
                      <option key={list.id} value={list.id}>
                        {list.displayName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={config.microsoftTaskListId || ''}
                    onChange={(e) => handleChange('microsoftTaskListId', e.target.value)}
                    placeholder="Leave blank for default (My Tasks)"
                    style={{ marginBottom: '1rem' }}
                  />
                )}
                <p style={{ fontSize: '0.85rem', color: '#a1a1aa', marginTop: '-0.5rem' }}>
                  Select which Microsoft To Do list to sync tasks to. Leave blank to use "My Tasks" (default).
                </p>
                <button
                  onClick={loadMicrosoftTaskLists}
                  disabled={loadingTaskLists}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#3f3f46',
                    color: '#e5e5e7',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    marginBottom: '1rem'
                  }}
                >
                  {loadingTaskLists ? 'Loading...' : '🔄 Refresh Task Lists'}
                </button>
              </div>
            ) : (
              <div>
                <p style={{ color: '#a1a1aa', marginBottom: '1rem', lineHeight: '1.6' }}>
                  Connect your Microsoft Planner/To Do to automatically create tasks for commitments with deadlines.
                  One-click setup with OAuth.
                </p>
                
                {!config.microsoftClientId || !config.microsoftClientSecret || !config.microsoftTenantId ? (
                  <div style={{ marginBottom: '1rem' }}>
                    <p style={{ fontSize: '0.9rem', color: '#fbbf24', marginBottom: '1rem' }}>
                      ⚠️ Setup required: Add your Azure app registration details below, then click Connect
                    </p>
                    
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
                      Azure Tenant ID
                    </label>
                    <input
                      type="text"
                      value={config.microsoftTenantId}
                      onChange={(e) => handleChange('microsoftTenantId', e.target.value)}
                      placeholder="12345678-1234-1234-1234-123456789abc"
                      style={{ marginBottom: '1rem' }}
                    />
                    
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
                      Azure Client ID (Application ID)
                    </label>
                    <input
                      type="text"
                      value={config.microsoftClientId}
                      onChange={(e) => handleChange('microsoftClientId', e.target.value)}
                      placeholder="87654321-4321-4321-4321-cba987654321"
                      style={{ marginBottom: '1rem' }}
                    />
                    
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
                      Azure Client Secret
                    </label>
                    <input
                      type="password"
                      value={config.microsoftClientSecret}
                      onChange={(e) => handleChange('microsoftClientSecret', e.target.value)}
                      placeholder="Your client secret value"
                      style={{ marginBottom: '1rem' }}
                    />
                    {config.microsoftClientSecret.includes('•') && (
                      <p style={{ fontSize: '0.85rem', color: '#22c55e', marginTop: '-0.5rem', marginBottom: '1rem' }}>
                        ✓ Client secret is configured
                      </p>
                    )}
                    
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
                      Redirect URI (Optional)
                    </label>
                    <input
                      type="text"
                      value={config.microsoftRedirectUri}
                      onChange={(e) => handleChange('microsoftRedirectUri', e.target.value)}
                      placeholder="https://aicos.yourdomain.com/api/planner/microsoft/callback"
                    />
                    <p style={{ fontSize: '0.85rem', color: '#a1a1aa', marginTop: '0.5rem' }}>
                      Only needed if using SWAG/reverse proxy. Leave blank for local use.
                    </p>
                    
                    <details style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#a1a1aa' }}>
                      <summary style={{ cursor: 'pointer', marginBottom: '0.5rem' }}>
                        How to get Azure app registration details
                      </summary>
                      <ol style={{ marginLeft: '1.5rem', lineHeight: '1.8' }}>
                        <li>Go to <a href="https://portal.azure.com" target="_blank" rel="noopener noreferrer">Azure Portal</a></li>
                        <li>Navigate to <strong>Azure Active Directory</strong> → <strong>App registrations</strong></li>
                        <li>Click <strong>+ New registration</strong></li>
                        <li>Fill in:
                          <ul style={{ marginTop: '0.25rem', listStyleType: 'circle' }}>
                            <li>Name: <code style={{ fontSize: '0.8rem' }}>AI Chief of Staff</code></li>
                            <li>Supported account types: <strong>Personal Microsoft accounts</strong></li>
                            <li>Redirect URI: <code style={{ fontSize: '0.8rem' }}>http://localhost:3001/api/planner/microsoft/callback</code></li>
                          </ul>
                        </li>
                        <li>Go to <strong>API permissions</strong> → Add:
                          <ul style={{ marginTop: '0.25rem', listStyleType: 'circle' }}>
                            <li><code style={{ fontSize: '0.8rem' }}>Tasks.ReadWrite</code> (Microsoft To Do)</li>
                            <li><code style={{ fontSize: '0.8rem' }}>User.Read</code></li>
                          </ul>
                        </li>
                        <li>Go to <strong>Certificates & secrets</strong> → Create new client secret</li>
                        <li>Copy <strong>Tenant ID</strong> from Azure AD Overview</li>
                        <li>Copy <strong>Application (Client) ID</strong> from App Registration Overview</li>
                        <li>Copy <strong>Client Secret Value</strong> (save immediately, you won't see it again)</li>
                        <li>See <code style={{ fontSize: '0.8rem' }}>MICROSOFT-PLANNER-SETUP.md</code> for detailed instructions</li>
                      </ol>
                    </details>
                  </div>
                ) : (
                  <button 
                    onClick={handleMicrosoftConnect}
                    style={{
                      padding: '0.75rem 1.5rem',
                      backgroundColor: '#0078d4',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    <span style={{ fontSize: '1.2rem' }}>🔗</span>
                    Connect Microsoft Planner
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        )}

        {enabledIntegrations.jira && (
        <div style={{ marginBottom: '2rem' }}>
          <h3>🎯 Jira Integration</h3>
          
          <div style={{ 
            backgroundColor: '#18181b', 
            border: '2px solid #3f3f46', 
            borderRadius: '12px', 
            padding: '1.5rem',
            marginBottom: '1.5rem'
          }}>
            <h4 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: '1.5rem', marginRight: '0.5rem' }}>🎯</span>
              Jira (Cloud or On-Prem)
            </h4>
            
            {checkingJira ? (
              <p style={{ color: '#a1a1aa' }}>Checking connection status...</p>
            ) : jiraConnected ? (
              <div>
                <div style={{ 
                  backgroundColor: '#e5ffe5', 
                  color: '#00a000',
                  padding: '1rem',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <span>
                    <strong>✓ Connected</strong> - Tasks will be created automatically in Jira
                  </span>
                  <button 
                    onClick={handleJiraDisconnect}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#ff4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.9rem'
                    }}
                  >
                    Disconnect
                  </button>
                </div>
                <p style={{ fontSize: '0.85rem', color: '#a1a1aa', marginBottom: '1rem' }}>
                  Tasks with deadlines will automatically create Jira issues (stories/tasks). Supports both Jira Cloud and on-premise.
                </p>
              </div>
            ) : (
              <div>
                <p style={{ color: '#a1a1aa', marginBottom: '1rem', lineHeight: '1.6' }}>
                  Connect your Jira instance to automatically create issues for commitments with deadlines.
                  Supports both Jira Cloud (atlassian.net) and on-premise Jira servers.
                </p>
                
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
                  Jira Base URL
                </label>
                <input
                  type="url"
                  value={config.jiraBaseUrl}
                  onChange={(e) => handleChange('jiraBaseUrl', e.target.value)}
                  placeholder="https://yourcompany.atlassian.net or https://jira.yourcompany.com"
                  style={{ marginBottom: '1rem' }}
                />
                <p style={{ fontSize: '0.85rem', color: '#a1a1aa', marginTop: '-0.5rem', marginBottom: '1rem' }}>
                  For Jira Cloud: https://yourcompany.atlassian.net<br />
                  For on-premise: https://jira.yourcompany.com
                </p>
                
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
                  Email / Username
                </label>
                <input
                  type="email"
                  value={config.jiraEmail}
                  onChange={(e) => handleChange('jiraEmail', e.target.value)}
                  placeholder="your.email@example.com"
                  style={{ 
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #3f3f46',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    fontFamily: 'inherit',
                    marginBottom: '1rem',
                    backgroundColor: '#18181b',
                    color: '#e5e5e7'
                  }}
                />
                
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
                  API Token
                </label>
                <input
                  type="password"
                  value={config.jiraApiToken}
                  onChange={(e) => handleChange('jiraApiToken', e.target.value)}
                  placeholder="Your Jira API token"
                  style={{ marginBottom: '1rem' }}
                />
                {config.jiraApiToken.includes('•') && (
                  <p style={{ fontSize: '0.85rem', color: '#22c55e', marginTop: '-0.5rem', marginBottom: '1rem' }}>
                    ✓ API token is configured
                  </p>
                )}
                <p style={{ fontSize: '0.85rem', color: '#a1a1aa', marginTop: config.jiraApiToken.includes('•') ? '0' : '-0.5rem', marginBottom: '1rem' }}>
                  Create an API token: <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer">Jira Cloud</a> or your on-premise Jira → Account Settings → Security → API Tokens
                </p>
                
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
                  Project Key
                </label>
                <input
                  type="text"
                  value={config.jiraProjectKey}
                  onChange={(e) => handleChange('jiraProjectKey', e.target.value.toUpperCase())}
                  placeholder="PROJ"
                  style={{ marginBottom: '1rem' }}
                />
                <p style={{ fontSize: '0.85rem', color: '#a1a1aa', marginTop: '-0.5rem', marginBottom: '1rem' }}>
                  The project key where issues will be created (e.g., PROJ, DEV, TASK)
                </p>
                
                <p style={{ fontSize: '0.85rem', color: '#22c55e', marginTop: '1rem', padding: '0.75rem', backgroundColor: '#1a2e1a', borderRadius: '6px' }}>
                  💡 After saving these credentials, Jira will automatically connect. Issues will be created as Stories (for commitments) or Tasks (for action items).
                </p>
              </div>
            )}
          </div>
        </div>
        )}

        <details style={{ marginBottom: '2rem' }}>
          <summary style={{ 
            cursor: 'pointer', 
            fontWeight: 'bold',
            padding: '0.5rem',
            color: '#e5e5e7',
            fontSize: '1.125rem',
            marginBottom: '0.5rem'
          }}>
            💾 Database Configuration
          </summary>
          <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#18181b', borderRadius: '8px' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
            Database Type
          </label>
          <select
            value={config.dbType}
            onChange={(e) => handleChange('dbType', e.target.value)}
            style={{ 
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #3f3f46',
              borderRadius: '8px',
              fontSize: '1rem',
              fontFamily: 'inherit',
              marginBottom: '1rem',
              backgroundColor: '#18181b',
              color: '#e5e5e7'
            }}
          >
            <option value="sqlite">SQLite (Default)</option>
            <option value="postgres">PostgreSQL</option>
          </select>

          {config.dbType === 'postgres' && (
            <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#18181b', borderRadius: '8px', border: '1px solid #3f3f46' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
                PostgreSQL Host
              </label>
              <input
                type="text"
                value={config.postgresHost}
                onChange={(e) => handleChange('postgresHost', e.target.value)}
                placeholder="localhost"
              />

              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
                Port
              </label>
              <input
                type="text"
                value={config.postgresPort}
                onChange={(e) => handleChange('postgresPort', e.target.value)}
                placeholder="5432"
              />

              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
                Database Name
              </label>
              <input
                type="text"
                value={config.postgresDb}
                onChange={(e) => handleChange('postgresDb', e.target.value)}
                placeholder="ai_chief_of_staff"
              />

              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
                Username
              </label>
              <input
                type="text"
                value={config.postgresUser}
                onChange={(e) => handleChange('postgresUser', e.target.value)}
                placeholder="postgres"
              />

              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
                Password
              </label>
              <input
                type="password"
                value={config.postgresPassword}
                onChange={(e) => handleChange('postgresPassword', e.target.value)}
                placeholder="••••••••"
                style={{ marginBottom: 0 }}
              />
              {config.postgresPassword.includes('•') && (
                <p style={{ fontSize: '0.85rem', color: '#22c55e', marginTop: '0.5rem' }}>
                  ✓ Password is configured (change to update)
                </p>
              )}
            </div>
          )}
          </div>
        </details>

        <button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
        
        <p style={{ fontSize: '0.85rem', color: '#a1a1aa', marginTop: '1rem' }}>
          💾 All settings are saved to <code>/app/data/config.json</code> and the database, and persist across container restarts.
        </p>
      </div>

      {/* Notifications Card */}
      <div className="card">
        <h2>🔔 Push Notifications</h2>
        <p style={{ color: '#a1a1aa', marginBottom: '1.5rem' }}>
          Enable push notifications to receive task reminders, overdue alerts, and sync notifications on this device.
        </p>
        
        <button 
          onClick={() => {
            if ('Notification' in window) {
              if (Notification.permission === 'granted') {
                alert('Notifications are already enabled for this device!');
              } else {
                Notification.requestPermission().then(async (permission) => {
                  if (permission === 'granted') {
                    setNotificationsEnabled(true); // Update state immediately
                    try {
                      const registration = await navigator.serviceWorker.ready;
                      const response = await fetch('/api/notifications/vapid-public-key');
                      if (response.ok) {
                        const { publicKey } = await response.json();
                        const urlBase64ToUint8Array = (base64String) => {
                          const padding = '='.repeat((4 - base64String.length % 4) % 4);
                          const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
                          const rawData = window.atob(base64);
                          const outputArray = new Uint8Array(rawData.length);
                          for (let i = 0; i < rawData.length; ++i) {
                            outputArray[i] = rawData.charCodeAt(i);
                          }
                          return outputArray;
                        };
                        const subscription = await registration.pushManager.subscribe({
                          userVisibleOnly: true,
                          applicationServerKey: urlBase64ToUint8Array(publicKey)
                        });
                        await fetch('/api/notifications/subscribe', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ subscription })
                        });
                        alert('✅ Notifications enabled successfully!');
                      } else {
                        alert('⚠️ Notifications enabled, but server needs VAPID keys configured.');
                      }
                    } catch (error) {
                      console.error('Error:', error);
                      alert('⚠️ Notifications enabled, but push subscription failed.');
                    }
                  }
                });
              }
            } else {
              alert('❌ This browser does not support notifications');
            }
          }}
          style={{ marginBottom: '1rem' }}
        >
          {notificationsEnabled ? '✅ Notifications Enabled' : '🔔 Enable Notifications'}
        </button>

        <button 
          onClick={async () => {
            try {
              await fetch('/api/notifications/test', { method: 'POST' });
              alert('Test notification sent! Check your notifications.');
            } catch (error) {
              alert('Failed to send test notification. Server may need VAPID keys configured.');
            }
          }}
          className="secondary"
        >
          🧪 Send Test Notification
        </button>

        <div style={{ 
          marginTop: '1.5rem', 
          padding: '1rem', 
          backgroundColor: '#1e3a5f', 
          borderRadius: '8px',
          border: '1px solid #2563eb' 
        }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: '#60a5fa' }}>📋 Notification Types</h3>
          <ul style={{ color: '#bfdbfe', fontSize: '0.9rem', lineHeight: '1.8', paddingLeft: '1.5rem' }}>
            <li>Task reminders 24 hours before deadline</li>
            <li>Daily overdue task alerts</li>
            <li>Sync success notifications</li>
          </ul>
          <p style={{ fontSize: '0.85rem', color: '#bfdbfe', marginTop: '1rem' }}>
            <strong>Server setup:</strong> VAPID keys required. See README for instructions.
          </p>
        </div>
      </div>

      {/* AI Prompts Card */}
      <div className="card">
        <h2>🤖 AI Prompts</h2>
        <p style={{ color: '#a1a1aa', marginBottom: '1.5rem' }}>
          Customize how AI extracts tasks, generates descriptions, and creates reports. Changes take effect immediately.
        </p>
        
        {loadingPrompts ? (
          <p style={{ color: '#a1a1aa' }}>Loading prompts...</p>
        ) : prompts.length === 0 ? (
          <div style={{ 
            padding: '2rem', 
            backgroundColor: '#18181b', 
            borderRadius: '8px',
            border: '1px solid #3f3f46',
            textAlign: 'center'
          }}>
            <p style={{ color: '#fbbf24', fontSize: '1.2rem', marginBottom: '1rem' }}>⚠️ No prompts found</p>
            <p style={{ color: '#a1a1aa', marginBottom: '1rem' }}>
              The prompts table may be empty. Restart the container to initialize default prompts.
            </p>
            <button 
              onClick={() => {
                setLoadingPrompts(true);
                loadPrompts();
              }}
              style={{ 
                padding: '0.75rem 1.5rem',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '1rem'
              }}
            >
              🔄 Retry Loading
            </button>
          </div>
        ) : (
          prompts.map((prompt) => (
            <details 
              key={prompt.key}
              style={{ 
                marginBottom: '1rem',
                padding: '1rem',
                backgroundColor: '#18181b',
                borderRadius: '8px',
                border: '1px solid #3f3f46'
              }}
            >
              <summary style={{ 
                cursor: 'pointer', 
                fontWeight: 'bold',
                padding: '0.5rem',
                color: '#fff',
                fontSize: '1rem'
              }}>
                {prompt.name}
              </summary>
              
              <div style={{ marginTop: '1rem' }}>
                <p style={{ fontSize: '0.9rem', color: '#a1a1aa', marginBottom: '1rem' }}>
                  {prompt.description}
                </p>
                
                {editingPrompt === prompt.key ? (
                  <div>
                    <textarea
                      value={prompt.prompt}
                      onChange={(e) => {
                        const newPrompts = prompts.map(p => 
                          p.key === prompt.key ? { ...p, prompt: e.target.value } : p
                        );
                        setPrompts(newPrompts);
                      }}
                      style={{
                        width: '100%',
                        minHeight: '300px',
                        padding: '1rem',
                        backgroundColor: '#09090b',
                        color: '#fff',
                        border: '1px solid #3f3f46',
                        borderRadius: '8px',
                        fontFamily: 'monospace',
                        fontSize: '0.9rem',
                        marginBottom: '1rem'
                      }}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button 
                        onClick={() => updatePrompt(prompt.key, prompt.prompt)}
                        style={{ 
                          padding: '0.5rem 1rem',
                          backgroundColor: '#22c55e',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        ✅ Save
                      </button>
                      <button 
                        onClick={() => {
                          setEditingPrompt(null);
                          loadPrompts(); // Reload to discard changes
                        }}
                        style={{ 
                          padding: '0.5rem 1rem',
                          backgroundColor: '#6b7280',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        ❌ Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <pre style={{
                      backgroundColor: '#09090b',
                      padding: '1rem',
                      borderRadius: '8px',
                      overflow: 'auto',
                      maxHeight: '200px',
                      fontSize: '0.85rem',
                      color: '#a1a1aa',
                      marginBottom: '1rem'
                    }}>
                      {prompt.prompt}
                    </pre>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button 
                        onClick={() => setEditingPrompt(prompt.key)}
                        style={{ 
                          padding: '0.5rem 1rem',
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        ✏️ Edit
                      </button>
                      <button 
                        onClick={() => resetPrompt(prompt.key)}
                        style={{ 
                          padding: '0.5rem 1rem',
                          backgroundColor: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        🔄 Reset to Default
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </details>
          ))
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>AI Services Status</h2>
          <button
            onClick={loadServicesHealth}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#3f3f46',
              color: '#e4e4e7',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.85rem'
            }}
          >
            🔄 Refresh
          </button>
        </div>
        {servicesHealth ? (
          <div style={{ 
            border: '1px solid #52525b', 
            borderRadius: '8px', 
            overflow: 'hidden',
            marginTop: '1rem'
          }}>
            <button
              onClick={() => setShowServicesHealth(!showServicesHealth)}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                backgroundColor: '#3f3f46',
                color: '#e4e4e7',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.9rem',
                fontWeight: '500'
              }}
            >
              <span>
                🤖 Microservices Health 
                <span style={{ 
                  marginLeft: '0.5rem', 
                  fontSize: '0.8rem',
                  color: servicesHealth.status === 'healthy' ? '#34c759' : '#ff9500'
                }}>
                  {servicesHealth.status === 'healthy' ? '✓ All Healthy' : '⚠ Degraded'}
                </span>
              </span>
              <span>{showServicesHealth ? '▼' : '▶'}</span>
            </button>
            
            {showServicesHealth && (
              <div style={{ 
                padding: '1rem', 
                backgroundColor: '#27272a',
                fontSize: '0.85rem'
              }}>
                {Object.entries(servicesHealth.services || {}).map(([name, service]) => (
                  <div key={name} style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    padding: '0.5rem 0',
                    borderBottom: '1px solid #3f3f46'
                  }}>
                    <span style={{ color: '#a1a1aa' }}>
                      {name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                    </span>
                    <span style={{ 
                      color: service.status === 'healthy' ? '#34c759' : '#ff3b30',
                      fontWeight: '500'
                    }}>
                      {service.status === 'healthy' ? '✓ Online' : '✗ Offline'}
                    </span>
                  </div>
                ))}
                <div style={{ 
                  marginTop: '0.75rem', 
                  paddingTop: '0.75rem', 
                  borderTop: '1px solid #52525b',
                  color: '#71717a',
                  fontSize: '0.75rem'
                }}>
                  Microservices provide AI-powered task analysis, voice transcription, pattern recognition, and context management.
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ marginTop: '1rem' }}>
            <p style={{ color: '#a1a1aa', marginBottom: '0.5rem' }}>
              Microservices health information unavailable. Services may not be running.
            </p>
            <button
              onClick={loadServicesHealth}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
            >
              🔄 Check Again
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h2>About</h2>
        <VersionInfo />
        <p style={{ marginTop: '1rem' }}>
          <strong>AI Chief of Staff</strong> - Your intelligent executive assistant
        </p>
        <p style={{ marginTop: '1rem', color: '#a1a1aa', lineHeight: '1.6' }}>
          This application uses Claude AI to generate daily briefs, track tasks, 
          and maintain context from your meetings and emails.
        </p>
        <ul style={{ marginTop: '1rem', color: '#a1a1aa', lineHeight: '1.8' }}>
          <li>Upload meeting transcripts to extract action items</li>
          <li>Generate AI-powered daily briefs in 10 seconds</li>
          <li>Track all tasks across a rolling context window</li>
          <li>Create calendar blocks automatically</li>
        </ul>
      </div>
      </div>
    </PullToRefresh>
  );
}

export default Configuration;
