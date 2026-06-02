const { Client } = require('@microsoft/microsoft-graph-client');
const { getDb } = require('../database/db');
const { createModuleLogger } = require('../utils/logger');
const { getMicrosoftScopeString } = require('./microsoft-scopes');
const { createOAuthState } = require('./oauth-state');
const { getMicrosoftIdentityBaseUrl, requireMicrosoftTenantId, resolveMicrosoftTenantId } = require('./microsoft-identity');

const logger = createModuleLogger('MICROSOFT-PLANNER');

const DEFAULT_SYNC_CONFIG = {
  sync_enabled: false,
  target_type: 'todo',
  todo_list_id: '',
  todo_list_name: '',
  planner_plan_id: '',
  planner_plan_title: '',
  planner_bucket_id: '',
  planner_bucket_name: '',
  assign_to_self: true
};

function parseJsonSafely(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    logger.warn(`Invalid Microsoft Planner config JSON: ${error.message}`);
    return fallback;
  }
}

function normalizeSyncConfig(config = {}) {
  const targetType = config.target_type === 'planner' ? 'planner' : 'todo';

  return {
    ...DEFAULT_SYNC_CONFIG,
    ...config,
    sync_enabled: config.sync_enabled === true || config.sync_enabled === 'true' || config.sync_enabled === 1,
    target_type: targetType,
    todo_list_id: String(config.todo_list_id || '').trim(),
    todo_list_name: String(config.todo_list_name || '').trim(),
    planner_plan_id: String(config.planner_plan_id || '').trim(),
    planner_plan_title: String(config.planner_plan_title || '').trim(),
    planner_bucket_id: String(config.planner_bucket_id || '').trim(),
    planner_bucket_name: String(config.planner_bucket_name || '').trim(),
    assign_to_self: config.assign_to_self !== false && config.assign_to_self !== 'false'
  };
}

function getRawMicrosoftTaskId(taskId) {
  const raw = String(taskId || '');
  if (raw.startsWith('planner:')) {
    return { targetType: 'planner', id: raw.slice('planner:'.length) };
  }
  if (raw.startsWith('todo:')) {
    return { targetType: 'todo', id: raw.slice('todo:'.length) };
  }
  return { targetType: null, id: raw };
}

function getPlannerTaskTitle(taskData) {
  return String(taskData.title || taskData.description || 'Untitled task').trim().slice(0, 255);
}

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
  const clientId = clientIdRow?.value || process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = clientSecretRow?.value || process.env.MICROSOFT_CLIENT_SECRET;
  const rawTenantId = resolveMicrosoftTenantId(tenantIdRow?.value, process.env.MICROSOFT_TENANT_ID);
  
  // Get redirect URI from config or environment variable
  const redirectUriRow = await db.get('SELECT value FROM config WHERE key = ?', ['microsoftRedirectUri']);
  const redirectUri = redirectUriRow?.value || process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:3001/api/planner/microsoft/callback';
  
  logger.info(`Using Microsoft OAuth redirect URI: ${redirectUri}`);
  
  // Check which credentials are missing and provide helpful error message
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
    tenantId,
    redirectUri
  };
}

/**
 * Generate OAuth URL for user to authorize
 * Includes Microsoft 365 scopes for unified Microsoft integration
 */
async function getAuthUrl(profileId = 2) {
  const { clientId, tenantId, redirectUri } = await getOAuthClient(profileId);
  
  // Microsoft OAuth2 authorization endpoint.
  // Includes calendar, task, mail, and online meeting scopes for unified Microsoft 365 integration.
  const scopes = getMicrosoftScopeString();
  
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: scopes,
    state: await createOAuthState(profileId, 'microsoft'),
    prompt: 'select_account' // Allow user to choose which account to use
  });
  
  const url = `${getMicrosoftIdentityBaseUrl(tenantId)}/authorize?${params.toString()}`;
  
  logger.info('Generated Microsoft OAuth URL (Microsoft 365)');
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
  const { clientId, clientSecret, tenantId, redirectUri } = await getOAuthClient(profileId);
  
  const tokenUrl = `${getMicrosoftIdentityBaseUrl(tenantId)}/token`;
  
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    scope: getMicrosoftScopeString()
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
    `INSERT INTO profile_integrations (profile_id, integration_type, integration_name, token_data, config, is_enabled, created_date, updated_date)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (profile_id, integration_type, integration_name)
     DO UPDATE SET token_data = ?, is_enabled = ?, updated_date = CURRENT_TIMESTAMP`,
    [profileId, 'calendar', 'microsoft', JSON.stringify(tokens), '{}', true, JSON.stringify(tokens), true]
  );
  
  logger.info(`Microsoft tokens stored successfully for profile ${profileId} (Microsoft 365)`);
  return tokens;
}

