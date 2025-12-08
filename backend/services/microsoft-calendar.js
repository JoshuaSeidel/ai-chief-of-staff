const { Client } = require('@microsoft/microsoft-graph-client');
const { getDb } = require('../database/db');
const { createModuleLogger } = require('../utils/logger');
const { generateEventDescription } = require('./claude');

const logger = createModuleLogger('MICROSOFT-CALENDAR');

// Custom authentication provider for Microsoft Graph
class CustomAuthProvider {
  constructor(initialTokens, refreshCallback) {
    this.tokens = initialTokens;
    this.refreshCallback = refreshCallback;
  }
  
  async getAccessToken() {
    // Check if token is expired (expires_at is in seconds)
    if (this.tokens.expires_at && Date.now() >= this.tokens.expires_at * 1000) {
      if (this.refreshCallback) {
        this.tokens = await this.refreshCallback(this.tokens.refresh_token);
      }
    }
    return this.tokens.access_token;
  }
}

/**
 * Get Microsoft OAuth2 client with credentials from database
 * Uses same credentials as Microsoft Planner
 * @param {number} profileId - Profile ID (not used for credentials, but for consistency)
 */
async function getOAuthClient(profileId = 2) {
  const db = getDb();
  
  // Get Microsoft OAuth credentials from config (shared with Planner)
  const clientIdRow = await db.get('SELECT value FROM config WHERE key = ?', ['microsoftClientId']);
  const clientSecretRow = await db.get('SELECT value FROM config WHERE key = ?', ['microsoftClientSecret']);
  const tenantIdRow = await db.get('SELECT value FROM config WHERE key = ?', ['microsoftTenantId']);
  
  // Get redirect URI from config or environment variable
  let redirectUri = process.env.MICROSOFT_REDIRECT_URI;
  if (!redirectUri) {
    const redirectUriRow = await db.get('SELECT value FROM config WHERE key = ?', ['microsoftRedirectUri']);
    redirectUri = redirectUriRow?.value || 'http://localhost:3001/api/calendar/microsoft/callback';
  }
  
  logger.info(`Using Microsoft OAuth redirect URI: ${redirectUri} (multi-tenant mode)`);
  
  // Check which credentials are missing
  const missing = [];
  if (!clientIdRow || !clientIdRow.value) missing.push('Client ID');
  if (!clientSecretRow || !clientSecretRow.value) missing.push('Client Secret');
  
  if (missing.length > 0) {
    throw new Error(`Microsoft OAuth credentials not configured. Missing: ${missing.join(', ')}. Please configure in the Configuration page.`);
  }
  
  return {
    clientId: clientIdRow.value,
    clientSecret: clientSecretRow.value,
    tenantId: tenantIdRow?.value, // Optional for multi-tenant
    redirectUri
  };
}

/**
 * Generate OAuth URL for user to authorize (includes Calendar and Tasks scopes)
 */
/**
 * Generate OAuth URL for user to authorize
 * @param {number} profileId - Profile ID to include in state for callback
 */
async function getAuthUrl(profileId = 2) {
  const { clientId, redirectUri } = await getOAuthClient(profileId);
  
  // Microsoft OAuth2 authorization endpoint - using /common for multi-tenant support
  // Includes both Calendar and Tasks scopes for unified Microsoft integration
  const scopes = [
    'Calendars.ReadWrite',
    'Tasks.ReadWrite',
    'User.Read'
  ].join(' ');
  
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: scopes,
    state: profileId.toString(), // Include profileId in state for callback
    prompt: 'select_account' // Allow user to choose which account to use
  });
  
  // Use /common for multi-tenant support (works with any org or personal accounts)
  const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  
  logger.info(`Generated Microsoft OAuth URL (Calendar + Tasks) for profile ${profileId}`);
  return url;
}

/**
 * Exchange authorization code for tokens
 * @param {string} code - OAuth authorization code
 * @param {number} profileId - Profile ID to associate tokens with
 */
