const { google } = require('googleapis');
const { getDb } = require('../database/db');
const { createModuleLogger } = require('../utils/logger');
const { generateEventDescription } = require('./claude');

const logger = createModuleLogger('GOOGLE-CALENDAR');

/**
 * Get OAuth2 client with credentials from database
 * @param {number} profileId - Profile ID to get tokens for
 */
async function getOAuthClient(profileId = 2) {
  const db = getDb();
  
  // Get Google OAuth credentials from config (global settings)
  const clientIdRow = await db.get('SELECT value FROM config WHERE key = ?', ['googleClientId']);
  const clientSecretRow = await db.get('SELECT value FROM config WHERE key = ?', ['googleClientSecret']);
  
  // Get redirect URI from config or environment variable
  let redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!redirectUri) {
    const redirectUriRow = await db.get('SELECT value FROM config WHERE key = ?', ['googleRedirectUri']);
    redirectUri = redirectUriRow?.value || 'http://localhost:3001/api/calendar/google/callback';
  }
  
  logger.info(`Using Google OAuth redirect URI: ${redirectUri}`);
  
  if (!clientIdRow || !clientSecretRow) {
    throw new Error('Google OAuth credentials not configured');
  }
  
  const oauth2Client = new google.auth.OAuth2(
    clientIdRow.value,
    clientSecretRow.value,
    redirectUri
  );
  
  // Get stored access token for this profile from profile_integrations
  const tokenRow = await db.get(
    'SELECT token_data FROM profile_integrations WHERE profile_id = ? AND integration_type = ? AND integration_name = ?',
    [profileId, 'calendar', 'google']
  );
  
  if (tokenRow && tokenRow.token_data) {
    try {
      const tokens = JSON.parse(tokenRow.token_data);
      oauth2Client.setCredentials(tokens);
    } catch (err) {
      logger.warn('Failed to parse stored token', err);
    }
  }
  
  return oauth2Client;
}

/**
 * Generate OAuth URL for user to authorize
 */
async function getAuthUrl() {
  const oauth2Client = await getOAuthClient();
  
  const scopes = [
    'https://www.googleapis.com/auth/calendar.events'
  ];
  
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent' // Force consent screen to get refresh token
  });
  
  return url;
}

/**
 * Exchange authorization code for tokens
 * @param {string} code - OAuth authorization code
 * @param {number} profileId - Profile ID to associate tokens with
 */
async function getTokenFromCode(code, profileId = 2) {
  const oauth2Client = await getOAuthClient(profileId);
  const { tokens } = await oauth2Client.getToken(code);
  
  // Store tokens in profile_integrations table
  const db = getDb();
  await db.run(
    `INSERT INTO profile_integrations (profile_id, integration_type, integration_name, token_data, is_enabled, created_date, updated_date)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (profile_id, integration_type, integration_name)
     DO UPDATE SET token_data = ?, is_enabled = ?, updated_date = CURRENT_TIMESTAMP`,
    [profileId, 'calendar', 'google', JSON.stringify(tokens), true, JSON.stringify(tokens), true]
  );
  
  logger.info(`Google Calendar tokens stored successfully for profile ${profileId}`);
  return tokens;
}

/**
 * Check if user has connected Google Calendar for a profile
 * @param {number} profileId - Profile ID to check
 */
async function isConnected(profileId = 2) {
  const db = getDb();
  const tokenRow = await db.get(
    'SELECT token_data FROM profile_integrations WHERE profile_id = ? AND integration_type = ? AND integration_name = ? AND is_enabled = ?',
    [profileId, 'calendar', 'google', true]
  );
  return !!(tokenRow && tokenRow.token_data);
}

/**
 * Disconnect Google Calendar for a profile
 * @param {number} profileId - Profile ID to disconnect
 */
async function disconnect(profileId = 2) {
  const db = getDb();
  await db.run(
    'DELETE FROM profile_integrations WHERE profile_id = ? AND integration_type = ? AND integration_name = ?',
    [profileId, 'calendar', 'google']
  );
  logger.info(`Google Calendar disconnected for profile ${profileId}`);
}

