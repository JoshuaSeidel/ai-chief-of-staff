const crypto = require('crypto');
const { Client } = require('@microsoft/microsoft-graph-client');
const { getDb } = require('../database/db');
const microsoftCalendar = require('./microsoft-calendar');
const { MICROSOFT_GRAPH_APPLICATION_SCOPES } = require('./microsoft-scopes');
const { createModuleLogger } = require('../utils/logger');

const logger = createModuleLogger('MICROSOFT-INTAKE');
const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';

let cachedApplicationToken = null;

function describeGraphError(error) {
  if (!error) return 'Unknown Microsoft Graph error';

  const parts = [];
  if (error.statusCode || error.status) parts.push(`status ${error.statusCode || error.status}`);
  if (error.code) parts.push(`code ${error.code}`);
  if (error.message) parts.push(error.message);

  const body = error.body || error.response?.body || error.response?.text;
  if (body) {
    const bodyText = typeof body === 'string' ? body : JSON.stringify(body);
    parts.push(bodyText.slice(0, 500));
  }

  return parts.filter(Boolean).join(': ') || 'Microsoft Graph request failed without details';
}

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

function normalizeTeamsJoinUrl(value) {
  if (!value) return '';
  return String(value)
    .replace(/&amp;/gi, '&')
    .replace(/[)\].,;]+$/g, '')
    .trim();
}

function getMeetingJoinUrl(event) {
  const metadataUrl = event?.onlineMeeting?.joinUrl
    || event?.onlineMeeting?.joinWebUrl
    || event?.onlineMeetingUrl
    || '';

  if (metadataUrl) {
    return normalizeTeamsJoinUrl(metadataUrl);
  }

  const rawBody = event?.body?.content || event?.bodyPreview || '';
  const bodyText = event?.body?.contentType === 'html'
    ? `${rawBody}\n${stripHtml(rawBody)}`
    : rawBody;
  const match = String(bodyText).match(/https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s<>"']+/i);
  return normalizeTeamsJoinUrl(match?.[0]);
}

function getMeetingJoinUrlVariants(event) {
  const joinUrl = getMeetingJoinUrl(event);
  if (!joinUrl) return [];

  const candidates = [joinUrl];
  try {
    const decoded = decodeURI(joinUrl);
    candidates.push(decoded);
  } catch (error) {
    // Keep the original URL only.
  }

  return candidates
    .map(normalizeTeamsJoinUrl)
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
}

function isTeamsMeeting(event) {
  return Boolean(
    event?.isOnlineMeeting
    || event?.onlineMeeting
    || event?.onlineMeetingUrl
    || getMeetingJoinUrl(event)
  );
}

function isOutOfOfficeMeeting(event) {
  return /\booto\b/i.test(event?.subject || '');
}

function parseGraphDateTime(value) {
  if (!value) return null;

  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const dateTime = value.dateTime;
  if (!dateTime) return null;

  const hasOffset = /(?:z|[+-]\d{2}:\d{2})$/i.test(dateTime);
  const normalized = !hasOffset && String(value.timeZone || '').toUpperCase() === 'UTC'
    ? `${dateTime}Z`
    : dateTime;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isMeetingEndedBefore(event, cutoff = new Date()) {
  const endDate = parseGraphDateTime(event?.end);
  return Boolean(endDate && endDate <= cutoff);
}

function escapeODataString(value) {
  return String(value).replace(/'/g, "''");
}

function encodePathSegment(value) {
  return encodeURIComponent(String(value));
}

function isUsableGraphContentUrl(value) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.hostname === 'graph.microsoft.com'
      && url.pathname !== '/v1.0/$metadata'
      && url.pathname.endsWith('/content');
  } catch (error) {
    return false;
  }
}

function resolveArtifactAccessUserId({ accessUserId, organizerUserId }) {
  return accessUserId || organizerUserId;
}

function buildOnlineMeetingsLookupEndpoint(accessUserId) {
  return `/users/${encodePathSegment(accessUserId)}/onlineMeetings`;
}

function buildOnlineMeetingEndpoint({ accessUserId, organizerUserId, onlineMeetingId }) {
  const userId = resolveArtifactAccessUserId({ accessUserId, organizerUserId });
  return `${buildOnlineMeetingsLookupEndpoint(userId)}/${encodePathSegment(onlineMeetingId)}`;
}

function buildTranscriptContentEndpoint({ accessUserId, organizerUserId, onlineMeetingId, transcriptId }) {
  return `${buildOnlineMeetingEndpoint({ accessUserId, organizerUserId, onlineMeetingId })}/transcripts/${encodePathSegment(transcriptId)}/content?$format=text/vtt`;
}

function buildRecordingContentEndpoint({ accessUserId, organizerUserId, onlineMeetingId, recordingId }) {
  return `${buildOnlineMeetingEndpoint({ accessUserId, organizerUserId, onlineMeetingId })}/recordings/${encodePathSegment(recordingId)}/content`;
}

function resolveGraphContentEndpoint(contentUrl, fallbackEndpoint) {
  return isUsableGraphContentUrl(contentUrl) ? contentUrl : fallbackEndpoint;
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
    throw new Error(`Failed to get Microsoft application token: ${response.status} ${errorText.slice(0, 240)}`);
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

async function graphFetch(path, { headers = {} } = {}) {
  const token = await getApplicationAccessToken();
  const url = path.startsWith('http') ? path : `${GRAPH_ROOT}${path}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...headers
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Microsoft Graph request failed: ${response.status} ${errorText.slice(0, 240)}`);
  }

  return response;
}

