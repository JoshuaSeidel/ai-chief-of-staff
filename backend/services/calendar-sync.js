const googleCalendar = require('./google-calendar');
const microsoftCalendar = require('./microsoft-calendar');
const { createModuleLogger } = require('../utils/logger');

const logger = createModuleLogger('CALENDAR-SYNC');

async function getConnectedProviders(profileId = 2) {
  const providers = [];

  try {
    if (await microsoftCalendar.isConnected(profileId)) {
      providers.push({ name: 'microsoft', service: microsoftCalendar });
    }
  } catch (error) {
    logger.warn('Microsoft Calendar connection check failed', { profileId, error: error.message });
  }

  try {
    if (await googleCalendar.isConnected(profileId)) {
      providers.push({ name: 'google', service: googleCalendar });
    }
  } catch (error) {
    logger.warn('Google Calendar connection check failed', { profileId, error: error.message });
  }

  return providers;
}

async function isConnected(profileId = 2) {
  return (await getConnectedProviders(profileId)).length > 0;
}

async function createEventFromCommitment(commitment, profileId = 2) {
  const providers = await getConnectedProviders(profileId);
  let lastError = null;

  for (const provider of providers) {
    try {
      const event = await provider.service.createEventFromCommitment(commitment, profileId);
      return {
        provider: provider.name,
        event
      };
    } catch (error) {
      lastError = error;
      logger.warn(`Failed to create ${provider.name} calendar event`, {
        profileId,
        commitmentId: commitment.id,
        error: error.message
      });
    }
  }

  if (lastError) throw lastError;
  throw new Error('No connected calendar provider');
}

async function deleteEvent(eventId, profileId = 2) {
  const providers = await getConnectedProviders(profileId);
  let deleted = false;
  let lastError = null;

  for (const provider of providers) {
    try {
      const result = await provider.service.deleteEvent(eventId, profileId);
      if (result !== false) {
        deleted = true;
        logger.info(`Deleted ${provider.name} calendar event`, { profileId, eventId });
        break;
      }
    } catch (error) {
      lastError = error;
      logger.warn(`Failed to delete ${provider.name} calendar event`, {
        profileId,
        eventId,
        error: error.message
      });
    }
  }

  if (!deleted && lastError) throw lastError;
  return deleted;
}

async function deleteEvents(eventIds = [], profileId = 2) {
  const results = [];
  for (const eventId of eventIds) {
    results.push(await deleteEvent(eventId, profileId));
  }
  return results;
}

module.exports = {
  getConnectedProviders,
  isConnected,
  createEventFromCommitment,
  deleteEvent,
  deleteEvents
};