/**
 * Get Microsoft Graph client with stored tokens (shared Microsoft 365 token)
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
  const { clientId, clientSecret, tenantId } = await getOAuthClient(profileId);
  
  const tokenUrl = `${getMicrosoftIdentityBaseUrl(tenantId)}/token`;
  
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshTokenValue,
    grant_type: 'refresh_token',
    scope: getMicrosoftScopeString()
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
  
  // Store updated tokens in profile_integrations (shared Microsoft 365 token)
  const db = getDb();
  await db.run(
    `UPDATE profile_integrations \n     SET token_data = ?, updated_date = CURRENT_TIMESTAMP \n     WHERE profile_id = ? AND integration_type = ? AND integration_name = ?`,
    [JSON.stringify(tokens), profileId, 'calendar', 'microsoft']
  );
  
  logger.info(`Microsoft tokens refreshed successfully for profile ${profileId} (Microsoft 365)`);
  return tokens;
}

/**
 * Check if user has connected Microsoft for a profile (shared Microsoft 365 token)
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

async function getSyncConfig(profileId = 2) {
  const db = getDb();
  const configRow = await db.get(
    'SELECT config FROM profile_integrations WHERE profile_id = ? AND integration_type = ? AND integration_name = ?',
    [profileId, 'planner', 'microsoft']
  );
  const config = normalizeSyncConfig(parseJsonSafely(configRow?.config, {}));

  if (!config.todo_list_id) {
    const listIdRow = await db.get('SELECT value FROM config WHERE key = ?', ['microsoftTaskListId']);
    if (listIdRow?.value) {
      config.todo_list_id = listIdRow.value;
    }
  }

  return config;
}

async function saveSyncConfig(config = {}, profileId = 2) {
  const db = getDb();
  const normalized = normalizeSyncConfig(config);

  if (normalized.sync_enabled && normalized.target_type === 'planner' && !normalized.planner_plan_id) {
    throw new Error('Select a Microsoft Planner plan before enabling Planner sync.');
  }

  await db.run(
    `INSERT INTO profile_integrations (profile_id, integration_type, integration_name, token_data, config, is_enabled, created_date, updated_date)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (profile_id, integration_type, integration_name)
     DO UPDATE SET config = ?, is_enabled = ?, updated_date = CURRENT_TIMESTAMP`,
    [
      profileId,
      'planner',
      'microsoft',
      null,
      JSON.stringify(normalized),
      true,
      JSON.stringify(normalized),
      true
    ]
  );

  return normalized;
}

async function isSyncEnabled(profileId = 2) {
  const [connected, config] = await Promise.all([
    isConnected(profileId),
    getSyncConfig(profileId)
  ]);

  return Boolean(connected && config.sync_enabled);
}

/**
 * Disconnect Microsoft for a profile (removes shared Microsoft 365 token)
 * @param {number} profileId - Profile ID to disconnect
 */
