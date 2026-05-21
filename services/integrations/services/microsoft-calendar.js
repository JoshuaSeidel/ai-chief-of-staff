const { Client } = require('@microsoft/microsoft-graph-client');
const fetch = require('node-fetch');
const { getConfig, setConfig, query } = require('../utils/db-helper');
const { getMicrosoftIdentityBaseUrl, requireMicrosoftTenantId, resolveMicrosoftTenantId } = require('../utils/microsoft-identity');

const logger = {
  info: (msg, ...args) => console.log(`[MS Calendar] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[MS Calendar ERROR] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[MS Calendar WARNING] ${msg}`, ...args)
};

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
 * Get Microsoft OAuth2 client configuration from database
 * Uses same credentials as Microsoft Planner
 */
async function getOAuthConfig() {
  const clientId = await getConfig('microsoftClientId') || process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = await getConfig('microsoftClientSecret') || process.env.MICROSOFT_CLIENT_SECRET;
  const rawTenantId = resolveMicrosoftTenantId(await getConfig('microsoftTenantId'), process.env.MICROSOFT_TENANT_ID);
  
  let redirectUri = process.env.MICROSOFT_REDIRECT_URI;
  if (!redirectUri) {
    redirectUri = await getConfig('microsoftRedirectUri') || 'http://localhost:3001/api/calendar/microsoft/callback';
  }
  
  logger.info(`Using Microsoft OAuth redirect URI: ${redirectUri}`);
  
  const missing = [];
  if (!clientId) missing.push('Client ID');
  if (!clientSecret) missing.push('Client Secret');
  if (!rawTenantId) missing.push('Tenant ID');
  
  if (missing.length > 0) {
    throw new Error(`Microsoft OAuth credentials not configured. Missing: ${missing.join(', ')}. Please configure in the Configuration page.`);
  }

  const tenantId = requireMicrosoftTenantId(rawTenantId);
  
  return {
    clientId,
    clientSecret,
    tenantId: tenantId || null,
    redirectUri
  };
}

/**
 * Generate OAuth URL for user to authorize (includes Calendar and Tasks scopes)
 */
async function getAuthUrl() {
  const { clientId, tenantId, redirectUri } = await getOAuthConfig();
  
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
    state: 'microsoft-integration-auth',
    prompt: 'select_account'
  });
  
  const url = `${getMicrosoftIdentityBaseUrl(tenantId)}/authorize?${params.toString()}`;
  
  logger.info('Generated Microsoft OAuth URL (Calendar + Tasks)');
  return url;
}

/**
 * Exchange authorization code for tokens
 */
async function getTokenFromCode(code) {
  const { clientId, clientSecret, tenantId, redirectUri } = await getOAuthConfig();
  
  const tokenUrl = `${getMicrosoftIdentityBaseUrl(tenantId)}/token`;
  
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
  
  if (tokens.expires_in && !tokens.expires_at) {
    tokens.expires_at = Math.floor(Date.now() / 1000) + tokens.expires_in;
  }
  
  // Store tokens in database (shared with Planner)
  await setConfig('microsoftToken', JSON.stringify(tokens));
  
  logger.info('Microsoft tokens stored successfully (Calendar + Tasks)');
  return tokens;
}

/**
 * Get Microsoft Graph client with stored tokens
 */
async function getGraphClient() {
  const tokenStr = await getConfig('microsoftToken');
  
  if (!tokenStr) {
    throw new Error('Microsoft not connected. Please connect in Configuration.');
  }
  
  const tokens = JSON.parse(tokenStr);
  
  const authProvider = new CustomAuthProvider(tokens, refreshToken);
  const client = Client.initWithMiddleware({ authProvider });
  
  return client;
}

/**
 * Refresh access token using refresh token
 */
async function refreshToken(refreshTokenValue) {
  const { clientId, clientSecret, tenantId } = await getOAuthConfig();
  
  const tokenUrl = `${getMicrosoftIdentityBaseUrl(tenantId)}/token`;
  
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
  
  if (tokens.expires_in && !tokens.expires_at) {
    tokens.expires_at = Math.floor(Date.now() / 1000) + tokens.expires_in;
  }
  
  await setConfig('microsoftToken', JSON.stringify(tokens));
  
  logger.info('Microsoft tokens refreshed successfully');
  return tokens;
}

/**
 * Check if user has connected Microsoft (shared token for Calendar and Planner)
 */
async function checkStatus() {
  try {
    const tokenStr = await getConfig('microsoftToken');
    if (!tokenStr) {
      return {
        connected: false,
        error: 'Not configured'
      };
    }
    
    const client = await getGraphClient();
    const user = await client.api('/me').get();
    
    logger.info(`Connected to Microsoft as: ${user.displayName} (${user.mail || user.userPrincipalName})`);
    
    return {
      connected: true,
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.mail || user.userPrincipalName
      }
    };
  } catch (error) {
    logger.warn('Microsoft connection check failed', error.message);
    return {
      connected: false,
      error: error.message
    };
  }
}

/**
 * Disconnect Microsoft (removes shared token)
 */
async function disconnect() {
  await query('DELETE FROM config WHERE key = ?', ['microsoftToken']);
  logger.info('Microsoft disconnected (Calendar + Planner)');
  return { success: true };
}