async function graphFetchText(path, options) {
  const response = await graphFetch(path, options);
  return response.text();
}

async function graphFetchBuffer(path, options) {
  const response = await graphFetch(path, options);
  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: response.headers.get('content-type') || 'application/octet-stream',
    contentLength: Number(response.headers.get('content-length')) || null
  };
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
    isOnlineMeeting: isTeamsMeeting(event),
    hasTeamsJoinUrl: Boolean(joinUrl),
    attendeeCount: Array.isArray(event.attendees) ? event.attendees.length : 0
  };
}

function summarizeTranscript(transcript) {
  return {
    id: transcript.id,
    createdDateTime: transcript.createdDateTime,
    meetingId: transcript.meetingId,
    contentCorrelationId: transcript.contentCorrelationId,
    transcriptContentUrl: transcript.transcriptContentUrl || null
  };
}

function summarizeRecording(recording) {
  return {
    id: recording.id,
    createdDateTime: recording.createdDateTime,
    endDateTime: recording.endDateTime,
    meetingId: recording.meetingId,
    contentCorrelationId: recording.contentCorrelationId,
    recordingContentUrl: recording.recordingContentUrl || null
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
    .header('Prefer', 'outlook.timezone="UTC"')
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

async function resolveMeetingAccessUserId(profileId = 2) {
  return getCurrentUserIdentifier(profileId);
}

async function findOnlineMeetingForEvent(event, profileId = 2) {
  const joinUrlVariants = getMeetingJoinUrlVariants(event);
  if (joinUrlVariants.length === 0) {
    return {
      accessUserId: null,
      organizerUserId: null,
      joinUrl: null,
      onlineMeeting: null,
      reason: 'Meeting does not include a Teams join URL'
    };
  }

  const accessUserId = await resolveMeetingAccessUserId(profileId);
  const organizerUserId = getEmailAddress(event.organizer) || null;
  const lookupUserIds = [accessUserId, organizerUserId]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
  const client = await getApplicationGraphClient();
  const warnings = [];

  for (const userId of lookupUserIds) {
    for (const joinUrl of joinUrlVariants) {
      try {
        const response = await client
          .api(buildOnlineMeetingsLookupEndpoint(userId))
          .filter(`JoinWebUrl eq '${escapeODataString(joinUrl)}'`)
          .top(1)
          .get();
        const onlineMeeting = (response.value || [])[0] || null;

        if (onlineMeeting) {
          return {
            accessUserId: userId,
            organizerUserId,
            joinUrl,
            onlineMeeting,
            reason: null,
            warnings
          };
        }
      } catch (error) {
        const message = describeGraphError(error);
        warnings.push(`Unable to resolve Teams meeting for ${userId}: ${message}`);
        logger.warn('Teams online meeting lookup failed', { userId, error: message });
      }
    }
  }

  return {
    accessUserId,
    organizerUserId,
    joinUrl: joinUrlVariants[0],
    onlineMeeting: null,
    reason: 'No matching Teams online meeting was found for the connected Microsoft user or organizer',
    warnings
  };
}

async function listAssetCollection(client, endpoint, label, mapper, { pageSize = 50, maxPages = 25 } = {}) {
  try {
    const items = [];
    let page = 0;
    let request = client.api(endpoint).top(pageSize);

    while (request && page < maxPages) {
      const response = await request.get();
      items.push(...(response.value || []).map(mapper));
      const nextLink = response['@odata.nextLink'];
      request = nextLink ? client.api(nextLink) : null;
      page += 1;
    }

    return {
      items,
      warning: request ? `Stopped listing Teams ${label} after ${maxPages} pages` : null
    };
  } catch (error) {
    const message = describeGraphError(error);
    logger.warn(`Unable to list Teams ${label}`, { endpoint, error: message });
    return {
      items: [],
      warning: `Unable to list Teams ${label}: ${message}`
    };
  }
}

async function getMeetingCaptureAssets(event, profileId = 2) {
  const lookup = await findOnlineMeetingForEvent(event, profileId);

  if (!lookup.onlineMeeting) {
    return {
      accessUserId: lookup.accessUserId,
      organizerUserId: lookup.organizerUserId,
      joinUrl: lookup.joinUrl,
      onlineMeeting: null,
      transcripts: [],
      recordings: [],
      warnings: [lookup.reason, ...(lookup.warnings || [])].filter(Boolean)
    };
  }

  const client = await getApplicationGraphClient();
  const baseEndpoint = buildOnlineMeetingEndpoint({
    accessUserId: lookup.accessUserId,
    onlineMeetingId: lookup.onlineMeeting.id
  });
  const [transcriptResult, recordingResult] = await Promise.all([
    listAssetCollection(client, `${baseEndpoint}/transcripts`, 'transcripts', summarizeTranscript),
    listAssetCollection(client, `${baseEndpoint}/recordings`, 'recordings', summarizeRecording)
  ]);

  return {
    accessUserId: lookup.accessUserId,
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

function selectLatestRecording(recordings = []) {
  return [...recordings]
    .filter(recording => recording.id)
    .sort((a, b) => new Date(b.createdDateTime || b.endDateTime || 0) - new Date(a.createdDateTime || a.endDateTime || 0))[0] || null;
}

async function downloadTranscriptContent({ accessUserId, organizerUserId, onlineMeetingId, transcriptId, transcriptContentUrl }) {
  const endpoint = resolveGraphContentEndpoint(
    transcriptContentUrl,
    buildTranscriptContentEndpoint({ accessUserId, organizerUserId, onlineMeetingId, transcriptId })
  );
  return graphFetchText(endpoint, { headers: { Accept: 'text/vtt' } });
}

async function downloadRecordingContent({ accessUserId, organizerUserId, onlineMeetingId, recordingId, recordingContentUrl }) {
  const endpoint = resolveGraphContentEndpoint(
    recordingContentUrl,
    buildRecordingContentEndpoint({ accessUserId, organizerUserId, onlineMeetingId, recordingId })
  );
  return graphFetchBuffer(endpoint, { headers: { Accept: 'video/mp4,application/octet-stream' } });
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
  isMeetingEndedBefore,
  isOutOfOfficeMeeting,
  isTeamsMeeting,
  selectLatestTranscript,
  selectLatestRecording,
  downloadTranscriptContent,
  downloadRecordingContent,
  formatMeetingWithTranscript,
  messageFilename,
  meetingFilename,
  meetingTranscriptFilename,
  _test: {
    buildRecordingContentEndpoint,
    buildOnlineMeetingEndpoint,
    buildOnlineMeetingsLookupEndpoint,
    buildTranscriptContentEndpoint,
    encodePathSegment,
    getMeetingJoinUrl,
    getMeetingJoinUrlVariants,
    isMeetingEndedBefore,
    isOutOfOfficeMeeting,
    isTeamsMeeting,
    isUsableGraphContentUrl,
    listAssetCollection,
    normalizeTranscriptContent,
    resolveGraphContentEndpoint,
    summarizeRecording,
    summarizeTranscript
  }
};
