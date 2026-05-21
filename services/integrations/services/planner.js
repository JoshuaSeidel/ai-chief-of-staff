const { Client } = require('@microsoft/microsoft-graph-client');
const fetch = require('node-fetch');
const { getConfig, setConfig, query } = require('../utils/db-helper');
const { getMicrosoftIdentityBaseUrl, requireMicrosoftTenantId, resolveMicrosoftTenantId } = require('../utils/microsoft-identity');

const logger = {
  info: (msg, ...args) => console.log(`[MS Planner] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[MS Planner ERROR] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[MS Planner WARNING] ${msg}`, ...args)
};

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
 * Get Microsoft OAuth2 client configuration from database
 */
async function getOAuthConfig() {
  const clientId = await getConfig('microsoftClientId') || process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = await getConfig('microsoftClientSecret') || process.env.MICROSOFT_CLIENT_SECRET;
  const rawTenantId = resolveMicrosoftTenantId(await getConfig('microsoftTenantId'), process.env.MICROSOFT_TENANT_ID);
  
  let redirectUri = process.env.MICROSOFT_REDIRECT_URI;
  if (!redirectUri) {
    redirectUri = await getConfig('microsoftRedirectUri') || 'http://localhost:3001/api/planner/microsoft/callback';
  }
  
  logger.info(`Using Microsoft OAuth redirect URI: ${redirectUri}`);
  
  const missing = [];
  if (!clientId) missing.push('Client ID');
  if (!clientSecret) missing.push('Client Secret');
  if (!rawTenantId) missing.push('Tenant ID');
  
  if (missing.length > 0) {
    throw new Error(`Microsoft OAuth credentials not configured. Missing: ${missing.join(', ')}. Please configure in the Configuration page.`);
  }

  const tenantId = requireMicrosoftTenantId(rawTenantId);
  
  return {
    clientId,
    clientSecret,
    tenantId: tenantId || null,
    redirectUri
  };
}

/**
 * Generate OAuth URL for user to authorize
 */
async function getAuthUrl() {
  const { clientId, tenantId, redirectUri } = await getOAuthConfig();
  
  const scopes = [
    'Calendars.ReadWrite',
    'Tasks.ReadWrite',
    'User.Read'
  ].join(' ');
  
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: scopes,
    state: 'microsoft-integration-auth',
    prompt: 'select_account'
  });
  
  const url = `${getMicrosoftIdentityBaseUrl(tenantId)}/authorize?${params.toString()}`;
  
  logger.info('Generated Microsoft OAuth URL (Calendar + Tasks)');
  return url;
}

/**
 * Exchange authorization code for tokens
 */
async function getTokenFromCode(code) {
  const { clientId, clientSecret, tenantId, redirectUri } = await getOAuthConfig();
  
  const tokenUrl = `${getMicrosoftIdentityBaseUrl(tenantId)}/token`;
  
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    scope: 'Calendars.ReadWrite Tasks.ReadWrite User.Read'
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
  
  // Store tokens in database
  await setConfig('microsoftToken', JSON.stringify(tokens));
  
  logger.info('Microsoft tokens stored successfully (Calendar + Tasks)');
  return tokens;
}

/**
 * Get Microsoft Graph client with stored tokens
 */
async function getGraphClient() {
  const tokenStr = await getConfig('microsoftToken');
  
  if (!tokenStr) {
    throw new Error('Microsoft not connected. Please connect in Configuration.');
  }
  
  let tokens;
  try {
    tokens = JSON.parse(tokenStr);
  } catch (err) {
    logger.error('Failed to parse stored token', err);
    throw new Error('Invalid stored token. Please reconnect.');
  }
  
  // Store expires_at if not present
  if (!tokens.expires_at && tokens.expires_in) {
    tokens.expires_at = Math.floor(Date.now() / 1000) + tokens.expires_in;
    await setConfig('microsoftToken', JSON.stringify(tokens));
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
  const { clientId, clientSecret, tenantId } = await getOAuthConfig();
  
  const tokenUrl = `${getMicrosoftIdentityBaseUrl(tenantId)}/token`;
  
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshTokenValue,
    grant_type: 'refresh_token',
    scope: 'Calendars.ReadWrite Tasks.ReadWrite User.Read'
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
    logger.error('Token refresh failed', { status: response.status, error: errorText });
    throw new Error(`Failed to refresh token: ${response.status}`);
  }
  
  const tokens = await response.json();
  
  if (tokens.expires_in && !tokens.expires_at) {
    tokens.expires_at = Math.floor(Date.now() / 1000) + tokens.expires_in;
  }
  
  await setConfig('microsoftToken', JSON.stringify(tokens));
  
  logger.info('Microsoft tokens refreshed successfully (Calendar + Tasks)');
  return tokens;
}

/**
 * Check if user has connected Microsoft
 */