async function getTokenFromCode(code, profileId = 2) {
  const { clientId, clientSecret, redirectUri } = await getOAuthClient(profileId);
  
  // Use /common for multi-tenant token exchange
  const tokenUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/token`;
  
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    scope: 'Calendars.ReadWrite Tasks.ReadWrite User.Read'
  });
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Token exchange failed', { status: response.status, error: errorText });
    throw new Error(`Failed to exchange code for token: ${response.status}`);
  }
  
  const tokens = await response.json();
  
  // Calculate expires_at from expires_in
  if (tokens.expires_in && !tokens.expires_at) {
    tokens.expires_at = Math.floor(Date.now() / 1000) + tokens.expires_in;
  }
  
  // Store tokens in profile_integrations table
  const db = getDb();
  await db.run(
    `INSERT INTO profile_integrations (profile_id, integration_type, integration_name, token_data, is_enabled, created_date, updated_date)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (profile_id, integration_type, integration_name)
     DO UPDATE SET token_data = ?, is_enabled = ?, updated_date = CURRENT_TIMESTAMP`,
    [profileId, 'calendar', 'microsoft', JSON.stringify(tokens), true, JSON.stringify(tokens), true]
  );
  
  logger.info(`Microsoft tokens stored successfully for profile ${profileId} (Calendar + Tasks)`);
  return tokens;
}

/**
 * Get Microsoft Graph client with stored tokens
 * @param {number} profileId - Profile ID to get tokens for
 */
async function getGraphClient(profileId = 2) {
  const db = getDb();
  const tokenRow = await db.get(
    'SELECT token_data FROM profile_integrations WHERE profile_id = ? AND integration_type = ? AND integration_name = ?',
    [profileId, 'calendar', 'microsoft']
  );
  
  if (!tokenRow || !tokenRow.token_data) {
    throw new Error('Microsoft not connected. Please connect in Configuration.');
  }
  
  const tokens = JSON.parse(tokenRow.token_data);
  
  const authProvider = new CustomAuthProvider(tokens, refreshToken);
  const client = Client.initWithMiddleware({ authProvider });
  
  return client;
}

/**
 * Refresh access token using refresh token
 * @param {string} refreshTokenValue - The refresh token
 * @param {number} profileId - Profile ID to update tokens for
 */
async function refreshToken(refreshTokenValue, profileId = 2) {
  const { clientId, clientSecret } = await getOAuthClient(profileId);
  
  // Use /common for multi-tenant token refresh
  const tokenUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/token`;
  
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshTokenValue,
    grant_type: 'refresh_token',
    scope: 'Calendars.ReadWrite Tasks.ReadWrite User.Read'
  });
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Token refresh failed', { status: response.status, error: errorText });
    throw new Error(`Failed to refresh token: ${response.status}`);
  }
  
  const tokens = await response.json();
  
  // Calculate expires_at from expires_in
  if (tokens.expires_in && !tokens.expires_at) {
    tokens.expires_at = Math.floor(Date.now() / 1000) + tokens.expires_in;
  }
  
  // Store updated tokens in profile_integrations
  const db = getDb();
  await db.run(
    `UPDATE profile_integrations 
     SET token_data = ?, updated_date = CURRENT_TIMESTAMP 
     WHERE profile_id = ? AND integration_type = ? AND integration_name = ?`,
    [JSON.stringify(tokens), profileId, 'calendar', 'microsoft']
  );
  
  logger.info(`Microsoft tokens refreshed successfully for profile ${profileId}`);
  return tokens;
}

/**
 * Check if user has connected Microsoft for a profile
 * @param {number} profileId - Profile ID to check
 */
async function isConnected(profileId = 2) {
  const db = getDb();
  const tokenRow = await db.get(
    'SELECT token_data FROM profile_integrations WHERE profile_id = ? AND integration_type = ? AND integration_name = ? AND is_enabled = ?',
    [profileId, 'calendar', 'microsoft', true]
  );
  return !!(tokenRow && tokenRow.token_data);
}

