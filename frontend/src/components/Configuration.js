import React, { useState, useEffect } from 'react';
import { configAPI } from '../services/api';

function Configuration() {
  const [config, setConfig] = useState({
    anthropicApiKey: '',
    claudeModel: 'claude-sonnet-4-5-20250929',
    plaudApiKey: '',
    plaudApiUrl: 'https://api.plaud.ai',
    icalCalendarUrl: '',
    dbType: 'sqlite',
    postgresHost: '',
    postgresPort: '5432',
    postgresDb: '',
    postgresUser: '',
    postgresPassword: '',
  });
  
  // Track which fields have been loaded from server (to know which ones to skip on save)
  const [loadedFields, setLoadedFields] = useState({});
  
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      // Load app config from database
      const appResponse = await configAPI.getAll();
      const appData = appResponse.data;
      
      // Load system config from file
      const sysResponse = await fetch('/api/config/system');
      const sysData = await sysResponse.json();
      
      // Track which fields were actually loaded (have values)
      const loaded = {
        anthropicApiKey: !!appData.anthropicApiKey,
        plaudApiKey: !!appData.plaudApiKey,
        postgresPassword: !!(sysData.postgres?.password && sysData.postgres.password !== '********')
      };
      
      setLoadedFields(loaded);
      setConfig({
        anthropicApiKey: appData.anthropicApiKey ? '••••••••' : '',
        claudeModel: appData.claudeModel || 'claude-sonnet-4-5-20250929',
        plaudApiKey: appData.plaudApiKey ? '••••••••' : '',
        plaudApiUrl: appData.plaudApiUrl || 'https://api.plaud.ai',
        icalCalendarUrl: appData.icalCalendarUrl || '',
        dbType: sysData.dbType || 'sqlite',
        postgresHost: sysData.postgres?.host || '',
        postgresPort: sysData.postgres?.port || '5432',
        postgresDb: sysData.postgres?.database || '',
        postgresUser: sysData.postgres?.user || '',
        postgresPassword: sysData.postgres?.password === '********' ? '••••••••' : '',
      });
    } catch (err) {
      console.error('Failed to load config:', err);
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
      appUpdates.claudeModel = config.claudeModel;
      appUpdates.plaudApiUrl = config.plaudApiUrl;
      appUpdates.icalCalendarUrl = config.icalCalendarUrl;
      
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
      await configAPI.bulkUpdate(appUpdates);
      
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

        <div style={{ marginBottom: '2rem' }}>
          <h3>Anthropic Claude API</h3>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
            API Key (Required)
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
          <p style={{ fontSize: '0.85rem', color: '#a1a1aa', marginTop: config.anthropicApiKey.includes('•') ? '0' : '-0.5rem' }}>
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
              border: '1px solid #d2d2d7',
              borderRadius: '8px',
              fontSize: '1rem',
              fontFamily: 'inherit',
              marginBottom: '1rem'
            }}
          >
            <option value="claude-sonnet-4-5-20250929">Claude Sonnet 4.5 (Latest - Recommended)</option>
            <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
            <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
            <option value="claude-3-opus-20240229">Claude 3 Opus</option>
          </select>
        </div>

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

        <div style={{ marginBottom: '2rem' }}>
          <h3>iCloud Calendar</h3>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
            Calendar URL (webcal:// or https://)
          </label>
          <input
            type="text"
            value={config.icalCalendarUrl}
            onChange={(e) => handleChange('icalCalendarUrl', e.target.value)}
            placeholder="webcal://p01-caldav.icloud.com/..."
          />
          <p style={{ fontSize: '0.85rem', color: '#a1a1aa', marginTop: '-0.5rem' }}>
            Find this in Calendar app → Calendar Settings → Right-click your calendar → Share
          </p>
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <h3>Database Configuration</h3>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
            Database Type
          </label>
          <select
            value={config.dbType}
            onChange={(e) => handleChange('dbType', e.target.value)}
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

        <button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
        
        <p style={{ fontSize: '0.85rem', color: '#a1a1aa', marginTop: '1rem' }}>
          💾 All settings are saved to <code>/app/data/config.json</code> and the database, and persist across container restarts.
        </p>
      </div>

      <div className="card">
        <h2>About</h2>
        <p>
          <strong>AI Chief of Staff</strong> - Your intelligent executive assistant
        </p>
        <p style={{ marginTop: '1rem', color: '#a1a1aa', lineHeight: '1.6' }}>
          This application uses Claude AI to generate daily briefs, track commitments, 
          and maintain context from your meetings and emails.
        </p>
        <ul style={{ marginTop: '1rem', color: '#a1a1aa', lineHeight: '1.8' }}>
          <li>Upload meeting transcripts to extract action items</li>
          <li>Generate AI-powered daily briefs in 10 seconds</li>
          <li>Track commitments across a rolling 2-week window</li>
          <li>Create calendar blocks automatically</li>
        </ul>
      </div>
    </div>
  );
}

export default Configuration;
