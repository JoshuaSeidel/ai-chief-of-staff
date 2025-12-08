import React, { useState, useEffect } from 'react';
import { configAPI, intelligenceAPI, microservicesAPI } from '../services/api';
import { PullToRefresh } from './PullToRefresh';
import ProfileManagement from './ProfileManagement';
import { useProfile } from '../contexts/ProfileContext';

// Scope badge component
function ScopeBadge({ scope }) {
  if (scope === 'profile') {
    return <span className="scope-badge scope-profile" title="This setting is specific to the current profile">👤 Profile</span>;
  }
  if (scope === 'global') {
    return <span className="scope-badge scope-global" title="This setting applies to all profiles">🌐 Global</span>;
  }
  return null;
}

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
      <div className="version-box">
        <p className="version-loading">Loading version...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="version-box">
        <p className="version-error">Failed to load version: {error}</p>
      </div>
    );
  }

  if (!version) {
    return (
      <div className="version-box">
        <p className="version-loading">Version information not available</p>
      </div>
    );
  }

  return (
    <div className="version-box mb-lg mt-0">
      <p className="version-title">
        Application Version
      </p>
      <p className="version-item">
        <strong className="version-label">Frontend:</strong> <span className="version-value">{version.frontendVersion || version.version || 'Unknown'}</span>
      </p>
      <p className="version-item">
        <strong className="version-label">Backend:</strong> <span className="version-value">{version.backendVersion || version.version || 'Unknown'}</span>
      </p>
      {version.microservices && Object.keys(version.microservices).length > 0 && (
        <div className="version-divider">
          <p className="version-subtitle">
            Microservices:
          </p>
          {Object.entries(version.microservices).map(([name, ver]) => (
            <p key={name} className={ver === 'unavailable' ? 'version-dep-item version-dep-unavailable' : 'version-dep-item'}>
              <strong className="version-label">{name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}:</strong>{' '}
              <span className="text-mono">
                {ver}
              </span>
            </p>
          ))}
        </div>
      )}
      {version.buildDate && (
        <p className="version-build-date">
          <strong className="version-label">Build Date:</strong> {new Date(version.buildDate).toLocaleString()}
        </p>
      )}
    </div>
  );
}