/**
 * Disconnect Microsoft for a profile
 * @param {number} profileId - Profile ID to disconnect
 */
async function disconnect(profileId = 2) {
  const db = getDb();
  await db.run(
    'DELETE FROM profile_integrations WHERE profile_id = ? AND integration_type = ? AND integration_name = ?',
    [profileId, 'calendar', 'microsoft']
  );
  logger.info(`Microsoft disconnected for profile ${profileId} (Calendar + Planner)`);
}

/**
 * Get configured calendar ID or default to primary
 */
async function getCalendarId() {
  const db = getDb();
  const calendarIdRow = await db.get('SELECT value FROM config WHERE key = ?', ['microsoftCalendarId']);
  const calendarId = calendarIdRow?.value || process.env.MICROSOFT_CALENDAR_ID || null; // null = default calendar
  logger.info(`Using Microsoft Calendar ID: ${calendarId || 'default'}`);
  return calendarId;
}

/**
 * Create a calendar event
 * @param {object} eventData - Event data
 * @param {number} profileId - Profile ID to use
 */
async function createEvent(eventData, profileId = 2) {
  try {
    const client = await getGraphClient(profileId);
    const calendarId = await getCalendarId();
    
    const event = {
      subject: eventData.title,
      body: {
        contentType: 'HTML',
        content: eventData.description || ''
      },
      start: {
        dateTime: eventData.startTime,
        timeZone: eventData.timeZone || 'America/New_York'
      },
      end: {
        dateTime: eventData.endTime,
        timeZone: eventData.timeZone || 'America/New_York'
      },
      isReminderOn: true,
      reminderMinutesBeforeStart: 30
    };
    
    if (eventData.attendees && eventData.attendees.length > 0) {
      event.attendees = eventData.attendees.map(email => ({
        emailAddress: { address: email },
        type: 'required'
      }));
    }
    
    const endpoint = calendarId 
      ? `/me/calendars/${calendarId}/events`
      : '/me/events';
    
    logger.info(`Creating Microsoft Calendar event: ${eventData.title} in calendar: ${calendarId || 'default'}`);
    const response = await client.api(endpoint).post(event);
    
    logger.info(`Event created successfully: ${response.id}`);
    return {
      id: response.id,
      webLink: response.webLink,
      ...response
    };
  } catch (error) {
    logger.error('Error creating calendar event', error);
    throw error;
  }
}

/**
 * List upcoming events
 * @param {number} maxResults - Maximum number of results
 * @param {number} profileId - Profile ID to use
 */
async function listEvents(maxResults = 50, profileId = 2) {
  try {
    const client = await getGraphClient(profileId);
    const calendarId = await getCalendarId();
    
    const endpoint = calendarId
      ? `/me/calendars/${calendarId}/events`
      : '/me/events';
    
    const response = await client
      .api(endpoint)
      .filter(`start/dateTime ge '${new Date().toISOString()}'`)
      .top(maxResults)
      .orderby('start/dateTime')
      .get();
    
    const events = response.value || [];
    logger.info(`Retrieved ${events.length} upcoming events`);
    
    return events.map(event => ({
      id: event.id,
      subject: event.subject,
      body: event.body?.content,
      start: event.start?.dateTime,
      end: event.end?.dateTime,
      location: event.location?.displayName,
      webLink: event.webLink
    }));
  } catch (error) {
    logger.error('Error listing calendar events', error);
    throw error;
  }
}

/**
 * Create calendar event from commitment
 * @param {object} commitment - Commitment/task data
 * @param {number} profileId - Profile ID to use
 */
