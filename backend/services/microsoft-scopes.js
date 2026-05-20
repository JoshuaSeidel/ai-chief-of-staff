const MICROSOFT_GRAPH_SCOPES = [
  'offline_access',
  'User.Read',
  'Calendars.ReadWrite',
  'Tasks.ReadWrite',
  'Mail.ReadWrite',
  'OnlineMeetings.Read'
];

const MICROSOFT_GRAPH_APPLICATION_SCOPES = [
  'OnlineMeetings.Read.All',
  'OnlineMeetingTranscript.Read.All',
  'OnlineMeetingRecording.Read.All'
];

const MICROSOFT_EMAIL_SCOPES = ['Mail.Read', 'Mail.ReadWrite'];
const MICROSOFT_CALENDAR_SCOPES = ['Calendars.Read', 'Calendars.ReadWrite'];
const MICROSOFT_TASK_SCOPES = ['Tasks.Read', 'Tasks.ReadWrite'];

function getMicrosoftScopeString() {
  return MICROSOFT_GRAPH_SCOPES.join(' ');
}

function normalizeScopes(scopeValue) {
  if (!scopeValue) return [];
  if (Array.isArray(scopeValue)) return scopeValue.map(scope => String(scope).toLowerCase());
  return String(scopeValue)
    .split(/\s+/)
    .map(scope => scope.trim().toLowerCase())
    .filter(Boolean);
}

function hasAnyScope(grantedScopes, requiredScopes) {
  const granted = new Set(normalizeScopes(grantedScopes));
  return requiredScopes.some(scope => granted.has(scope.toLowerCase()));
}

function missingScopes(grantedScopes, requiredScopes) {
  const granted = new Set(normalizeScopes(grantedScopes));
  return requiredScopes.filter(scope => !granted.has(scope.toLowerCase()));
}

module.exports = {
  MICROSOFT_GRAPH_SCOPES,
  MICROSOFT_GRAPH_APPLICATION_SCOPES,
  MICROSOFT_EMAIL_SCOPES,
  MICROSOFT_CALENDAR_SCOPES,
  MICROSOFT_TASK_SCOPES,
  getMicrosoftScopeString,
  normalizeScopes,
  hasAnyScope,
  missingScopes
};
