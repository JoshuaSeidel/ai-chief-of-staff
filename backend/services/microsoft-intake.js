const crypto = require('crypto');
const { Client } = require('@microsoft/microsoft-graph-client');
const { getDb } = require('../database/db');
const microsoftCalendar = require('./microsoft-calendar');
const { MICROSOFT_GRAPH_APPLICATION_SCOPES } = require('./microsoft-scopes');
const { createModuleLogger } = require('../utils/logger');

const logger = createModuleLogger('MICROSOFT-INTAKE');
const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';

let cachedApplicationToken = null;

function removeHtmlElementBlocks(value, tagName) {
  let output = '';
  let cursor = 0;
  const source = String(value);
  const lowerSource = source.toLowerCase();
  const openPrefix = `<${tagName.toLowerCase()}`;
  const closePrefix = `</${tagName.toLowerCase()}`;

  while (cursor < source.length) {
    const openStart = lowerSource.indexOf(openPrefix, cursor);
    if (openStart === -1) {
      output += source.slice(cursor);
      break;
    }

    const boundary = lowerSource[openStart + openPrefix.length];
    if (boundary && !/[\s>/]/.test(boundary)) {
      output += source.slice(cursor, openStart + openPrefix.length);
      cursor = openStart + openPrefix.length;
      continue;
    }

    output += source.slice(cursor, openStart);
    const openEnd = lowerSource.indexOf('>', openStart);
    if (openEnd === -1) break;

    const closeStart = lowerSource.indexOf(closePrefix, openEnd + 1);
    if (closeStart === -1) {
      cursor = openEnd + 1;
      continue;
    }

    const closeEnd = lowerSource.indexOf('>', closeStart);
    cursor = closeEnd === -1 ? source.length : closeEnd + 1;
  }

  return output;
}

function stripHtml(value = '') {
  const withoutScripts = removeHtmlElementBlocks(value, 'script');
  const withoutStyles = removeHtmlElementBlocks(withoutScripts, 'style');

  return withoutStyles
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function safeTitle(value, fallback = 'Untitled') {
  return String(value || fallback)
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90) || fallback;
}

function shortExternalId(id) {
  return crypto.createHash('sha1').update(String(id)).digest('hex').slice(0, 10);
}

function getEmailAddress(person) {
  return person?.emailAddress?.address || person?.address || '';
}

function getMeetingJoinUrl(event) {
  return event?.onlineMeeting?.joinUrl
    || event?.onlineMeeting?.joinWebUrl
    || event?.onlineMeetingUrl
    || '';
}

function escapeODataString(value) {
  return String(value).replace(/'/g, "''");
}

function encodePathSegment(value) {
  return encodeURIComponent(String(value));
}

function parseDateOrDefault(value, fallback) {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

async function getConfigValue(key, envKey) {
  const db = getDb();
  const row = await db.get('SELECT value FROM config WHERE key = ?', [key]);
  return row?.value || process.env[envKey] || '';
}

async function getMicrosoftApplicationConfig() {
  const [clientId, clientSecret, tenantId] = await Promise.all([
    getConfigValue('microsoftClientId', 'MICROSOFT_CLIENT_ID'),
    getConfigValue('microsoftClientSecret', 'MICROSOFT_CLIENT_SECRET'),
    getConfigValue('microsoftTenantId', 'MICROSOFT_TENANT_ID')
  ]);

  const missing = [];
  if (!clientId) missing.push('Microsoft Client ID');
  if (!clientSecret) missing.push('Microsoft Client Secret');
  if (!tenantId || ['common', 'organizations', 'consumers'].includes(String(tenantId).toLowerCase())) {
    missing.push('Microsoft Tenant ID');
  }

  if (missing.length > 0) {
    throw new Error(
      `${missing.join(', ')} required for Teams recording/transcript capture. ` +
      `Grant application permissions: ${MICROSOFT_GRAPH_APPLICATION_SCOPES.join(', ')}, ` +
      'then grant a Teams application access policy for the app.'
    );
  }

  return { clientId, clientSecret, tenantId };
}

async function getApplicationAccessToken() {
  if (cachedApplicationToken && Date.now() < cachedApplicationToken.expiresAt) {
    return cachedApplicationToken.accessToken;
  }

  const { clientId, clientSecret, tenantId } = await getMicrosoftApplicationConfig();
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default'
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
    logger.error('Microsoft application token request failed', { status: response.status, error: errorText });
    throw new Error(`Failed to get Microsoft application token: ${response.status}`);
  }

  const token = await response.json();
  cachedApplicationToken = {
    accessToken: token.access_token,
    expiresAt: Date.now() + Math.max((token.expires_in || 3600) - 120, 60) * 1000
  };

  return cachedApplicationToken.accessToken;
}

async function getApplicationGraphClient() {
  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: getApplicationAccessToken
    }
  });
}

