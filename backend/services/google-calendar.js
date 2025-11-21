const { google } = require('googleapis');
const { getDb } = require('../database/db');
const { createModuleLogger } = require('../utils/logger');

const logger = createModuleLogger('GOOGLE-CALENDAR');

/**
 * Get OAuth2 client with credentials from database
 */
async function getOAuthClient() {
  const db = getDb();
  
  // Get Google OAuth credentials from config
  const clientIdRow = await db.get('SELECT value FROM config WHERE key = ?', ['googleClientId']);
  const clientSecretRow = await db.get('SELECT value FROM config WHERE key = ?', ['googleClientSecret']);
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/calendar/google/callback';
  
  if (!clientIdRow || !clientSecretRow) {
    throw new Error('Google OAuth credentials not configured');
  }
  
  const oauth2Client = new google.auth.OAuth2(
    clientIdRow.value,
    clientSecretRow.value,
    redirectUri
  );
  
  // Get stored access token if exists
  const tokenRow = await db.get('SELECT value FROM config WHERE key = ?', ['googleCalendarToken']);
  if (tokenRow && tokenRow.value) {
    try {
      const tokens = JSON.parse(tokenRow.value);
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
 */
async function getTokenFromCode(code) {
  const oauth2Client = await getOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  
  // Store tokens in database
  const db = getDb();
  await db.run(
    'INSERT OR REPLACE INTO config (key, value, updated_date) VALUES (?, ?, CURRENT_TIMESTAMP)',
    ['googleCalendarToken', JSON.stringify(tokens)]
  );
  
  logger.info('Google Calendar tokens stored successfully');
  return tokens;
}

/**
 * Check if user has connected Google Calendar
 */
async function isConnected() {
  const db = getDb();
  const tokenRow = await db.get('SELECT value FROM config WHERE key = ?', ['googleCalendarToken']);
  return !!(tokenRow && tokenRow.value);
}

/**
 * Disconnect Google Calendar
 */
async function disconnect() {
  const db = getDb();
  await db.run('DELETE FROM config WHERE key = ?', ['googleCalendarToken']);
  logger.info('Google Calendar disconnected');
}

/**
 * Create a calendar event
 */
async function createEvent(eventData) {
  try {
    const oauth2Client = await getOAuthClient();
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
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
    
    logger.info(`Creating calendar event: ${eventData.title}`);
    const response = await calendar.events.insert({
      calendarId: 'primary',
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
 */
async function listEvents(maxResults = 50) {
  try {
    const oauth2Client = await getOAuthClient();
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    const response = await calendar.events.list({
      calendarId: 'primary',
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
 */
async function createEventFromCommitment(commitment) {
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
    
    let description = commitment.description;
    
    // Add suggested approach if available
    if (commitment.suggested_approach) {
      description += `\n\n💡 Suggested Approach:\n${commitment.suggested_approach}`;
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
    
    const event = await createEvent({
      title: `[Commitment] ${commitment.description.substring(0, 80)}`,
      startTime,
      endTime,
      description,
      timeZone: 'America/New_York'
    });
    
    logger.info(`Created calendar event for commitment ${commitment.id}: ${event.id}`);
    return event;
  } catch (error) {
    logger.error(`Error creating event from commitment ${commitment.id}`, error);
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
  createEventFromCommitment
};

