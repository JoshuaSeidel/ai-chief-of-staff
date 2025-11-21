const express = require('express');
const router = express.Router();
const ical = require('node-ical');
const { createModuleLogger } = require('../utils/logger');

const logger = createModuleLogger('CALENDAR');

/**
 * Fetch calendar events from iCloud
 */
router.get('/events', async (req, res) => {
  const calendarUrl = process.env.ICAL_CALENDAR_URL;
  
  if (!calendarUrl) {
    logger.warn('Calendar events requested but iCloud calendar URL not configured');
    return res.status(400).json({ error: 'iCloud calendar URL not configured' });
  }

  try {
    logger.info('Fetching calendar events from iCloud');
    const events = await ical.async.fromURL(calendarUrl);
    const eventList = [];

    for (const [key, event] of Object.entries(events)) {
      if (event.type === 'VEVENT') {
        eventList.push({
          id: key,
          summary: event.summary,
          start: event.start,
          end: event.end,
          description: event.description,
          location: event.location
        });
      }
    }

    logger.info(`Retrieved ${eventList.length} calendar events`);
    res.json(eventList);
  } catch (error) {
    logger.error('Error fetching calendar events', error);
    res.status(500).json({ error: 'Error fetching calendar events', message: error.message });
  }
});

/**
 * Create calendar block (note: iCloud webcal is read-only, this is a placeholder)
 */
router.post('/block', async (req, res) => {
  const { title, startTime, endTime, description } = req.body;

  if (!title || !startTime || !endTime) {
    logger.warn('Calendar block creation attempted with missing required fields');
    return res.status(400).json({ error: 'Title, startTime, and endTime are required' });
  }

  logger.info(`Creating calendar block: ${title}`, {
    start: startTime,
    end: endTime
  });

  // NOTE: iCloud calendar URLs are typically read-only
  // To create events, you would need to use CalDAV protocol or macOS Calendar app
  // This is a placeholder that returns the event data for manual creation
  
  const event = {
    title,
    startTime,
    endTime,
    description,
    icsFormat: generateICS(title, startTime, endTime, description)
  };

  logger.info('Calendar block data generated (manual import needed)');
  res.json({
    message: 'Calendar block created (manual import needed)',
    event,
    instructions: 'Download the ICS file and import it into your iCloud calendar'
  });
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
UID:${Date.now()}@aichief
DTSTAMP:${start}
DTSTART:${start}
DTEND:${end}
SUMMARY:${title}
DESCRIPTION:${description || ''}
END:VEVENT
END:VCALENDAR`;
}

/**
 * Download ICS file
 */
router.get('/block/:id/download', (req, res) => {
  logger.info(`ICS download requested for event ID: ${req.params.id}`);
  // This would retrieve a stored event and return as ICS file
  res.setHeader('Content-Type', 'text/calendar');
  res.setHeader('Content-Disposition', 'attachment; filename=event.ics');
  res.send('Placeholder ICS content');
});

module.exports = router;
