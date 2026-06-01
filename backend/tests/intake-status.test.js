const test = require('node:test');
const assert = require('node:assert/strict');

const intakeRoutes = require('../routes/intake');

test('builds pending Teams transcript status details from artifact lookup warnings', () => {
  const message = intakeRoutes._test.buildPendingStatusMessage([
    'No matching Teams online meeting was found',
    'No Teams recording is available for this meeting yet'
  ]);

  assert.match(message, /next Teams sync will retry/i);
  assert.match(message, /No matching Teams online meeting/);
  assert.match(message, /No Teams recording/);
});

test('builds a default pending Teams transcript status detail', () => {
  assert.equal(
    intakeRoutes._test.buildPendingStatusMessage(),
    'Teams transcript and recording are not available yet. The next Teams sync will retry this meeting.'
  );
});
