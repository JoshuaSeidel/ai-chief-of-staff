const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const googleCalendar = require('../services/google-calendar');
const microsoftCalendar = require('../services/microsoft-calendar');
const microsoftPlanner = require('../services/microsoft-planner');
const jira = require('../services/jira');
const {
  MICROSOFT_CALENDAR_SCOPES,
  MICROSOFT_EMAIL_SCOPES,
  MICROSOFT_TASK_SCOPES,
  hasAnyScope,
  missingScopes,
  normalizeScopes
} = require('../services/microsoft-scopes');
const { createModuleLogger } = require('../utils/logger');

const logger = createModuleLogger('CONNECTIVITY');

async function safeCheck(fn, fallback = false) {
  try {
    return await fn();
  } catch (error) {
    return fallback;
  }
}

async function getMicrosoftTokenInfo(profileId) {
  const db = getDb();
  const row = await db.get(
    'SELECT token_data, is_enabled FROM profile_integrations WHERE profile_id = ? AND integration_type = ? AND integration_name = ?',
    [profileId, 'calendar', 'microsoft']
  );

  if (!row || row.is_enabled === false || row.is_enabled === 0) {
    return { configured: false, hasToken: false, scopes: [] };
  }

  if (!row.token_data) {
    return { configured: true, hasToken: false, scopes: [] };
  }

  try {
    const token = JSON.parse(row.token_data);
    return {
      configured: true,
      hasToken: true,
      scopes: normalizeScopes(token.scope),
      rawScope: token.scope || ''
    };
  } catch (error) {
    logger.warn('Unable to parse Microsoft token for connectivity status', {
      profileId,
      message: error.message
    });
    return { configured: true, hasToken: false, scopes: [], invalid: true };
  }
}

async function hasConfiguredIntegration(profileId, integrationType, integrationName) {
  const db = getDb();
  const row = await db.get(
    'SELECT id, token_data, config, is_enabled FROM profile_integrations WHERE profile_id = ? AND integration_type = ? AND integration_name = ?',
    [profileId, integrationType, integrationName]
  );

  if (!row || row.is_enabled === false || row.is_enabled === 0) {
    return false;
  }

  return Boolean(row.token_data || row.config);
}

function statusPayload({ configured = true, connected, warning = false, provider = null, detail = '', reconnectRequired = false, missing = [] }) {
  let state = 'disconnected';
  if (connected) state = 'connected';
  if (warning) state = 'warning';

  return {
    configured,
    connected,
    state,
    provider,
    detail,
    reconnectRequired,
    missingScopes: missing
  };
}

router.get('/status', async (req, res) => {
  const profileId = req.profileId || 2;

  try {
    const [
      googleConnected,
      microsoftConnected,
      plannerConnected,
      jiraConnected,
      microsoftToken,
      plannerConfig,
      googleConfigured,
      jiraConfigured
    ] = await Promise.all([
      safeCheck(() => googleCalendar.isConnected(profileId)),
      safeCheck(() => microsoftCalendar.isConnected(profileId)),
      safeCheck(() => microsoftPlanner.isConnected(profileId)),
      safeCheck(() => jira.isConnected(profileId)),
      getMicrosoftTokenInfo(profileId),
      microsoftPlanner.getSyncConfig(profileId),
      hasConfiguredIntegration(profileId, 'calendar', 'google'),
      hasConfiguredIntegration(profileId, 'task', 'jira')
    ]);

    const microsoftConfigured = microsoftToken.configured;
    const meetingsConfigured = googleConfigured || microsoftConfigured;
    const hasMicrosoftCalendarScope = hasAnyScope(microsoftToken.scopes, MICROSOFT_CALENDAR_SCOPES);
    const hasMicrosoftTaskScope = hasAnyScope(microsoftToken.scopes, MICROSOFT_TASK_SCOPES);
    const hasEmailScope = hasAnyScope(microsoftToken.scopes, MICROSOFT_EMAIL_SCOPES);
    const microsoftNeedsReconnect = microsoftToken.hasToken;

    let meetings;
    if (!meetingsConfigured) {
      meetings = statusPayload({
        configured: false,
        connected: false,
        provider: null,
        detail: 'No calendar connection configured'
      });
    } else if (microsoftConnected && hasMicrosoftCalendarScope) {
      meetings = statusPayload({
        connected: true,
        provider: 'Microsoft Calendar',
        detail: 'Calendar access ready'
      });
    } else if (googleConnected) {
      meetings = statusPayload({
        connected: true,
        provider: 'Google Calendar',
        detail: 'Calendar access ready'
      });
    } else if (microsoftConnected && microsoftNeedsReconnect) {
      meetings = statusPayload({
        connected: false,
        warning: true,
        provider: 'Microsoft Calendar',
        detail: 'Reconnect Microsoft to grant calendar access',
        reconnectRequired: true,
        missing: missingScopes(microsoftToken.scopes, ['Calendars.ReadWrite'])
      });
    } else {
      meetings = statusPayload({
        connected: false,
        warning: true,
        provider: microsoftConfigured ? 'Microsoft Calendar' : 'Google Calendar',
        detail: 'Configured calendar is not connected'
      });
    }

    const email = microsoftConfigured && hasEmailScope
      ? statusPayload({
          connected: true,
          provider: 'Microsoft 365',
          detail: 'Mail access ready'
        })
      : statusPayload({
          configured: microsoftConfigured,
          connected: false,
          warning: microsoftConfigured,
          provider: microsoftConfigured ? 'Microsoft 365' : null,
          detail: microsoftConfigured
            ? 'Reconnect Microsoft to grant email access'
            : 'Microsoft email not connected',
          reconnectRequired: microsoftConfigured,
          missing: missingScopes(microsoftToken.scopes, ['Mail.ReadWrite'])
        });

    const planner = microsoftConfigured && plannerConnected && hasMicrosoftTaskScope && plannerConfig.sync_enabled
      ? statusPayload({
          connected: true,
          provider: plannerConfig.target_type === 'planner' ? 'Microsoft Planner' : 'Microsoft To Do',
          detail: 'Task sync ready'
        })
      : statusPayload({
          configured: microsoftConfigured || plannerConfig.sync_enabled,
          connected: false,
          warning: microsoftConfigured && plannerConnected && microsoftNeedsReconnect,
          provider: microsoftConfigured
            ? (plannerConfig.target_type === 'planner' ? 'Microsoft Planner' : 'Microsoft To Do')
            : null,
          detail: microsoftConfigured && plannerConnected && hasMicrosoftTaskScope
            ? 'Microsoft task sync is turned off'
            : microsoftConfigured && plannerConnected
              ? 'Reconnect Microsoft to grant task access'
              : 'Microsoft task sync not connected',
          reconnectRequired: microsoftConfigured && plannerConnected && microsoftNeedsReconnect,
          missing: missingScopes(microsoftToken.scopes, ['Tasks.ReadWrite'])
        });

    const jiraStatus = jiraConfigured && jiraConnected
      ? statusPayload({
          connected: true,
          provider: 'Jira',
          detail: 'Issue sync ready'
        })
      : statusPayload({
          configured: jiraConfigured,
          connected: false,
          warning: jiraConfigured,
          provider: jiraConfigured ? 'Jira' : null,
          detail: jiraConfigured ? 'Configured Jira is not connected' : 'Jira not connected'
        });

    res.json({
      success: true,
      profileId,
      checkedAt: new Date().toISOString(),
      services: {
        meetings,
        email,
        jira: jiraStatus,
        planner
      }
    });
  } catch (error) {
    logger.error('Error building connectivity status', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check connectivity',
      message: error.message
    });
  }
});

module.exports = router;