async function disconnect(profileId = 2) {
  const db = getDb();
  await db.run(
    'DELETE FROM profile_integrations WHERE profile_id = ? AND integration_type = ? AND integration_name = ?',
    [profileId, 'calendar', 'microsoft']
  );
  logger.info(`Microsoft disconnected for profile ${profileId} (Microsoft 365)`);
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

async function listPlannerPlans(profileId = 2) {
  const client = await getGraphClient(profileId);
  const plans = await client.api('/me/planner/plans').get();
  return plans.value || [];
}

async function listPlannerBuckets(planId, profileId = 2) {
  if (!planId) {
    throw new Error('Planner plan ID is required');
  }

  const client = await getGraphClient(profileId);
  const buckets = await client.api(`/planner/plans/${planId}/buckets`).get();
  return buckets.value || [];
}

/**
 * Get configured task list ID or default to "My Tasks"
 * @param {number} profileId - Profile ID to use
 */
async function getTaskListId(profileId = 2) {
  const syncConfig = await getSyncConfig(profileId);
  
  if (syncConfig.todo_list_id) {
    logger.info(`Using configured Microsoft To Do list ID: ${syncConfig.todo_list_id}`);
    return syncConfig.todo_list_id;
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
async function createTodoTask(taskData, profileId = 2) {
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

async function getSignedInUserId(client) {
  const user = await client.api('/me').select('id').get();
  return user.id;
}

async function createPlannerTask(taskData, profileId = 2, syncConfig = null) {
  const client = await getGraphClient(profileId);
  const config = syncConfig || await getSyncConfig(profileId);

  if (!config.planner_plan_id) {
    throw new Error('Microsoft Planner plan is not configured. Select a plan in Settings.');
  }

  const task = {
    planId: config.planner_plan_id,
    title: getPlannerTaskTitle(taskData)
  };

  if (config.planner_bucket_id) {
    task.bucketId = config.planner_bucket_id;
  }

  if (taskData.dueDate) {
    task.dueDateTime = new Date(taskData.dueDate).toISOString();
  }

  if (config.assign_to_self) {
    try {
      const userId = await getSignedInUserId(client);
      if (userId) {
        task.assignments = {
          [userId]: {
            '@odata.type': '#microsoft.graph.plannerAssignment',
            orderHint: ' !'
          }
        };
      }
    } catch (error) {
      logger.warn(`Unable to assign Planner task to signed-in user: ${error.message}`);
    }
  }

  logger.info(`Creating Planner task: ${task.title} in plan ${config.planner_plan_id}`);
  const createdTask = await client.api('/planner/tasks').post(task);
  logger.info(`Planner task created: ${createdTask.id}`);

  return {
    ...createdTask,
    id: `planner:${createdTask.id}`,
    graph_id: createdTask.id,
    sync_target_type: 'planner'
  };
}

async function createTask(taskData, profileId = 2) {
  const syncConfig = await getSyncConfig(profileId);

  if (!syncConfig.sync_enabled) {
    throw new Error('Microsoft task sync is turned off in Settings.');
  }

  if (syncConfig.target_type === 'planner') {
    return createPlannerTask(taskData, profileId, syncConfig);
  }

  return createTodoTask(taskData, profileId);
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

function mapCommitmentImportance(commitment) {
  const urgencyMap = {
    highest: 'high',
    critical: 'high',
    urgent: 'high',
    high: 'high',
    medium: 'normal',
    normal: 'normal',
    low: 'low',
    lowest: 'low'
  };

  const value = String(commitment.urgency || commitment.priority || '').toLowerCase();
  return urgencyMap[value] || 'normal';
}

function mapCommitmentStatus(status) {
  const statusMap = {
    pending: 'notStarted',
    in_progress: 'inProgress',
    completed: 'completed'
  };

  return statusMap[status] || 'notStarted';
}

function mapCommitmentPercentComplete(status) {
  if (status === 'completed') return 100;
  if (status === 'in_progress') return 50;
  return 0;
}

async function getPlannerTaskEtag(client, taskId) {
  const task = await client.api(`/planner/tasks/${taskId}`).get();
  const etag = task['@odata.etag'];
  if (!etag) {
    throw new Error('Planner task did not include an ETag for update.');
  }
  return etag;
}

async function patchPlannerTask(client, taskId, updateData) {
  const etag = await getPlannerTaskEtag(client, taskId);
  await client
    .api(`/planner/tasks/${taskId}`)
    .header('If-Match', etag)
    .patch(updateData);
}

/**
 * Update a Microsoft To Do task from a local commitment.
 * @param {string} taskId - Microsoft To Do task ID
 * @param {object} commitment - Local commitment/task data
 * @param {string} updateNote - Optional note to append to the task body
 * @param {number} profileId - Profile ID to use
 */
async function updateTaskFromCommitment(taskId, commitment, updateNote = '', profileId = 2) {
  try {
    const storedTask = getRawMicrosoftTaskId(taskId);
    const syncConfig = await getSyncConfig(profileId);
    const targetType = storedTask.targetType || syncConfig.target_type;
    const client = await getGraphClient(profileId);

    if (targetType === 'planner') {
      const updateData = {
        title: getPlannerTaskTitle(commitment),
        percentComplete: mapCommitmentPercentComplete(commitment.status)
      };

      if (commitment.deadline) {
        updateData.dueDateTime = new Date(commitment.deadline).toISOString();
      } else {
        updateData.dueDateTime = null;
      }

      await patchPlannerTask(client, storedTask.id, updateData);
      logger.info(`Updated Planner task ${storedTask.id} from commitment ${commitment.id}`);
      return true;
    }

    const taskListId = await getTaskListId(profileId);

    let existingBody = '';
    try {
      const currentTask = await client
        .api(`/me/todo/lists/${taskListId}/tasks/${storedTask.id}`)
        .get();
      existingBody = currentTask.body?.content || '';
    } catch (error) {
      logger.warn(`Could not read Microsoft task ${storedTask.id} before update: ${error.message}`);
    }

    const bodyParts = [existingBody || commitment.suggested_approach || commitment.description];
    if (updateNote) {
      bodyParts.push(`AI Chief of Staff update (${new Date().toISOString()}):\n${updateNote}`);
    }

    const updateData = {
      title: commitment.description,
      body: {
        contentType: 'text',
        content: bodyParts.filter(Boolean).join('\n\n')
      },
      importance: mapCommitmentImportance(commitment),
      status: mapCommitmentStatus(commitment.status)
    };

    if (commitment.deadline) {
      updateData.dueDateTime = {
        dateTime: new Date(commitment.deadline).toISOString(),
        timeZone: 'UTC'
      };
    }

    await client
      .api(`/me/todo/lists/${taskListId}/tasks/${storedTask.id}`)
      .patch(updateData);

    logger.info(`Updated Microsoft task ${storedTask.id} from commitment ${commitment.id}`);
    return true;
  } catch (error) {
    logger.warn(`Failed to update Microsoft task ${taskId}: ${error.message}`);
    return false;
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
    const storedTask = getRawMicrosoftTaskId(taskId);
    const syncConfig = await getSyncConfig(profileId);
    const targetType = storedTask.targetType || syncConfig.target_type;

    if (targetType === 'planner') {
      const plannerStatusMap = {
        notStarted: 0,
        inProgress: 50,
        completed: 100,
        waitingOnOthers: 50,
        deferred: 0
      };
      const percentComplete = plannerStatusMap[status];
      if (percentComplete === undefined) {
        throw new Error(`Invalid status: ${status}. Must be one of: ${Object.keys(plannerStatusMap).join(', ')}`);
      }

      await patchPlannerTask(client, storedTask.id, { percentComplete });
      logger.info(`Updated Planner task ${storedTask.id} percent complete to ${percentComplete}`);
      return true;
    }

    const taskListId = await getTaskListId(profileId);
    
    // Microsoft To Do API status values: notStarted, inProgress, completed, waitingOnOthers, deferred
    const validStatuses = ['notStarted', 'inProgress', 'completed', 'waitingOnOthers', 'deferred'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
    }
    
    await client
      .api(`/me/todo/lists/${taskListId}/tasks/${storedTask.id}`)
      .patch({
        status: status
      });
    
    logger.info(`Updated Microsoft task ${storedTask.id} status to ${status}`);
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
    const storedTask = getRawMicrosoftTaskId(taskId);
    const syncConfig = await getSyncConfig(profileId);
    const targetType = storedTask.targetType || syncConfig.target_type;

    if (targetType === 'planner') {
      await patchPlannerTask(client, storedTask.id, { percentComplete: 100 });
      logger.info(`Completed Planner task ${storedTask.id}`);
      return true;
    }

    const taskListId = await getTaskListId(profileId);
    
    const updateData = {
      status: 'completed'
    };
    
    // If completion note provided, append it to the task body
    if (completionNote) {
      try {
        // Get current task to preserve existing body
        const currentTask = await client
          .api(`/me/todo/lists/${taskListId}/tasks/${storedTask.id}`)
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
      .api(`/me/todo/lists/${taskListId}/tasks/${storedTask.id}`)
      .patch(updateData);
    
    logger.info(`Completed Microsoft task ${storedTask.id}`);
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
    const storedTask = getRawMicrosoftTaskId(taskId);
    const syncConfig = await getSyncConfig(profileId);
    const targetType = storedTask.targetType || syncConfig.target_type;

    if (targetType === 'planner') {
      const etag = await getPlannerTaskEtag(client, storedTask.id);
      await client
        .api(`/planner/tasks/${storedTask.id}`)
        .header('If-Match', etag)
        .delete();
      logger.info(`Deleted Planner task ${storedTask.id}`);
      return true;
    }

    const taskListId = await getTaskListId(profileId);
    
    await client
      .api(`/me/todo/lists/${taskListId}/tasks/${storedTask.id}`)
      .delete();
    
    logger.info(`Deleted Microsoft task ${storedTask.id}`);
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
  const syncConfig = await getSyncConfig(profileId);

  if (syncConfig.target_type === 'planner') {
    if (!syncConfig.planner_plan_id) {
      throw new Error('Microsoft Planner plan is not configured. Select a plan in Settings.');
    }

    const tasks = await client
      .api(`/planner/plans/${syncConfig.planner_plan_id}/tasks`)
      .top(limit)
      .get();

    return tasks.value || [];
  }

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
  getGraphClient,
  isConnected,
  getSyncConfig,
  saveSyncConfig,
  isSyncEnabled,
  disconnect,
  listTaskLists,
  listPlannerPlans,
  listPlannerBuckets,
  getTaskListId,
  createTask,
  createTaskFromCommitment,
  updateTaskFromCommitment,
  updateTaskStatus,
  completeTask,
  deleteTask,
  listTasks
};
