const test = require('node:test');
const assert = require('node:assert/strict');

const microsoftIntake = require('../services/microsoft-intake');

const {
  buildOnlineMeetingEndpoint,
  buildOnlineMeetingsLookupEndpoint,
  buildRecordingContentEndpoint,
  buildTranscriptContentEndpoint,
  getMeetingJoinUrl,
  isMeetingEndedBefore,
  isTeamsMeeting,
  isUsableGraphContentUrl,
  listAssetCollection,
  normalizeTranscriptContent,
  resolveGraphContentEndpoint,
  summarizeRecording,
  summarizeTranscript
} = microsoftIntake._test;

test('builds Microsoft Graph artifact content endpoints with encoded path segments', () => {
  assert.equal(
    buildRecordingContentEndpoint({
      accessUserId: 'jseidel@edgeconnex.com',
      onlineMeetingId: 'MSox+meeting/thread/v2=',
      recordingId: "rec/with spaces'and/slashes"
    }),
    '/users/jseidel%40edgeconnex.com/onlineMeetings/MSox%2Bmeeting%2Fthread%2Fv2%3D/recordings/rec%2Fwith%20spaces\'and%2Fslashes/content'
  );

  assert.equal(
    buildTranscriptContentEndpoint({
      accessUserId: 'jseidel@edgeconnex.com',
      onlineMeetingId: 'MSox+meeting/thread/v2=',
      transcriptId: 'transcript/id='
    }),
    '/users/jseidel%40edgeconnex.com/onlineMeetings/MSox%2Bmeeting%2Fthread%2Fv2%3D/transcripts/transcript%2Fid%3D/content?$format=text/vtt'
  );
});

test('resolves Teams artifacts through the connected access user path', () => {
  assert.equal(
    buildOnlineMeetingsLookupEndpoint('jseidel@edgeconnex.com'),
    '/users/jseidel%40edgeconnex.com/onlineMeetings'
  );

  assert.equal(
    buildOnlineMeetingEndpoint({
      accessUserId: 'jseidel@edgeconnex.com',
      onlineMeetingId: 'meeting/id'
    }),
    '/users/jseidel%40edgeconnex.com/onlineMeetings/meeting%2Fid'
  );

  assert.equal(
    buildRecordingContentEndpoint({
      accessUserId: 'jseidel@edgeconnex.com',
      organizerUserId: 'organizer@example.com',
      onlineMeetingId: 'meeting/id',
      recordingId: 'recording/id'
    }),
    '/users/jseidel%40edgeconnex.com/onlineMeetings/meeting%2Fid/recordings/recording%2Fid/content'
  );
});

test('uses only real Graph content URLs and falls back from metadata fragment examples', () => {
  const fallback = '/users/user/onlineMeetings/meeting/recordings/recording/content';
  const usable = 'https://graph.microsoft.com/v1.0/users/user/onlineMeetings/meeting/recordings/recording/content';
  const metadataFragment = "https://graph.microsoft.com/v1.0/$metadata#users('user')/onlineMeetings('meeting')/recordings/('recording')/content";

  assert.equal(isUsableGraphContentUrl(usable), true);
  assert.equal(isUsableGraphContentUrl(metadataFragment), false);
  assert.equal(resolveGraphContentEndpoint(usable, fallback), usable);
  assert.equal(resolveGraphContentEndpoint(metadataFragment, fallback), fallback);
  assert.equal(resolveGraphContentEndpoint(null, fallback), fallback);
});