async function graphFetchText(path) {
  const token = await getApplicationAccessToken();
  const response = await fetch(path.startsWith('http') ? path : `${GRAPH_ROOT}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Microsoft Graph request failed: ${response.status} ${errorText.slice(0, 240)}`);
  }

  return response.text();
}

function summarizeMessage(message) {
  return {
    id: message.id,
    subject: message.subject || '(No subject)',
    from: message.from?.emailAddress || null,
    receivedDateTime: message.receivedDateTime,
    bodyPreview: message.bodyPreview || '',
    webLink: message.webLink,
    isRead: Boolean(message.isRead),
    importance: message.importance || 'normal'
  };
}

function summarizeMeeting(event) {
  const joinUrl = getMeetingJoinUrl(event);

  return {
    id: event.id,
    subject: event.subject || '(No subject)',
    organizer: event.organizer?.emailAddress || null,
    start: event.start,
    end: event.end,
    bodyPreview: event.bodyPreview || '',
    webLink: event.webLink,
    isOnlineMeeting: Boolean(event.isOnlineMeeting || event.onlineMeeting),
    hasTeamsJoinUrl: Boolean(joinUrl),
    attendeeCount: Array.isArray(event.attendees) ? event.attendees.length : 0
  };
}

function summarizeTranscript(transcript) {
  return {
    id: transcript.id,
    createdDateTime: transcript.createdDateTime,
    meetingId: transcript.meetingId,
    contentCorrelationId: transcript.contentCorrelationId
  };
}

function summarizeRecording(recording) {
  return {
    id: recording.id,
    createdDateTime: recording.createdDateTime,
    endDateTime: recording.endDateTime,
    meetingId: recording.meetingId,
    contentCorrelationId: recording.contentCorrelationId
  };
}

async function listMessages({ limit = 25, unreadOnly = false, query = '' } = {}, profileId = 2) {
  const client = await microsoftCalendar.getGraphClient(profileId);
  const cappedLimit = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 50);

  let request = client
    .api('/me/mailFolders/inbox/messages')
    .select('id,subject,from,receivedDateTime,bodyPreview,webLink,isRead,importance')
    .orderby('receivedDateTime desc')
    .top(cappedLimit);

  if (unreadOnly) {
    request = request.filter('isRead eq false');
  }

  const response = await request.get();
  let messages = (response.value || []).map(summarizeMessage);

  if (query) {
    const normalized = query.toLowerCase();
    messages = messages.filter(message => (
      message.subject.toLowerCase().includes(normalized)
      || message.bodyPreview.toLowerCase().includes(normalized)
      || getEmailAddress(message.from).toLowerCase().includes(normalized)
    ));
  }

  logger.info(`Listed ${messages.length} Microsoft email messages for profile ${profileId}`);
  return messages;
}

async function getMessage(messageId, profileId = 2) {
  const client = await microsoftCalendar.getGraphClient(profileId);
  return client
    .api(`/me/messages/${encodeURIComponent(messageId)}`)
    .select('id,subject,from,toRecipients,ccRecipients,receivedDateTime,body,bodyPreview,webLink,isRead,importance')
    .get();
}

function formatMessageForTranscript(message) {
  const from = getEmailAddress(message.from);
  const to = (message.toRecipients || []).map(getEmailAddress).filter(Boolean).join(', ');
  const cc = (message.ccRecipients || []).map(getEmailAddress).filter(Boolean).join(', ');
  const body = message.body?.contentType === 'html'
    ? stripHtml(message.body?.content)
    : (message.body?.content || message.bodyPreview || '');

  return [
    `Email: ${message.subject || '(No subject)'}`,
    `From: ${from || 'Unknown'}`,
    `To: ${to || 'Unknown'}`,
    cc ? `Cc: ${cc}` : null,
    `Received: ${message.receivedDateTime || 'Unknown'}`,
    `Importance: ${message.importance || 'normal'}`,
    message.webLink ? `Link: ${message.webLink}` : null,
    '',
    stripHtml(body)
  ].filter(line => line !== null).join('\n');
}

