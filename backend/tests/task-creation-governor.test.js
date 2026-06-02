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

test('hard gate skips actions from emails not directly addressed to the user', () => {
  const result = _test.hardGateCandidate({
    task_type: 'action',
    description: 'Review the renewal quote',
    assignee: 'Josh'
  }, {
    ...context,
    sourceType: 'email',
    sourceText: 'Email: Renewal quote\nFrom: sales@example.com\nTo: Alex Example\n\nPlease review the renewal quote.'
  }, []);

  assert.equal(result.decision, 'skip');
  assert.match(result.reason, /does not directly address/i);
});

test('hard gate skips risks from automated email', () => {
  const result = _test.hardGateCandidate({
    task_type: 'risk',
    description: 'Marketing campaign performance is at risk'
  }, {
    ...context,
    sourceType: 'email',
    sourceText: 'Email: Weekly marketing digest\nFrom: notifications@example.com\nTo: jseidel@edgeconnex.com\n\nYou are receiving this automated email. Unsubscribe here.'
  }, []);

  assert.equal(result.decision, 'skip');
  assert.match(result.reason, /automated/i);
});

test('hard gate skips tasks matching ignored patterns', () => {
  const result = _test.hardGateCandidate({
    task_type: 'follow-up',
    description: 'Check with Morgan about the recurring newsletter update',
    with: 'Morgan'
  }, {
    ...context,
    ignoredTaskPatterns: [{
      description: 'Follow up with Morgan about recurring newsletter updates',
      task_type: 'follow-up',
      created_at: '2026-06-02T00:00:00.000Z'
    }]
  }, []);

  assert.equal(result.decision, 'skip');
  assert.match(result.reason, /ignored pattern/i);
});

test('task text similarity ignores task phrasing noise', () => {
  const score = _test.tokenSimilarity(
    'Follow up with Morgan about the customer escalation update',
    'Check Morgan customer escalation status'
  );

  assert.ok(score >= 0.4);
});

test('hard gate updates similar tasks across different phrasing', () => {
  const result = _test.hardGateCandidate({
    task_type: 'follow-up',
    description: 'Check with Morgan on the customer escalation status',
    with: 'Morgan'
  }, context, [
    {
      id: 77,
      description: 'Follow up with Morgan about the customer escalation update',
      assignee: 'Joshua Seidel',
      status: 'pending'
    }
  ]);

  assert.equal(result.decision, 'update');
  assert.equal(result.duplicateOfId, 77);
});