async function createEventFromCommitment(commitment, profileId = 2) {
  try {
    // Parse deadline to create event time
    const deadline = new Date(commitment.deadline);
    
    // Set event for 9 AM on the deadline date (or adjusted based on urgency)
    let eventTime = new Date(deadline);
    
    // Adjust time based on urgency
    if (commitment.urgency === 'high' || commitment.urgency === 'critical') {
      // High urgency: set for start of business day
      eventTime.setHours(9, 0, 0, 0);
    } else {
      // Normal/Low urgency: set for afternoon
      eventTime.setHours(14, 0, 0, 0);
    }
    
    const startTime = eventTime.toISOString();
    const endTime = new Date(eventTime.getTime() + 60 * 60 * 1000).toISOString(); // 1 hour duration
    
    // Generate detailed AI description
    logger.info(`Generating AI description for task: ${commitment.description.substring(0, 50)}...`);
    let description;
    try {
      description = await generateEventDescription(commitment, commitment.transcriptContext, profileId);
    } catch (err) {
      logger.warn('Failed to generate AI description, using fallback', err.message);
      // Fallback to basic description
      description = commitment.description;
      if (commitment.suggested_approach) {
        description += `\n\n💡 Suggested Approach:\n${commitment.suggested_approach}`;
      }
    }
    
    // Add urgency indicator
    if (commitment.urgency) {
      const urgencyEmoji = {
        'critical': '🔴',
        'high': '🟠',
        'medium': '🟡',
        'low': '🟢'
      };
      description = `${urgencyEmoji[commitment.urgency] || ''} ${description}`;
    }
    
    // Determine title prefix based on task type
    const typePrefix = {
      'commitment': '📋',
      'action': '⚡',
      'follow-up': '🔄',
      'risk': '⚠️'
    };
    const prefix = typePrefix[commitment.task_type || commitment.type] || '📋';
    const taskType = (commitment.task_type || commitment.type || 'Task').replace(/-/g, ' ');
    
    const event = await createEvent({
      title: `${prefix} [${taskType}] ${commitment.description.substring(0, 70)}`,
      startTime,
      endTime,
      description,
      timeZone: 'America/New_York'
    }, profileId);
    
    logger.info(`Created Microsoft Calendar event for ${taskType} ${commitment.id}: ${event.id}`);
    return event;
  } catch (error) {
    logger.error(`Error creating event from commitment ${commitment.id}`, error);
    throw error;
  }
}

/**
 * Delete a calendar event by ID
 * @param {string} eventId - Calendar event ID
 * @param {number} profileId - Profile ID to use
 */
async function deleteEvent(eventId, profileId = 2) {
  try {
    const client = await getGraphClient(profileId);
    const calendarId = await getCalendarId();
    
    const endpoint = calendarId
      ? `/me/calendars/${calendarId}/events/${eventId}`
      : `/me/events/${eventId}`;
    
    await client.api(endpoint).delete();
    
    logger.info(`Deleted Microsoft Calendar event: ${eventId}`);
    return true;
  } catch (error) {
    if (error.statusCode === 404 || error.message?.includes('Not Found')) {
      logger.warn(`Calendar event ${eventId} not found (may have been already deleted)`);
      return false;
    }
    logger.error(`Error deleting calendar event ${eventId}`, error);
    throw error;
  }
}

/**
 * List all calendars accessible to the user
 * @param {number} profileId - Profile ID to use
 */
async function listCalendars(profileId = 2) {
  try {
    const client = await getGraphClient(profileId);
    
    const response = await client.api('/me/calendars').get();
    
    const calendars = (response.value || []).map(cal => ({
      id: cal.id,
      name: cal.name,
      canEdit: cal.canEdit || false,
      isDefaultCalendar: cal.isDefaultCalendar || false,
      color: cal.color
    }));
    
    logger.info(`Retrieved ${calendars.length} calendars`);
    return calendars;
  } catch (error) {
    logger.error('Error listing calendars', error);
    throw error;
  }
}

module.exports = {
  getAuthUrl,
  getTokenFromCode,
  isConnected,
  disconnect,
  createEvent,
  listEvents,
  createEventFromCommitment,
  deleteEvent,
  listCalendars
};