async function listMeetings({ start, end, limit = 25, query = '' } = {}, profileId = 2) {
  const client = await microsoftCalendar.getGraphClient(profileId);
  const cappedLimit = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 50);
  const now = new Date();
  const defaultStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const defaultEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  let startDate = parseDateOrDefault(start, defaultStart);
  let endDate = parseDateOrDefault(end, defaultEnd);

  if (startDate > endDate) {
    logger.warn('Invalid Microsoft meeting date range supplied; using default range', { profileId });
    startDate = defaultStart;
    endDate = defaultEnd;
  }

  const response = await client
    .api('/me/calendarView')
    .query({
      startDateTime: startDate.toISOString(),
      endDateTime: endDate.toISOString()
    })
    .select('id,subject,organizer,attendees,start,end,bodyPreview,webLink,isOnlineMeeting,onlineMeeting,onlineMeetingUrl')
    .orderby('start/dateTime desc')
    .top(cappedLimit)
    .header('Prefer', 'outlook.timezone="UTC"')
    .get();

  let meetings = (response.value || []).map(summarizeMeeting);

  if (query) {
    const normalized = query.toLowerCase();
    meetings = meetings.filter(meeting => (
      meeting.subject.toLowerCase().includes(normalized)
      || meeting.bodyPreview.toLowerCase().includes(normalized)
      || getEmailAddress(meeting.organizer).toLowerCase().includes(normalized)
    ));
  }

  logger.info(`Listed ${meetings.length} Microsoft meetings for profile ${profileId}`);
  return meetings;
}

async function getMeeting(eventId, profileId = 2) {
  const client = await microsoftCalendar.getGraphClient(profileId);
  return client
    .api(`/me/events/${encodeURIComponent(eventId)}`)
    .select('id,subject,organizer,attendees,start,end,body,bodyPreview,webLink,isOnlineMeeting,onlineMeeting,onlineMeetingUrl')
    .get();
}

function formatMeetingForTranscript(event) {
  const organizer = getEmailAddress(event.organizer);
  const attendees = (event.attendees || [])
    .map(attendee => getEmailAddress(attendee))
    .filter(Boolean)
    .join(', ');
  const body = event.body?.contentType === 'html'
    ? stripHtml(event.body?.content)
    : (event.body?.content || event.bodyPreview || '');

  return [
    `Meeting: ${event.subject || '(No subject)'}`,
    `Organizer: ${organizer || 'Unknown'}`,
    `Attendees: ${attendees || 'Unknown'}`,
    `Start: ${event.start?.dateTime || 'Unknown'} ${event.start?.timeZone || ''}`.trim(),
    `End: ${event.end?.dateTime || 'Unknown'} ${event.end?.timeZone || ''}`.trim(),
    `Online meeting: ${event.isOnlineMeeting || event.onlineMeeting ? 'Yes' : 'No'}`,
    event.webLink ? `Link: ${event.webLink}` : null,
    '',
    stripHtml(body)
  ].filter(line => line !== null).join('\n');
}

function messageFilename(message) {
  return `Email - ${safeTitle(message.subject, 'No subject')} - ${shortExternalId(message.id)}.txt`;
}

function meetingFilename(event) {
  return `Meeting - ${safeTitle(event.subject, 'No subject')} - ${shortExternalId(event.id)}.txt`;
}

function meetingTranscriptFilename(event, transcript) {
  return `Teams Transcript - ${safeTitle(event.subject, 'No subject')} - ${shortExternalId(`${event.id}:${transcript.id}`)}.txt`;
}

async function getCurrentUserIdentifier(profileId = 2) {
  const client = await microsoftCalendar.getGraphClient(profileId);
  const me = await client.api('/me').select('id,mail,userPrincipalName').get();
  return me.mail || me.userPrincipalName || me.id;
}

async function resolveMeetingOrganizerUserId(event, profileId = 2) {
  const organizer = getEmailAddress(event.organizer);
  if (organizer) return organizer;
  return getCurrentUserIdentifier(profileId);
}

async function findOnlineMeetingForEvent(event, profileId = 2) {
  const joinUrl = getMeetingJoinUrl(event);
  if (!joinUrl) {
    return {
      organizerUserId: null,
      joinUrl: null,
      onlineMeeting: null,
      reason: 'Meeting does not include a Teams join URL'
    };
  }

  const organizerUserId = await resolveMeetingOrganizerUserId(event, profileId);
  const client = await getApplicationGraphClient();
  const response = await client
    .api(`/users/${encodePathSegment(organizerUserId)}/onlineMeetings`)
    .filter(`JoinWebUrl eq '${escapeODataString(joinUrl)}'`)
    .top(1)
    .get();

  return {
    organizerUserId,
    joinUrl,
    onlineMeeting: (response.value || [])[0] || null,
    reason: response.value?.length ? null : 'No matching Teams online meeting was found'
  };
}

