const { Client } = require('@microsoft/microsoft-graph-client');
const { getDb } = require('../database/db');
const { createModuleLogger } = require('../utils/logger');

const logger = createModuleLogger('MICROSOFT-PLANNER');

// Custom authentication provider for Microsoft Graph
class CustomAuthProvider {
  constructor(initialTokens, refreshCallback) {
    this.tokens = initialTokens;
    this.refreshCallback = refreshCallback;
  }
  
  async getAccessToken() {
    // Check if token is expired (expires_at is in seconds)
    if (this.tokens.expires_at && Date.now() >= this.tokens.expires_at * 1000) {
      if (this.refreshCallback) {
        this.tokens = await this.refreshCallback(this.tokens.refresh_token);
      }
    }
    return this.tokens.access_token;
  }
}

/**
 * Get Microsoft OAuth2 client with credentials from database
 */
async function getOAuthClient() {
  const db = getDb();
  
  // Get Microsoft OAuth credentials from config
  const clientIdRow = await db.get('SELECT value FROM config WHERE key = ?', ['microsoftClientId']);
  const clientSecretRow = await db.get('SELECT value FROM config WHERE key = ?', ['microsoftClientSecret']);
  const tenantIdRow = await db.get('SELECT value FROM config WHERE key = ?', ['microsoftTenantId']);
  
  // Get redirect URI from config or environment variable
  let redirectUri = process.env.MICROSOFT_REDIRECT_URI;
  if (!redirectUri) {
    const redirectUriRow = await db.get('SELECT value FROM config WHERE key = ?', ['microsoftRedirectUri']);
    redirectUri = redirectUriRow?.value || 'http://localhost:3001/api/planner/microsoft/callback';
  }
  
  logger.info(`Using Microsoft OAuth redirect URI: ${redirectUri}`);
  
  // Check which credentials are missing and provide helpful error message
  const missing = [];
  if (!clientIdRow || !clientIdRow.value) missing.push('Client ID');
  if (!clientSecretRow || !clientSecretRow.value) missing.push('Client Secret');
  if (!tenantIdRow || !tenantIdRow.value) missing.push('Tenant ID');
  
  if (missing.length > 0) {
    throw new Error(`Microsoft OAuth credentials not configured. Missing: ${missing.join(', ')}. Please configure in the Configuration page.`);
  }
  
  return {
    clientId: clientIdRow.value,
    clientSecret: clientSecretRow.value,
    tenantId: tenantIdRow.value,
    redirectUri
  };
}

/**
 * Generate OAuth URL for user to authorize
 */
async function getAuthUrl() {
  const { clientId, redirectUri } = await getOAuthClient();
  
  // Microsoft OAuth2 authorization endpoint - using /common for multi-tenant support
  // This allows users from any organization or personal accounts to sign in
  // Using Microsoft To Do API, not Planner API
  const scopes = [
    'Tasks.ReadWrite',
    'User.Read'
  ].join(' ');
  
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: scopes,
    state: 'microsoft-planner-auth',
    prompt: 'select_account' // Allow user to choose which account to use
  });
  
  // Use /common for multi-tenant support (works with any org or personal accounts)
  // Alternative: use /organizations for work/school accounts only
  const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  
  logger.info('Generated Microsoft OAuth URL (multi-tenant)');
  return url;
}

/**
 * Exchange authorization code for tokens
 */
