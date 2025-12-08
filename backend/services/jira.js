const { getDb } = require('../database/db');
const { createModuleLogger } = require('../utils/logger');

const logger = createModuleLogger('JIRA');

/**
 * Get Jira configuration from database
 * @param {number} profileId - Profile ID to get config for
 */
async function getJiraConfig(profileId = 2) {
  const db = getDb();
  
  const configRow = await db.get(
    'SELECT token_data FROM profile_integrations WHERE profile_id = ? AND integration_type = ? AND integration_name = ?',
    [profileId, 'task', 'jira']
  );
  
  if (!configRow || !configRow.token_data) {
    const error = new Error('Jira credentials not configured. Please configure in the Configuration page.');
    error.code = 'NOT_CONFIGURED';
    throw error;
  }
  
  let config;
  try {
    config = JSON.parse(configRow.token_data);
  } catch (err) {
    const error = new Error('Invalid Jira configuration. Please reconfigure in the Configuration page.');
    error.code = 'NOT_CONFIGURED';
    throw error;
  }
  
  const missing = [];
  if (!config.baseUrl) missing.push('Base URL');
  if (!config.email) missing.push('Email');
  if (!config.apiToken) missing.push('API Token');
  if (!config.projectKey) missing.push('Project Key');
  
  if (missing.length > 0) {
    const error = new Error(`Jira credentials incomplete. Missing: ${missing.join(', ')}. Please configure in the Configuration page.`);
    error.code = 'NOT_CONFIGURED';
    throw error;
  }
  
  return {
    baseUrl: config.baseUrl.replace(/\/$/, ''), // Remove trailing slash
    email: config.email,
    apiToken: config.apiToken,
    projectKey: config.projectKey
  };
}

/**
 * Make authenticated request to Jira API
 * @param {string} endpoint - API endpoint
 * @param {string} method - HTTP method
 * @param {object} body - Request body
 * @param {number} profileId - Profile ID to use
 */
