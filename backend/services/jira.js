const { getDb } = require('../database/db');
const { createModuleLogger } = require('../utils/logger');

const logger = createModuleLogger('JIRA');

/**
 * Get Jira configuration from database
 */
async function getJiraConfig() {
  const db = getDb();
  
  const baseUrlRow = await db.get('SELECT value FROM config WHERE key = ?', ['jiraBaseUrl']);
  const emailRow = await db.get('SELECT value FROM config WHERE key = ?', ['jiraEmail']);
  const apiTokenRow = await db.get('SELECT value FROM config WHERE key = ?', ['jiraApiToken']);
  const projectKeyRow = await db.get('SELECT value FROM config WHERE key = ?', ['jiraProjectKey']);
  
  const missing = [];
  if (!baseUrlRow || !baseUrlRow.value) missing.push('Base URL');
  if (!emailRow || !emailRow.value) missing.push('Email');
  if (!apiTokenRow || !apiTokenRow.value) missing.push('API Token');
  if (!projectKeyRow || !projectKeyRow.value) missing.push('Project Key');
  
  if (missing.length > 0) {
    const error = new Error(`Jira credentials not configured. Missing: ${missing.join(', ')}. Please configure in the Configuration page.`);
    error.code = 'NOT_CONFIGURED';
    throw error;
  }
  
  return {
    baseUrl: baseUrlRow.value.replace(/\/$/, ''), // Remove trailing slash
    email: emailRow.value,
    apiToken: apiTokenRow.value,
    projectKey: projectKeyRow.value
  };
}

/**
 * Make authenticated request to Jira API
 */
async function jiraRequest(endpoint, method = 'GET', body = null) {
  const { baseUrl, email, apiToken } = await getJiraConfig();
  
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
    logger.error(`Jira API error: ${response.status} - ${errorText}`);
    throw new Error(`Jira API error: ${response.status} - ${errorText.substring(0, 200)}`);
  }
  
  if (response.status === 204) {
    return null; // No content
  }
  
  return await response.json();
}

/**
 * Check if Jira is configured and accessible
 */
async function isConnected() {
  try {
    const config = await getJiraConfig();
    // Test connection by getting current user
    await jiraRequest('/myself');
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
 * Disconnect Jira (clear credentials)
 */
async function disconnect() {
  const db = getDb();
  await db.run('DELETE FROM config WHERE key IN (?, ?, ?, ?)', 
    ['jiraBaseUrl', 'jiraEmail', 'jiraApiToken', 'jiraProjectKey']);
  logger.info('Jira disconnected');
}

/**
 * Get project information
 */
async function getProject(projectKey) {
  return await jiraRequest(`/project/${projectKey}`);
}

/**
 * List available projects
 */
async function listProjects() {
  const projects = await jiraRequest('/project');
  return projects || [];
}

/**
 * Get issue types for a project
 */
async function getIssueTypes(projectKey) {
  const project = await getProject(projectKey);
  return project.issueTypes || [];
}

/**
 * Create a Jira issue (story/task)
 */
async function createIssue(issueData) {
  const { projectKey } = await getJiraConfig();
  
  const {
    summary,
    description,
    issueType = 'Task', // Task, Story, Bug, etc.
    assignee = null,
    dueDate = null,
    priority = 'Medium'
  } = issueData;
  
  // Get project to find issue type ID
  const project = await getProject(projectKey);
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
      const users = await jiraRequest(`/user/search?query=${encodeURIComponent(assignee)}`);
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
  
  const createdIssue = await jiraRequest('/issue', 'POST', issue);
  
  logger.info(`Jira issue created: ${createdIssue.key} (${createdIssue.id})`);
  return createdIssue;
}

/**
 * Create issue from commitment
 */
async function createIssueFromCommitment(commitment) {
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
    
    return await createIssue(issueData);
  } catch (error) {
    logger.error('Error creating Jira issue from commitment', error);
    throw error;
  }
}

/**
 * Get issue by key
 */
async function getIssue(issueKey) {
  return await jiraRequest(`/issue/${issueKey}`);
}

/**
 * List issues in project
 */
async function listIssues(projectKey = null, limit = 50) {
  const { projectKey: configProjectKey } = await getJiraConfig();
  const searchProjectKey = projectKey || configProjectKey;
  
  // JQL (Jira Query Language) query
  const jql = `project = ${searchProjectKey} ORDER BY created DESC`;
  const issues = await jiraRequest(`/search?jql=${encodeURIComponent(jql)}&maxResults=${limit}`);
  
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
  getIssue,
  listIssues
};

