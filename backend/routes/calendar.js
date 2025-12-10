const express = require('express');
const router = express.Router();
const { createModuleLogger } = require('../utils/logger');
const { getConfig } = require('../config/manager');
const googleCalendar = require('../services/google-calendar');
const microsoftCalendar = require('../services/microsoft-calendar');

const logger = createModuleLogger('CALENDAR');

/**
 * Fetch calendar events from connected calendar (Google or Microsoft)
 */
router.get('/events', async (req, res) => {
  try {
    const profileId = req.profileId || 2;
    
    // Get configuration
    const googleEnabled = await getConfig('googleCalendarEnabled', true);
    const microsoftEnabled = await getConfig('microsoftEnabled', false);
    
    // Try Google Calendar first (if enabled)
    if (googleEnabled) {
      const isGoogleConnected = await googleCalendar.isConnected(profileId);
      if (isGoogleConnected) {
        logger.info(`Fetching events from Google Calendar for profile ${profileId}`);
        const events = await googleCalendar.listEvents(50, profileId);
        return res.json({ source: 'google', events });
      }
    }
    
    // Try Microsoft Calendar (if enabled)
    if (microsoftEnabled) {
      const isMicrosoftConnected = await microsoftCalendar.isConnected(profileId);
      if (isMicrosoftConnected) {
        logger.info(`Fetching events from Microsoft Calendar for profile ${profileId}`);
        const events = await microsoftCalendar.listEvents(50, profileId);
        return res.json({ source: 'microsoft', events });
      }
    }
    
    return res.status(200).json({ 
      source: 'none',
      events: [],
      message: 'No calendar connected. Calendar integration is optional. Connect Google Calendar or Microsoft Calendar in Configuration to sync events.'
    });
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
  const profileId = req.profileId || 2;

  if (!title || !startTime || !endTime) {
    return res.status(400).json({ error: 'Title, startTime, and endTime are required' });
  }

  try {
    // Try Google Calendar first
    const isGoogleConnected = await googleCalendar.isConnected(profileId);
    if (isGoogleConnected) {
      logger.info(`Creating Google Calendar event: ${title} for profile ${profileId}`);
      const event = await googleCalendar.createEvent({
        title,
        startTime,
        endTime,
        description,
        attendees
      }, profileId);
      
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
    
    // Try Microsoft Calendar
    const isMicrosoftConnected = await microsoftCalendar.isConnected(profileId);
    if (isMicrosoftConnected) {
      logger.info(`Creating Microsoft Calendar event: ${title} for profile ${profileId}`);
      const event = await microsoftCalendar.createEvent({
        title,
        startTime,
        endTime,
        description,
        attendees
      }, profileId);
      
      return res.json({
        success: true,
        source: 'microsoft',
        event: {
          id: event.id,
          link: event.webLink
        },
        message: 'Event created in Microsoft Calendar'
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
 * Google OAuth - Get configuration
 */
router.get('/google/config', async (req, res) => {
  try {
    const { getDb } = require('../database/db');
    const db = getDb();

    const clientIdRow = await db.get('SELECT value FROM config WHERE key = ?', ['googleClientId']);
    const clientSecretRow = await db.get('SELECT value FROM config WHERE key = ?', ['googleClientSecret']);
    const redirectUriRow = await db.get('SELECT value FROM config WHERE key = ?', ['googleRedirectUri']);

    res.json({
      client_id: clientIdRow?.value || '',
      client_secret: clientSecretRow?.value ? '********' : '', // Don't expose secret
      redirect_uri: redirectUriRow?.value || ''
    });
  } catch (error) {
    logger.error('Error getting Google config', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Google OAuth - Save configuration
 */
router.post('/google/config', async (req, res) => {
  try {
    const { client_id, client_secret, redirect_uri } = req.body;
    const { getDb } = require('../database/db');
    const db = getDb();

    // Update each config key
    if (client_id !== undefined) {
      await db.run(
        'INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
        ['googleClientId', client_id]
      );
    }
    if (client_secret !== undefined && client_secret !== '********') {
      await db.run(
        'INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
        ['googleClientSecret', client_secret]
      );
    }
    if (redirect_uri !== undefined) {
      await db.run(
        'INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
        ['googleRedirectUri', redirect_uri]
      );
    }

    logger.info('Google OAuth config saved');
    res.json({ success: true, message: 'Google configuration saved' });
  } catch (error) {
    logger.error('Error saving Google config', error);
    res.status(500).json({ error: error.message });
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
    const profileId = req.profileId || 2;

    // Get request origin for redirect URI
    const origin = req.get('origin') || req.get('referer')?.split('/').slice(0, 3).join('/') || null;

    logger.info(`Initiating Google OAuth for profile ${profileId}`, {
      profileId,
      origin,
      headers: {
        'x-profile-id': req.headers['x-profile-id'],
        'origin': req.get('origin'),
        'referer': req.get('referer')
      }
    });

    const authUrl = await googleCalendar.getAuthUrl(profileId, origin);
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
  const { code, error, state } = req.query;

  logger.info('Google OAuth callback received', {
    hasCode: !!code,
    hasError: !!error,
    state,
    middlewareProfileId: req.profileId
  });

  // IMPORTANT: Prioritize state parameter (from OAuth flow) over middleware's profileId
  // The state parameter contains the profile ID that initiated the OAuth flow
  const profileId = (state && parseInt(state)) || req.profileId || 2;

  logger.info(`Using profile ID: ${profileId} (from state: ${state})`);

  if (error) {
    logger.error('OAuth callback error', { error, state });
    return res.redirect('/#config?error=oauth_failed');
  }

  if (!code) {
    logger.error('OAuth callback missing code');
    return res.redirect('/#config?error=no_code');
  }

  try {
    await googleCalendar.getTokenFromCode(code, profileId);
    logger.info(`Google Calendar connected successfully for profile ${profileId}`);
    res.redirect(`/#config?success=google_calendar_connected&profile=${profileId}`);
  } catch (err) {
    logger.error('Error exchanging code for token', { error: err.message, profileId });
    res.redirect('/#config?error=oauth_exchange_failed');
  }
});

/**
 * Google Calendar - Check connection status
 */
router.get('/google/status', async (req, res) => {
  try {
    const profileId = req.profileId || 2;
    logger.info(`Checking Google Calendar status for profile ${profileId}`, {
      profileId,
      headerProfileId: req.headers['x-profile-id']
    });
    const connected = await googleCalendar.isConnected(profileId);
    logger.info(`Google Calendar connected: ${connected} for profile ${profileId}`);
    res.json({ connected, profileId });
  } catch (error) {
    logger.error('Error checking Google status', { error: error.message, profileId: req.profileId });
    res.json({ connected: false, error: error.message });
  }
});

/**
 * Google Calendar - List available calendars
 */
router.get('/google/calendars', async (req, res) => {
  try {
    const profileId = req.profileId || 2;
    const calendars = await googleCalendar.listCalendars(profileId);
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
    const profileId = req.profileId || 2;
    await googleCalendar.disconnect(profileId);
    res.json({ message: 'Google Calendar disconnected successfully' });
  } catch (error) {
    logger.error('Error disconnecting Google Calendar', error);
    res.status(500).json({ error: 'Error disconnecting Google Calendar' });
  }
});

/**
 * Microsoft OAuth - Get configuration
 */
router.get('/microsoft/config', async (req, res) => {
  try {
    const { getDb } = require('../database/db');
    const db = getDb();

    const clientIdRow = await db.get('SELECT value FROM config WHERE key = ?', ['microsoftClientId']);
    const clientSecretRow = await db.get('SELECT value FROM config WHERE key = ?', ['microsoftClientSecret']);
    const tenantIdRow = await db.get('SELECT value FROM config WHERE key = ?', ['microsoftTenantId']);
    const redirectUriRow = await db.get('SELECT value FROM config WHERE key = ?', ['microsoftRedirectUri']);

    res.json({
      client_id: clientIdRow?.value || '',
      client_secret: clientSecretRow?.value ? '********' : '', // Don't expose secret
      tenant_id: tenantIdRow?.value || 'common',
      redirect_uri: redirectUriRow?.value || ''
    });
  } catch (error) {
    logger.error('Error getting Microsoft config', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Microsoft OAuth - Save configuration
 */
router.post('/microsoft/config', async (req, res) => {
  try {
    const { client_id, client_secret, tenant_id, redirect_uri } = req.body;
    const { getDb } = require('../database/db');
    const db = getDb();

    if (client_id !== undefined) {
      await db.run(
        'INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
        ['microsoftClientId', client_id]
      );
    }
    if (client_secret !== undefined && client_secret !== '********') {
      await db.run(
        'INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
        ['microsoftClientSecret', client_secret]
      );
    }
    if (tenant_id !== undefined) {
      await db.run(
        'INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
        ['microsoftTenantId', tenant_id]
      );
    }
    if (redirect_uri !== undefined) {
      await db.run(
        'INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
        ['microsoftRedirectUri', redirect_uri]
      );
    }

    logger.info('Microsoft OAuth config saved');
    res.json({ success: true, message: 'Microsoft configuration saved' });
  } catch (error) {
    logger.error('Error saving Microsoft config', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Microsoft OAuth - Initiate
 */
router.get('/microsoft/auth', async (req, res) => {
  try {
    const profileId = req.profileId || 2;
    const authUrl = await microsoftCalendar.getAuthUrl(profileId);
    res.json({ authUrl });
  } catch (error) {
    logger.error('Error generating Microsoft auth URL', error);
    res.status(500).json({
      error: 'Error initiating Microsoft Calendar authorization',
      message: error.message
    });
  }
});

/**
 * Microsoft OAuth - Callback
 */
router.get('/microsoft/callback', async (req, res) => {
  const { code, error, state } = req.query;
  // IMPORTANT: Prioritize state parameter (from OAuth flow) over middleware's profileId
  const profileId = (state && parseInt(state)) || req.profileId || 2;

  if (error) {
    logger.error('OAuth callback error', error);
    return res.redirect('/#config?error=microsoft_oauth_failed');
  }

  if (!code) {
    return res.redirect('/#config?error=no_code');
  }

  try {
    await microsoftCalendar.getTokenFromCode(code, profileId);
    logger.info(`Microsoft Calendar connected successfully for profile ${profileId}`);
    res.redirect(`/#config?success=microsoft_calendar_connected&profile=${profileId}`);
  } catch (error) {
    logger.error('Error exchanging code for token', error);
    res.redirect('/#config?error=microsoft_oauth_exchange_failed');
  }
});

/**
 * Microsoft Calendar - Check connection status
 */
router.get('/microsoft/status', async (req, res) => {
  try {
    const profileId = req.profileId || 2;
    const connected = await microsoftCalendar.isConnected(profileId);
    res.json({ connected, profileId });
  } catch (error) {
    res.json({ connected: false, error: error.message });
  }
});

/**
 * Microsoft Calendar - List available calendars
 */
router.get('/microsoft/calendars', async (req, res) => {
  try {
    const profileId = req.profileId || 2;
    const calendars = await microsoftCalendar.listCalendars(profileId);
    res.json({ calendars });
  } catch (error) {
    logger.error('Error listing Microsoft calendars', error);
    res.status(500).json({ 
      error: 'Error listing calendars',
      message: error.message
    });
  }
});

/**
 * Microsoft Calendar - Disconnect
 */
router.post('/microsoft/disconnect', async (req, res) => {
  try {
    const profileId = req.profileId || 2;
    await microsoftCalendar.disconnect(profileId);
    res.json({ message: 'Microsoft Calendar disconnected successfully' });
  } catch (error) {
    logger.error('Error disconnecting Microsoft Calendar', error);
    res.status(500).json({ error: 'Error disconnecting Microsoft Calendar' });
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
