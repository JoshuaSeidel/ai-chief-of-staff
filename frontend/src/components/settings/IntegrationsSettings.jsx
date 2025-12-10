import React, { useState, useEffect } from 'react';
import { calendarAPI, plannerAPI, integrationsAPI } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { useProfile } from '../../contexts/ProfileContext';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { CardSkeleton } from '../common/LoadingSkeleton';

function IntegrationCard({
  title,
  icon,
  description,
  connected,
  checking,
  onConnect,
  onDisconnect,
  children,
  expanded,
  onToggleExpand
}) {
  return (
    <div className={`integration-card ${connected ? 'integration-connected' : ''}`}>
      <div className="integration-header" onClick={onToggleExpand}>
        <div className="integration-info">
          <span className="integration-icon">{icon}</span>
          <div>
            <h4 className="integration-title">{title}</h4>
            <p className="integration-description">{description}</p>
          </div>
        </div>
        <div className="integration-status">
          {checking ? (
            <Badge variant="info" icon="⏳">Checking...</Badge>
          ) : connected ? (
            <Badge variant="success" icon="✓">Connected</Badge>
          ) : (
            <Badge variant="default" icon="">Not Connected</Badge>
          )}
          <span className={`integration-chevron ${expanded ? 'expanded' : ''}`}>▼</span>
        </div>
      </div>

      {expanded && (
        <div className="integration-body">
          {children}
          <div className="integration-actions">
            {connected ? (
              <Button variant="error" size="sm" onClick={onDisconnect}>
                Disconnect
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={onConnect}>
                Connect
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function IntegrationsSettings() {
  const { currentProfile } = useProfile();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [expandedCard, setExpandedCard] = useState(null);

  // Connection states
  const [googleConnected, setGoogleConnected] = useState(false);
  const [checkingGoogle, setCheckingGoogle] = useState(true);
  const [microsoftConnected, setMicrosoftConnected] = useState(false);
  const [checkingMicrosoft, setCheckingMicrosoft] = useState(true);
  const [jiraConnected, setJiraConnected] = useState(false);
  const [checkingJira, setCheckingJira] = useState(true);

  // Additional integration states
  const [trelloConnected, setTrelloConnected] = useState(false);
  const [checkingTrello, setCheckingTrello] = useState(true);
  const [mondayConnected, setMondayConnected] = useState(false);
  const [checkingMonday, setCheckingMonday] = useState(true);
  const [radicaleConnected, setRadicaleConnected] = useState(false);
  const [checkingRadicale, setCheckingRadicale] = useState(true);

  // Config states for OAuth integrations (credentials needed before connecting)
  const [googleConfig, setGoogleConfig] = useState({
    clientId: '',
    clientSecret: '',
    redirectUri: ''
  });
  const [microsoftConfig, setMicrosoftConfig] = useState({
    clientId: '',
    clientSecret: '',
    tenantId: '',
    redirectUri: ''
  });

  // Config states for non-OAuth integrations
  const [jiraConfig, setJiraConfig] = useState({
    baseUrl: '',
    email: '',
    apiToken: '',
    projectKey: ''
  });
  const [trelloConfig, setTrelloConfig] = useState({
    apiKey: '',
    apiToken: '',
    boardId: ''
  });
  const [mondayConfig, setMondayConfig] = useState({
    apiToken: '',
    boardId: ''
  });
  const [radicaleConfig, setRadicaleConfig] = useState({
    serverUrl: '',
    username: '',
    password: '',
    calendarPath: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    checkAllStatuses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProfile?.id]);

  const checkAllStatuses = async () => {
    setLoading(true);
    await Promise.all([
      checkGoogleStatus(),
      checkMicrosoftStatus(),
      checkJiraStatus(),
      checkTrelloStatus(),
      checkMondayStatus(),
      checkRadicaleStatus()
    ]);
    setLoading(false);
  };

  const checkGoogleStatus = async () => {
    setCheckingGoogle(true);
    try {
      const response = await calendarAPI.getGoogleStatus();
      setGoogleConnected(response.data.connected);

      // Load Google OAuth config
      const configResponse = await calendarAPI.getGoogleConfig();
      if (configResponse.data) {
        setGoogleConfig({
          clientId: configResponse.data.client_id || '',
          clientSecret: configResponse.data.client_secret || '',
          redirectUri: configResponse.data.redirect_uri || ''
        });
      }
    } catch (err) {
      console.error('Failed to check Google status:', err);
      setGoogleConnected(false);
    } finally {
      setCheckingGoogle(false);
    }
  };

  const checkMicrosoftStatus = async () => {
    setCheckingMicrosoft(true);
    try {
      const response = await calendarAPI.getMicrosoftStatus();
      setMicrosoftConnected(response.data.connected);

      // Load Microsoft OAuth config
      const configResponse = await calendarAPI.getMicrosoftConfig();
      if (configResponse.data) {
        setMicrosoftConfig({
          clientId: configResponse.data.client_id || '',
          clientSecret: configResponse.data.client_secret || '',
          tenantId: configResponse.data.tenant_id || 'common',
          redirectUri: configResponse.data.redirect_uri || ''
        });
      }
    } catch (err) {
      console.error('Failed to check Microsoft status:', err);
      setMicrosoftConnected(false);
    } finally {
      setCheckingMicrosoft(false);
    }
  };

  const checkJiraStatus = async () => {
    setCheckingJira(true);
    try {
      const response = await plannerAPI.getJiraStatus();
      setJiraConnected(response.data.connected);

      // Load Jira config from planner API
      const configResponse = await plannerAPI.getJiraConfig();
      if (configResponse.data) {
        setJiraConfig({
          baseUrl: configResponse.data.base_url || '',
          email: configResponse.data.email || '',
          apiToken: configResponse.data.api_token || '',
          projectKey: configResponse.data.project_key || ''
        });
      }
    } catch (err) {
      console.error('Failed to check Jira status:', err);
      setJiraConnected(false);
    } finally {
      setCheckingJira(false);
    }
  };

  const checkTrelloStatus = async () => {
    setCheckingTrello(true);
    try {
      const response = await integrationsAPI.getTrelloStatus();
      setTrelloConnected(response.data.connected);

      // Load Trello config
      const configResponse = await integrationsAPI.getTrelloConfig();
      if (configResponse.data) {
        setTrelloConfig({
          apiKey: configResponse.data.api_key || '',
          apiToken: configResponse.data.api_token || '',
          boardId: configResponse.data.board_id || ''
        });
      }
    } catch (err) {
      console.error('Failed to check Trello status:', err);
      setTrelloConnected(false);
    } finally {
      setCheckingTrello(false);
    }
  };

  const checkMondayStatus = async () => {
    setCheckingMonday(true);
    try {
      const response = await integrationsAPI.getMondayStatus();
      setMondayConnected(response.data.connected);

      // Load Monday config
      const configResponse = await integrationsAPI.getMondayConfig();
      if (configResponse.data) {
        setMondayConfig({
          apiToken: configResponse.data.api_token || '',
          boardId: configResponse.data.board_id || ''
        });
      }
    } catch (err) {
      console.error('Failed to check Monday status:', err);
      setMondayConnected(false);
    } finally {
      setCheckingMonday(false);
    }
  };

  const checkRadicaleStatus = async () => {
    setCheckingRadicale(true);
    try {
      const response = await integrationsAPI.getRadicaleStatus();
      setRadicaleConnected(response.data.connected);

      // Load Radicale config
      const configResponse = await integrationsAPI.getRadicaleConfig();
      if (configResponse.data) {
        setRadicaleConfig({
          serverUrl: configResponse.data.server_url || '',
          username: configResponse.data.username || '',
          password: configResponse.data.password || '',
          calendarPath: configResponse.data.calendar_path || ''
        });
      }
    } catch (err) {
      console.error('Failed to check Radicale status:', err);
      setRadicaleConnected(false);
    } finally {
      setCheckingRadicale(false);
    }
  };

  const handleGoogleSaveConfig = async () => {
    if (!googleConfig.clientId || !googleConfig.clientSecret || !googleConfig.redirectUri) {
      toast.warning('Please fill in Client ID, Client Secret, and Redirect URI');
      return;
    }

    setSaving(true);
    try {
      await calendarAPI.saveGoogleConfig({
        client_id: googleConfig.clientId,
        client_secret: googleConfig.clientSecret,
        redirect_uri: googleConfig.redirectUri
      });
      toast.success('Google configuration saved. You can now connect.');
    } catch (err) {
      toast.error('Failed to save Google configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleGoogleConnect = async () => {
    if (!googleConfig.clientId || !googleConfig.redirectUri) {
      toast.warning('Please configure and save Google OAuth settings first');
      setExpandedCard('google');
      return;
    }

    try {
      const response = await calendarAPI.getGoogleAuthUrl();
      if (response.data.authUrl) {
        window.location.href = response.data.authUrl;
      } else {
        toast.error('Failed to get Google authorization URL');
      }
    } catch (err) {
      toast.error('Failed to connect to Google: ' + err.message);
    }
  };

  const handleMicrosoftSaveConfig = async () => {
    if (!microsoftConfig.clientId || !microsoftConfig.clientSecret || !microsoftConfig.redirectUri) {
      toast.warning('Please fill in Client ID, Client Secret, and Redirect URI');
      return;
    }

    setSaving(true);
    try {
      await calendarAPI.saveMicrosoftConfig({
        client_id: microsoftConfig.clientId,
        client_secret: microsoftConfig.clientSecret,
        tenant_id: microsoftConfig.tenantId || 'common',
        redirect_uri: microsoftConfig.redirectUri
      });
      toast.success('Microsoft configuration saved. You can now connect.');
    } catch (err) {
      toast.error('Failed to save Microsoft configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleMicrosoftConnect = async () => {
    if (!microsoftConfig.clientId || !microsoftConfig.redirectUri) {
      toast.warning('Please configure and save Microsoft OAuth settings first');
      setExpandedCard('microsoft');
      return;
    }

    try {
      const response = await calendarAPI.getMicrosoftAuthUrl();
      if (response.data.authUrl) {
        window.location.href = response.data.authUrl;
      } else {
        toast.error('Failed to get Microsoft authorization URL');
      }
    } catch (err) {
      toast.error('Failed to connect to Microsoft: ' + err.message);
    }
  };

  const handleJiraSave = async () => {
    if (!jiraConfig.baseUrl || !jiraConfig.email || !jiraConfig.apiToken || !jiraConfig.projectKey) {
      toast.warning('Please fill in all Jira fields');
      return;
    }

    setSaving(true);
    try {
      await plannerAPI.saveJiraConfig({
        base_url: jiraConfig.baseUrl,
        email: jiraConfig.email,
        api_token: jiraConfig.apiToken,
        project_key: jiraConfig.projectKey
      });
      await checkJiraStatus();
      toast.success('Jira configuration saved');
    } catch (err) {
      toast.error('Failed to save Jira configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleTrelloSave = async () => {
    if (!trelloConfig.apiKey || !trelloConfig.apiToken) {
      toast.warning('Please fill in Trello API Key and Token');
      return;
    }

    setSaving(true);
    try {
      await integrationsAPI.saveTrelloConfig({
        api_key: trelloConfig.apiKey,
        api_token: trelloConfig.apiToken,
        board_id: trelloConfig.boardId
      });
      await checkTrelloStatus();
      toast.success('Trello configuration saved');
    } catch (err) {
      toast.error('Failed to save Trello configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleMondaySave = async () => {
    if (!mondayConfig.apiToken) {
      toast.warning('Please fill in Monday.com API Token');
      return;
    }

    setSaving(true);
    try {
      await integrationsAPI.saveMondayConfig({
        api_token: mondayConfig.apiToken,
        board_id: mondayConfig.boardId
      });
      await checkMondayStatus();
      toast.success('Monday.com configuration saved');
    } catch (err) {
      toast.error('Failed to save Monday.com configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleRadicaleSave = async () => {
    if (!radicaleConfig.serverUrl || !radicaleConfig.username || !radicaleConfig.password) {
      toast.warning('Please fill in CalDAV server URL, username, and password');
      return;
    }

    setSaving(true);
    try {
      await integrationsAPI.saveRadicaleConfig({
        server_url: radicaleConfig.serverUrl,
        username: radicaleConfig.username,
        password: radicaleConfig.password,
        calendar_path: radicaleConfig.calendarPath
      });
      await checkRadicaleStatus();
      toast.success('CalDAV configuration saved');
    } catch (err) {
      toast.error('Failed to save CalDAV configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async (service) => {
    const confirmed = await toast.confirm(`Are you sure you want to disconnect ${service}?`);
    if (!confirmed) return;

    try {
      if (service === 'Google') {
        await calendarAPI.disconnectGoogle();
        setGoogleConnected(false);
      } else if (service === 'Microsoft') {
        await calendarAPI.disconnectMicrosoft();
        setMicrosoftConnected(false);
      } else if (service === 'Jira') {
        await plannerAPI.disconnectJira();
        setJiraConnected(false);
        setJiraConfig({ baseUrl: '', email: '', apiToken: '', projectKey: '' });
      } else if (service === 'Trello') {
        await integrationsAPI.saveTrelloConfig({ api_key: '', api_token: '', board_id: '' });
        setTrelloConnected(false);
        setTrelloConfig({ apiKey: '', apiToken: '', boardId: '' });
      } else if (service === 'Monday.com') {
        await integrationsAPI.saveMondayConfig({ api_token: '', board_id: '' });
        setMondayConnected(false);
        setMondayConfig({ apiToken: '', boardId: '' });
      } else if (service === 'CalDAV') {
        await integrationsAPI.saveRadicaleConfig({ server_url: '', username: '', password: '', calendar_path: '' });
        setRadicaleConnected(false);
        setRadicaleConfig({ serverUrl: '', username: '', password: '', calendarPath: '' });
      }
      toast.success(`${service} disconnected`);
    } catch (err) {
      toast.error(`Failed to disconnect ${service}`);
    }
  };

  if (loading) {
    return (
      <div className="settings-section">
        <CardSkeleton lines={2} />
        <CardSkeleton lines={2} />
        <CardSkeleton lines={2} />
      </div>
    );
  }

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <h3>Integrations</h3>
        <p className="settings-section-description">
          Connect your calendar and task management services
        </p>
      </div>

      {/* Google Calendar */}
      <IntegrationCard
        title="Google Calendar"
        icon="📅"
        description="Sync events and create calendar blocks"
        connected={googleConnected}
        checking={checkingGoogle}
        onConnect={handleGoogleConnect}
        onDisconnect={() => handleDisconnect('Google')}
        expanded={expandedCard === 'google'}
        onToggleExpand={() => setExpandedCard(expandedCard === 'google' ? null : 'google')}
      >
        <p className="text-muted text-sm mb-3">
          Configure your Google OAuth credentials from Google Cloud Console, then click Connect.
        </p>
        <div className="form-group">
          <label className="form-label">Client ID</label>
          <input
            type="text"
            value={googleConfig.clientId}
            onChange={(e) => setGoogleConfig({ ...googleConfig, clientId: e.target.value })}
            placeholder="your-client-id.apps.googleusercontent.com"
            className="form-input"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Client Secret</label>
          <input
            type="password"
            value={googleConfig.clientSecret}
            onChange={(e) => setGoogleConfig({ ...googleConfig, clientSecret: e.target.value })}
            placeholder="Your client secret"
            className="form-input"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Redirect URI</label>
          <input
            type="text"
            value={googleConfig.redirectUri}
            onChange={(e) => setGoogleConfig({ ...googleConfig, redirectUri: e.target.value })}
            placeholder="https://your-domain.com/api/calendar/google/callback"
            className="form-input"
          />
          <span className="form-hint">
            Must match exactly in Google Cloud Console
          </span>
        </div>
        <div className="button-group">
          <Button variant="secondary" size="sm" onClick={handleGoogleSaveConfig} loading={saving}>
            Save Config
          </Button>
          {googleConfig.clientId && googleConfig.redirectUri && !googleConnected && (
            <Button variant="primary" size="sm" onClick={handleGoogleConnect}>
              Connect to Google
            </Button>
          )}
        </div>
      </IntegrationCard>

      {/* Microsoft */}
      <IntegrationCard
        title="Microsoft 365"
        icon="📋"
        description="Calendar, Planner, and To Do integration"
        connected={microsoftConnected}
        checking={checkingMicrosoft}
        onConnect={handleMicrosoftConnect}
        onDisconnect={() => handleDisconnect('Microsoft')}
        expanded={expandedCard === 'microsoft'}
        onToggleExpand={() => setExpandedCard(expandedCard === 'microsoft' ? null : 'microsoft')}
      >
        <p className="text-muted text-sm mb-3">
          Configure your Microsoft Azure AD app credentials, then click Connect.
        </p>
        <div className="form-group">
          <label className="form-label">Client ID (Application ID)</label>
          <input
            type="text"
            value={microsoftConfig.clientId}
            onChange={(e) => setMicrosoftConfig({ ...microsoftConfig, clientId: e.target.value })}
            placeholder="your-application-id"
            className="form-input"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Client Secret</label>
          <input
            type="password"
            value={microsoftConfig.clientSecret}
            onChange={(e) => setMicrosoftConfig({ ...microsoftConfig, clientSecret: e.target.value })}
            placeholder="Your client secret"
            className="form-input"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Tenant ID</label>
          <input
            type="text"
            value={microsoftConfig.tenantId}
            onChange={(e) => setMicrosoftConfig({ ...microsoftConfig, tenantId: e.target.value })}
            placeholder="common (or your tenant ID)"
            className="form-input"
          />
          <span className="form-hint">
            Use &quot;common&quot; for multi-tenant or your specific tenant ID
          </span>
        </div>
        <div className="form-group">
          <label className="form-label">Redirect URI</label>
          <input
            type="text"
            value={microsoftConfig.redirectUri}
            onChange={(e) => setMicrosoftConfig({ ...microsoftConfig, redirectUri: e.target.value })}
            placeholder="https://your-domain.com/api/calendar/microsoft/callback"
            className="form-input"
          />
          <span className="form-hint">
            Must match exactly in Azure AD app registration
          </span>
        </div>
        <div className="button-group">
          <Button variant="secondary" size="sm" onClick={handleMicrosoftSaveConfig} loading={saving}>
            Save Config
          </Button>
          {microsoftConfig.clientId && microsoftConfig.redirectUri && !microsoftConnected && (
            <Button variant="primary" size="sm" onClick={handleMicrosoftConnect}>
              Connect to Microsoft
            </Button>
          )}
        </div>
      </IntegrationCard>

      {/* Jira */}
      <IntegrationCard
        title="Jira"
        icon="🎯"
        description="Sync tasks with Jira issues"
        connected={jiraConnected}
        checking={checkingJira}
        onConnect={() => setExpandedCard('jira')}
        onDisconnect={() => handleDisconnect('Jira')}
        expanded={expandedCard === 'jira'}
        onToggleExpand={() => setExpandedCard(expandedCard === 'jira' ? null : 'jira')}
      >
        <div className="form-group">
          <label className="form-label">Jira Base URL</label>
          <input
            type="text"
            value={jiraConfig.baseUrl}
            onChange={(e) => setJiraConfig({ ...jiraConfig, baseUrl: e.target.value })}
            placeholder="https://your-domain.atlassian.net"
            className="form-input"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Email</label>
          <input
            type="email"
            value={jiraConfig.email}
            onChange={(e) => setJiraConfig({ ...jiraConfig, email: e.target.value })}
            placeholder="your-email@example.com"
            className="form-input"
          />
        </div>
        <div className="form-group">
          <label className="form-label">API Token</label>
          <input
            type="password"
            value={jiraConfig.apiToken}
            onChange={(e) => setJiraConfig({ ...jiraConfig, apiToken: e.target.value })}
            placeholder="Your Jira API token"
            className="form-input"
          />
          <span className="form-hint">
            <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer">
              Generate an API token
            </a>
          </span>
        </div>
        <div className="form-group">
          <label className="form-label">Project Key</label>
          <input
            type="text"
            value={jiraConfig.projectKey}
            onChange={(e) => setJiraConfig({ ...jiraConfig, projectKey: e.target.value })}
            placeholder="PROJECT"
            className="form-input"
          />
        </div>
        <Button variant="primary" size="sm" onClick={handleJiraSave} loading={saving}>
          Save Jira Settings
        </Button>
      </IntegrationCard>

      {/* Trello */}
      <IntegrationCard
        title="Trello"
        icon="📝"
        description="Sync tasks with Trello cards"
        connected={trelloConnected}
        checking={checkingTrello}
        onConnect={() => setExpandedCard('trello')}
        onDisconnect={() => handleDisconnect('Trello')}
        expanded={expandedCard === 'trello'}
        onToggleExpand={() => setExpandedCard(expandedCard === 'trello' ? null : 'trello')}
      >
        <div className="form-group">
          <label className="form-label">API Key</label>
          <input
            type="text"
            value={trelloConfig.apiKey}
            onChange={(e) => setTrelloConfig({ ...trelloConfig, apiKey: e.target.value })}
            placeholder="Your Trello API key"
            className="form-input"
          />
          <span className="form-hint">
            <a href="https://trello.com/app-key" target="_blank" rel="noopener noreferrer">
              Get your API key
            </a>
          </span>
        </div>
        <div className="form-group">
          <label className="form-label">API Token</label>
          <input
            type="password"
            value={trelloConfig.apiToken}
            onChange={(e) => setTrelloConfig({ ...trelloConfig, apiToken: e.target.value })}
            placeholder="Your Trello API token"
            className="form-input"
          />
          <span className="form-hint">
            Generate a token from the API key page above
          </span>
        </div>
        <div className="form-group">
          <label className="form-label">Board ID (optional)</label>
          <input
            type="text"
            value={trelloConfig.boardId}
            onChange={(e) => setTrelloConfig({ ...trelloConfig, boardId: e.target.value })}
            placeholder="Default board ID for new cards"
            className="form-input"
          />
        </div>
        <Button variant="primary" size="sm" onClick={handleTrelloSave} loading={saving}>
          Save Trello Settings
        </Button>
      </IntegrationCard>

      {/* Monday.com */}
      <IntegrationCard
        title="Monday.com"
        icon="📊"
        description="Sync tasks with Monday.com boards"
        connected={mondayConnected}
        checking={checkingMonday}
        onConnect={() => setExpandedCard('monday')}
        onDisconnect={() => handleDisconnect('Monday.com')}
        expanded={expandedCard === 'monday'}
        onToggleExpand={() => setExpandedCard(expandedCard === 'monday' ? null : 'monday')}
      >
        <div className="form-group">
          <label className="form-label">API Token</label>
          <input
            type="password"
            value={mondayConfig.apiToken}
            onChange={(e) => setMondayConfig({ ...mondayConfig, apiToken: e.target.value })}
            placeholder="Your Monday.com API token"
            className="form-input"
          />
          <span className="form-hint">
            <a href="https://monday.com/developers/apps" target="_blank" rel="noopener noreferrer">
              Get your API token
            </a>
          </span>
        </div>
        <div className="form-group">
          <label className="form-label">Board ID (optional)</label>
          <input
            type="text"
            value={mondayConfig.boardId}
            onChange={(e) => setMondayConfig({ ...mondayConfig, boardId: e.target.value })}
            placeholder="Default board ID for new items"
            className="form-input"
          />
        </div>
        <Button variant="primary" size="sm" onClick={handleMondaySave} loading={saving}>
          Save Monday.com Settings
        </Button>
      </IntegrationCard>

      {/* Radicale/CalDAV */}
      <IntegrationCard
        title="CalDAV (Radicale/Nextcloud)"
        icon="🗓️"
        description="Sync with self-hosted CalDAV servers"
        connected={radicaleConnected}
        checking={checkingRadicale}
        onConnect={() => setExpandedCard('radicale')}
        onDisconnect={() => handleDisconnect('CalDAV')}
        expanded={expandedCard === 'radicale'}
        onToggleExpand={() => setExpandedCard(expandedCard === 'radicale' ? null : 'radicale')}
      >
        <div className="form-group">
          <label className="form-label">Server URL</label>
          <input
            type="text"
            value={radicaleConfig.serverUrl}
            onChange={(e) => setRadicaleConfig({ ...radicaleConfig, serverUrl: e.target.value })}
            placeholder="https://caldav.example.com"
            className="form-input"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Username</label>
          <input
            type="text"
            value={radicaleConfig.username}
            onChange={(e) => setRadicaleConfig({ ...radicaleConfig, username: e.target.value })}
            placeholder="your-username"
            className="form-input"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Password</label>
          <input
            type="password"
            value={radicaleConfig.password}
            onChange={(e) => setRadicaleConfig({ ...radicaleConfig, password: e.target.value })}
            placeholder="Your CalDAV password"
            className="form-input"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Calendar Path (optional)</label>
          <input
            type="text"
            value={radicaleConfig.calendarPath}
            onChange={(e) => setRadicaleConfig({ ...radicaleConfig, calendarPath: e.target.value })}
            placeholder="/calendars/user/default/"
            className="form-input"
          />
          <span className="form-hint">
            Leave empty to auto-discover calendars
          </span>
        </div>
        <Button variant="primary" size="sm" onClick={handleRadicaleSave} loading={saving}>
          Save CalDAV Settings
        </Button>
      </IntegrationCard>
    </div>
  );
}

export default IntegrationsSettings;
