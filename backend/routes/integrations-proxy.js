const express = require('express');
const router = express.Router();
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { createModuleLogger } = require('../utils/logger');

const logger = createModuleLogger('INTEGRATIONS-PROXY');

// Get integrations service URL from environment
const INTEGRATIONS_URL = process.env.INTEGRATIONS_URL || 'https://aicos-integrations:8006';

// Load CA certificate for validating microservice certificates
// Note: Certs are in /app/certs which is mounted from tls-certs volume
const CA_CERT_PATH = '/app/certs/ca.crt';
let httpsAgent = null;

// Try to load CA certificate if it exists
if (fs.existsSync(CA_CERT_PATH)) {
  try {
    const caCert = fs.readFileSync(CA_CERT_PATH);
    httpsAgent = new https.Agent({
      ca: caCert,
      rejectUnauthorized: false, // Accept self-signed certs even with CA
      checkServerIdentity: () => undefined // Skip hostname verification
    });
    logger.info('Loaded CA certificate for HTTPS communication with integrations service');
  } catch (error) {
    logger.warn('Failed to load CA certificate, using insecure HTTPS', { error: error.message });
    // Fallback to accepting self-signed certificates
    httpsAgent = new https.Agent({
      rejectUnauthorized: false,
      checkServerIdentity: () => undefined
    });
  }
} else {
  logger.warn('CA certificate not found at expected path, using insecure HTTPS', { path: CA_CERT_PATH });
  // Fallback to accepting self-signed certificates
  httpsAgent = new https.Agent({
    rejectUnauthorized: false,
    checkServerIdentity: () => undefined
  });
}

