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
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await configAPI.getAll();
      const data = response.data;
      setConfig({
        anthropicApiKey: data.anthropicApiKey ? '••••••••' : '',
        claudeModel: data.claudeModel || 'claude-sonnet-4-5-20250929',
        plaudApiKey: data.plaudApiKey ? '••••••••' : '',
        plaudApiUrl: data.plaudApiUrl || 'https://api.plaud.ai',
        icalCalendarUrl: data.icalCalendarUrl || '',
        dbType: data.dbType || 'sqlite',
        postgresHost: data.postgresHost || '',
        postgresPort: data.postgresPort || '5432',
        postgresDb: data.postgresDb || '',
        postgresUser: data.postgresUser || '',
        postgresPassword: data.postgresPassword ? '••••••••' : '',
      });
    } catch (err) {
      console.error('Failed to load config:', err);
    }
  };

  const handleChange = (key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      // Only send non-masked values
      const updates = {};
      Object.keys(config).forEach(key => {
        const value = config[key];
        // Skip masked passwords
        if (value && !value.includes('•')) {
          updates[key] = value;
        } else if (key === 'claudeModel' || key === 'plaudApiUrl' || key === 'icalCalendarUrl' || 
                   key === 'dbType' || key === 'postgresHost' || key === 'postgresPort' || 
                   key === 'postgresDb' || key === 'postgresUser') {
          // Include non-password fields even if empty
          updates[key] = value;
        }
      });

      await configAPI.bulkUpdate(updates);
      setMessage({ type: 'success', text: 'Configuration saved successfully!' });
      setTimeout(() => {
        loadConfig();
        setMessage(null);
      }, 2000);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save configuration' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="configuration">
      <div className="card">
        <h2>Configuration</h2>
        <p style={{ color: '#6e6e73', marginBottom: '1.5rem' }}>
          Configure your AI Chief of Staff application settings.
        </p>

        {message && (
          <div style={{ 
            backgroundColor: message.type === 'success' ? '#e5ffe5' : '#ffe5e5',
            color: message.type === 'success' ? '#00a000' : '#d70015',
            padding: '1rem',
            borderRadius: '8px',
            marginBottom: '1rem'
          }}>
            {message.text}
          </div>
        )}

        <div style={{ marginBottom: '2rem' }}>
          <h3>Anthropic Claude API</h3>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#6e6e73' }}>
            API Key (Required)
          </label>
          <input
            type="password"
            value={config.anthropicApiKey}
            onChange={(e) => handleChange('anthropicApiKey', e.target.value)}
            placeholder="sk-ant-..."
          />
          <p style={{ fontSize: '0.85rem', color: '#6e6e73', marginTop: '-0.5rem' }}>
            Get your API key from <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer">console.anthropic.com</a>
          </p>

          <label style={{ display: 'block', marginBottom: '0.5rem', marginTop: '1rem', fontSize: '0.9rem', color: '#6e6e73' }}>
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
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#6e6e73' }}>
            Plaud API Key (Optional)
          </label>
          <input
            type="password"
            value={config.plaudApiKey}
            onChange={(e) => handleChange('plaudApiKey', e.target.value)}
            placeholder="Your Plaud API key"
          />
          
          <label style={{ display: 'block', marginBottom: '0.5rem', marginTop: '1rem', fontSize: '0.9rem', color: '#6e6e73' }}>
            Plaud API URL
          </label>
          <input
            type="url"
            value={config.plaudApiUrl}
            onChange={(e) => handleChange('plaudApiUrl', e.target.value)}
            placeholder="https://api.plaud.ai"
          />
          <p style={{ fontSize: '0.85rem', color: '#6e6e73', marginTop: '-0.5rem' }}>
            Configure to automatically pull transcripts from Plaud
          </p>
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <h3>iCloud Calendar</h3>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#6e6e73' }}>
            Calendar URL (webcal://)
          </label>
          <input
            type="url"
            value={config.icalCalendarUrl}
            onChange={(e) => handleChange('icalCalendarUrl', e.target.value)}
            placeholder="webcal://..."
          />
          <p style={{ fontSize: '0.85rem', color: '#6e6e73', marginTop: '-0.5rem' }}>
            Find this in Calendar app → Calendar Settings → Right-click your calendar → Share
          </p>
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <h3>Database Configuration</h3>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#6e6e73' }}>
            Database Type
          </label>
          <select
            value={config.dbType}
            onChange={(e) => handleChange('dbType', e.target.value)}
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
            <option value="sqlite">SQLite (Default)</option>
            <option value="postgres">PostgreSQL</option>
          </select>

          {config.dbType === 'postgres' && (
            <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f5f5f7', borderRadius: '8px' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#6e6e73' }}>
                PostgreSQL Host
              </label>
              <input
                type="text"
                value={config.postgresHost}
                onChange={(e) => handleChange('postgresHost', e.target.value)}
                placeholder="localhost"
              />

              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#6e6e73' }}>
                Port
              </label>
              <input
                type="text"
                value={config.postgresPort}
                onChange={(e) => handleChange('postgresPort', e.target.value)}
                placeholder="5432"
              />

              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#6e6e73' }}>
                Database Name
              </label>
              <input
                type="text"
                value={config.postgresDb}
                onChange={(e) => handleChange('postgresDb', e.target.value)}
                placeholder="ai_chief_of_staff"
              />

              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#6e6e73' }}>
                Username
              </label>
              <input
                type="text"
                value={config.postgresUser}
                onChange={(e) => handleChange('postgresUser', e.target.value)}
                placeholder="postgres"
              />

              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#6e6e73' }}>
                Password
              </label>
              <input
                type="password"
                value={config.postgresPassword}
                onChange={(e) => handleChange('postgresPassword', e.target.value)}
                placeholder="••••••••"
                style={{ marginBottom: 0 }}
              />
            </div>
          )}
        </div>

        <button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>

      <div className="card">
        <h2>About</h2>
        <p>
          <strong>AI Chief of Staff</strong> - Your intelligent executive assistant
        </p>
        <p style={{ marginTop: '1rem', color: '#6e6e73', lineHeight: '1.6' }}>
          This application uses Claude AI to generate daily briefs, track commitments, 
          and maintain context from your meetings and emails.
        </p>
        <ul style={{ marginTop: '1rem', color: '#6e6e73', lineHeight: '1.8' }}>
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