async function getTokenFromCode(code) {
  const { clientId, clientSecret, redirectUri } = await getOAuthClient();
  
  // Use /common for multi-tenant token exchange
  // The actual tenant will be determined by the authorization code
  const tokenUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/token`;
  
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    scope: 'Tasks.ReadWrite User.Read'
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
    logger.error('Token exchange failed', { status: response.status, error: errorText });
    throw new Error(`Failed to exchange code for token: ${response.status}`);
  }
  
  const tokens = await response.json();
  
  // Calculate expires_at from expires_in
  if (tokens.expires_in && !tokens.expires_at) {
    tokens.expires_at = Math.floor(Date.now() / 1000) + tokens.expires_in;
  }
  
  // Store tokens in database (including tenant info if provided)
  const db = getDb();
  await db.run(
    'INSERT OR REPLACE INTO config (key, value, updated_date) VALUES (?, ?, CURRENT_TIMESTAMP)',
    ['microsoftPlannerToken', JSON.stringify(tokens)]
  );
  
  logger.info('Microsoft Planner tokens stored successfully');
  return tokens;
}

/**
 * Get Microsoft Graph client with stored tokens
 */
async function getGraphClient() {
  const db = getDb();
  const tokenRow = await db.get('SELECT value FROM config WHERE key = ?', ['microsoftPlannerToken']);
  
  if (!tokenRow || !tokenRow.value) {
    throw new Error('Microsoft Planner not connected. Please connect in Configuration.');
  }
  
  let tokens;
  try {
    tokens = JSON.parse(tokenRow.value);
  } catch (err) {
    logger.error('Failed to parse stored token', err);
    throw new Error('Invalid stored token. Please reconnect.');
  }
  
  // Store expires_at if not present (calculate from expires_in)
  if (!tokens.expires_at && tokens.expires_in) {
    tokens.expires_at = Math.floor(Date.now() / 1000) + tokens.expires_in;
    // Update stored token with expires_at
    const db = getDb();
    await db.run(
      'INSERT OR REPLACE INTO config (key, value, updated_date) VALUES (?, ?, CURRENT_TIMESTAMP)',
      ['microsoftPlannerToken', JSON.stringify(tokens)]
    );
  }
  
  // Create custom authentication provider
  const authProvider = new CustomAuthProvider(tokens, refreshToken);
  
  const client = Client.initWithMiddleware({
    authProvider: authProvider
  });
  
  return client;
}

/**
 * Refresh access token using refresh token
 */
async function refreshToken(refreshTokenValue) {
  const { clientId, clientSecret, tenantId } = await getOAuthClient();
  
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshTokenValue,
    grant_type: 'refresh_token',
    scope: 'Tasks.ReadWrite User.Read'
  });
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });
  
  if (!response.ok) {
    throw new Error('Failed to refresh token');
  }
  
  const tokens = await response.json();
  
  // Calculate expires_at from expires_in
  if (tokens.expires_in && !tokens.expires_at) {
    tokens.expires_at = Math.floor(Date.now() / 1000) + tokens.expires_in;
  }
  
  // Store updated tokens
  const db = getDb();
  await db.run(
    'INSERT OR REPLACE INTO config (key, value, updated_date) VALUES (?, ?, CURRENT_TIMESTAMP)',
    ['microsoftPlannerToken', JSON.stringify(tokens)]
  );
  
  return tokens;
}

/**
 * Check if user has connected Microsoft Planner
 */
async function isConnected() {
  const db = getDb();
  const tokenRow = await db.get('SELECT value FROM config WHERE key = ?', ['microsoftPlannerToken']);
  return !!(tokenRow && tokenRow.value);
}

/**
 * Disconnect Microsoft Planner
 */
async function disconnect() {
  const db = getDb();
  await db.run('DELETE FROM config WHERE key = ?', ['microsoftPlannerToken']);
  logger.info('Microsoft Planner disconnected');
}

/**
 * List all available task lists
 */
async function listTaskLists() {
  const client = await getGraphClient();
  
  // Get user's task lists
  const taskLists = await client.api('/me/todo/lists').get();
  
  return taskLists.value || [];
}

/**
 * Get configured task list ID or default to "My Tasks"
 */
async function getTaskListId() {
  const db = getDb();
  const listIdRow = await db.get('SELECT value FROM config WHERE key = ?', ['microsoftTaskListId']);
  
  if (listIdRow && listIdRow.value) {
    logger.info(`Using configured Microsoft To Do list ID: ${listIdRow.value}`);
    return listIdRow.value;
  }
  
  // Fallback: get default list
  const client = await getGraphClient();
  const taskLists = await client.api('/me/todo/lists').get();
  const defaultList = taskLists.value.find(list => list.displayName === 'My Tasks') || taskLists.value[0];
  
  if (!defaultList) {
    throw new Error('No task list found. Please create a task list in Microsoft To Do.');
  }
  
  logger.info(`Using default Microsoft To Do list: ${defaultList.displayName} (${defaultList.id})`);
  return defaultList.id;
}

/**
 * Create a task in Microsoft Planner/To Do
 */
async function createTask(taskData) {
  const client = await getGraphClient();
  
  const {
    title,
    description,
    dueDate,
    importance = 'normal', // low, normal, high
    status = 'notStarted' // notStarted, inProgress, completed, waitingOnOthers, deferred
  } = taskData;
  
  // Get configured task list ID
  const taskListId = await getTaskListId();
  
  // Create task in Microsoft To Do
  const task = {
    title: title,
    body: {
      contentType: 'text',
      content: description || ''
    },
    dueDateTime: dueDate ? {
      dateTime: new Date(dueDate).toISOString(),
      timeZone: 'UTC'
    } : null,
    importance: importance,
    status: status
  };
  
  logger.info(`Creating Microsoft task: ${title} in list ${taskListId}`);
  
  const createdTask = await client
    .api(`/me/todo/lists/${taskListId}/tasks`)
    .post(task);
  
  logger.info(`Microsoft task created: ${createdTask.id}`);
  return createdTask;
}

/**
 * Create task from commitment
 */
async function createTaskFromCommitment(commitment) {
  try {
    // Map urgency to importance
    const urgencyMap = {
      'high': 'high',
      'medium': 'normal',
      'low': 'low'
    };
    
    // Map status
    const statusMap = {
      'pending': 'notStarted',
      'in_progress': 'inProgress',
      'completed': 'completed'
    };
    
    const taskData = {
      title: commitment.description,
      description: commitment.suggested_approach || commitment.description,
      dueDate: commitment.deadline,
      importance: urgencyMap[commitment.urgency] || 'normal',
      status: statusMap[commitment.status] || 'notStarted'
    };
    
    return await createTask(taskData);
  } catch (error) {
    logger.error('Error creating Microsoft task from commitment', error);
    throw error;
  }
}

/**
 * List all tasks
 */
async function listTasks(limit = 50) {
  const client = await getGraphClient();
  const taskListId = await getTaskListId();
  
  const tasks = await client
    .api(`/me/todo/lists/${taskListId}/tasks`)
    .top(limit)
    .get();
  
  return tasks.value || [];
}

module.exports = {
  getAuthUrl,
  getTokenFromCode,
  isConnected,
  disconnect,
  listTaskLists,
  getTaskListId,
  createTask,
  createTaskFromCommitment,
  listTasks
};

