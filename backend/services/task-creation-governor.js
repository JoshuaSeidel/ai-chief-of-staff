const { generateResponse } = require('./ai-service');
const { getDb } = require('../database/db');
const { createModuleLogger } = require('../utils/logger');

const logger = createModuleLogger('TASK-GOVERNOR');

const DEFAULT_TASK_INSTRUCTIONS = [
  'Only create commitments and action items when the configured user is explicitly responsible for the work.',
  'Skip tasks assigned to other people, teams, or ambiguous owners.',
  'Only create follow-ups when the configured user is the person who should check, unblock, request, or verify the work; being copied on an email is not enough.',
  'Create risks only when they require the configured user\'s awareness or action; skip newsletter, digest, no-reply, marketing, and automated-notification risks by default.',
  'Treat commitments as promises the configured user clearly made or accepted, not generic team discussion, "we should" statements, or someone else\'s assignment.',
  'Skip duplicates and near-duplicates across all recent tasks, even when wording, deadline, source, or task type differs slightly.',
  'Honor explicit ignore feedback by suppressing future similar tasks and emails.',
  'When uncertain, skip the item instead of creating a task.'
].join('\n');

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'in',
  'into',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'about',
  'after',
  'before',
  'status',
  'next',
  'need',
  'needs',
  'needed',
  'please',
  'team',
  'to',
  'with',
  'will'
]);

function parsePreferences(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return {};
  }
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9@. ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTaskText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(follow|followup|follow up|check|review|sync|discuss|update|task|action|item|commitment|confirm|circle|back|touch|base|ping|ask|request|send)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeTaskText(value) {
  return normalizeTaskText(value)
    .split(' ')
    .filter(token => token.length > 2 && !STOP_WORDS.has(token));
}

