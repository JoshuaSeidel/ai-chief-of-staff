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
 * @param {number} profileId - Profile ID (not used for credentials, but for consistency)
 */
async function getOAuthClient(profileId = 2) {
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
  
  logger.info(`Using Microsoft OAuth redirect URI: ${redirectUri} (multi-tenant mode)`);
  
  // Check which credentials are missing and provide helpful error message
  const missing = [];
  if (!clientIdRow || !clientIdRow.value) missing.push('Client ID');
  if (!clientSecretRow || !clientSecretRow.value) missing.push('Client Secret');
  // Note: Tenant ID is optional for multi-tenant apps, but still recommended for logging
  
  if (missing.length > 0) {
    throw new Error(`Microsoft OAuth credentials not configured. Missing: ${missing.join(', ')}. Please configure in the Configuration page.`);
  }
  
  return {
    clientId: clientIdRow.value,
    clientSecret: clientSecretRow.value,
    tenantId: tenantIdRow?.value || null, // Optional for multi-tenant, used only for logging
    redirectUri
  };
}

/**
 * Generate OAuth URL for user to authorize
 * Includes both Calendar and Tasks scopes for unified Microsoft integration
 */
async function getAuthUrl() {
  const { clientId, redirectUri } = await getOAuthClient();
  
  // Microsoft OAuth2 authorization endpoint - using /common for multi-tenant support
  // Includes both Calendar and Tasks scopes for unified Microsoft integration
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
    prompt: 'select_account' // Allow user to choose which account to use
  });
  
  // Use /common for multi-tenant support (works with any org or personal accounts)
  const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  
  logger.info('Generated Microsoft OAuth URL (Calendar + Tasks)');
  return url;
}

/**
 * Exchange authorization code for tokens
 * NOTE: Microsoft Planner shares the same token as Microsoft Calendar.
 * Token is stored in profile_integrations with integration_name='microsoft'
 * @param {string} code - OAuth authorization code
 * @param {number} profileId - Profile ID to associate tokens with
 */
async function getTokenFromCode(code, profileId = 2) {
  const { clientId, clientSecret, redirectUri } = await getOAuthClient(profileId);
  
  // Use /common for multi-tenant token exchange
  // The actual tenant will be determined by the authorization code
  const tokenUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/token`;
  
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
  
  // Store tokens in profile_integrations table (shared with Microsoft Calendar)
  const db = getDb();
  await db.run(
    `INSERT INTO profile_integrations (profile_id, integration_type, integration_name, token_data, is_enabled, created_date, updated_date)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (profile_id, integration_type, integration_name)
     DO UPDATE SET token_data = ?, is_enabled = ?, updated_date = CURRENT_TIMESTAMP`,
    [profileId, 'calendar', 'microsoft', JSON.stringify(tokens), true, JSON.stringify(tokens), true]
  );
  
  logger.info(`Microsoft tokens stored successfully for profile ${profileId} (Calendar + Tasks)`);
  return tokens;
}

/**
 * Get Microsoft Graph client with stored tokens (shared token for Calendar and Planner)
 * @param {number} profileId - Profile ID to get tokens for
 */
async function getGraphClient(profileId = 2) {
  const db = getDb();
  const tokenRow = await db.get(
    'SELECT token_data FROM profile_integrations WHERE profile_id = ? AND integration_type = ? AND integration_name = ?',
    [profileId, 'calendar', 'microsoft']
  );
  
  if (!tokenRow || !tokenRow.token_data) {
    throw new Error('Microsoft not connected. Please connect in Configuration.');
  }
  
  let tokens;
  try {
    tokens = JSON.parse(tokenRow.token_data);
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
      `UPDATE profile_integrations 
       SET token_data = ?, updated_date = CURRENT_TIMESTAMP 
       WHERE profile_id = ? AND integration_type = ? AND integration_name = ?`,
      [JSON.stringify(tokens), profileId, 'calendar', 'microsoft']
    );
  }
  
  // Create custom authentication provider with profileId bound
  const authProvider = new CustomAuthProvider(tokens, (refreshTokenValue) => refreshToken(refreshTokenValue, profileId));
  
  const client = Client.initWithMiddleware({
    authProvider: authProvider
  });
  
  return client;
}

/**
 * Refresh access token using refresh token
 * @param {string} refreshTokenValue - The refresh token
 * @param {number} profileId - Profile ID to update tokens for
 */
async function refreshToken(refreshTokenValue, profileId = 2) {
  const { clientId, clientSecret } = await getOAuthClient(profileId);
  
  // Use /common for multi-tenant token refresh
  // The tenant is determined by the refresh token itself
  const tokenUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/token`;
  
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
  
  // Calculate expires_at from expires_in
  if (tokens.expires_in && !tokens.expires_at) {
    tokens.expires_at = Math.floor(Date.now() / 1000) + tokens.expires_in;
  }
  
  // Store updated tokens in profile_integrations (shared token for Calendar and Planner)
  const db = getDb();
  await db.run(
    `UPDATE profile_integrations \n     SET token_data = ?, updated_date = CURRENT_TIMESTAMP \n     WHERE profile_id = ? AND integration_type = ? AND integration_name = ?`,
    [JSON.stringify(tokens), profileId, 'calendar', 'microsoft']
  );
  
  logger.info(`Microsoft tokens refreshed successfully for profile ${profileId} (Calendar + Tasks)`);
  return tokens;
}

/**
 * Check if user has connected Microsoft for a profile (shared token for Calendar and Planner)
 * @param {number} profileId - Profile ID to check
 */
