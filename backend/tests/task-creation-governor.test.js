const test = require('node:test');
const assert = require('node:assert/strict');

const { _test } = require('../services/task-creation-governor');

const context = {
  userAliases: ['Joshua Seidel', 'jseidel@edgeconnex.com', 'Josh']
};

test('hard gate skips commitments assigned to someone else', () => {
  const result = _test.hardGateCandidate({
    task_type: 'commitment',
    description: 'Send the updated budget model',
    assignee: 'Alex'
  }, context, []);

  assert.equal(result.decision, 'skip');
  assert.match(result.reason, /not the configured user/i);
});

test('hard gate skips ambiguous action owners', () => {
  const result = _test.hardGateCandidate({
    task_type: 'action',
    description: 'Prepare launch notes',
    assignee: 'TBD'
  }, context, []);

  assert.equal(result.decision, 'skip');
  assert.match(result.reason, /ambiguous/i);
});

test('hard gate sends near-duplicates to the update path', () => {
  const result = _test.hardGateCandidate({
    task_type: 'commitment',
    description: 'Send the FedRAMP compliance documentation update',
    assignee: 'Josh'
  }, context, [
    {
      id: 42,
      description: 'Send FedRAMP compliance documentation update',
      assignee: 'Joshua Seidel',
      status: 'pending'
    }
  ]);

  assert.equal(result.decision, 'update');
  assert.equal(result.duplicateOfId, 42);
});

test('follow-ups are allowed through for AI relevance review', () => {
  const result = _test.hardGateCandidate({
    task_type: 'follow-up',
    description: 'Check whether Alex has the SOC report',
    with: 'Alex',
    assignee: 'Alex'
  }, context, []);

  assert.equal(result.decision, 'review');
});

test('task text similarity ignores task phrasing noise', () => {
  const score = _test.tokenSimilarity(
    'Follow up with Morgan about the customer escalation update',
    'Check Morgan customer escalation status'
  );

  assert.ok(score >= 0.4);
});