/**
 * Get configured calendar ID or default to primary
 */
async function getCalendarId() {
  const db = getDb();
  const calendarIdRow = await db.get('SELECT value FROM config WHERE key = ?', ['googleCalendarId']);
  const calendarId = calendarIdRow?.value || process.env.GOOGLE_CALENDAR_ID || 'primary';
  logger.info(`Using Google Calendar ID: ${calendarId}`);
  return calendarId;
}

/**
 * Create a calendar event
 * @param {object} eventData - Event data
 * @param {number} profileId - Profile ID to use
 */
async function createEvent(eventData, profileId = 2) {
  try {
    const oauth2Client = await getOAuthClient(profileId);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const calendarId = await getCalendarId();
    
    const event = {
      summary: eventData.title,
      description: eventData.description || '',
      start: {
        dateTime: eventData.startTime,
        timeZone: eventData.timeZone || 'America/New_York',
      },
      end: {
        dateTime: eventData.endTime,
        timeZone: eventData.timeZone || 'America/New_York',
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 }, // 1 day before
          { method: 'popup', minutes: 30 }, // 30 minutes before
        ],
      },
    };
    
    if (eventData.attendees && eventData.attendees.length > 0) {
      event.attendees = eventData.attendees.map(email => ({ email }));
    }
    
    logger.info(`Creating calendar event: ${eventData.title} in calendar: ${calendarId}`);
    const response = await calendar.events.insert({
      calendarId: calendarId,
      requestBody: event,
    });
    
    logger.info(`Event created successfully: ${response.data.id}`);
    return response.data;
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
    const oauth2Client = await getOAuthClient(profileId);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const calendarId = await getCalendarId();
    
    const response = await calendar.events.list({
      calendarId: calendarId,
      timeMin: new Date().toISOString(),
      maxResults: maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    });
    
    const events = response.data.items || [];
    logger.info(`Retrieved ${events.length} upcoming events`);
    
    return events.map(event => ({
      id: event.id,
      summary: event.summary,
      description: event.description,
      start: event.start.dateTime || event.start.date,
      end: event.end.dateTime || event.end.date,
      location: event.location,
      htmlLink: event.htmlLink
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
    
    logger.info(`Created calendar event for ${taskType} ${commitment.id}: ${event.id}`);
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
    const oauth2Client = await getOAuthClient(profileId);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    const db = getDb();
    const calendarIdRow = await db.get('SELECT value FROM config WHERE key = ?', ['googleCalendarId']);
    const calendarId = calendarIdRow?.value || 'primary';
    
    await calendar.events.delete({
      calendarId,
      eventId
    });
    
    logger.info(`Deleted calendar event: ${eventId}`);
    return true;
  } catch (error) {
    if (error.code === 404 || error.message?.includes('Not Found')) {
      logger.warn(`Calendar event ${eventId} not found (may have been already deleted)`);
      return false;
    }
    logger.error(`Error deleting calendar event ${eventId}`, error);
    throw error;
  }
}

/**
 * Delete multiple calendar events by IDs
 * @param {string[]} eventIds - Array of calendar event IDs
 * @param {number} profileId - Profile ID to use
 */
async function deleteEvents(eventIds, profileId = 2) {
  const results = [];
  for (const eventId of eventIds) {
    try {
      const deleted = await deleteEvent(eventId, profileId);
      results.push({ eventId, deleted });
    } catch (error) {
      logger.error(`Failed to delete event ${eventId}:`, error.message);
      results.push({ eventId, deleted: false, error: error.message });
    }
  }
  return results;
}

/**
 * List all calendars accessible to the user
 * @param {number} profileId - Profile ID to use
 */
async function listCalendars(profileId = 2) {
  try {
    const oauth2Client = await getOAuthClient(profileId);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    const response = await calendar.calendarList.list();
    
    const calendars = response.data.items.map(cal => ({
      id: cal.id,
      name: cal.summary,
      description: cal.description,
      primary: cal.primary || false,
      accessRole: cal.accessRole,
      backgroundColor: cal.backgroundColor,
      foregroundColor: cal.foregroundColor
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
  deleteEvents,
  listCalendars
};