test('lists paged Teams artifact collections without dropping recordings after the first page', async () => {
  const calls = [];
  const pages = new Map([
    ['/users/u/onlineMeetings/m/recordings', {
      value: [
        { id: 'r1', createdDateTime: '2026-05-31T10:00:00Z', recordingContentUrl: 'https://graph.microsoft.com/v1.0/users/u/onlineMeetings/m/recordings/r1/content' }
      ],
      '@odata.nextLink': 'https://graph.microsoft.com/v1.0/users/u/onlineMeetings/m/recordings?$skiptoken=abc'
    }],
    ['https://graph.microsoft.com/v1.0/users/u/onlineMeetings/m/recordings?$skiptoken=abc', {
      value: [
        { id: 'r2', createdDateTime: '2026-05-31T11:00:00Z', recordingContentUrl: 'https://graph.microsoft.com/v1.0/users/u/onlineMeetings/m/recordings/r2/content' }
      ]
    }]
  ]);

  const client = {
    api(endpoint) {
      calls.push(endpoint);
      return {
        top() {
          return this;
        },
        async get() {
          return pages.get(endpoint);
        }
      };
    }
  };

  const result = await listAssetCollection(client, '/users/u/onlineMeetings/m/recordings', 'recordings', summarizeRecording);

  assert.deepEqual(calls, [
    '/users/u/onlineMeetings/m/recordings',
    'https://graph.microsoft.com/v1.0/users/u/onlineMeetings/m/recordings?$skiptoken=abc'
  ]);
  assert.equal(result.warning, null);
  assert.deepEqual(result.items.map(item => item.id), ['r1', 'r2']);
  assert.equal(result.items[0].recordingContentUrl.endsWith('/recordings/r1/content'), true);
});

test('keeps transcript and recording content URLs in summarized artifacts', () => {
  const transcript = summarizeTranscript({
    id: 't1',
    createdDateTime: '2026-05-31T10:00:00Z',
    meetingId: 'm1',
    contentCorrelationId: 'c1',
    transcriptContentUrl: 'https://graph.microsoft.com/v1.0/users/u/onlineMeetings/m/transcripts/t1/content'
  });
  const recording = summarizeRecording({
    id: 'r1',
    createdDateTime: '2026-05-31T10:05:00Z',
    meetingId: 'm1',
    contentCorrelationId: 'c1',
    recordingContentUrl: 'https://graph.microsoft.com/v1.0/users/u/onlineMeetings/m/recordings/r1/content'
  });

  assert.equal(transcript.transcriptContentUrl.endsWith('/transcripts/t1/content'), true);
  assert.equal(recording.recordingContentUrl.endsWith('/recordings/r1/content'), true);
});

test('normalizes Teams VTT transcript content into plain meeting text', () => {
  const raw = [
    'WEBVTT',
    '',
    '1',
    '00:00:01.000 --> 00:00:04.000',
    'Speaker 1: Hello team.',
    '',
    'NOTE Confidence: high',
    '2',
    '00:00:05.000 --> 00:00:07.000',
    'Speaker 2: Next steps are clear.'
  ].join('\n');

  assert.equal(
    normalizeTranscriptContent(raw),
    'Speaker 1: Hello team.\nSpeaker 2: Next steps are clear.'
  );
});

test('selects the latest Teams recording by creation time', () => {
  const latest = microsoftIntake.selectLatestRecording([
    { id: 'older', createdDateTime: '2026-05-31T09:00:00Z' },
    { id: 'newer', createdDateTime: '2026-05-31T12:00:00Z' }
  ]);

  assert.equal(latest.id, 'newer');
});

test('detects Teams meetings from metadata and body join URLs', () => {
  const metadataMeeting = {
    isOnlineMeeting: false,
    onlineMeetingUrl: 'https://teams.microsoft.com/l/meetup-join/abc'
  };
  const bodyMeeting = {
    body: {
      contentType: 'html',
      content: '<p>Join: <a href="https://teams.microsoft.com/l/meetup-join/xyz?context=123&amp;tenantId=abc">link</a></p>'
    }
  };

  assert.equal(isTeamsMeeting(metadataMeeting), true);
  assert.equal(isTeamsMeeting(bodyMeeting), true);
  assert.equal(getMeetingJoinUrl(bodyMeeting), 'https://teams.microsoft.com/l/meetup-join/xyz?context=123&tenantId=abc');
  assert.equal(isTeamsMeeting({ bodyPreview: 'in person' }), false);
});

test('parses UTC Graph calendar boundaries before deciding transcript retry eligibility', () => {
  const meeting = {
    end: {
      dateTime: '2026-06-01T14:00:00.0000000',
      timeZone: 'UTC'
    }
  };

  assert.equal(isMeetingEndedBefore(meeting, new Date('2026-06-01T14:30:00Z')), true);
  assert.equal(isMeetingEndedBefore(meeting, new Date('2026-06-01T13:59:59Z')), false);
  assert.equal(isMeetingEndedBefore({ end: null }, new Date('2026-06-01T14:30:00Z')), false);
});