async function listAssetCollection(client, endpoint, label, mapper) {
  try {
    const response = await client.api(endpoint).top(20).get();
    return {
      items: (response.value || []).map(mapper),
      warning: null
    };
  } catch (error) {
    logger.warn(`Unable to list Teams ${label}`, error.message);
    return {
      items: [],
      warning: `Unable to list Teams ${label}: ${error.message}`
    };
  }
}

async function getMeetingCaptureAssets(event, profileId = 2) {
  const lookup = await findOnlineMeetingForEvent(event, profileId);

  if (!lookup.onlineMeeting) {
    return {
      organizerUserId: lookup.organizerUserId,
      joinUrl: lookup.joinUrl,
      onlineMeeting: null,
      transcripts: [],
      recordings: [],
      warnings: lookup.reason ? [lookup.reason] : []
    };
  }

  const client = await getApplicationGraphClient();
  const baseEndpoint = `/users/${encodePathSegment(lookup.organizerUserId)}/onlineMeetings/${encodePathSegment(lookup.onlineMeeting.id)}`;
  const [transcriptResult, recordingResult] = await Promise.all([
    listAssetCollection(client, `${baseEndpoint}/transcripts`, 'transcripts', summarizeTranscript),
    listAssetCollection(client, `${baseEndpoint}/recordings`, 'recordings', summarizeRecording)
  ]);

  return {
    organizerUserId: lookup.organizerUserId,
    joinUrl: lookup.joinUrl,
    onlineMeeting: {
      id: lookup.onlineMeeting.id,
      subject: lookup.onlineMeeting.subject,
      joinWebUrl: lookup.onlineMeeting.joinWebUrl,
      creationDateTime: lookup.onlineMeeting.creationDateTime,
      startDateTime: lookup.onlineMeeting.startDateTime,
      endDateTime: lookup.onlineMeeting.endDateTime
    },
    transcripts: transcriptResult.items,
    recordings: recordingResult.items,
    warnings: [transcriptResult.warning, recordingResult.warning].filter(Boolean)
  };
}

function selectLatestTranscript(transcripts = []) {
  return [...transcripts]
    .filter(transcript => transcript.id)
    .sort((a, b) => new Date(b.createdDateTime || 0) - new Date(a.createdDateTime || 0))[0] || null;
}

async function downloadTranscriptContent({ organizerUserId, onlineMeetingId, transcriptId }) {
  const endpoint = `/users/${encodePathSegment(organizerUserId)}/onlineMeetings/${encodePathSegment(onlineMeetingId)}/transcripts/${encodePathSegment(transcriptId)}/content?$format=text/vtt`;
  return graphFetchText(endpoint);
}

function normalizeTranscriptContent(content = '') {
  return String(content)
    .replace(/^\uFEFF?WEBVTT.*$/gim, '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !/^\d+$/.test(line))
    .filter(line => !/^\d{2}:\d{2}:\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}\.\d{3}/.test(line))
    .filter(line => !/^NOTE\b/i.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatMeetingWithTranscript(event, transcriptContent, captureAssets, transcript) {
  const baseMetadata = formatMeetingForTranscript(event);
  const normalizedTranscript = normalizeTranscriptContent(transcriptContent) || transcriptContent;

  return [
    baseMetadata,
    '',
    'Teams capture:',
    `Transcript ID: ${transcript.id}`,
    transcript.createdDateTime ? `Transcript created: ${transcript.createdDateTime}` : null,
    `Recording assets found: ${captureAssets.recordings.length}`,
    captureAssets.onlineMeeting?.joinWebUrl ? `Teams join URL: ${captureAssets.onlineMeeting.joinWebUrl}` : null,
    '',
    'Transcript:',
    normalizedTranscript
  ].filter(line => line !== null).join('\n');
}

module.exports = {
  listMessages,
  getMessage,
  formatMessageForTranscript,
  listMeetings,
  getMeeting,
  formatMeetingForTranscript,
  getMeetingCaptureAssets,
  selectLatestTranscript,
  downloadTranscriptContent,
  formatMeetingWithTranscript,
  messageFilename,
  meetingFilename,
  meetingTranscriptFilename
};
