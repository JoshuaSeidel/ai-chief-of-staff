const express = require('express');
const router = express.Router();
const { createModuleLogger } = require('../utils/logger');
const googleCalendar = require('../services/google-calendar');

const logger = createModuleLogger('CALENDAR');

/**
 * Fetch calendar events from Google Calendar
 */
router.get('/events', async (req, res) => {
  try {
    // Check if Google Calendar is connected
    const isGoogleConnected = await googleCalendar.isConnected();
    
    if (!isGoogleConnected) {
      return res.status(400).json({ 
        error: 'No calendar configured',
        message: 'Please connect Google Calendar in Configuration'
      });
    }
    
    logger.info('Fetching events from Google Calendar');
    const events = await googleCalendar.listEvents(50);
    return res.json({ source: 'google', events });
  } catch (error) {
    logger.error('Error fetching calendar events', error);
    res.status(500).json({ 
      error: 'Error fetching calendar events', 
      message: error.message
    });
  }
});

/**
 * Create calendar event
 */
router.post('/block', async (req, res) => {
  const { title, startTime, endTime, description, attendees } = req.body;

  if (!title || !startTime || !endTime) {
    return res.status(400).json({ error: 'Title, startTime, and endTime are required' });
  }

  try {
    // Try Google Calendar first
    const isGoogleConnected = await googleCalendar.isConnected();
    
    if (isGoogleConnected) {
      logger.info(`Creating Google Calendar event: ${title}`);
      const event = await googleCalendar.createEvent({
        title,
        startTime,
        endTime,
        description,
        attendees
      });
      
      return res.json({
        success: true,
        source: 'google',
        event: {
          id: event.id,
          link: event.htmlLink
        },
        message: 'Event created in Google Calendar'
      });
    }
    
    // Fall back to ICS file generation
    logger.info(`Generating ICS file for: ${title}`);
    const icsContent = generateICS(title, startTime, endTime, description);
    
    res.json({
      success: true,
      source: 'ics',
      icsContent,
      message: 'ICS file generated. Download and import to your calendar.'
    });
  } catch (error) {
    logger.error('Error creating calendar event', error);
    res.status(500).json({ 
      error: 'Error creating calendar event',
      message: error.message
    });
  }
});

/**
 * Google OAuth - Debug redirect URI
 */
router.get('/google/debug-redirect', async (req, res) => {
  try {
    const { getDb } = require('../database/db');
    const db = getDb();
    
    const redirectUriRow = await db.get('SELECT value FROM config WHERE key = ?', ['googleRedirectUri']);
    const envRedirectUri = process.env.GOOGLE_REDIRECT_URI;
    
    res.json({
      configuredInDatabase: redirectUriRow?.value || null,
      environmentVariable: envRedirectUri || null,
      willUse: envRedirectUri || redirectUriRow?.value || 'http://localhost:3001/api/calendar/google/callback'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Google OAuth - Initiate
 */
router.get('/google/auth', async (req, res) => {
  try {
    const authUrl = await googleCalendar.getAuthUrl();
    res.json({ authUrl });
  } catch (error) {
    logger.error('Error generating auth URL', error);
    res.status(500).json({ 
      error: 'Error initiating Google Calendar authorization',
      message: error.message
    });
  }
});

/**
 * Google OAuth - Callback
 */
router.get('/google/callback', async (req, res) => {
  const { code, error } = req.query;
  
  if (error) {
    logger.error('OAuth callback error', error);
    return res.redirect('/#config?error=oauth_failed');
  }
  
  if (!code) {
    return res.redirect('/#config?error=no_code');
  }
  
  try {
    await googleCalendar.getTokenFromCode(code);
    logger.info('Google Calendar connected successfully');
    res.redirect('/#config?success=google_calendar_connected');
  } catch (error) {
    logger.error('Error exchanging code for token', error);
    res.redirect('/#config?error=oauth_exchange_failed');
  }
});

/**
 * Google Calendar - Check connection status
 */
router.get('/google/status', async (req, res) => {
  try {
    const connected = await googleCalendar.isConnected();
    res.json({ connected });
  } catch (error) {
    res.json({ connected: false, error: error.message });
  }
});

/**
 * Google Calendar - List available calendars
 */
router.get('/google/calendars', async (req, res) => {
  try {
    const calendars = await googleCalendar.listCalendars();
    res.json({ calendars });
  } catch (error) {
    logger.error('Error listing calendars', error);
    res.status(500).json({ 
      error: 'Error listing calendars',
      message: error.message
    });
  }
});

/**
 * Google Calendar - Disconnect
 */
router.post('/google/disconnect', async (req, res) => {
  try {
    await googleCalendar.disconnect();
    res.json({ message: 'Google Calendar disconnected successfully' });
  } catch (error) {
    logger.error('Error disconnecting Google Calendar', error);
    res.status(500).json({ error: 'Error disconnecting Google Calendar' });
  }
});

/**
 * Generate ICS format for calendar event
 */
function generateICS(title, startTime, endTime, description) {
  const start = new Date(startTime).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const end = new Date(endTime).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  
  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//AI Chief of Staff//EN
BEGIN:VEVENT
UID:${Date.now()}@aichiefofstaff
DTSTAMP:${start}
DTSTART:${start}
DTEND:${end}
SUMMARY:${title}
DESCRIPTION:${description || ''}
END:VEVENT
END:VCALENDAR`;
}

module.exports = router;