async function jiraRequest(endpoint, method = 'GET', body = null, profileId = 2) {
  const { baseUrl, email, apiToken } = await getJiraConfig(profileId);
  
  // Create Basic Auth header (email:apiToken base64 encoded)
  const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
  
  const url = `${baseUrl}/rest/api/3${endpoint}`;
  
  const options = {
    method,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  logger.info(`Jira API ${method} ${endpoint}`);
  
  const response = await fetch(url, options);
  
  if (!response.ok) {
    const errorText = await response.text();
    // Check if this is an assignment error (400 with "cannot be assigned") - these are expected
    const isAssignmentError = response.status === 400 && 
      (errorText.includes('cannot be assigned') || endpoint.includes('/assignee'));
    
    if (isAssignmentError) {
      // Assignment errors are expected - log as info, not error
      logger.info(`Jira API ${method} ${endpoint} - Assignment not possible (this is expected)`);
    } else {
      logger.error(`Jira API error: ${response.status} - ${errorText}`);
    }
    throw new Error(`Jira API error: ${response.status} - ${errorText.substring(0, 200)}`);
  }
  
  if (response.status === 204) {
    return null; // No content
  }
  
  return await response.json();
}

/**
 * Check if Jira is configured and accessible
 * @param {number} profileId - Profile ID to check
 */
async function isConnected(profileId = 2) {
  try {
    const config = await getJiraConfig(profileId);
    // Test connection by getting current user
    await jiraRequest('/myself', 'GET', null, profileId);
    return true;
  } catch (error) {
    // If credentials aren't configured, that's fine - just return false silently
    if (error.code === 'NOT_CONFIGURED' || (error.message && error.message.includes('not configured'))) {
      return false;
    }
    // For other errors, log a warning but still return false
    logger.warn('Jira connection check failed', error.message);
    return false;
  }
}

/**
 * Disconnect Jira for a profile
 * @param {number} profileId - Profile ID to disconnect
 */
async function disconnect(profileId = 2) {
  const db = getDb();
  await db.run(
    'DELETE FROM profile_integrations WHERE profile_id = ? AND integration_type = ? AND integration_name = ?',
    [profileId, 'task', 'jira']
  );
  logger.info(`Jira disconnected for profile ${profileId}`);
}

/**
 * Get project information
 * @param {string} projectKey - Jira project key
 * @param {number} profileId - Profile ID to use
 */
async function getProject(projectKey, profileId = 2) {
  return await jiraRequest(`/project/${projectKey}`, 'GET', null, profileId);
}

/**
 * List available projects
 * @param {number} profileId - Profile ID to use
 */
async function listProjects(profileId = 2) {
  const projects = await jiraRequest('/project', 'GET', null, profileId);
  return projects || [];
}

/**
 * Get issue types for a project
 * @param {string} projectKey - Jira project key
 * @param {number} profileId - Profile ID to use
 */
async function getIssueTypes(projectKey, profileId = 2) {
  const project = await getProject(projectKey, profileId);
  return project.issueTypes || [];
}

/**
 * Create a Jira issue (story/task)
 * @param {object} issueData - Issue data
 * @param {number} profileId - Profile ID to use
 */
async function createIssue(issueData, profileId = 2) {
  const { projectKey } = await getJiraConfig(profileId);
  
  const {
    summary,
    description,
    issueType = 'Task', // Task, Story, Bug, etc.
    assignee = null,
    dueDate = null,
    priority = 'Medium'
  } = issueData;
  
  // Get project to find issue type ID
  const project = await getProject(projectKey, profileId);
  let issueTypeObj = project.issueTypes.find(type => 
    type.name === issueType || type.name.toLowerCase() === issueType.toLowerCase()
  );
  
  if (!issueTypeObj) {
    // Fallback to first available issue type
    const firstType = project.issueTypes && project.issueTypes.length > 0 ? project.issueTypes[0] : null;
    if (firstType) {
      logger.warn(`Issue type "${issueType}" not found, using "${firstType.name}"`);
      issueTypeObj = firstType;
    } else {
      throw new Error('No issue types available in project. Please configure issue types in Jira.');
    }
  }
  
  // Map priority names to Jira priority IDs
  // Common priorities: Highest (1), High (2), Medium (3), Low (4), Lowest (5)
  const priorityMap = {
    'Highest': '1',
    'High': '2',
    'Medium': '3',
    'Low': '4',
    'Lowest': '5'
  };
  
  const priorityId = priorityMap[priority] || '3'; // Default to Medium
  
  // Build issue payload
  const issue = {
    fields: {
      project: {
        key: projectKey
      },
      summary: summary,
      issuetype: {
        id: issueTypeObj.id
      },
      priority: {
        id: priorityId
      }
    }
  };
  
  // Add description if provided
  if (description) {
    // Jira uses ADF (Atlassian Document Format) for rich text
    // For simplicity, we'll use plain text in description field
    issue.fields.description = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: description
            }
          ]
        }
      ]
    };
  }
  
  // Add assignee if provided
  if (assignee) {
    // Try to find user by email or accountId
    try {
      const users = await jiraRequest(`/user/search?query=${encodeURIComponent(assignee)}`, 'GET', null, profileId);
      if (users && users.length > 0) {
        issue.fields.assignee = {
          accountId: users[0].accountId
        };
      }
    } catch (error) {
      logger.warn(`Could not assign to ${assignee}:`, error.message);
    }
  }
  
  // Add due date if provided
  if (dueDate) {
    // Jira expects date in format: YYYY-MM-DD
    const date = new Date(dueDate);
    issue.fields.duedate = date.toISOString().split('T')[0];
  }
  
  logger.info(`Creating Jira issue: ${summary} in project ${projectKey}`);
  
  // Try to create issue with assignee first
  let createdIssue;
  try {
    createdIssue = await jiraRequest('/issue', 'POST', issue, profileId);
  } catch (error) {
    // If creation fails due to assignee issue, retry without assignee
    if (error.message && error.message.includes('assignee') && issue.fields.assignee) {
      logger.warn(`Issue creation failed due to assignee, retrying without assignee: ${error.message}`);
      delete issue.fields.assignee;
      createdIssue = await jiraRequest('/issue', 'POST', issue, profileId);
      
      // Try to assign after creation (this can fail silently - expected behavior)
      if (assignee && createdIssue && createdIssue.key) {
        try {
          const users = await jiraRequest(`/user/search?query=${encodeURIComponent(assignee)}`, 'GET', null, profileId);
          if (users && users.length > 0) {
            // Use a wrapper to catch assignment errors without logging them as errors
            try {
              await jiraRequest(`/issue/${createdIssue.key}/assignee`, 'PUT', {
                accountId: users[0].accountId
              }, profileId);
              logger.info(`Assigned issue ${createdIssue.key} to ${assignee}`);
            } catch (assignError) {
              // Assignment failures are expected (permissions, project settings) - don't log as error
              // Check if it's a "cannot be assigned" error specifically
              const errorMsg = assignError.message || '';
              if (errorMsg.includes('cannot be assigned') || errorMsg.includes('400')) {
                // This is expected - user doesn't have permission or project settings prevent assignment
                logger.info(`Issue ${createdIssue.key} created successfully (assignment skipped: user cannot be assigned issues)`);
              } else {
                // Other assignment errors - log as warning, not error
                logger.warn(`Could not assign issue ${createdIssue.key} to ${assignee}: ${errorMsg}`);
              }
            }
          }
        } catch (assignError) {
          // User search or other assignment-related errors - log as warning, not error
          logger.warn(`Could not assign issue ${createdIssue.key} to ${assignee}: ${assignError.message}`);
        }
      }
    } else {
      throw error;
    }
  }
  
  logger.info(`Jira issue created: ${createdIssue.key} (${createdIssue.id})`);
  return createdIssue;
}