function Configuration() {
  const { currentProfile } = useProfile();
  const [config, setConfig] = useState({
    aiProvider: 'anthropic',
    anthropicApiKey: '',
    claudeModel: 'claude-sonnet-4-5-20250929',
    openaiApiKey: '',
    openaiModel: 'gpt-4o',
    ollamaBaseUrl: 'http://localhost:11434',
    ollamaModel: 'llama3.1',
    aiMaxTokens: '4096',
    aiTemperature: '0.7',
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
    microsoftCalendarId: '',
    microsoftTaskListId: '',
    jiraBaseUrl: '',
    jiraEmail: '',
    jiraApiToken: '',
    jiraProjectKey: '',
    trelloApiKey: '',
    trelloToken: '',
    trelloBoardId: '',
    trelloListId: '',
    mondayApiToken: '',
    mondayBoardId: '',
    mondayGroupId: '',
    userNames: '',
    dbType: 'sqlite',
    postgresHost: '',
    postgresPort: '5432',
    postgresDb: '',
    postgresUser: '',
    postgresPassword: '',
    storageType: 'local',
    storagePath: '/app/data/voice-recordings',
    s3Bucket: '',
    s3Region: 'us-east-1',
    s3AccessKeyId: '',
    s3SecretAccessKey: '',
    s3Endpoint: '',
  });
  
  // Track which fields have been loaded from server (to know which ones to skip on save)
  const [loadedFields, setLoadedFields] = useState({});
  
  // Integration toggles
  const [enabledIntegrations, setEnabledIntegrations] = useState({
    googleCalendar: false,
    microsoft: false, // Combined Microsoft Calendar + Planner
    jira: false,
    trello: false,
    monday: false,
    radicale: false
  });
  
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [checkingGoogle, setCheckingGoogle] = useState(true);
  const [microsoftConnected, setMicrosoftConnected] = useState(false);
  const [checkingMicrosoft, setCheckingMicrosoft] = useState(true);
  const [jiraConnected, setJiraConnected] = useState(false);
  const [checkingJira, setCheckingJira] = useState(true);
  const [trelloConnected, setTrelloConnected] = useState(false);
  const [checkingTrello, setCheckingTrello] = useState(true);
  const [mondayConnected, setMondayConnected] = useState(false);
  const [checkingMonday, setCheckingMonday] = useState(true);
  const [trelloBoards, setTrelloBoards] = useState([]);
  const [trelloLists, setTrelloLists] = useState([]);
  const [mondayBoards, setMondayBoards] = useState([]);
  const [mondayGroups, setMondayGroups] = useState([]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [microservicesExpanded, setMicroservicesExpanded] = useState(false);
  const [notificationMaxRepeat, setNotificationMaxRepeat] = useState(3);
  const [notificationRepeatIntervalHours, setNotificationRepeatIntervalHours] = useState(24);
  const [microsoftTaskLists, setMicrosoftTaskLists] = useState([]);
  const [loadingTaskLists, setLoadingTaskLists] = useState(false);
  const [prompts, setPrompts] = useState([]);
  const [loadingPrompts, setLoadingPrompts] = useState(true);
  const [editingPrompt, setEditingPrompt] = useState(null);
  const [servicesHealth, setServicesHealth] = useState(null);
  const [showServicesHealth, setShowServicesHealth] = useState(false);
  
  // Model lists from API providers
  const [availableModels, setAvailableModels] = useState({
    anthropic: [],
    openai: [],
    ollama: []
  });
  const [loadingModels, setLoadingModels] = useState({
    anthropic: false,
    openai: false,
    ollama: false
  });

  useEffect(() => {
    loadConfig();
    loadServicesHealth();
    checkGoogleCalendarStatus();
    checkMicrosoftPlannerStatus();
    checkJiraStatus();
    checkTrelloStatus();
    checkMondayStatus();
    loadPrompts();
    
    // Load available models for all providers on mount
    loadModelsForProvider('anthropic');
    loadModelsForProvider('openai');
    loadModelsForProvider('ollama');
    
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
    
    // Load notification limits from config
    configAPI.getAll().then(config => {
      if (config.notification_max_repeat !== undefined) {
        setNotificationMaxRepeat(parseInt(config.notification_max_repeat) || 3);
      }
      if (config.notification_repeat_interval_hours !== undefined) {
        setNotificationRepeatIntervalHours(parseInt(config.notification_repeat_interval_hours) || 24);
      }
    }).catch(err => {
      console.error('Failed to load notification config:', err);
    });
    
    // Check for URL parameters (success/error messages from OAuth redirects)
    const hash = window.location.hash;
    const hashParams = new URLSearchParams(hash.split('?')[1] || '');
    const error = hashParams.get('error');
    const success = hashParams.get('success');
    const errorDetails = hashParams.get('error_details');
    
    if (success === 'microsoft_planner_connected' || success === 'microsoft_calendar_connected' || success === 'microsoft_integration_connected') {
      setMessage({ type: 'success', text: '✅ Microsoft Integration connected successfully! (Calendar + Planner)' });
      checkMicrosoftPlannerStatus(); // Refresh connection status
      // Clean up URL
      const cleanHash = hash.split('?')[0];
      window.history.replaceState({}, '', window.location.pathname + cleanHash);
    } else if (error === 'microsoft_oauth_failed') {
      setMessage({ type: 'error', text: '❌ Failed to connect Microsoft Integration. Please try again.' });
      // Clean up URL
      const cleanHash = hash.split('?')[0];
      window.history.replaceState({}, '', window.location.pathname + cleanHash);
    } else if (error === 'microsoft_oauth_access_denied') {
      setMessage({ type: 'error', text: '❌ Microsoft Integration connection was cancelled. Please try again if you want to connect.' });
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
      setMessage({ type: 'error', text: '❌ Failed to complete Microsoft Integration connection. Please check your credentials and try again.' });
      // Clean up URL
      const cleanHash = hash.split('?')[0];
      window.history.replaceState({}, '', window.location.pathname + cleanHash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  const loadServicesHealth = async () => {
    try {
      const response = await microservicesAPI.checkHealth();
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
        aiTemperature: appData.aiTemperature !== undefined ? appData.aiTemperature : '0.7',
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
        microsoftCalendarId: appData.microsoftCalendarId || '',
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

  const loadModelsForProvider = async (provider) => {
    if (!provider) return;
    
    setLoadingModels(prev => ({ ...prev, [provider]: true }));
    
    try {
      const response = await configAPI.getModels(provider);
      const models = response.data.models || [];
      
      setAvailableModels(prev => ({
        ...prev,
        [provider]: models
      }));
      
      console.log(`Loaded ${models.length} models for ${provider}:`, models);
    } catch (err) {
      console.error(`Failed to load ${provider} models:`, err);
      setAvailableModels(prev => ({
        ...prev,
        [provider]: []
      }));
    } finally {
      setLoadingModels(prev => ({ ...prev, [provider]: false }));
    }
  };

  // Helper to render model dropdown with refresh button
  const renderModelSelector = (provider, currentModel, onModelChange) => {
    const supportsRefresh = ['anthropic', 'openai', 'ollama'].includes(provider);
    
    return (
      <div className="model-selector-container">
        <select
          value={currentModel}
          onChange={(e) => onModelChange(e.target.value)}
          className="model-dropdown"
          disabled={loadingModels[provider]}
        >
          {provider === 'anthropic' && (
            <>
              {availableModels.anthropic.length > 0 ? (
                availableModels.anthropic.map(model => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))
              ) : (
                <>
                  <option value="claude-sonnet-4-5-20250929">Claude Sonnet 4.5 (Latest)</option>
                  <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                  <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                  <option value="claude-3-opus-20240229">Claude 3 Opus</option>
                </>
              )}
            </>
          )}
          {provider === 'openai' && (
            <>
              {availableModels.openai.length > 0 ? (
                availableModels.openai.map(model => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))
              ) : (
                <>
                  <option value="gpt-4o">GPT-4o</option>
                  <option value="gpt-4-turbo">GPT-4 Turbo</option>
                  <option value="gpt-4">GPT-4</option>
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                  <option value="whisper-1">Whisper-1</option>
                </>
              )}
            </>
          )}
          {provider === 'ollama' && (
            <>
              {availableModels.ollama.length > 0 ? (
                availableModels.ollama.map(model => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))
              ) : (
                <>
                  <option value="mistral:latest">Mistral Latest</option>
                  <option value="llama3.1:latest">Llama 3.1 Latest</option>
                  <option value="llama2:latest">Llama 2 Latest</option>
                  <option value="codellama:latest">Code Llama Latest</option>
                  <option value="whisper:latest">Whisper Latest</option>
                </>
              )}
            </>
          )}
          {provider === 'bedrock' && (
            <>
              <option value="anthropic.claude-sonnet-4-5-20250929-v1:0">Claude Sonnet 4.5</option>
              <option value="anthropic.claude-3-5-sonnet-20241022-v2:0">Claude 3.5 Sonnet</option>
            </>
          )}
        </select>
        {supportsRefresh && (
          <button
            type="button"
            onClick={() => loadModelsForProvider(provider)}
            disabled={loadingModels[provider]}
            title="Refresh model list"
            className="model-refresh-btn"
          >
            {loadingModels[provider] ? '⏳' : '🔄'}
          </button>
        )}
      </div>
    );
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
      // Check Microsoft status (shared token for Calendar and Planner)
      const response = await fetch('/api/planner/microsoft/status');
      const data = await response.json();
      setMicrosoftConnected(data.connected);
      
      // If connected, load available task lists and enable integration
      if (data.connected) {
        loadMicrosoftTaskLists();
        setEnabledIntegrations(prev => ({ ...prev, microsoft: true }));
      }
    } catch (err) {
      console.error('Failed to check Microsoft status:', err);
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

  const checkTrelloStatus = async () => {
    try {
      setCheckingTrello(true);
      const response = await fetch('/api/integrations/tasks/trello/status');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setTrelloConnected(data.connected || false);
      const hasConfig = config.trelloApiKey && config.trelloToken && config.trelloBoardId;
      if (hasConfig || data.connected) {
        setEnabledIntegrations(prev => ({ ...prev, trello: true }));
      }
    } catch (err) {
      console.error('Failed to check Trello status:', err);
      setTrelloConnected(false);
    } finally {
      setCheckingTrello(false);
    }
  };

  const handleTrelloDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect Trello? This will not delete any existing cards.')) {
      return;
    }
    try {
      const response = await fetch('/api/integrations/tasks/trello/disconnect', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        setMessage({ type: 'success', text: '✅ Trello disconnected successfully' });
        await checkTrelloStatus();
      } else {
        setMessage({ type: 'error', text: `❌ Failed to disconnect: ${data.message || 'Unknown error'}` });
      }
    } catch (err) {
      console.error('Failed to disconnect Trello:', err);
      setMessage({ type: 'error', text: `❌ Error disconnecting: ${err.message}` });
    }
  };

  const loadTrelloBoards = async () => {
    try {
      const response = await fetch('/api/integrations/tasks/trello/boards');
      if (!response.ok) throw new Error('Failed to fetch boards');
      const data = await response.json();
      setTrelloBoards(data.boards || []);
    } catch (err) {
      console.error('Failed to load Trello boards:', err);
      setMessage({ type: 'error', text: `❌ Failed to load boards: ${err.message}` });
    }
  };

  const loadTrelloLists = async (boardId) => {
    try {
      const response = await fetch(`/api/integrations/tasks/trello/boards/${boardId}/lists`);
      if (!response.ok) throw new Error('Failed to fetch lists');
      const data = await response.json();
      setTrelloLists(data.lists || []);
    } catch (err) {
      console.error('Failed to load Trello lists:', err);
      setMessage({ type: 'error', text: `❌ Failed to load lists: ${err.message}` });
    }
  };

  const checkMondayStatus = async () => {
    try {
      setCheckingMonday(true);
      const response = await fetch('/api/integrations/tasks/monday/status');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setMondayConnected(data.connected || false);
      const hasConfig = config.mondayApiToken && config.mondayBoardId;
      if (hasConfig || data.connected) {
        setEnabledIntegrations(prev => ({ ...prev, monday: true }));
      }
    } catch (err) {
      console.error('Failed to check Monday status:', err);
      setMondayConnected(false);
    } finally {
      setCheckingMonday(false);
    }
  };

  const handleMondayDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect Monday.com? This will not delete any existing items.')) {
      return;
    }
    try {
      const response = await fetch('/api/integrations/tasks/monday/disconnect', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        setMessage({ type: 'success', text: '✅ Monday.com disconnected successfully' });
        await checkMondayStatus();
      } else {
        setMessage({ type: 'error', text: `❌ Failed to disconnect: ${data.message || 'Unknown error'}` });
      }
    } catch (err) {
      console.error('Failed to disconnect Monday.com:', err);
      setMessage({ type: 'error', text: `❌ Error disconnecting: ${err.message}` });
    }
  };

  const loadMondayBoards = async () => {
    try {
      const response = await fetch('/api/integrations/tasks/monday/boards');
      if (!response.ok) throw new Error('Failed to fetch boards');
      const data = await response.json();
      setMondayBoards(data.boards || []);
    } catch (err) {
      console.error('Failed to load Monday boards:', err);
      setMessage({ type: 'error', text: `❌ Failed to load boards: ${err.message}` });
    }
  };

  const loadMondayGroups = async (boardId) => {
    try {
      const response = await fetch(`/api/integrations/tasks/monday/boards/${boardId}/groups`);
      if (!response.ok) throw new Error('Failed to fetch groups');
      const data = await response.json();
      setMondayGroups(data.groups || []);
    } catch (err) {
      console.error('Failed to load Monday groups:', err);
      setMessage({ type: 'error', text: `❌ Failed to load groups: ${err.message}` });
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
      // Use planner route for auth (it uses microsoft-calendar service which includes both scopes)
      const response = await fetch('/api/planner/microsoft/auth');
      const data = await response.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to initiate Microsoft Integration connection' });
    }
  };

  const handleMicrosoftDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect Microsoft Integration? This will disconnect both Calendar and Planner.')) {
      return;
    }
    
    try {
      // Disconnect from planner route (removes shared token)
      await fetch('/api/planner/microsoft/disconnect', { method: 'POST' });
      setMicrosoftConnected(false);
      setEnabledIntegrations(prev => ({ ...prev, microsoft: false }));
      setMessage({ type: 'success', text: 'Microsoft Integration disconnected successfully (Calendar + Planner)' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to disconnect Microsoft Integration' });
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
      appUpdates.aiTemperature = config.aiTemperature !== undefined ? config.aiTemperature : '0.7';
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
      if (config.microsoftCalendarId) {
        appUpdates.microsoftCalendarId = config.microsoftCalendarId;
      } else if (!config.microsoftCalendarId && loadedFields.microsoftCalendarId) {
        appUpdates.microsoftCalendarId = '';
      }
      if (config.googleCalendarId) {
        appUpdates.googleCalendarId = config.googleCalendarId;
      }
      if (config.userNames) {
        appUpdates.userNames = config.userNames;
      }
      
      // Save integration toggles
      appUpdates.googleCalendarEnabled = enabledIntegrations.googleCalendar;
      appUpdates.microsoftEnabled = enabledIntegrations.microsoft;
      appUpdates.jiraEnabled = enabledIntegrations.jira;
      
      // AI Model Configuration (per-service)
      if (config.aiIntelligenceProvider) appUpdates.aiIntelligenceProvider = config.aiIntelligenceProvider;
      if (config.aiIntelligenceModel) appUpdates.aiIntelligenceModel = config.aiIntelligenceModel;
      if (config.voiceProcessorProvider) appUpdates.voiceProcessorProvider = config.voiceProcessorProvider;
      if (config.voiceProcessorModel) appUpdates.voiceProcessorModel = config.voiceProcessorModel;
      if (config.patternRecognitionProvider) appUpdates.patternRecognitionProvider = config.patternRecognitionProvider;
      if (config.patternRecognitionModel) appUpdates.patternRecognitionModel = config.patternRecognitionModel;
      if (config.nlParserProvider) appUpdates.nlParserProvider = config.nlParserProvider;
      if (config.nlParserModel) appUpdates.nlParserModel = config.nlParserModel;
      
      // AI API Keys
      if (config.anthropicApiKey && !config.anthropicApiKey.includes('•')) {
        appUpdates.anthropicApiKey = config.anthropicApiKey;
      }
      if (config.openaiApiKey && !config.openaiApiKey.includes('•')) {
        appUpdates.openaiApiKey = config.openaiApiKey;
      }
      if (config.ollamaBaseUrl) appUpdates.ollamaBaseUrl = config.ollamaBaseUrl;
      if (config.awsAccessKeyId && !config.awsAccessKeyId.includes('•')) {
        appUpdates.awsAccessKeyId = config.awsAccessKeyId;
      }
      if (config.awsSecretAccessKey && !config.awsSecretAccessKey.includes('•')) {
        appUpdates.awsSecretAccessKey = config.awsSecretAccessKey;
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
      
      // Radicale CalDAV configuration
      appUpdates.radicaleEnabled = enabledIntegrations.radicale;
      if (config.radicaleUrl) {
        appUpdates.radicaleUrl = config.radicaleUrl;
      }
      if (config.radicaleUsername) {
        appUpdates.radicaleUsername = config.radicaleUsername;
      }
      if (config.radicalePassword && !config.radicalePassword.includes('•')) {
        appUpdates.radicalePassword = config.radicalePassword;
      } else if (!config.radicalePassword && loadedFields.radicalePassword) {
        appUpdates.radicalePassword = '';
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
        <ProfileManagement />
      </div>

      {/* PROFILE-SPECIFIC SETTINGS CARD */}
      <div className="card">
        <h2>👤 Profile-Specific Settings</h2>
        <p className="text-muted-mb-lg">
          These settings are isolated per profile. Changes here only affect the current profile: <strong>{currentProfile?.name || 'Unknown'}</strong>
        </p>

        {message && (
          <div className={
            message.type === 'success' ? 'message-success' :
            message.type === 'warning' ? 'message-warning' :
            'message-error'
          }>
            {message.text}
          </div>
        )}

        {/* AI Provider Selection - Per Profile */}
        <div className="mb-xl">
          <h3>🤖 AI Provider & Model</h3>
          <p className="config-section-description">
            Select AI provider and model for this profile. Each profile can use different models for its briefs and task processing.
          </p>
          
          <div className="glass-panel mb-lg">
            <div className="grid-2col mb-lg">
              <div>
                <label className="form-label">
                  Provider
                </label>
                <select
                  value={config.aiProvider || 'anthropic'}
                  onChange={(e) => {
                    const newProvider = e.target.value;
                    handleChange('aiProvider', newProvider);
                    if (newProvider === 'anthropic' || newProvider === 'openai' || newProvider === 'ollama') {
                      loadModelsForProvider(newProvider);
                    }
                  }}
                  className="form-input"
                >
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openai">OpenAI GPT</option>
                  <option value="ollama">Ollama (Local)</option>
                  <option value="bedrock">AWS Bedrock</option>
                </select>
              </div>
              
              <div>
                <label className="form-label">
                  Model
                </label>
                {renderModelSelector(
                  config.aiProvider || 'anthropic',
                  config.aiProvider === 'anthropic' ? config.claudeModel || 'claude-sonnet-4-5-20250929' :
                  config.aiProvider === 'openai' ? config.openaiModel || 'gpt-4o' :
                  config.aiProvider === 'ollama' ? config.ollamaModel || 'llama3.1' :
                  'claude-sonnet-4-5-20250929',
                  (value) => {
                    if (config.aiProvider === 'anthropic') {
                      handleChange('claudeModel', value);
                    } else if (config.aiProvider === 'openai') {
                      handleChange('openaiModel', value);
                    } else if (config.aiProvider === 'ollama') {
                      handleChange('ollamaModel', value);
                    }
                  }
                )}
              </div>
            </div>
            
            <div className="grid-2col">
              <div>
                <label className="form-label">
                  Max Tokens (Advanced)
                </label>
                <input
                  type="number"
                  value={config.aiMaxTokens || '4096'}
                  onChange={(e) => handleChange('aiMaxTokens', e.target.value)}
                  placeholder="4096"
                  min="1000"
                  max="8192"
                  className="form-input"
                  style={{ width: '100%' }}
                />
                <p className="form-hint">
                  Maximum tokens for AI responses (1000-8192). Higher values allow longer responses but cost more.
                </p>
              </div>
              
              <div>
                <label className="form-label">
                  Temperature
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={config.aiTemperature !== undefined ? config.aiTemperature : '0.7'}
                  onChange={(e) => handleChange('aiTemperature', parseFloat(e.target.value) || 0.7)}
                  placeholder="0.7"
                  min="0"
                  max="2"
                  className="form-input"
                  style={{ width: '100%' }}
                />
                <p className="form-hint">
                  Controls randomness (0-2). Lower = more focused, Higher = more creative. Default: 0.7
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Microservice AI Configuration - Profile-Specific */}
        <div className="mb-xl">
          <h3>🤖 Microservice AI Configuration</h3>
          <p className="config-section-description">
            AI provider selection for microservices (Pattern Recognition, Voice Processor, etc.) for this profile.
          </p>
          
          <div className="mt-xl-mb-md">
            <h4 
              onClick={() => setMicroservicesExpanded(!microservicesExpanded)}
              className="flex items-center gap-sm header-interactive"
            >
              <span className={`rotate-icon ${microservicesExpanded ? 'rotate-icon-open' : ''}`}>
                ▶
              </span>
              Microservices Configuration (Optional)
            </h4>
          </div>
          
          {microservicesExpanded && (
            <>
              {/* AI Intelligence Service */}
              <div className="glass-panel mb-xl">
            <h4 className="config-subsection-title mt-0">🧠 AI Intelligence Service</h4>
            <p className="config-subsection-description">
              Task effort estimation, energy classification, and task clustering
            </p>
            
            <div className="grid-2col mb-lg">
              <div>
                <label className="form-label">
                  Provider
                </label>
                <select
                  value={config.aiIntelligenceProvider || 'anthropic'}
                  onChange={(e) => handleChange('aiIntelligenceProvider', e.target.value)}
                  className="form-input"
                >
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openai">OpenAI GPT</option>
                  <option value="ollama">Ollama (Local)</option>
                  <option value="bedrock">AWS Bedrock</option>
                </select>
              </div>
              
              <div>
                <label className="form-label">
                  Model
                </label>
                {renderModelSelector(
                  config.aiIntelligenceProvider || 'anthropic',
                  config.aiIntelligenceModel || 'claude-sonnet-4-5-20250929',
                  (value) => handleChange('aiIntelligenceModel', value)
                )}
              </div>
            </div>
          </div>
          
          {/* Voice Processor Service */}
          <div className="glass-panel mb-xl">
            <h4 className="config-subsection-title mt-0">🎤 Voice Processor Service</h4>
            <p className="config-subsection-description">
              Audio transcription and voice-to-text
            </p>
            
            <div className="grid-2col mb-lg">
              <div>
                <label className="form-label">
                  Provider
                </label>
                <select
                  value={config.voiceProcessorProvider || 'openai'}
                  onChange={(e) => handleChange('voiceProcessorProvider', e.target.value)}
                  className="form-input"
                >
                  <option value="openai">OpenAI Whisper</option>
                  <option value="ollama">Ollama Whisper</option>
                </select>
              </div>
              
              <div>
                <label className="form-label">
                  Model
                </label>
                {renderModelSelector(
                  config.voiceProcessorProvider || 'openai',
                  config.voiceProcessorModel || 'whisper-1',
                  (value) => handleChange('voiceProcessorModel', value)
                )}
              </div>
            </div>
            
            {/* Voice Storage Configuration */}
            <div className="section-divider">
              <h5 className="config-subsection-subtitle mt-0">💾 Storage Configuration</h5>
              <p className="config-subsection-description">
                Configure where transcribed audio files are stored
              </p>
              
              <div className="grid-2col mb-lg">
                <div>
                  <label className="form-label">
                    Storage Type
                  </label>
                  <select
                    value={config.storageType || 'local'}
                    onChange={(e) => handleChange('storageType', e.target.value)}
                    className="form-input"
                  >
                    <option value="local">Local Filesystem</option>
                    <option value="s3">AWS S3</option>
                  </select>
                </div>
                
                {config.storageType === 'local' && (
                  <div>
                    <label className="form-label">
                      Storage Path
                    </label>
                    <input
                      type="text"
                      value={config.storagePath || '/app/data/voice-recordings'}
                      onChange={(e) => handleChange('storagePath', e.target.value)}
                      placeholder="/app/data/voice-recordings"
                      className="form-input"
                    />
                  </div>
                )}
              </div>
              
              {config.storageType === 's3' && (
                <div className="grid-2col">
                  <div>
                    <label className="form-label">
                      S3 Bucket
                    </label>
                    <input
                      type="text"
                      value={config.s3Bucket || ''}
                      onChange={(e) => handleChange('s3Bucket', e.target.value)}
                      placeholder="my-bucket"
                      className="form-input"
                    />
                  </div>
                  
                  <div>
                    <label className="form-label">
                      S3 Region
                    </label>
                    <input
                      type="text"
                      value={config.s3Region || 'us-east-1'}
                      onChange={(e) => handleChange('s3Region', e.target.value)}
                      placeholder="us-east-1"
                      className="form-input"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Pattern Recognition Service */}
          <div className="glass-panel mb-xl">
            <h4 className="config-subsection-title mt-0">🔍 Pattern Recognition Service</h4>
            <p className="config-subsection-description">
              Behavioral pattern detection and task clustering
            </p>
            
            <div className="grid-2col mb-lg">
              <div>
                <label className="form-label">
                  Provider
                </label>
                <select
                  value={config.patternRecognitionProvider || 'anthropic'}
                  onChange={(e) => handleChange('patternRecognitionProvider', e.target.value)}
                  className="form-input"
                >
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openai">OpenAI GPT</option>
                  <option value="ollama">Ollama (Local)</option>
                  <option value="bedrock">AWS Bedrock</option>
                </select>
              </div>
              
              <div>
                <label className="form-label">
                  Model
                </label>
                {renderModelSelector(
                  config.patternRecognitionProvider || 'anthropic',
                  config.patternRecognitionModel || 'claude-sonnet-4-5-20250929',
                  (value) => handleChange('patternRecognitionModel', value)
                )}
              </div>
            </div>
          </div>
          
          {/* NL Parser Service */}
          <div className="glass-panel mb-xl">
            <h4 className="config-subsection-title mt-0">📝 NL Parser Service</h4>
            <p className="config-subsection-description">
              Natural language task parsing and date extraction
            </p>
            
            <div className="grid-2col mb-lg">
              <div>
                <label className="form-label">
                  Provider
                </label>
                <select
                  value={config.nlParserProvider || 'anthropic'}
                  onChange={(e) => handleChange('nlParserProvider', e.target.value)}
                  className="form-input"
                >
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openai">OpenAI GPT</option>
                  <option value="ollama">Ollama (Local)</option>
                  <option value="bedrock">AWS Bedrock</option>
                </select>
              </div>
              
              <div>
                <label className="form-label">
                  Model
                </label>
                {renderModelSelector(
                  config.nlParserProvider || 'anthropic',
                  config.nlParserModel || 'claude-sonnet-4-5-20250929',
                  (value) => handleChange('nlParserModel', value)
                )}
              </div>
            </div>
          </div>
            </>
          )}
        </div>

        <div className="mb-xl">
          <h3>🔌 Integrations</h3>
          <p className="text-sm-muted-mb-md">
            Enable or disable integrations for this profile. Only enabled integrations will be shown below.
          </p>
          
          <div className="glass-panel">
            <label className="integration-label">
              <input
                type="checkbox"
                checked={enabledIntegrations.googleCalendar}
                onChange={(e) => setEnabledIntegrations({ ...enabledIntegrations, googleCalendar: e.target.checked })}
                className="integration-checkbox"
              />
              <span className="integration-text">📅 Google Calendar</span>
            </label>
            
            <label className="integration-label">
              <input
                type="checkbox"
                checked={enabledIntegrations.microsoft}
                onChange={(e) => {
                  const newValue = e.target.checked;
                  setEnabledIntegrations({ ...enabledIntegrations, microsoft: newValue });
                  // When Microsoft Integration is enabled/disabled, both Calendar and Planner are affected
                  // They can't be enabled/disabled separately
                }}
                className="integration-checkbox"
              />
              <span className="integration-text">📅 Microsoft Integration (Calendar + Planner)</span>
            </label>
            
            <label className="integration-label">
              <input
                type="checkbox"
                checked={enabledIntegrations.jira}
                onChange={(e) => setEnabledIntegrations({ ...enabledIntegrations, jira: e.target.checked })}
                className="integration-checkbox"
              />
              <span className="integration-text">🎯 Jira</span>
            </label>
            
            <label className="integration-label">
              <input
                type="checkbox"
                checked={enabledIntegrations.trello}
                onChange={(e) => setEnabledIntegrations({ ...enabledIntegrations, trello: e.target.checked })}
                className="integration-checkbox"
              />
              <span className="integration-text">📋 Trello</span>
            </label>
            
            <label className="integration-label">
              <input
                type="checkbox"
                checked={enabledIntegrations.monday}
                onChange={(e) => setEnabledIntegrations({ ...enabledIntegrations, monday: e.target.checked })}
                className="integration-checkbox"
              />
              <span className="integration-text">📊 Monday.com</span>
            </label>
            
            <label className="integration-label">
              <input
                type="checkbox"
                checked={enabledIntegrations.radicale}
                onChange={(e) => setEnabledIntegrations({ ...enabledIntegrations, radicale: e.target.checked })}
                className="integration-checkbox"
              />
              <span className="integration-text">📆 CalDAV (Radicale, Nextcloud, etc.)</span>
            </label>
          </div>
        </div>

        {enabledIntegrations.googleCalendar && (
        <div className="mb-xl">
          <h3>📅 Google Calendar Integration</h3>
          
          <div className="glass-panel mb-lg">
            <h4 className="mt-0-mb-md-flex-center">
              <span className="emoji-icon">🗓️</span>
              Google Calendar (Recommended)
            </h4>
            
            {checkingGoogle ? (
              <p className="text-muted">Checking connection status...</p>
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
                <p className="config-subsection-description">
                  Commitments with deadlines will automatically create calendar events. Events sync across all your devices.
                </p>
                
                <label className="form-label-muted">
                  Calendar ID (Optional)
                </label>
                <input
                  type="text"
                  value={config.googleCalendarId}
                  onChange={(e) => handleChange('googleCalendarId', e.target.value)}
                  placeholder="primary (default) or specific calendar ID"
                />
                <p className="text-sm-muted-mt-sm">
                  Leave blank to use your primary calendar. To find calendar IDs: <a href="https://calendar.google.com/calendar/u/0/r/settings" target="_blank" rel="noopener noreferrer">Calendar Settings</a> → Select calendar → Scroll to "Integrate calendar"
                </p>
              </div>
            ) : (
              <div>
                <p className="text-muted-mb-md-lh">
                  Connect your Google Calendar to automatically create events for tasks with deadlines.
                  One-click setup with OAuth.
                </p>
                
                {!config.googleClientId || !config.googleClientSecret ? (
                  <div className="mb-md">
                    <p className="text-warning-mb-md">
                      ⚠️ Setup required: Add your Google OAuth credentials below, then click Connect
                    </p>
                    
                    <label className="form-label-muted">
                      Google Client ID
                    </label>
                    <input
                      type="text"
                      value={config.googleClientId}
                      onChange={(e) => handleChange('googleClientId', e.target.value)}
                      placeholder="123456789-xxxxxxxx.apps.googleusercontent.com"
                      className="mb-md"
                    />
                    
                    <label className="form-label-muted">
                      Google Client Secret
                    </label>
                    <input
                      type="password"
                      value={config.googleClientSecret}
                      onChange={(e) => handleChange('googleClientSecret', e.target.value)}
                      placeholder="GOCSPX-xxxxxxxx"
                      className="mb-md"
                    />
                    {config.googleClientSecret.includes('•') && (
                      <p className="text-success-mt-negative-mb-md">
                        ✓ Client secret is configured
                      </p>
                    )}
                    
                    <label className="form-label-muted">
                      Redirect URI (Optional)
                    </label>
                    <input
                      type="text"
                      value={config.googleRedirectUri}
                      onChange={(e) => handleChange('googleRedirectUri', e.target.value)}
                      placeholder="https://aicos.yourdomain.com/api/calendar/google/callback"
                    />
                    <p className="text-sm-muted-mt-sm">
                      Only needed if using SWAG/reverse proxy. Leave blank for local use.
                    </p>
                    
                    <details className="details-expandable">
                      <summary className="details-summary">
                        How to get Google OAuth credentials
                      </summary>
                      <ol className="list-ordered-indent">
                        <li>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">Google Cloud Console</a></li>
                        <li>Create a new project or select existing</li>
                        <li>Enable Google Calendar API</li>
                        <li>Create OAuth 2.0 Client ID (Web application)</li>
                        <li>Add authorized redirect URI:
                          <ul className="list-nested">
                            <li>Local: <code className="code-inline-sm">http://localhost:3001/api/calendar/google/callback</code></li>
                            <li>SWAG: <code className="code-inline-sm">https://aicos.yourdomain.com/api/calendar/google/callback</code></li>
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
                    <span className="icon-md">🔗</span>
                    Connect Google Calendar
                  </button>
                )}
              </div>
            )}
          </div>

        </div>
        )}

        {enabledIntegrations.microsoft && (
        <div className="mb-xl">
          <h3>📅 Microsoft Integration (Calendar + Planner)</h3>
          
          <div className="glass-panel mb-lg">
            <h4 className="mt-0-mb-md-flex-center">
              <span className="emoji-icon">📅</span>
              Microsoft Outlook Calendar & Planner
            </h4>
            
            {checkingMicrosoft ? (
              <p className="text-muted">Checking connection status...</p>
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
                    <strong>✓ Connected</strong> - Calendar events and tasks will be created automatically
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
                <p className="config-subsection-description">
                  Commitments with deadlines will automatically create Outlook Calendar events and Microsoft To Do tasks. Both sync across all your devices.
                </p>
                
                <label className="form-label-muted">
                  Calendar ID (Optional)
                </label>
                <input
                  type="text"
                  value={config.microsoftCalendarId || ''}
                  onChange={(e) => handleChange('microsoftCalendarId', e.target.value)}
                  placeholder="Leave blank for default calendar"
                  className="mb-md"
                />
                <p className="text-sm-muted-mt-negative-mb-md">
                  Leave blank to use your default Outlook calendar. To find calendar IDs, use the Microsoft Graph API or Outlook web interface.
                </p>
                
                <label className="form-label-muted">
                  Task List (Optional)
                </label>
                {loadingTaskLists ? (
                  <p className="text-sm text-muted">Loading task lists...</p>
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
                    className="mb-md"
                  />
                )}
                <p className="text-sm-muted-mt-negative">
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
                <p className="text-muted-mb-md-lh">
                  Connect your Microsoft account to automatically create Outlook Calendar events and Microsoft To Do tasks for commitments with deadlines.
                  One-click setup with OAuth. Both Calendar and Planner are enabled together.
                </p>
                
                {!config.microsoftClientId || !config.microsoftClientSecret || !config.microsoftTenantId ? (
                  <div className="mb-md">
                    <p className="text-warning-mb-md">
                      ⚠️ Setup required: Add your Azure app registration details below, then click Connect
                    </p>
                    
                    <label className="form-label-muted">
                      Azure Tenant ID
                    </label>
                    <input
                      type="text"
                      value={config.microsoftTenantId}
                      onChange={(e) => handleChange('microsoftTenantId', e.target.value)}
                      placeholder="12345678-1234-1234-1234-123456789abc"
                      className="mb-md"
                    />
                    
                    <label className="form-label-muted">
                      Azure Client ID (Application ID)
                    </label>
                    <input
                      type="text"
                      value={config.microsoftClientId}
                      onChange={(e) => handleChange('microsoftClientId', e.target.value)}
                      placeholder="87654321-4321-4321-4321-cba987654321"
                      className="mb-md"
                    />
                    
                    <label className="form-label-muted">
                      Azure Client Secret
                    </label>
                    <input
                      type="password"
                      value={config.microsoftClientSecret}
                      onChange={(e) => handleChange('microsoftClientSecret', e.target.value)}
                      placeholder="Your client secret value"
                      className="mb-md"
                    />
                    {config.microsoftClientSecret.includes('•') && (
                      <p className="text-success-mt-negative-mb-md">
                        ✓ Client secret is configured
                      </p>
                    )}
                    
                    <label className="form-label-muted">
                      Redirect URI (Optional)
                    </label>
                    <input
                      type="text"
                      value={config.microsoftRedirectUri}
                      onChange={(e) => handleChange('microsoftRedirectUri', e.target.value)}
                      placeholder="https://aicos.yourdomain.com/api/planner/microsoft/callback"
                    />
                    <p className="text-sm-muted-mt-sm">
                      Only needed if using SWAG/reverse proxy. Leave blank for local use.
                    </p>
                    
                    <details className="details-expandable">
                      <summary className="details-summary">
                        How to get Azure app registration details
                      </summary>
                      <ol className="list-ordered-indent">
                        <li>Go to <a href="https://portal.azure.com" target="_blank" rel="noopener noreferrer">Azure Portal</a></li>
                        <li>Navigate to <strong>Azure Active Directory</strong> → <strong>App registrations</strong></li>
                        <li>Click <strong>+ New registration</strong></li>
                        <li>Fill in:
                          <ul className="list-nested">
                            <li>Name: <code className="code-inline-sm">AI Chief of Staff</code></li>
                            <li>Supported account types: <strong>Personal Microsoft accounts</strong></li>
                            <li>Redirect URI: <code className="code-inline-sm">http://localhost:3001/api/planner/microsoft/callback</code></li>
                          </ul>
                        </li>
                        <li>Go to <strong>API permissions</strong> → Add:
                          <ul className="list-nested">
                            <li><code className="code-inline-sm">Calendars.ReadWrite</code> (Outlook Calendar)</li>
                            <li><code className="code-inline-sm">Tasks.ReadWrite</code> (Microsoft To Do)</li>
                            <li><code className="code-inline-sm">User.Read</code></li>
                          </ul>
                        </li>
                        <li>Go to <strong>Certificates & secrets</strong> → Create new client secret</li>
                        <li>Copy <strong>Tenant ID</strong> from Azure AD Overview</li>
                        <li>Copy <strong>Application (Client) ID</strong> from App Registration Overview</li>
                        <li>Copy <strong>Client Secret Value</strong> (save immediately, you won't see it again)</li>
                        <li>See <code className="code-inline-sm">MICROSOFT-PLANNER-SETUP.md</code> for detailed instructions</li>
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
                    <span className="icon-md">🔗</span>
                    Connect Microsoft Integration
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        )}

        {enabledIntegrations.jira && (
        <div className="mb-xl">
          <h3>🎯 Jira Integration</h3>
          
          <div className="glass-panel mb-lg">
            <h4 className="mt-0-mb-md-flex-center">
              <span className="emoji-icon">🎯</span>
              Jira (Cloud or On-Prem)
            </h4>
            
            {checkingJira ? (
              <p className="text-muted">Checking connection status...</p>
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
                <p className="config-subsection-description">
                  Tasks with deadlines will automatically create Jira issues (stories/tasks). Supports both Jira Cloud and on-premise.
                </p>
              </div>
            ) : (
              <div>
                <p className="text-muted-mb-md-lh">
                  Connect your Jira instance to automatically create issues for commitments with deadlines.
                  Supports both Jira Cloud (atlassian.net) and on-premise Jira servers.
                </p>
                
                <label className="form-label-muted">
                  Jira Base URL
                </label>
                <input
                  type="url"
                  value={config.jiraBaseUrl}
                  onChange={(e) => handleChange('jiraBaseUrl', e.target.value)}
                  placeholder="https://yourcompany.atlassian.net or https://jira.yourcompany.com"
                  className="mb-md"
                />
                <p className="text-sm-muted-mt-negative-mb-md">
                  For Jira Cloud: https://yourcompany.atlassian.net<br />
                  For on-premise: https://jira.yourcompany.com
                </p>
                
                <label className="form-label-muted">
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
                    color: '#e5e5e7'
                  }}
                />
                
                <label className="form-label-muted">
                  API Token
                </label>
                <input
                  type="password"
                  value={config.jiraApiToken}
                  onChange={(e) => handleChange('jiraApiToken', e.target.value)}
                  placeholder="Your Jira API token"
                  className="mb-md"
                />
                {config.jiraApiToken.includes('•') && (
                  <p className="text-success-mt-negative-mb-md">
                    ✓ API token is configured
                  </p>
                )}
                <p className={config.jiraApiToken.includes('•') ? 'text-sm-muted-mb-md' : 'text-sm-muted-mt-negative-mb-md'}>
                  Create an API token: <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer">Jira Cloud</a> or your on-premise Jira → Account Settings → Security → API Tokens
                </p>
                
                <label className="form-label-muted">
                  Project Key
                </label>
                <input
                  type="text"
                  value={config.jiraProjectKey}
                  onChange={(e) => handleChange('jiraProjectKey', e.target.value.toUpperCase())}
                  placeholder="PROJ"
                  className="mb-md"
                />
                <p className="text-sm-muted-mt-negative-mb-md">
                  The project key where issues will be created (e.g., PROJ, DEV, TASK)
                </p>
                
                <p className="info-box-success">
                  💡 After saving these credentials, Jira will automatically connect. Issues will be created as Stories (for commitments) or Tasks (for action items).
                </p>
              </div>
            )}
          </div>
        </div>
        )}

        {enabledIntegrations.trello && (
        <div className="mb-xl">
          <h3>📋 Trello Integration</h3>
          
          <div className="glass-panel mb-lg">
            <h4 className="mt-0-mb-md-flex-center">
              <span className="emoji-icon">📋</span>
              Trello Board Management
            </h4>
            
            {checkingTrello ? (
              <p className="text-muted">Checking connection status...</p>
            ) : trelloConnected ? (
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
                    <strong>✓ Connected</strong> - Cards will be created automatically in Trello
                  </span>
                  <button 
                    onClick={handleTrelloDisconnect}
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
                <p className="config-subsection-description">
                  Tasks with deadlines will automatically create Trello cards in your configured board and list.
                </p>
              </div>
            ) : (
              <div>
                <p className="text-muted-mb-md-lh">
                  Connect Trello to automatically create cards for commitments and action items with deadlines.
                </p>
                
                <label className="form-label-muted">
                  Trello API Key
                </label>
                <input
                  type="text"
                  value={config.trelloApiKey}
                  onChange={(e) => handleChange('trelloApiKey', e.target.value)}
                  placeholder="Your Trello API key"
                  className="mb-md"
                />
                <p className="text-sm-muted-mt-negative-mb-md">
                  Get your API key: <a href="https://trello.com/app-key" target="_blank" rel="noopener noreferrer">https://trello.com/app-key</a>
                </p>
                
                <label className="form-label-muted">
                  Trello Token
                </label>
                <input
                  type="password"
                  value={config.trelloToken}
                  onChange={(e) => handleChange('trelloToken', e.target.value)}
                  placeholder="Your Trello token"
                  className="mb-md"
                />
                {config.trelloToken.includes('•') && (
                  <p className="text-success-mt-negative-mb-md">
                    ✓ Token is configured
                  </p>
                )}
                <p className={config.trelloToken.includes('•') ? 'text-sm-muted-mb-md' : 'text-sm-muted-mt-negative-mb-md'}>
                  Generate a token from the API key page above (click the "Token" link)
                </p>
                
                {config.trelloApiKey && config.trelloToken && (
                  <>
                    <label className="form-label-muted">
                      Board
                    </label>
                    <select
                      value={config.trelloBoardId}
                      onChange={(e) => {
                        handleChange('trelloBoardId', e.target.value);
                        if (e.target.value) {
                          loadTrelloLists(e.target.value);
                        }
                      }}
                      onFocus={loadTrelloBoards}
                      style={{ 
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #3f3f46',
                        borderRadius: '8px',
                        fontSize: '1rem',
                        fontFamily: 'inherit',
                        marginBottom: '1rem',
                        color: '#e5e5e7'
                      }}
                    >
                      <option value="">Select a board...</option>
                      {trelloBoards.map(board => (
                        <option key={board.id} value={board.id}>{board.name}</option>
                      ))}
                    </select>
                    
                    {config.trelloBoardId && (
                      <>
                        <label className="form-label-muted">
                          List
                        </label>
                        <select
                          value={config.trelloListId}
                          onChange={(e) => handleChange('trelloListId', e.target.value)}
                          style={{ 
                            width: '100%',
                            padding: '0.75rem',
                            border: '1px solid #3f3f46',
                            borderRadius: '8px',
                            fontSize: '1rem',
                            fontFamily: 'inherit',
                            marginBottom: '1rem',
                            color: '#e5e5e7'
                          }}
                        >
                          <option value="">Select a list...</option>
                          {trelloLists.map(list => (
                            <option key={list.id} value={list.id}>{list.name}</option>
                          ))}
                        </select>
                        <p className="text-sm-muted-mt-negative-mb-md">
                          Cards will be created in this list
                        </p>
                      </>
                    )}
                  </>
                )}
                
                <p className="info-box-success">
                  💡 After saving these credentials, Trello will automatically connect. Cards will be created for tasks with deadlines.
                </p>
              </div>
            )}
          </div>
        </div>
        )}

        {enabledIntegrations.monday && (
        <div className="mb-xl">
          <h3>📊 Monday.com Integration</h3>
          
          <div className="glass-panel mb-lg">
            <h4 className="mt-0-mb-md-flex-center">
              <span className="emoji-icon">📊</span>
              Monday.com Workspace
            </h4>
            
            {checkingMonday ? (
              <p className="text-muted">Checking connection status...</p>
            ) : mondayConnected ? (
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
                    <strong>✓ Connected</strong> - Items will be created automatically in Monday.com
                  </span>
                  <button 
                    onClick={handleMondayDisconnect}
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
                <p className="config-subsection-description">
                  Tasks with deadlines will automatically create Monday.com items in your configured board and group.
                </p>
              </div>
            ) : (
              <div>
                <p className="text-muted-mb-md-lh">
                  Connect Monday.com to automatically create items for commitments and action items with deadlines.
                </p>
                
                <label className="form-label-muted">
                  API Token
                </label>
                <input
                  type="password"
                  value={config.mondayApiToken}
                  onChange={(e) => handleChange('mondayApiToken', e.target.value)}
                  placeholder="Your Monday.com API token"
                  className="mb-md"
                />
                {config.mondayApiToken.includes('•') && (
                  <p className="text-success-mt-negative-mb-md">
                    ✓ API token is configured
                  </p>
                )}
                <p style={{ fontSize: '0.85rem', color: '#a1a1aa', marginTop: config.mondayApiToken.includes('•') ? '0' : '-0.5rem', marginBottom: '1rem' }}>
                  Get your token: Monday.com → Profile Picture → Developers → My Access Tokens → Generate
                </p>
                
                {config.mondayApiToken && (
                  <>
                    <label className="form-label-muted">
                      Board
                    </label>
                    <select
                      value={config.mondayBoardId}
                      onChange={(e) => {
                        handleChange('mondayBoardId', e.target.value);
                        if (e.target.value) {
                          loadMondayGroups(e.target.value);
                        }
                      }}
                      onFocus={loadMondayBoards}
                      style={{ 
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #3f3f46',
                        borderRadius: '8px',
                        fontSize: '1rem',
                        fontFamily: 'inherit',
                        marginBottom: '1rem',
                        color: '#e5e5e7'
                      }}
                    >
                      <option value="">Select a board...</option>
                      {mondayBoards.map(board => (
                        <option key={board.id} value={board.id}>{board.name}</option>
                      ))}
                    </select>
                    
                    {config.mondayBoardId && (
                      <>
                        <label className="form-label-muted">
                          Group
                        </label>
                        <select
                          value={config.mondayGroupId}
                          onChange={(e) => handleChange('mondayGroupId', e.target.value)}
                          style={{ 
                            width: '100%',
                            padding: '0.75rem',
                            border: '1px solid #3f3f46',
                            borderRadius: '8px',
                            fontSize: '1rem',
                            fontFamily: 'inherit',
                            marginBottom: '1rem',
                            color: '#e5e5e7'
                          }}
                        >
                          <option value="">Select a group...</option>
                          {mondayGroups.map(group => (
                            <option key={group.id} value={group.id}>{group.title}</option>
                          ))}
                        </select>
                        <p className="text-sm-muted-mt-negative-mb-md">
                          Items will be created in this group
                        </p>
                      </>
                    )}
                  </>
                )}
                
                <p className="info-box-success">
                  💡 After saving these credentials, Monday.com will automatically connect. Items will be created for tasks with deadlines.
                </p>
              </div>
            )}
          </div>
        </div>
        )}

        {enabledIntegrations.radicale && (
        <div className="mb-xl">
          <h3>📆 CalDAV Integration</h3>
          
          <div className="glass-panel mb-lg">
            <h4 className="mt-0-mb-md-flex-center">
              <span className="emoji-icon">📆</span>
              CalDAV Server (Radicale, Nextcloud, etc.)
            </h4>
            
            <p className="text-muted-mb-md-lh">
              Connect any CalDAV-compatible calendar server including Radicale, Nextcloud, Baikal, or other self-hosted solutions.
              Perfect for privacy-focused local calendar synchronization and on-premise deployments.
            </p>
            
            <label className="form-label-muted">
              CalDAV Server URL
            </label>
            <input
              type="url"
              value={config.radicaleUrl || ''}
              onChange={(e) => handleChange('radicaleUrl', e.target.value)}
              placeholder="http://localhost:5232 (Radicale) or https://nextcloud.example.com/remote.php/dav"
              style={{ 
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #3f3f46',
                borderRadius: '8px',
                fontSize: '1rem',
                fontFamily: 'inherit',
                marginBottom: '1rem',
                color: '#e5e5e7'
              }}
            />
            <p className="text-sm-muted-mt-negative-mb-md">
              Examples: http://localhost:5232 (Radicale), https://nextcloud.example.com/remote.php/dav (Nextcloud)
            </p>
            
            <label className="form-label-muted">
              Username
            </label>
            <input
              type="text"
              value={config.radicaleUsername || ''}
              onChange={(e) => handleChange('radicaleUsername', e.target.value)}
              placeholder="Your CalDAV username"
              style={{ 
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #3f3f46',
                borderRadius: '8px',
                fontSize: '1rem',
                fontFamily: 'inherit',
                marginBottom: '1rem',
                color: '#e5e5e7'
              }}
            />
            
            <label className="form-label-muted">
              Password
            </label>
            <input
              type="password"
              value={config.radicalePassword || ''}
              onChange={(e) => handleChange('radicalePassword', e.target.value)}
              placeholder="Your CalDAV password or app-specific password"
              style={{ 
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #3f3f46',
                borderRadius: '8px',
                fontSize: '1rem',
                fontFamily: 'inherit',
                marginBottom: '1rem',
                color: '#e5e5e7'
              }}
            />
            {config.radicalePassword && config.radicalePassword.includes('•') && (
              <p className="text-success-mt-negative-mb-md">
                ✓ Password is configured
              </p>
            )}
            
            <p className="info-box-primary">
              💡 Radicale is a lightweight CalDAV server. Install with: <code className="code-snippet">pip install radicale</code><br />
              Run with: <code className="code-snippet">python -m radicale</code><br />
              More info: <a href="https://radicale.org/" target="_blank" rel="noopener noreferrer" className="link-primary">radicale.org</a>
            </p>
          </div>
        </div>
        )}

        {/* Microservice AI Configuration - Profile-Specific */}
        <div className="mb-xl">
          <h3>🤖 Microservice AI Configuration</h3>
          <p className="config-section-description">
            AI provider selection for microservices (Pattern Recognition, Voice Processor, etc.) for this profile.
          </p>
          
          <div className="mt-xl-mb-md">
            <h4 
              onClick={() => setMicroservicesExpanded(!microservicesExpanded)}
              className="flex items-center gap-sm header-interactive"
            >
              <span className={`rotate-icon ${microservicesExpanded ? 'rotate-icon-open' : ''}`}>
                ▶
              </span>
              Microservices Configuration (Optional)
            </h4>
          </div>
          
          {microservicesExpanded && (
            <>
              {/* AI Intelligence Service */}
              <div className="glass-panel mb-xl">
            <h4 className="config-subsection-title mt-0">🧠 AI Intelligence Service</h4>
            <p className="config-subsection-description">
              Task effort estimation, energy classification, and task clustering
            </p>
            
            <div className="grid-2col mb-lg">
              <div>
                <label className="form-label">
                  Provider
                </label>
                <select
                  value={config.aiIntelligenceProvider || 'anthropic'}
                  onChange={(e) => handleChange('aiIntelligenceProvider', e.target.value)}
                  className="form-input"
                >
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openai">OpenAI GPT</option>
                  <option value="ollama">Ollama (Local)</option>
                  <option value="bedrock">AWS Bedrock</option>
                </select>
              </div>
              
              <div>
                <label className="form-label">
                  Model
                </label>
                {renderModelSelector(
                  config.aiIntelligenceProvider || 'anthropic',
                  config.aiIntelligenceModel || 'claude-sonnet-4-5-20250929',
                  (value) => handleChange('aiIntelligenceModel', value)
                )}
              </div>
            </div>
          </div>
          
          {/* Voice Processor Service */}
          <div className="glass-panel mb-xl">
            <h4 className="config-subsection-title mt-0">🎤 Voice Processor Service</h4>
            <p className="config-subsection-description">
              Audio transcription and voice-to-text
            </p>
            
            <div className="grid-2col mb-lg">
              <div>
                <label className="form-label">
                  Provider
                </label>
                <select
                  value={config.voiceProcessorProvider || 'openai'}
                  onChange={(e) => handleChange('voiceProcessorProvider', e.target.value)}
                  className="form-input"
                >
                  <option value="openai">OpenAI Whisper</option>
                  <option value="ollama">Ollama Whisper</option>
                </select>
              </div>
              
              <div>
                <label className="form-label">
                  Model
                </label>
                {renderModelSelector(
                  config.voiceProcessorProvider || 'openai',
                  config.voiceProcessorModel || 'whisper-1',
                  (value) => handleChange('voiceProcessorModel', value)
                )}
              </div>
            </div>
            
            {/* Voice Storage Configuration */}
            <div className="section-divider">
              <h5 className="config-subsection-subtitle mt-0">💾 Storage Configuration</h5>
              <p className="config-subsection-description">
                Configure where transcribed audio files are stored
              </p>
              
              <div className="grid-2col mb-lg">
                <div>
                  <label className="form-label">
                    Storage Type
                  </label>
                  <select
                    value={config.storageType || 'local'}
                    onChange={(e) => handleChange('storageType', e.target.value)}
                    className="form-input"
                  >
                    <option value="local">Local Filesystem</option>
                    <option value="s3">AWS S3</option>
                  </select>
                </div>
                
                {config.storageType === 'local' && (
                  <div>
                    <label className="form-label">
                      Storage Path
                    </label>
                    <input
                      type="text"
                      value={config.storagePath || '/app/data/voice-recordings'}
                      onChange={(e) => handleChange('storagePath', e.target.value)}
                      placeholder="/app/data/voice-recordings"
                      className="form-input"
                    />
                  </div>
                )}
              </div>
              
              {config.storageType === 's3' && (
                <div className="grid-2col">
                  <div>
                    <label className="form-label">
                      S3 Bucket
                    </label>
                    <input
                      type="text"
                      value={config.s3Bucket || ''}
                      onChange={(e) => handleChange('s3Bucket', e.target.value)}
                      placeholder="my-bucket"
                      className="form-input"
                    />
                  </div>
                  
                  <div>
                    <label className="form-label">
                      S3 Region
                    </label>
                    <input
                      type="text"
                      value={config.s3Region || 'us-east-1'}
                      onChange={(e) => handleChange('s3Region', e.target.value)}
                      placeholder="us-east-1"
                      className="form-input"
                    />
                  </div>
                  
                  <div>
                    <label className="form-label">
                      S3 Access Key ID
                    </label>
                    <input
                      type="password"
                      value={config.s3AccessKeyId || ''}
                      onChange={(e) => handleChange('s3AccessKeyId', e.target.value)}
                      placeholder="AKIA..."
                      className="form-input"
                    />
                  </div>
                  
                  <div>
                    <label className="form-label">
                      S3 Secret Access Key
                    </label>
                    <input
                      type="password"
                      value={config.s3SecretAccessKey || ''}
                      onChange={(e) => handleChange('s3SecretAccessKey', e.target.value)}
                      placeholder="••••••••"
                      className="form-input"
                    />
                  </div>
                  
                  <div className="grid-2col-span">
                    <label className="form-label">
                      S3 Endpoint (Optional - for S3-compatible services)
                    </label>
                    <input
                      type="text"
                      value={config.s3Endpoint || ''}
                      onChange={(e) => handleChange('s3Endpoint', e.target.value)}
                      placeholder="https://s3.amazonaws.com"
                      className="form-input"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Pattern Recognition Service */}
          <div className="glass-panel mb-xl">
            <h4 className="config-subsection-title mt-0">🔍 Pattern Recognition Service</h4>
            <p className="config-subsection-description">
              Behavioral pattern analysis and productivity insights
            </p>
            
            <div className="grid-2col mb-lg">
              <div>
                <label className="form-label">
                  Provider
                </label>
                <select
                  value={config.patternRecognitionProvider || 'anthropic'}
                  onChange={(e) => handleChange('patternRecognitionProvider', e.target.value)}
                  className="form-input"
                >
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openai">OpenAI GPT</option>
                  <option value="ollama">Ollama (Local)</option>
                  <option value="bedrock">AWS Bedrock</option>
                </select>
              </div>
              
              <div>
                <label className="form-label">
                  Model
                </label>
                {renderModelSelector(
                  config.patternRecognitionProvider || 'anthropic',
                  config.patternRecognitionModel || 'claude-sonnet-4-5-20250929',
                  (value) => handleChange('patternRecognitionModel', value)
                )}
              </div>
            </div>
          </div>
          
          {/* NL Parser Service */}
          <div className="glass-panel mb-xl">
            <h4 className="config-subsection-title mt-0">📝 NL Parser Service</h4>
            <p className="config-subsection-description">
              Natural language task parsing and date extraction
            </p>
            
            <div className="grid-2col mb-lg">
              <div>
                <label className="form-label">
                  Provider
                </label>
                <select
                  value={config.nlParserProvider || 'anthropic'}
                  onChange={(e) => handleChange('nlParserProvider', e.target.value)}
                  className="form-input"
                >
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openai">OpenAI GPT</option>
                  <option value="ollama">Ollama (Local)</option>
                  <option value="bedrock">AWS Bedrock</option>
                </select>
              </div>
              
              <div>
                <label className="form-label">
                  Model
                </label>
                {renderModelSelector(
                  config.nlParserProvider || 'anthropic',
                  config.nlParserModel || 'claude-sonnet-4-5-20250929',
                  (value) => handleChange('nlParserModel', value)
                )}
              </div>
            </div>
          </div>
            </>
          )}
        </div>

        {/* AI Prompts - Profile-Specific */}
        <div className="card mb-xl">
          <h3>🤖 AI Prompts <ScopeBadge scope="profile" /></h3>
          <p className="text-muted-mb-lg">
            Customize how AI extracts tasks, generates descriptions, and creates reports for this profile. Changes take effect immediately.
          </p>
          
          {loadingPrompts ? (
            <p className="text-muted">Loading prompts...</p>
          ) : prompts.length === 0 ? (
            <div style={{ 
              padding: '2rem', 
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
                
                <div className="mt-md">
                  <p className="text-sm-muted-mb-md">
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
                      <div className="flex gap-sm">
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
                      <div className="flex gap-sm">
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
                            backgroundColor: '#f59e0b',
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
      </div>

      {/* GLOBAL SETTINGS CARD */}
      <div className="card">
        <h2>🌐 Global Settings</h2>
        <p className="text-muted-mb-lg">
          These settings apply to all profiles and require administrative access. Rarely changed.
        </p>

        {/* AI API Keys - Global */}
        <details open className="mb-2xl">
          <summary className="config-section-header">
            <span>🔑 AI API Keys</span>
          </summary>
          <p className="config-section-description">
            API keys are shared across all profiles. Each profile can choose which provider/model to use (configured in Profile-Specific Settings above).
          </p>
          
          {/* API Keys Section */}
          <div className="glass-panel">
            <h4 className="config-subsection-title mt-0">🔑 API Keys</h4>
            <p className="config-subsection-description">
              Configure API keys for AI providers. Keys are stored securely and never displayed in full.
            </p>
            
            <div className="flex flex-col gap-md">
              <div>
                <label className="form-label">
                  Anthropic API Key
                </label>
                <input
                  type="password"
                  value={config.anthropicApiKey || ''}
                  onChange={(e) => handleChange('anthropicApiKey', e.target.value)}
                  placeholder="sk-ant-..."
                  className="form-input-mono"
                />
              </div>
              
              <div>
                <label className="form-label">
                  OpenAI API Key
                </label>
                <input
                  type="password"
                  value={config.openaiApiKey || ''}
                  onChange={(e) => handleChange('openaiApiKey', e.target.value)}
                  placeholder="sk-..."
                  className="form-input-mono"
                />
              </div>
              
              <div>
                <label className="form-label">
                  Ollama Base URL (for local deployment)
                </label>
                <input
                  type="url"
                  value={config.ollamaBaseUrl || 'http://localhost:11434'}
                  onChange={(e) => handleChange('ollamaBaseUrl', e.target.value)}
                  placeholder="http://localhost:11434"
                  className="form-input"
                />
              </div>
              
              <div className="grid-2col">
                <div>
                  <label className="form-label">
                    AWS Access Key ID (for Bedrock)
                  </label>
                  <input
                    type="password"
                    value={config.awsAccessKeyId || ''}
                    onChange={(e) => handleChange('awsAccessKeyId', e.target.value)}
                    placeholder="AKIA..."
                    className="form-input-mono"
                  />
                </div>
                
                <div>
                  <label className="form-label">
                    AWS Secret Access Key
                  </label>
                  <input
                    type="password"
                    value={config.awsSecretAccessKey || ''}
                    onChange={(e) => handleChange('awsSecretAccessKey', e.target.value)}
                    placeholder="..."
                    className="form-input-mono"
                  />
                </div>
              </div>
            </div>
          </div>
        </details>

        <details className="mb-xl">
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
          <div className="version-box">
          <label className="form-label-muted">
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
              color: '#e5e5e7'
            }}
          >
            <option value="sqlite">SQLite (Default)</option>
            <option value="postgres">PostgreSQL</option>
          </select>

          {config.dbType === 'postgres' && (
            <div className="settings-box">
              <label className="form-label-muted">
                PostgreSQL Host
              </label>
              <input
                type="text"
                value={config.postgresHost}
                onChange={(e) => handleChange('postgresHost', e.target.value)}
                placeholder="localhost"
              />

              <label className="form-label-muted">
                Port
              </label>
              <input
                type="text"
                value={config.postgresPort}
                onChange={(e) => handleChange('postgresPort', e.target.value)}
                placeholder="5432"
              />

              <label className="form-label-muted">
                Database Name
              </label>
              <input
                type="text"
                value={config.postgresDb}
                onChange={(e) => handleChange('postgresDb', e.target.value)}
                placeholder="ai_chief_of_staff"
              />

              <label className="form-label-muted">
                Username
              </label>
              <input
                type="text"
                value={config.postgresUser}
                onChange={(e) => handleChange('postgresUser', e.target.value)}
                placeholder="postgres"
              />

              <label className="form-label-muted">
                Password
              </label>
              <input
                type="password"
                value={config.postgresPassword}
                onChange={(e) => handleChange('postgresPassword', e.target.value)}
                placeholder="••••••••"
                className="mb-0"
              />
              {config.postgresPassword.includes('•') && (
                <p className="text-sm-success-mt-sm">
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

        {/* Separator */}
        <div style={{ marginTop: '2rem', marginBottom: '2rem', borderTop: '1px solid #3f3f46' }}></div>

        {/* Push Notifications */}
        <h2>🔔 Push Notifications</h2>
        <p className="text-muted-mb-lg">
          Enable push notifications to receive task reminders, overdue alerts, and sync notifications on this device.
        </p>
        
        <button 
          onClick={async () => {
            if ('Notification' in window) {
              // If already enabled, ask to disable
              if (notificationsEnabled) {
                if (window.confirm('Disable push notifications?\n\nYou can re-enable them anytime to re-register this device.')) {
                  try {
                    const registration = await navigator.serviceWorker.ready;
                    const subscription = await registration.pushManager.getSubscription();
                    if (subscription) {
                      await subscription.unsubscribe();
                      // Optionally notify backend to remove subscription
                      await fetch('/api/notifications/unsubscribe', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ endpoint: subscription.endpoint })
                      });
                    }
                    setNotificationsEnabled(false);
                    alert('✅ Notifications disabled. Click again to re-enable.');
                  } catch (error) {
                    console.error('Error unsubscribing:', error);
                    setNotificationsEnabled(false);
                    alert('⚠️ Notifications disabled locally.');
                  }
                }
              } else {
                // Enable notifications
                if (Notification.permission === 'granted') {
                  // Already have permission, just subscribe
                  try {
                    setNotificationsEnabled(true);
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
                    alert('⚠️ Push subscription failed: ' + error.message);
                  }
                } else {
                  // Request permission first
                  Notification.requestPermission().then(async (permission) => {
                    if (permission === 'granted') {
                      setNotificationsEnabled(true);
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
              }
            } else {
              alert('❌ This browser does not support notifications');
            }
          }}
          className="mb-md"
        >
          {notificationsEnabled ? '✅ Notifications Enabled - Click to Disable' : '🔔 Enable Notifications'}
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
          className="secondary mr-sm"
        >
          🧪 Send Test Notification
        </button>

        <button 
          onClick={async () => {
            if (!window.confirm('⚠️ Regenerating VAPID keys will invalidate all existing push subscriptions.\n\nAll users will need to re-enable notifications.\n\nContinue?')) {
              return;
            }
            
            try {
              const response = await fetch('/api/notifications/regenerate-vapid', { method: 'POST' });
              const data = await response.json();
              
              if (response.ok) {
                alert('✅ VAPID keys regenerated successfully!\n\n' + data.note);
                // Disable notifications as current subscription is now invalid
                setNotificationsEnabled(false);
              } else {
                alert('❌ Failed to regenerate VAPID keys: ' + data.message);
              }
            } catch (error) {
              alert('❌ Error regenerating VAPID keys: ' + error.message);
            }
          }}
          className="secondary"
          style={{ 
            backgroundColor: '#dc2626',
            borderColor: '#dc2626'
          }}
        >
          🔄 Regenerate VAPID Keys
        </button>

        {/* Notification Repeat Limits */}
        <div className="glass-panel" style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #3f3f46' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: '#e4e4e7' }}>
            Notification Repeat Limits
          </h3>
          <p style={{ color: '#a1a1aa', marginBottom: '1rem', fontSize: '0.9rem' }}>
            Control how many times you'll be notified about the same overdue task to prevent notification spam.
          </p>

          <div className="mb-md">
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e4e4e7' }}>
              Maximum Repeat Notifications (per task):
            </label>
            <input
              type="number"
              min="1"
              max="20"
              value={notificationMaxRepeat}
              onChange={(e) => setNotificationMaxRepeat(parseInt(e.target.value) || 3)}
              style={{ 
                width: '100px',
                padding: '0.5rem',
                border: '1px solid #3f3f46',
                borderRadius: '4px',
                color: '#e4e4e7'
              }}
            />
            <span style={{ marginLeft: '0.5rem', color: '#a1a1aa', fontSize: '0.9rem' }}>
              notifications
            </span>
            <p style={{ color: '#6e6e73', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              After reaching this limit, you won't receive more notifications for that task until it's updated.
            </p>
          </div>

          <div className="mb-md">
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e4e4e7' }}>
              Minimum Hours Between Repeat Notifications:
            </label>
            <input
              type="number"
              min="1"
              max="168"
              value={notificationRepeatIntervalHours}
              onChange={(e) => setNotificationRepeatIntervalHours(parseInt(e.target.value) || 24)}
              style={{ 
                width: '100px',
                padding: '0.5rem',
                border: '1px solid #3f3f46',
                borderRadius: '4px',
                color: '#e4e4e7'
              }}
            />
            <span style={{ marginLeft: '0.5rem', color: '#a1a1aa', fontSize: '0.9rem' }}>
              hours ({Math.round(notificationRepeatIntervalHours / 24 * 10) / 10} days)
            </span>
            <p style={{ color: '#6e6e73', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              Wait at least this long before sending another notification for the same task.
            </p>
          </div>

          <button
            onClick={async () => {
              try {
                await configAPI.set('notification_max_repeat', notificationMaxRepeat.toString());
                await configAPI.set('notification_repeat_interval_hours', notificationRepeatIntervalHours.toString());
                alert('✅ Notification limits saved successfully!');
              } catch (error) {
                console.error('Failed to save notification limits:', error);
                alert('❌ Failed to save notification limits: ' + error.message);
              }
            }}
            className="mt-sm"
          >
            💾 Save Notification Limits
          </button>
        </div>

        <div className="glass-panel" style={{ 
          marginTop: '1.5rem', 
          padding: '1rem'
        }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: '#60a5fa' }}>📋 Notification Types</h3>
          <ul style={{ color: '#bfdbfe', fontSize: '0.9rem', lineHeight: '1.8', paddingLeft: '1.5rem' }}>
            <li>Task reminders 24 hours before deadline</li>
            <li>Daily overdue task alerts</li>
            <li>Sync success notifications</li>
          </ul>
          <p style={{ fontSize: '0.85rem', color: '#22c55e', marginTop: '1rem' }}>
            ✓ VAPID keys are automatically generated on server startup - no manual configuration needed!
          </p>
        </div>
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
                    <span className="text-muted">
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
          <div className="mt-md">
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
        <p className="mt-md">
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