async function isConnected(profileId = 2) {
  const db = getDb();
  const tokenRow = await db.get(
    'SELECT token_data FROM profile_integrations WHERE profile_id = ? AND integration_type = ? AND integration_name = ? AND is_enabled = ?',
    [profileId, 'calendar', 'microsoft', true]
  );
  return !!(tokenRow && tokenRow.token_data);
}

/**
 * Disconnect Microsoft for a profile (removes shared token for Calendar and Planner)
 * @param {number} profileId - Profile ID to disconnect
 */
async function disconnect(profileId = 2) {
  const db = getDb();
  await db.run(
    'DELETE FROM profile_integrations WHERE profile_id = ? AND integration_type = ? AND integration_name = ?',
    [profileId, 'calendar', 'microsoft']
  );
  logger.info(`Microsoft disconnected for profile ${profileId} (Calendar + Planner)`);
}

/**
 * List all available task lists
 * @param {number} profileId - Profile ID to use
 */
async function listTaskLists(profileId = 2) {
  const client = await getGraphClient(profileId);
  
  // Get user's task lists
  const taskLists = await client.api('/me/todo/lists').get();
  
  return taskLists.value || [];
}

/**
 * Get configured task list ID or default to "My Tasks"
 * @param {number} profileId - Profile ID to use
 */
async function getTaskListId(profileId = 2) {
  const db = getDb();
  const listIdRow = await db.get('SELECT value FROM config WHERE key = ?', ['microsoftTaskListId']);
  
  if (listIdRow && listIdRow.value) {
    logger.info(`Using configured Microsoft To Do list ID: ${listIdRow.value}`);
    return listIdRow.value;
  }
  
  // Fallback: get default list
  const client = await getGraphClient(profileId);
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
 * @param {object} taskData - Task data
 * @param {number} profileId - Profile ID to use
 */
async function createTask(taskData, profileId = 2) {
  const client = await getGraphClient(profileId);
  
  const {
    title,
    description,
    dueDate,
    importance = 'normal', // low, normal, high
    status = 'notStarted' // notStarted, inProgress, completed, waitingOnOthers, deferred
  } = taskData;
  
  // Get configured task list ID
  const taskListId = await getTaskListId(profileId);
  
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
 * @param {object} commitment - Commitment/task data
 * @param {number} profileId - Profile ID to use
 */
async function createTaskFromCommitment(commitment, profileId = 2) {
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
    
    return await createTask(taskData, profileId);
  } catch (error) {
    logger.error('Error creating Microsoft task from commitment', error);
    throw error;
  }
}

/**
 * Update task status (mark as completed)
 * @param {string} taskId - Task ID
 * @param {string} status - New status
 * @param {number} profileId - Profile ID to use
 */
async function updateTaskStatus(taskId, status, profileId = 2) {
  try {
    const client = await getGraphClient(profileId);
    const taskListId = await getTaskListId(profileId);
    
    // Microsoft To Do API status values: notStarted, inProgress, completed, waitingOnOthers, deferred
    const validStatuses = ['notStarted', 'inProgress', 'completed', 'waitingOnOthers', 'deferred'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
    }
    
    await client
      .api(`/me/todo/lists/${taskListId}/tasks/${taskId}`)
      .patch({
        status: status
      });
    
    logger.info(`Updated Microsoft task ${taskId} status to ${status}`);
    return true;
  } catch (error) {
    logger.warn(`Failed to update Microsoft task ${taskId} status: ${error.message}`);
    return false;
  }
}

/**
 * Mark a task as completed
 * @param {string} taskId - Task ID
 * @param {string} completionNote - Optional completion note
 * @param {number} profileId - Profile ID to use
 */
async function completeTask(taskId, completionNote = null, profileId = 2) {
  try {
    const client = await getGraphClient(profileId);
    const taskListId = await getTaskListId(profileId);
    
    const updateData = {
      status: 'completed'
    };
    
    // If completion note provided, append it to the task body
    if (completionNote) {
      try {
        // Get current task to preserve existing body
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
        logger.warn(`Failed to add completion note to Microsoft task: ${noteError.message}`);
        // Continue with status update even if note fails
      }
    }
    
    await client
      .api(`/me/todo/lists/${taskListId}/tasks/${taskId}`)
      .patch(updateData);
    
    logger.info(`Completed Microsoft task ${taskId}`);
    return true;
  } catch (error) {
    logger.warn(`Failed to complete Microsoft task ${taskId}: ${error.message}`);
    return false;
  }
}

/**
 * Delete a task permanently
 * @param {string} taskId - Task ID
 * @param {number} profileId - Profile ID to use
 */
async function deleteTask(taskId, profileId = 2) {
  try {
    const client = await getGraphClient(profileId);
    const taskListId = await getTaskListId(profileId);
    
    await client
      .api(`/me/todo/lists/${taskListId}/tasks/${taskId}`)
      .delete();
    
    logger.info(`Deleted Microsoft task ${taskId}`);
    return true;
  } catch (error) {
    logger.warn(`Failed to delete Microsoft task ${taskId}: ${error.message}`);
    return false;
  }
}

/**
 * List all tasks
 * @param {number} limit - Maximum number of tasks to return
 * @param {number} profileId - Profile ID to use
 */
async function listTasks(limit = 50, profileId = 2) {
  const client = await getGraphClient(profileId);
  const taskListId = await getTaskListId(profileId);
  
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
  updateTaskStatus,
  completeTask,
  deleteTask,
  listTasks
};

