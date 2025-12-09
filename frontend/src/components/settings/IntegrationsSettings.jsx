import React, { useState, useEffect } from 'react';
import { configAPI, calendarAPI, plannerAPI } from '../../services/api';
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

  // Config states for non-OAuth integrations
  const [jiraConfig, setJiraConfig] = useState({
    baseUrl: '',
    email: '',
    apiToken: '',
    projectKey: ''
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
      checkJiraStatus()
    ]);
    setLoading(false);
  };

  const checkGoogleStatus = async () => {
    setCheckingGoogle(true);
    try {
      const response = await calendarAPI.getGoogleStatus();
      setGoogleConnected(response.data.connected);
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

      // Load Jira config
      const configResponse = await configAPI.getAll();
      const data = configResponse.data;
      setJiraConfig({
        baseUrl: data.jira_base_url || '',
        email: data.jira_email || '',
        apiToken: data.jira_api_token || '',
        projectKey: data.jira_project_key || ''
      });
    } catch (err) {
      console.error('Failed to check Jira status:', err);
      setJiraConnected(false);
    } finally {
      setCheckingJira(false);
    }
  };

  const handleGoogleConnect = async () => {
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

  const handleMicrosoftConnect = async () => {
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
      await configAPI.bulkUpdate({
        jira_base_url: jiraConfig.baseUrl,
        jira_email: jiraConfig.email,
        jira_api_token: jiraConfig.apiToken,
        jira_project_key: jiraConfig.projectKey
      });
      await checkJiraStatus();
      toast.success('Jira configuration saved');
    } catch (err) {
      toast.error('Failed to save Jira configuration');
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
        <p className="text-muted text-sm">
          Connect your Google Calendar to sync events and automatically create calendar blocks for tasks.
        </p>
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
        <p className="text-muted text-sm">
          Connect to Microsoft 365 for calendar sync and task management with Planner/To Do.
        </p>
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
    </div>
  );
}

export default IntegrationsSettings;