/**
 * Get configured calendar ID or default to primary
 */
async function getCalendarId() {
  const calendarId = await getConfig('microsoftCalendarId') || process.env.MICROSOFT_CALENDAR_ID || null;
  logger.info(`Using Microsoft Calendar ID: ${calendarId || 'default'}`);
  return calendarId;
}

/**
 * Create a calendar event
 */
async function createEvent(eventData) {
  try {
    const client = await getGraphClient();
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
      subject: response.subject,
      start: response.start?.dateTime,
      end: response.end?.dateTime,
      webLink: response.webLink
    };
  } catch (error) {
    logger.error('Error creating calendar event', error);
    throw error;
  }
}

/**
 * Update a calendar event
 */
async function updateEvent(eventId, updates) {
  try {
    const client = await getGraphClient();
    const calendarId = await getCalendarId();
    
    const event = {};
    
    if (updates.title) event.subject = updates.title;
    if (updates.description !== undefined) {
      event.body = {
        contentType: 'HTML',
        content: updates.description
      };
    }
    if (updates.startTime) {
      event.start = {
        dateTime: updates.startTime,
        timeZone: updates.timeZone || 'America/New_York'
      };
    }
    if (updates.endTime) {
      event.end = {
        dateTime: updates.endTime,
        timeZone: updates.timeZone || 'America/New_York'
      };
    }
    
    const endpoint = calendarId
      ? `/me/calendars/${calendarId}/events/${eventId}`
      : `/me/events/${eventId}`;
    
    const response = await client.api(endpoint).patch(event);
    
    logger.info(`Updated Microsoft Calendar event: ${eventId}`);
    
    return {
      id: response.id,
      subject: response.subject,
      start: response.start?.dateTime,
      end: response.end?.dateTime
    };
  } catch (error) {
    logger.error(`Error updating calendar event ${eventId}`, error);
    throw error;
  }
}

/**
 * List upcoming events
 */
async function listEvents(maxResults = 50, timeMin = null, timeMax = null) {
  try {
    const client = await getGraphClient();
    const calendarId = await getCalendarId();
    
    const endpoint = calendarId
      ? `/me/calendars/${calendarId}/events`
      : '/me/events';
    
    let apiCall = client.api(endpoint).top(maxResults).orderby('start/dateTime');
    
    if (timeMin) {
      apiCall = apiCall.filter(`start/dateTime ge '${new Date(timeMin).toISOString()}'`);
    } else {
      apiCall = apiCall.filter(`start/dateTime ge '${new Date().toISOString()}'`);
    }
    
    if (timeMax) {
      apiCall = apiCall.filter(`start/dateTime le '${new Date(timeMax).toISOString()}'`);
    }
    
    const response = await apiCall.get();
    
    const events = response.value || [];
    logger.info(`Retrieved ${events.length} calendar events`);
    
    return events.map(event => ({
      id: event.id,
      subject: event.subject,
      body: event.body?.content,
      start: event.start?.dateTime,
      end: event.end?.dateTime,
      location: event.location?.displayName,
      webLink: event.webLink,
      attendees: event.attendees?.map(a => a.emailAddress?.address) || []
    }));
  } catch (error) {
    logger.error('Error listing calendar events', error);
    throw error;
  }
}

/**
 * Get a specific event
 */
async function getEvent(eventId) {
  try {
    const client = await getGraphClient();
    const calendarId = await getCalendarId();
    
    const endpoint = calendarId
      ? `/me/calendars/${calendarId}/events/${eventId}`
      : `/me/events/${eventId}`;
    
    const event = await client.api(endpoint).get();
    
    return {
      id: event.id,
      subject: event.subject,
      body: event.body?.content,
      start: event.start?.dateTime,
      end: event.end?.dateTime,
      location: event.location?.displayName,
      webLink: event.webLink,
      attendees: event.attendees?.map(a => a.emailAddress?.address) || []
    };
  } catch (error) {
    logger.error(`Error getting calendar event ${eventId}`, error);
    throw error;
  }
}

/**
 * Delete a calendar event by ID
 */
async function deleteEvent(eventId) {
  try {
    const client = await getGraphClient();
    const calendarId = await getCalendarId();
    
    const endpoint = calendarId
      ? `/me/calendars/${calendarId}/events/${eventId}`
      : `/me/events/${eventId}`;
    
    await client.api(endpoint).delete();
    
    logger.info(`Deleted Microsoft Calendar event: ${eventId}`);
    return { success: true };
  } catch (error) {
    if (error.statusCode === 404 || error.message?.includes('Not Found')) {
      logger.warn(`Calendar event ${eventId} not found (may have been already deleted)`);
      return { success: false, error: 'Not found' };
    }
    logger.error(`Error deleting calendar event ${eventId}`, error);
    return { success: false, error: error.message };
  }
}

/**
 * List all calendars accessible to the user
 */
async function listCalendars() {
  try {
    const client = await getGraphClient();
    
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
  checkStatus,
  disconnect,
  createEvent,
  updateEvent,
  listEvents,
  getEvent,
  deleteEvent,
  listCalendars
};