/**
 * Transition a Jira issue to Done/Closed status
 * @param {string} issueKey - Jira issue key
 * @param {string} completionNote - Optional completion note
 * @param {number} profileId - Profile ID to use
 */
async function closeIssue(issueKey, completionNote = null, profileId = 2) {
  try {
    // Add completion note as comment if provided
    if (completionNote) {
      try {
        await jiraRequest(`/issue/${issueKey}/comment`, 'POST', {
          body: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: `✅ Completion Note: ${completionNote}`
                  }
                ]
              }
            ]
          }
        }, profileId);
        logger.info(`Added completion note to Jira issue ${issueKey}`);
      } catch (commentError) {
        logger.warn(`Failed to add comment to Jira issue ${issueKey}: ${commentError.message}`);
        // Continue with closing even if comment fails
      }
    }
    
    // First, get available transitions for this issue
    const transitions = await jiraRequest(`/issue/${issueKey}/transitions`, 'GET', null, profileId);
    
    // Find the "Done" or "Closed" transition
    // Common transition names: "Done", "Close", "Resolve", "Closed"
    const doneTransition = transitions.transitions.find(t => 
      t.name.toLowerCase() === 'done' || 
      t.name.toLowerCase() === 'close' || 
      t.name.toLowerCase() === 'closed' ||
      t.name.toLowerCase() === 'resolve' ||
      t.to?.name?.toLowerCase() === 'done' ||
      t.to?.name?.toLowerCase() === 'closed'
    );
    
    if (!doneTransition) {
      logger.warn(`No "Done" transition found for issue ${issueKey}. Available transitions: ${transitions.transitions.map(t => t.name).join(', ')}`);
      return false;
    }
    
    // Transition the issue
    await jiraRequest(`/issue/${issueKey}/transitions`, 'POST', {
      transition: {
        id: doneTransition.id
      }
    }, profileId);
    
    logger.info(`Transitioned Jira issue ${issueKey} to Done`);
    return true;
  } catch (error) {
    logger.warn(`Failed to close Jira issue ${issueKey}: ${error.message}`);
    return false;
  }
}

/**
 * Delete a Jira issue permanently
 * @param {string} issueKey - Jira issue key
 * @param {number} profileId - Profile ID to use
 */
async function deleteIssue(issueKey, profileId = 2) {
  try {
    await jiraRequest(`/issue/${issueKey}`, 'DELETE', null, profileId);
    logger.info(`Deleted Jira issue ${issueKey}`);
    return true;
  } catch (error) {
    logger.warn(`Failed to delete Jira issue ${issueKey}: ${error.message}`);
    return false;
  }
}

/**
 * Create issue from commitment
 * @param {object} commitment - Commitment/task data
 * @param {number} profileId - Profile ID to use
 */
async function createIssueFromCommitment(commitment, profileId = 2) {
  try {
    // Map urgency to priority
    const urgencyMap = {
      'high': 'High',
      'medium': 'Medium',
      'low': 'Low'
    };
    
    // Determine issue type based on task type
    const typeMap = {
      'commitment': 'Story',
      'action': 'Task',
      'follow-up': 'Task',
      'risk': 'Bug'
    };
    
    const issueData = {
      summary: commitment.description,
      description: commitment.suggested_approach || commitment.description,
      issueType: typeMap[commitment.task_type] || 'Task',
      assignee: commitment.assignee || null,
      dueDate: commitment.deadline || null,
      priority: urgencyMap[commitment.urgency] || 'Medium'
    };
    
    return await createIssue(issueData, profileId);
  } catch (error) {
    logger.error('Error creating Jira issue from commitment', error);
    throw error;
  }
}

/**
 * Get issue by key
 * @param {string} issueKey - Jira issue key
 * @param {number} profileId - Profile ID to use
 */
async function getIssue(issueKey, profileId = 2) {
  return await jiraRequest(`/issue/${issueKey}`, 'GET', null, profileId);
}

/**
 * List issues in project
 * @param {string} projectKey - Jira project key (optional)
 * @param {number} limit - Maximum number of issues
 * @param {number} profileId - Profile ID to use
 */
async function listIssues(projectKey = null, limit = 50, profileId = 2) {
  const { projectKey: configProjectKey } = await getJiraConfig(profileId);
  const searchProjectKey = projectKey || configProjectKey;
  
  // JQL (Jira Query Language) query
  const jql = `project = ${searchProjectKey} ORDER BY created DESC`;
  const issues = await jiraRequest(`/search?jql=${encodeURIComponent(jql)}&maxResults=${limit}`, 'GET', null, profileId);
  
  return issues.issues || [];
}

module.exports = {
  isConnected,
  disconnect,
  getProject,
  listProjects,
  getIssueTypes,
  createIssue,
  createIssueFromCommitment,
  closeIssue,
  deleteIssue,
  getIssue,
  listIssues
};