function tokenSimilarity(left, right) {
  const leftTokens = new Set(tokenizeTaskText(left));
  const rightTokens = new Set(tokenizeTaskText(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let intersection = 0;
  leftTokens.forEach(token => {
    if (rightTokens.has(token)) intersection++;
  });

  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function characterTrigrams(value) {
  const normalized = normalizeTaskText(value).replace(/\s+/g, ' ');
  if (normalized.length < 3) return new Set(normalized ? [normalized] : []);

  const trigrams = new Set();
  for (let index = 0; index <= normalized.length - 3; index++) {
    trigrams.add(normalized.slice(index, index + 3));
  }
  return trigrams;
}

function setOverlapScore(leftSet, rightSet) {
  if (leftSet.size === 0 || rightSet.size === 0) return 0;

  let intersection = 0;
  leftSet.forEach(value => {
    if (rightSet.has(value)) intersection++;
  });

  return (2 * intersection) / (leftSet.size + rightSet.size);
}

function trigramSimilarity(left, right) {
  return setOverlapScore(characterTrigrams(left), characterTrigrams(right));
}

function hasMeaningfulTokenOverlap(left, right) {
  const leftTokens = new Set(tokenizeTaskText(left).filter(token => token.length >= 5));
  const rightTokens = new Set(tokenizeTaskText(right).filter(token => token.length >= 5));
  if (leftTokens.size === 0 || rightTokens.size === 0) return false;

  let overlap = 0;
  leftTokens.forEach(token => {
    if (rightTokens.has(token)) overlap++;
  });

  return overlap >= 2;
}

function isAliasMatch(value, aliases) {
  const normalized = normalizeName(value);
  if (!normalized) return false;

  return aliases.some(alias => {
    const normalizedAlias = normalizeName(alias);
    if (!normalizedAlias) return false;
    if (normalized === normalizedAlias) return true;

    const aliasParts = normalizedAlias.split(' ').filter(Boolean);
    if (aliasParts.length > 1 && normalized === aliasParts[0]) return true;
    return normalized.includes(normalizedAlias) || normalizedAlias.includes(normalized);
  });
}

function isUnknownAssignee(value) {
  const normalized = normalizeName(value);
  return !normalized || ['tbd', 'unknown', 'unassigned', 'someone', 'team', 'we', 'us'].includes(normalized);
}

function getEmailHeader(sourceText, headerName) {
  const pattern = new RegExp(`^${headerName}:\\s*(.*)$`, 'im');
  const match = String(sourceText || '').match(pattern);
  return match ? match[1].trim() : '';
}

function isEmailSource(sourceType, sourceText) {
  return String(sourceType || '').toLowerCase() === 'email' || /^Email:/im.test(String(sourceText || ''));
}

function sourceContainsUserAlias(value, aliases) {
  return aliases.some(alias => {
    const normalizedAlias = normalizeName(alias);
    if (!normalizedAlias) return false;
    return normalizeName(value).includes(normalizedAlias);
  });
}

function emailHasDirectUserSignal(sourceText, context) {
  if (!isEmailSource(context.sourceType, sourceText)) return true;

  const to = getEmailHeader(sourceText, 'To');
  if (!to || /^unknown$/i.test(to)) return true;
  if (sourceContainsUserAlias(to, context.userAliases || [])) return true;

  const opening = String(sourceText || '').slice(0, 1400);
  return sourceContainsUserAlias(opening, context.userAliases || []);
}

function isLikelyAutomatedEmail(sourceText, sourceType) {
  if (!isEmailSource(sourceType, sourceText)) return false;

  const from = getEmailHeader(sourceText, 'From');
  const subject = getEmailHeader(sourceText, 'Email') || getEmailHeader(sourceText, 'Subject');
  const lower = `${from}\n${subject}\n${String(sourceText || '').slice(0, 2500)}`.toLowerCase();

  return [
    /\bno[-_ ]?reply\b/,
    /\bdonotreply\b/,
    /\bmailer-daemon\b/,
    /\bnotification(s)?@/,
    /\bnewsletter\b/,
    /\bdigest\b/,
    /\bautomated (message|notification|email)\b/,
    /\bdo not reply\b/,
    /\bmanage (your )?(preferences|subscription)\b/,
    /\bunsubscribe\b/,
    /\bview (this )?(email|message) in (a )?browser\b/,
    /\bmarketing\b/,
    /\bpromotion\b/,
    /\bspam\b/
  ].some(pattern => pattern.test(lower));
}

function candidateDescription(candidate) {
  if (candidate.task_type === 'follow-up' && candidate.with) {
    return `Follow up with ${candidate.with}: ${candidate.description}`;
  }
  return candidate.description;
}

function flattenExtractedTasks(extracted = {}) {
  const candidates = [];
  let index = 1;

  (extracted.commitments || []).forEach(item => {
    candidates.push({
      candidate_id: `c${index++}`,
      collection: 'commitments',
      task_type: 'commitment',
      description: item.description,
      assignee: item.assignee || null,
      deadline: item.deadline || null,
      priority: item.urgency || item.priority || 'medium',
      item
    });
  });

  (extracted.actionItems || []).forEach(item => {
    candidates.push({
      candidate_id: `c${index++}`,
      collection: 'actionItems',
      task_type: 'action',
      description: item.description,
      assignee: item.assignee || null,
      deadline: item.deadline || null,
      priority: item.priority || item.urgency || 'medium',
      item
    });
  });

  (extracted.followUps || []).forEach(item => {
    candidates.push({
      candidate_id: `c${index++}`,
      collection: 'followUps',
      task_type: 'follow-up',
      description: item.description,
      with: item.with || null,
      assignee: item.with || null,
      deadline: item.deadline || null,
      priority: item.priority || 'medium',
      item
    });
  });

  (extracted.risks || []).forEach(item => {
    candidates.push({
      candidate_id: `c${index++}`,
      collection: 'risks',
      task_type: 'risk',
      description: item.description,
      assignee: null,
      deadline: item.deadline || null,
      priority: item.impact || 'high',
      item
    });
  });

  return candidates.filter(candidate => candidate.description);
}

function rebuildExtractedTasks(candidates) {
  return {
    commitments: candidates.filter(candidate => candidate.collection === 'commitments').map(candidate => candidate.item),
    actionItems: candidates.filter(candidate => candidate.collection === 'actionItems').map(candidate => candidate.item),
    followUps: candidates.filter(candidate => candidate.collection === 'followUps').map(candidate => candidate.item),
    risks: candidates.filter(candidate => candidate.collection === 'risks').map(candidate => candidate.item)
  };
}

function compactTaskForPrompt(task) {
  return {
    id: task.id,
    description: task.description,
    assignee: task.assignee,
    task_type: task.task_type || 'commitment',
    deadline: task.deadline,
    status: task.status,
    created_date: task.created_date
  };
}

function parseTaskSnapshot(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return {};
  }
}

async function getIgnoredTaskPatterns(profileId) {
  const db = getDb();
  let rows = [];

  try {
    rows = await db.all(
      `SELECT task_snapshot, reason, created_at
       FROM task_learning_events
       WHERE profile_id = ? AND action = ?
       ORDER BY created_at DESC
       LIMIT 500`,
      [profileId, 'ignore']
    );
  } catch (error) {
    logger.warn(`Unable to load ignored task patterns: ${error.message}`);
    return [];
  }

  return rows
    .map(row => {
      const snapshot = parseTaskSnapshot(row.task_snapshot);
      return {
        description: snapshot.description || '',
        assignee: snapshot.assignee || null,
        task_type: snapshot.task_type || null,
        reason: row.reason || '',
        created_at: row.created_at
      };
    })
    .filter(pattern => pattern.description);
}

function findIgnoredPattern(candidate, ignoredTaskPatterns = []) {
  const description = candidateDescription(candidate);

  for (const pattern of ignoredTaskPatterns) {
    const tokenScore = tokenSimilarity(description, pattern.description);
    const trigramScore = trigramSimilarity(description, pattern.description);
    const sameType = !pattern.task_type || !candidate.task_type || pattern.task_type === candidate.task_type;

    if (
      (sameType && tokenScore >= 0.46 && hasMeaningfulTokenOverlap(description, pattern.description))
      || tokenScore >= 0.62
      || trigramScore >= 0.76
    ) {
      return { pattern, score: Math.max(tokenScore, trigramScore) };
    }
  }

  return null;
}

function sourcePromptContext(sourceText, sourceType, context) {
  if (!sourceText && !sourceType) return null;

  return {
    type: sourceType || 'unknown',
    email_directly_addresses_user: emailHasDirectUserSignal(sourceText, context),
    likely_automated_email: isLikelyAutomatedEmail(sourceText, sourceType),
    email_from: getEmailHeader(sourceText, 'From') || null,
    email_to: getEmailHeader(sourceText, 'To') || null,
    email_cc: getEmailHeader(sourceText, 'Cc') || null,
    source_excerpt: String(sourceText || '').slice(0, 1800)
  };
}

function safeJsonParseResponse(responseText) {
  const cleanText = String(responseText || '').trim();
  const fenced = cleanText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const source = fenced ? fenced[1].trim() : cleanText;
  const firstBrace = source.indexOf('{');
  const lastBrace = source.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error('AI response did not contain JSON object');
  }

  return JSON.parse(source.slice(firstBrace, lastBrace + 1));
}

async function getConfigUserNames(db) {
  const row = await db.get('SELECT value FROM config WHERE key = ?', ['userNames']);
  return row?.value
    ? row.value.split(',').map(name => name.trim()).filter(Boolean)
    : [];
}

async function fetchMicrosoftUserProfile(profileId) {
  try {
    const microsoftCalendar = require('./microsoft-calendar');
    const client = await microsoftCalendar.getGraphClient(profileId);
    return await client
      .api('/me')
      .select('displayName,userPrincipalName,mail,jobTitle,department,companyName')
      .get();
  } catch (error) {
    logger.debug(`Microsoft user profile unavailable for profile ${profileId}: ${error.message}`);
    return null;
  }
}

async function getTaskProfileContext(profileId = 2, { refreshMicrosoftProfile = false } = {}) {
  const db = getDb();
  const profile = await db.get('SELECT id, name, description, preferences FROM profiles WHERE id = ?', [profileId]);
  const preferences = parsePreferences(profile?.preferences);
  const configUserNames = await getConfigUserNames(db);
  let microsoftUser = null;

  if (refreshMicrosoftProfile || (!preferences.jobTitle && !preferences.companyName)) {
    microsoftUser = await fetchMicrosoftUserProfile(profileId);
  }

  const userAliases = [
    ...configUserNames,
    ...(preferences.userAliases || []),
    microsoftUser?.displayName,
    microsoftUser?.mail,
    microsoftUser?.userPrincipalName
  ].filter(Boolean);

  const dedupedAliases = Array.from(new Set(userAliases.map(alias => String(alias).trim()).filter(Boolean)));
  const jobTitle = preferences.jobTitle || microsoftUser?.jobTitle || '';
  const companyName = preferences.companyName || microsoftUser?.companyName || '';
  const department = preferences.department || microsoftUser?.department || '';
  const taskExtractionInstructions = preferences.taskExtractionInstructions || DEFAULT_TASK_INSTRUCTIONS;

  if (microsoftUser && (microsoftUser.jobTitle || microsoftUser.companyName || microsoftUser.department)) {
    const updatedPreferences = {
      ...preferences,
      jobTitle,
      companyName,
      department
    };
    await db.run(
      'UPDATE profiles SET preferences = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [JSON.stringify(updatedPreferences), profileId]
    );
  }

  return {
    profileId,
    profileName: profile?.name || '',
    profileDescription: profile?.description || '',
    userAliases: dedupedAliases,
    primaryUserName: dedupedAliases[0] || '',
    jobTitle,
    companyName,
    department,
    taskExtractionInstructions,
    preferences
  };
}

async function getExistingTaskCandidates(profileId) {
  const db = getDb();
  const recentCutoff = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
  return db.all(
    `SELECT id, description, assignee, deadline, task_type, priority, status, created_date, completed_date
     FROM commitments
     WHERE profile_id = ?
       AND (status != ? OR created_date >= ? OR completed_date >= ?)
     ORDER BY created_date DESC
     LIMIT 300`,
    [profileId, 'completed', recentCutoff, recentCutoff]
  );
}

function findNearDuplicate(candidate, existingTasks) {
  const description = candidateDescription(candidate);
  const normalized = normalizeTaskText(description);

  for (const task of existingTasks) {
    const taskNormalized = normalizeTaskText(task.description);
    if (!normalized || !taskNormalized) continue;
    if (normalized === taskNormalized) {
      return { task, score: 1 };
    }

    if (normalized.includes(taskNormalized) || taskNormalized.includes(normalized)) {
      return { task, score: 0.95 };
    }

    const tokenScore = tokenSimilarity(description, task.description);
    const trigramScore = trigramSimilarity(description, task.description);
    const score = Math.max(tokenScore, trigramScore);
    if (
      tokenScore >= 0.62
      || trigramScore >= 0.78
      || (tokenScore >= 0.46 && hasMeaningfulTokenOverlap(description, task.description))
    ) {
      return { task, score };
    }
  }

  return null;
}

function hardGateCandidate(candidate, context, existingTasks) {
  const ignored = findIgnoredPattern(candidate, context.ignoredTaskPatterns || []);
  if (ignored) {
    return {
      decision: 'skip',
      reason: `Matches ignored pattern from ${ignored.pattern.created_at || 'previous feedback'}`,
      ignoredPattern: ignored.pattern,
      score: ignored.score
    };
  }

  const duplicate = findNearDuplicate(candidate, existingTasks);
  if (duplicate) {
    return {
      decision: 'update',
      reason: `Matches existing task ${duplicate.task.id}`,
      duplicateOfId: duplicate.task.id
    };
  }

  if (candidate.task_type === 'commitment' || candidate.task_type === 'action') {
    if (isUnknownAssignee(candidate.assignee)) {
      return {
        decision: 'skip',
        reason: 'Assignee is missing or ambiguous; only explicit user-owned tasks are created'
      };
    }

    if ((context.userAliases || []).length > 0 && !isAliasMatch(candidate.assignee, context.userAliases || [])) {
      return {
        decision: 'skip',
        reason: `Assigned to ${candidate.assignee}, not the configured user`
      };
    }
  }

  if (
    isEmailSource(context.sourceType, context.sourceText)
    && ['commitment', 'action', 'follow-up'].includes(candidate.task_type)
    && !emailHasDirectUserSignal(context.sourceText, context)
  ) {
    return {
      decision: 'skip',
      reason: 'Email does not directly address the configured user'
    };
  }

  if (candidate.task_type === 'risk' && isLikelyAutomatedEmail(context.sourceText, context.sourceType)) {
    return {
      decision: 'skip',
      reason: 'Risk came from an automated/no-reply style email'
    };
  }

  return { decision: 'review' };
}

function applyAiDecisions(candidates, decisionsById) {
  return candidates.map(candidate => {
    const aiDecision = decisionsById.get(candidate.candidate_id);
    if (!aiDecision) return candidate;

    return {
      ...candidate,
      gateDecision: ['create', 'update'].includes(aiDecision.decision) ? aiDecision.decision : 'skip',
      gateReason: aiDecision.reason || 'AI review skipped this item',
      duplicateOfId: aiDecision.duplicate_of_id || candidate.duplicateOfId || null,
      aiUpdates: aiDecision.updates || null
    };
  });
}

async function runAiCreationReview(candidates, existingTasks, context, profileId) {
  if (candidates.length === 0) return new Map();
  const sourceContext = sourcePromptContext(context.sourceText, context.sourceType, context);

  const prompt = `You are the AI Chief of Staff task creation gatekeeper. Decide whether each candidate should be saved as a task for the configured user.

Configured user:
- Aliases: ${context.userAliases.join(', ') || 'not configured'}
- Job title: ${context.jobTitle || 'unknown'}
- Company: ${context.companyName || 'unknown'}
- Department: ${context.department || 'unknown'}

Editable learning instructions:
${context.taskExtractionInstructions}

Source context:
${sourceContext ? JSON.stringify(sourceContext, null, 2) : 'No source metadata available'}

Rules:
1. Return "create" only when the item is clearly owned by the configured user.
2. Commitments and action items assigned to someone else, a team, "we", TBD, or no one must be skipped.
3. A commitment requires evidence that the configured user personally promised, accepted, or was explicitly assigned the work. Do not infer commitments from generic meeting discussion.
4. Follow-ups may be created only when the configured user is the action taker for the check-in. Being on To/Cc or merely seeing a status update is not enough.
5. For email candidates, skip when the email is not directed to the configured user as the action taker.
6. Risks may be created only when the user likely needs awareness or follow-up because of their role. Skip risks from automated, no-reply, digest, newsletter, marketing, or spam-like email unless there is a clear user-owned operational consequence.
7. Return "update" when a candidate is the same underlying work as an existing task and adds or changes useful information.
8. Updates can include description/detail, deadline, priority/severity, assignee, task type, and notes/context.
9. Skip exact duplicates and near-duplicates that add no new useful information.
10. If uncertain, skip.

Existing tasks:
${JSON.stringify(existingTasks.map(compactTaskForPrompt), null, 2)}

Candidates:
${JSON.stringify(candidates.map(candidate => ({
  candidate_id: candidate.candidate_id,
  task_type: candidate.task_type,
  description: candidateDescription(candidate),
  assignee: candidate.assignee,
  with: candidate.with,
  deadline: candidate.deadline,
  priority: candidate.priority
})), null, 2)}

Return ONLY JSON:
{
  "decisions": [
    {
      "candidate_id": "c1",
      "decision": "create|update|skip",
      "reason": "short reason",
      "duplicate_of_id": 123,
      "updates": {
        "description": "optional improved description",
        "deadline": "optional YYYY-MM-DD",
        "priority": "optional high|medium|low",
        "assignee": "optional assignee",
        "notes": "optional note to append to the task and ticket"
      }
    }
  ]
}`;

  try {
    const response = await generateResponse(
      prompt,
      'You are a conservative task filtering and deduplication assistant. Return valid JSON only.',
      1800,
      profileId
    );
    const parsed = safeJsonParseResponse(response);
    const decisions = new Map();
    (parsed.decisions || []).forEach(decision => {
      if (decision.candidate_id) {
        decisions.set(decision.candidate_id, decision);
      }
    });
    return decisions;
  } catch (error) {
    logger.warn(`AI creation review unavailable; using heuristic gates only: ${error.message}`);
    return new Map();
  }
}

function requiresAiApproval(candidate, context) {
  if (candidate.task_type === 'follow-up' || candidate.task_type === 'risk') return true;
  return isEmailSource(context.sourceType, context.sourceText);
}

async function reviewExtractedTasksForCreation(extracted, { profileId = 2, sourceText = '', sourceType = '' } = {}) {
  const context = await getTaskProfileContext(profileId, { refreshMicrosoftProfile: true });
  context.sourceText = sourceText || '';
  context.sourceType = sourceType || '';
  context.ignoredTaskPatterns = await getIgnoredTaskPatterns(profileId);
  const existingTasks = await getExistingTaskCandidates(profileId);
  const candidates = flattenExtractedTasks(extracted);

  const preReviewed = candidates.map(candidate => {
    const gate = hardGateCandidate(candidate, context, existingTasks);
    return {
      ...candidate,
      gateDecision: gate.decision === 'review' ? 'review' : gate.decision,
      gateReason: gate.reason || null,
      duplicateOfId: gate.duplicateOfId || null
    };
  });

  const needsAiReview = preReviewed.filter(candidate => ['review', 'update'].includes(candidate.gateDecision));
  const aiDecisions = await runAiCreationReview(needsAiReview, existingTasks, context, profileId);
  const reviewed = applyAiDecisions(preReviewed, aiDecisions).map(candidate => {
    if (candidate.gateDecision === 'update' && !candidate.duplicateOfId) {
      return {
        ...candidate,
        gateDecision: 'skip',
        gateReason: 'AI suggested update but did not identify an existing task'
      };
    }

    if (candidate.gateDecision === 'review') {
      if (requiresAiApproval(candidate, context)) {
        return {
          ...candidate,
          gateDecision: 'skip',
          gateReason: 'Requires explicit AI approval for this source/type; no create decision was returned'
        };
      }

      return {
        ...candidate,
        gateDecision: 'create',
        gateReason: 'Passed heuristic review; AI review had no objection'
      };
    }
    return candidate;
  });

  const accepted = reviewed.filter(candidate => candidate.gateDecision === 'create');
  const updates = reviewed.filter(candidate => candidate.gateDecision === 'update' && candidate.duplicateOfId);
  const skipped = reviewed.filter(candidate => !['create', 'update'].includes(candidate.gateDecision)).map(candidate => ({
    candidate_id: candidate.candidate_id,
    task_type: candidate.task_type,
    description: candidateDescription(candidate),
    reason: candidate.gateReason,
    duplicateOfId: candidate.duplicateOfId
  }));

  logger.info(`Task creation review complete`, {
    profileId,
    candidates: candidates.length,
    accepted: accepted.length,
    updates: updates.length,
    skipped: skipped.length
  });

  return {
    filtered: rebuildExtractedTasks(accepted),
    accepted,
    updates,
    skipped,
    context
  };
}

async function findDuplicateManualTask(task, profileId = 2) {
  const existingTasks = await getExistingTaskCandidates(profileId);
  const duplicate = findNearDuplicate({
    task_type: task.task_type || 'commitment',
    description: task.description,
    assignee: task.assignee || null
  }, existingTasks);

  return duplicate ? {
    id: duplicate.task.id,
    description: duplicate.task.description,
    status: duplicate.task.status,
    score: duplicate.score
  } : null;
}

async function recordTaskLearningEvent({ profileId = 2, action, task, reason = '', refineInstructions = true }) {
  if (!task) return;

  const db = getDb();
  const snapshot = {
    id: task.id,
    description: task.description,
    assignee: task.assignee,
    deadline: task.deadline,
    task_type: task.task_type,
    status: task.status,
    needs_confirmation: task.needs_confirmation
  };

  try {
    await db.run(
      `INSERT INTO task_learning_events (profile_id, action, commitment_id, task_snapshot, reason, created_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [profileId, action, task.id || null, JSON.stringify(snapshot), reason || null]
    );
  } catch (error) {
    logger.warn(`Unable to record task learning event: ${error.message}`);
  }

  if (refineInstructions) {
    refineTaskInstructionsFromFeedback({ profileId, action, task: snapshot, reason }).catch(error => {
      logger.warn(`Unable to refine task instructions: ${error.message}`);
    });
  }
}

async function recordSystemTaskUpdate({ profileId = 2, task, reason = '', updates = {} }) {
  if (!task) return;

  const db = getDb();
  const snapshot = {
    id: task.id,
    description: task.description,
    assignee: task.assignee,
    deadline: task.deadline,
    task_type: task.task_type,
    status: task.status,
    updates
  };

  try {
    await db.run(
      `INSERT INTO task_learning_events (profile_id, action, commitment_id, task_snapshot, reason, created_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [profileId, 'system_update', task.id || null, JSON.stringify(snapshot), reason || null]
    );
  } catch (error) {
    logger.warn(`Unable to record system task update: ${error.message}`);
  }
}

async function refineTaskInstructionsFromFeedback({ profileId, action, task, reason = '' }) {
  const context = await getTaskProfileContext(profileId);
  const currentInstructions = context.taskExtractionInstructions || DEFAULT_TASK_INSTRUCTIONS;

  const prompt = `The configured user ${action === 'reject' ? 'rejected' : 'deleted'} this task:
${JSON.stringify(task, null, 2)}

Reason, if known: ${reason || 'not provided'}

Current editable task extraction instructions:
${currentInstructions}

Revise the instructions so future task extraction avoids similar unwanted tasks or duplicates. Preserve the user's existing intent and manual edits. Keep it concise, operational, and written as instructions to the AI. Do not mention this one task by ID.

Return ONLY JSON:
{
  "instructions": "updated instructions"
}`;

  let updatedInstructions;
  try {
    const response = await generateResponse(
      prompt,
      'You improve user-specific task extraction instructions from feedback. Return valid JSON only.',
      900,
      profileId
    );
    const parsed = safeJsonParseResponse(response);
    updatedInstructions = String(parsed.instructions || '').trim();
  } catch (error) {
    logger.warn(`AI instruction refinement failed; using fallback update: ${error.message}`);
    updatedInstructions = `${currentInstructions}\n- Learned from user ${action}: avoid creating tasks like "${String(task.description || '').slice(0, 140)}" unless the configured user is explicitly responsible.`;
  }

  if (!updatedInstructions) return;

  const db = getDb();
  const profile = await db.get('SELECT preferences FROM profiles WHERE id = ?', [profileId]);
  const preferences = parsePreferences(profile?.preferences);
  preferences.taskExtractionInstructions = updatedInstructions.slice(0, 6000);
  preferences.taskLearningUpdatedAt = new Date().toISOString();

  await db.run(
    'UPDATE profiles SET preferences = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [JSON.stringify(preferences), profileId]
  );

  logger.info(`Updated task extraction learning instructions for profile ${profileId}`);
}

module.exports = {
  DEFAULT_TASK_INSTRUCTIONS,
  findDuplicateManualTask,
  getTaskProfileContext,
  getIgnoredTaskPatterns,
  recordTaskLearningEvent,
  recordSystemTaskUpdate,
  reviewExtractedTasksForCreation,
  _test: {
    candidateDescription,
    emailHasDirectUserSignal,
    findIgnoredPattern,
    flattenExtractedTasks,
    hardGateCandidate,
    isAliasMatch,
    isLikelyAutomatedEmail,
    normalizeTaskText,
    requiresAiApproval,
    trigramSimilarity,
    tokenSimilarity
  }
};