async function checkStatus() {
  try {
    const tokenStr = await getConfig('microsoftToken');
    if (!tokenStr) {
      return {
        connected: false,
        error: 'Not configured'
      };
    }
    
    const client = await getGraphClient();
    const user = await client.api('/me').get();
    
    logger.info(`Connected to Microsoft as: ${user.displayName} (${user.mail || user.userPrincipalName})`);
    
    return {
      connected: true,
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.mail || user.userPrincipalName
      }
    };
  } catch (error) {
    logger.warn('Microsoft connection check failed', error.message);
    return {
      connected: false,
      error: error.message
    };
  }
}

/**
 * Disconnect Microsoft
 */
async function disconnect() {
  await query('DELETE FROM config WHERE key = ?', ['microsoftToken']);
  logger.info('Microsoft disconnected (Calendar + Planner)');
  return { success: true };
}

/**
 * List all available task lists
 */
async function listTaskLists() {
  const client = await getGraphClient();
  const taskLists = await client.api('/me/todo/lists').get();
  
  return taskLists.value.map(list => ({
    id: list.id,
    displayName: list.displayName,
    isOwner: list.isOwner,
    isShared: list.isShared
  }));
}

/**
 * Get configured task list ID
 */
async function getTaskListId() {
  let listId = await getConfig('microsoftTaskListId');
  
  if (listId) {
    logger.info(`Using configured Microsoft To Do list ID: ${listId}`);
    return listId;
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
 * Create a task
 */
async function createTask(taskData) {
  const client = await getGraphClient();
  
  const {
    title,
    description,
    dueDate,
    importance = 'normal',
    status = 'notStarted'
  } = taskData;
  
  const taskListId = await getTaskListId();
  
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
  
  return {
    id: createdTask.id,
    title: createdTask.title,
    status: createdTask.status,
    importance: createdTask.importance,
    createdDateTime: createdTask.createdDateTime
  };
}

/**
 * Update task
 */
async function updateTask(taskId, updates) {
  const client = await getGraphClient();
  const taskListId = await getTaskListId();
  
  const { title, description, dueDate, importance, status } = updates;
  
  const updateData = {};
  
  if (title) updateData.title = title;
  if (description !== undefined) {
    updateData.body = {
      contentType: 'text',
      content: description
    };
  }
  if (dueDate) {
    updateData.dueDateTime = {
      dateTime: new Date(dueDate).toISOString(),
      timeZone: 'UTC'
    };
  }
  if (importance) updateData.importance = importance;
  if (status) updateData.status = status;
  
  await client
    .api(`/me/todo/lists/${taskListId}/tasks/${taskId}`)
    .patch(updateData);
  
  logger.info(`Updated Microsoft task ${taskId}`);
  
  return { success: true };
}

/**
 * Mark a task as completed
 */
async function completeTask(taskId, completionNote = null) {
  try {
    const client = await getGraphClient();
    const taskListId = await getTaskListId();
    
    const updateData = {
      status: 'completed'
    };
    
    // If completion note provided, append it to the task body
    if (completionNote) {
      try {
        const currentTask = await client
          .api(`/me/todo/lists/${taskListId}/tasks/${taskId}`)
          .get();
        
        const existingBody = currentTask.body?.content || '';
        const completionText = `\n\n✅ Completion Note: ${completionNote}`;
        
        updateData.body = {
          contentType: 'text',
          content: existingBody + completionText
        };
        
        logger.info(`Added completion note to Microsoft task ${taskId}`);
      } catch (noteError) {
        logger.warn(`Failed to add completion note: ${noteError.message}`);
      }
    }
    
    await client
      .api(`/me/todo/lists/${taskListId}/tasks/${taskId}`)
      .patch(updateData);
    
    logger.info(`Completed Microsoft task ${taskId}`);
    return { success: true };
  } catch (error) {
    logger.warn(`Failed to complete Microsoft task ${taskId}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a task
 */
async function deleteTask(taskId) {
  try {
    const client = await getGraphClient();
    const taskListId = await getTaskListId();
    
    await client
      .api(`/me/todo/lists/${taskListId}/tasks/${taskId}`)
      .delete();
    
    logger.info(`Deleted Microsoft task ${taskId}`);
    return { success: true };
  } catch (error) {
    logger.warn(`Failed to delete Microsoft task ${taskId}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Get a specific task
 */
async function getTask(taskId) {
  const client = await getGraphClient();
  const taskListId = await getTaskListId();
  
  const task = await client
    .api(`/me/todo/lists/${taskListId}/tasks/${taskId}`)
    .get();
  
  return {
    id: task.id,
    title: task.title,
    body: task.body?.content,
    status: task.status,
    importance: task.importance,
    dueDateTime: task.dueDateTime?.dateTime,
    createdDateTime: task.createdDateTime,
    lastModifiedDateTime: task.lastModifiedDateTime
  };
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
  
  return tasks.value.map(task => ({
    id: task.id,
    title: task.title,
    status: task.status,
    importance: task.importance,
    dueDateTime: task.dueDateTime?.dateTime,
    createdDateTime: task.createdDateTime
  }));
}

module.exports = {
  getAuthUrl,
  getTokenFromCode,
  checkStatus,
  disconnect,
  listTaskLists,
  getTaskListId,
  createTask,
  updateTask,
  completeTask,
  deleteTask,
  getTask,
  listTasks
};