// Create axios instance for integrations service
const integrationsClient = axios.create({
  baseURL: INTEGRATIONS_URL,
  timeout: 30000, // 30 second timeout
  httpsAgent: httpsAgent,
  maxBodyLength: 10 * 1024 * 1024, // 10MB max body size
  maxContentLength: 10 * 1024 * 1024, // 10MB max content size
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add request logging
integrationsClient.interceptors.request.use(request => {
  logger.debug(`Proxying request to integrations service`, {
    method: request.method.toUpperCase(),
    url: request.url,
    baseURL: request.baseURL
  });
  return request;
});

// Add response logging and error handling
integrationsClient.interceptors.response.use(
  response => {
    logger.debug(`Received response from integrations service`, {
      status: response.status,
      url: response.config.url
    });
    return response;
  },
  error => {
    logger.error(`Error from integrations service`, {
      message: error.message,
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data
    });
    return Promise.reject(error);
  }
);

/**
 * Generic proxy handler - forwards requests to integrations service
 * Preserves method, body, query params, and headers
 */
async function proxyRequest(req, res, targetPath) {
  try {
    const response = await integrationsClient({
      method: req.method,
      url: targetPath,
      data: req.body,
      params: req.query,
      headers: {
        // Forward relevant headers
        'content-type': req.get('content-type') || 'application/json'
      }
    });
    
    res.status(response.status).json(response.data);
  } catch (error) {
    // Handle different error scenarios
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      logger.error('Cannot connect to integrations service', { 
        url: INTEGRATIONS_URL,
        error: error.message 
      });
      return res.status(503).json({
        error: 'Integrations service unavailable',
        message: 'The integrations service is currently unavailable. Please try again later.',
        service: INTEGRATIONS_URL
      });
    }
    
    // Handle TLS certificate errors
    if (error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || 
        error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
        error.message?.includes('certificate')) {
      logger.error('TLS certificate verification failed', { 
        url: targetPath,
        error: error.message,
        code: error.code
      });
      return res.status(500).json({
        error: 'Certificate verification failed',
        message: 'TLS certificate verification failed. Check that certificates are properly generated.',
        details: error.message
      });
    }
    
    if (error.response) {
      // Service responded with error
      return res.status(error.response.status).json(error.response.data);
    }
    
    // Generic error
    logger.error('Proxy request failed', { 
      error: error.message,
      code: error.code,
      url: targetPath 
    });
    res.status(500).json({
      error: 'Proxy error',
      message: error.message
    });
  }
}

// ============================================================================
// JIRA ROUTES
// ============================================================================

/**
 * Check Jira connection status
 */
router.get('/tasks/jira/status', async (req, res) => {
  await proxyRequest(req, res, '/tasks/jira/status');
});

/**
 * Get Jira configuration
 */
router.get('/tasks/jira/config', async (req, res) => {
  await proxyRequest(req, res, '/tasks/jira/config');
});

/**
 * Save Jira configuration
 */
router.post('/tasks/jira/config', async (req, res) => {
  await proxyRequest(req, res, '/tasks/jira/config');
});

/**
 * Test Jira connection
 */
router.post('/tasks/jira/test', async (req, res) => {
  await proxyRequest(req, res, '/tasks/jira/test');
});

/**
 * Get Jira projects
 */
router.get('/tasks/jira/projects', async (req, res) => {
  await proxyRequest(req, res, '/tasks/jira/projects');
});

/**
 * List Jira issues
 */
router.get('/tasks/jira/issues', async (req, res) => {
  await proxyRequest(req, res, '/tasks/jira/issues');
});

/**
 * Create Jira issue
 */
router.post('/tasks/jira/issues', async (req, res) => {
  await proxyRequest(req, res, '/tasks/jira/issues');
});

/**
 * Close Jira issue
 */
router.post('/tasks/jira/issues/:issueKey/close', async (req, res) => {
  await proxyRequest(req, res, `/tasks/jira/issues/${req.params.issueKey}/close`);
});

// ============================================================================
// MICROSOFT PLANNER ROUTES
// ============================================================================

/**
 * Get Microsoft auth URL
 */
router.get('/tasks/planner/auth-url', async (req, res) => {
  await proxyRequest(req, res, '/tasks/planner/auth-url');
});

/**
 * Microsoft OAuth callback
 */
router.get('/tasks/planner/callback', async (req, res) => {
  await proxyRequest(req, res, '/tasks/planner/callback');
});

/**
 * Check Microsoft Planner connection status
 */
router.get('/tasks/planner/status', async (req, res) => {
  await proxyRequest(req, res, '/tasks/planner/status');
});

/**
 * Disconnect Microsoft Planner
 */
router.post('/tasks/planner/disconnect', async (req, res) => {
  await proxyRequest(req, res, '/tasks/planner/disconnect');
});

/**
 * Get Microsoft Planner plans
 */
router.get('/tasks/planner/plans', async (req, res) => {
  await proxyRequest(req, res, '/tasks/planner/plans');
});

/**
 * Get Microsoft Planner buckets
 */
router.get('/tasks/planner/plans/:planId/buckets', async (req, res) => {
  await proxyRequest(req, res, `/tasks/planner/plans/${req.params.planId}/buckets`);
});

/**
 * List Microsoft Planner tasks
 */
router.get('/tasks/planner/tasks', async (req, res) => {
  await proxyRequest(req, res, '/tasks/planner/tasks');
});

/**
 * Create Microsoft Planner task
 */
router.post('/tasks/planner/tasks', async (req, res) => {
  await proxyRequest(req, res, '/tasks/planner/tasks');
});

/**
 * Complete Microsoft Planner task
 */
router.post('/tasks/planner/tasks/:taskId/complete', async (req, res) => {
  await proxyRequest(req, res, `/tasks/planner/tasks/${req.params.taskId}/complete`);
});

// ============================================================================
// TRELLO ROUTES
// ============================================================================

/**
 * Check Trello connection status
 */
router.get('/tasks/trello/status', async (req, res) => {
  await proxyRequest(req, res, '/tasks/trello/status');
});

/**
 * Get Trello configuration
 */
router.get('/tasks/trello/config', async (req, res) => {
  await proxyRequest(req, res, '/tasks/trello/config');
});

/**
 * Save Trello configuration
 */
router.post('/tasks/trello/config', async (req, res) => {
  await proxyRequest(req, res, '/tasks/trello/config');
});

/**
 * Test Trello connection
 */
router.post('/tasks/trello/test', async (req, res) => {
  await proxyRequest(req, res, '/tasks/trello/test');
});

/**
 * Get Trello boards
 */
router.get('/tasks/trello/boards', async (req, res) => {
  await proxyRequest(req, res, '/tasks/trello/boards');
});

/**
 * Get Trello lists for a board
 */
router.get('/tasks/trello/boards/:boardId/lists', async (req, res) => {
  await proxyRequest(req, res, `/tasks/trello/boards/${req.params.boardId}/lists`);
});

/**
 * Search Trello cards
 */
router.get('/tasks/trello/cards', async (req, res) => {
  await proxyRequest(req, res, '/tasks/trello/cards');
});

/**
 * Create Trello card
 */
router.post('/tasks/trello/cards', async (req, res) => {
  await proxyRequest(req, res, '/tasks/trello/cards');
});

/**
 * Archive Trello card
 */
router.post('/tasks/trello/cards/:cardId/archive', async (req, res) => {
  await proxyRequest(req, res, `/tasks/trello/cards/${req.params.cardId}/archive`);
});

// ============================================================================
// MONDAY.COM ROUTES
// ============================================================================

/**
 * Check Monday.com connection status
 */
router.get('/tasks/monday/status', async (req, res) => {
  await proxyRequest(req, res, '/tasks/monday/status');
});

/**
 * Get Monday.com configuration
 */
router.get('/tasks/monday/config', async (req, res) => {
  await proxyRequest(req, res, '/tasks/monday/config');
});

/**
 * Save Monday.com configuration
 */
router.post('/tasks/monday/config', async (req, res) => {
  await proxyRequest(req, res, '/tasks/monday/config');
});

/**
 * Test Monday.com connection
 */
router.post('/tasks/monday/test', async (req, res) => {
  await proxyRequest(req, res, '/tasks/monday/test');
});

/**
 * Get Monday.com boards
 */
router.get('/tasks/monday/boards', async (req, res) => {
  await proxyRequest(req, res, '/tasks/monday/boards');
});

/**
 * Get Monday.com groups for a board
 */
router.get('/tasks/monday/boards/:boardId/groups', async (req, res) => {
  await proxyRequest(req, res, `/tasks/monday/boards/${req.params.boardId}/groups`);
});

/**
 * Get Monday.com columns for a board
 */
router.get('/tasks/monday/boards/:boardId/columns', async (req, res) => {
  await proxyRequest(req, res, `/tasks/monday/boards/${req.params.boardId}/columns`);
});

/**
 * Search Monday.com items
 */
router.get('/tasks/monday/items', async (req, res) => {
  await proxyRequest(req, res, '/tasks/monday/items');
});

/**
 * Create Monday.com item
 */
router.post('/tasks/monday/items', async (req, res) => {
  await proxyRequest(req, res, '/tasks/monday/items');
});

/**
 * Archive Monday.com item
 */
router.post('/tasks/monday/items/:itemId/archive', async (req, res) => {
  await proxyRequest(req, res, `/tasks/monday/items/${req.params.itemId}/archive`);
});

// ============================================================================
// GOOGLE CALENDAR ROUTES
// ============================================================================

/**
 * Get Google Calendar auth URL
 */
router.get('/calendar/google/auth-url', async (req, res) => {
  await proxyRequest(req, res, '/calendar/google/auth-url');
});

/**
 * Google OAuth callback
 */
router.get('/calendar/google/callback', async (req, res) => {
  await proxyRequest(req, res, '/calendar/google/callback');
});

/**
 * Check Google Calendar connection status
 */
router.get('/calendar/google/status', async (req, res) => {
  await proxyRequest(req, res, '/calendar/google/status');
});

/**
 * Disconnect Google Calendar
 */
router.post('/calendar/google/disconnect', async (req, res) => {
  await proxyRequest(req, res, '/calendar/google/disconnect');
});

/**
 * List Google Calendar events
 */
router.get('/calendar/google/events', async (req, res) => {
  await proxyRequest(req, res, '/calendar/google/events');
});

/**
 * Create Google Calendar event
 */
router.post('/calendar/google/events', async (req, res) => {
  await proxyRequest(req, res, '/calendar/google/events');
});

/**
 * Update Google Calendar event
 */
router.put('/calendar/google/events/:eventId', async (req, res) => {
  await proxyRequest(req, res, `/calendar/google/events/${req.params.eventId}`);
});

/**
 * Delete Google Calendar event
 */
router.delete('/calendar/google/events/:eventId', async (req, res) => {
  await proxyRequest(req, res, `/calendar/google/events/${req.params.eventId}`);
});

// ============================================================================
// MICROSOFT CALENDAR ROUTES
// ============================================================================

/**
 * Get Microsoft Calendar auth URL
 */
router.get('/calendar/microsoft/auth-url', async (req, res) => {
  await proxyRequest(req, res, '/calendar/microsoft/auth-url');
});

/**
 * Microsoft OAuth callback
 */
router.get('/calendar/microsoft/callback', async (req, res) => {
  await proxyRequest(req, res, '/calendar/microsoft/callback');
});

/**
 * Check Microsoft Calendar connection status
 */
router.get('/calendar/microsoft/status', async (req, res) => {
  await proxyRequest(req, res, '/calendar/microsoft/status');
});

/**
 * Disconnect Microsoft Calendar
 */
router.post('/calendar/microsoft/disconnect', async (req, res) => {
  await proxyRequest(req, res, '/calendar/microsoft/disconnect');
});

/**
 * List Microsoft Calendar events
 */
router.get('/calendar/microsoft/events', async (req, res) => {
  await proxyRequest(req, res, '/calendar/microsoft/events');
});

/**
 * Create Microsoft Calendar event
 */
router.post('/calendar/microsoft/events', async (req, res) => {
  await proxyRequest(req, res, '/calendar/microsoft/events');
});

/**
 * Update Microsoft Calendar event
 */
router.put('/calendar/microsoft/events/:eventId', async (req, res) => {
  await proxyRequest(req, res, `/calendar/microsoft/events/${req.params.eventId}`);
});

/**
 * Delete Microsoft Calendar event
 */
router.delete('/calendar/microsoft/events/:eventId', async (req, res) => {
  await proxyRequest(req, res, `/calendar/microsoft/events/${req.params.eventId}`);
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Check integrations service health
 */
router.get('/health', async (req, res) => {
  try {
    const response = await integrationsClient.get('/health');
    res.json({
      ...response.data,
      proxyStatus: 'ok',
      integrationsUrl: INTEGRATIONS_URL
    });
  } catch (error) {
    logger.error('Integrations service health check failed', { error: error.message });
    res.status(503).json({
      status: 'error',
      message: 'Integrations service is unavailable',
      error: error.message,
      integrationsUrl: INTEGRATIONS_URL
    });
  }
});

module.exports = router;
