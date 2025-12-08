/**
 * Task Intelligence API Routes
 * 
 * Proxy endpoints for microservices-based AI task analysis.
 * All requests are forwarded to specialized microservices running on internal Docker network.
 * 
 * Microservices:
 * - ai-intelligence (port 8001): Effort estimation, energy classification, task clustering
 * - pattern-recognition (port 8002): Behavioral insights, pattern analysis
 * - nl-parser (port 8003): Natural language task parsing
 * - voice-processor (port 8004): Audio transcription
 * - context-service (port 8005): Fast context retrieval
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { createModuleLogger } = require('../utils/logger');

const logger = createModuleLogger('INTELLIGENCE-API');

// Microservice URLs (internal Docker network)
const AI_INTELLIGENCE_URL = process.env.AI_INTELLIGENCE_URL || 'https://aicos-ai-intelligence:8001';
const PATTERN_RECOGNITION_URL = process.env.PATTERN_RECOGNITION_URL || 'https://aicos-pattern-recognition:8002';
const NL_PARSER_URL = process.env.NL_PARSER_URL || 'https://aicos-nl-parser:8003';
const VOICE_PROCESSOR_URL = process.env.VOICE_PROCESSOR_URL || 'https://aicos-voice-processor:8004';
const CONTEXT_SERVICE_URL = process.env.CONTEXT_SERVICE_URL || 'https://aicos-context-service:8005';

// Timeout for microservice calls
const MICROSERVICE_TIMEOUT = 30000;

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
    logger.info('Loaded CA certificate for HTTPS communication with microservices');
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

/**
 * Helper function to call microservices with error handling
 */
async function callMicroservice(serviceUrl, endpoint, method = 'POST', data = null, params = null) {
  try {
    const config = {
      method,
      url: `${serviceUrl}${endpoint}`,
      timeout: MICROSERVICE_TIMEOUT,
      httpsAgent: httpsAgent,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (data) config.data = data;
    if (params) config.params = params;

    const response = await axios(config);
    return response.data;
  } catch (error) {
    // Log error but provide graceful fallback
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      logger.warn(`Microservice ${serviceUrl} unavailable: ${error.message}`);
      throw new Error(`Microservice unavailable - please try again later`);
    } else if (error.response) {
      logger.error(`Microservice error (${error.response.status}):`, error.response.data);
      throw new Error(error.response.data.detail || error.response.data.error || 'Microservice error');
    } else {
      logger.error('Microservice call failed:', error.message);
      throw error;
    }
  }
}

/**
 * POST /api/intelligence/estimate-effort
 * Get AI effort estimation for a task (proxies to ai-intelligence service)
 */
router.post('/estimate-effort', async (req, res) => {
  try {
    const { description, context } = req.body;

    if (!description) {
      return res.status(400).json({ error: 'Task description is required' });
    }

    logger.info(`Estimating effort for: "${description.substring(0, 50)}..."`);

    try {
      const result = await callMicroservice(
        AI_INTELLIGENCE_URL,
        '/estimate-effort',
        'POST',
        { description, context: context || '' }
      );
      return res.json(result);
    } catch (microserviceErr) {
      logger.warn(`AI Intelligence microservice unavailable (${AI_INTELLIGENCE_URL}): ${microserviceErr.message}`);
      logger.info('Falling back to local implementation');
      const { estimateEffort } = require('./intelligence-local');
      const result = await estimateEffort(description, context, req.profileId);
      return res.json(result);
    }

  } catch (err) {
    logger.error('Error estimating effort:', err);
    res.status(500).json({ 
      error: 'Failed to estimate effort',
      message: err.message 
    });
  }
});

/**
 * POST /api/intelligence/classify-energy
 * Classify task by energy level required (proxies to ai-intelligence service)
 */
router.post('/classify-energy', async (req, res) => {
  try {
    const { description } = req.body;

    if (!description) {
      return res.status(400).json({ error: 'Task description is required' });
    }

    logger.info(`Classifying energy level for: "${description.substring(0, 50)}..."`);

    try {
      const result = await callMicroservice(
        AI_INTELLIGENCE_URL,
        '/classify-energy',
        'POST',
        { description }
      );
      return res.json(result);
    } catch (microserviceErr) {
      logger.warn(`AI Intelligence microservice unavailable (${AI_INTELLIGENCE_URL}): ${microserviceErr.message}`);
      logger.info('Falling back to local implementation');
      const { classifyEnergy } = require('./intelligence-local');
      const result = await classifyEnergy(description, req.profileId);
      return res.json(result);
    }

  } catch (err) {
    logger.error('Error classifying energy:', err);
    res.status(500).json({ 
      error: 'Failed to classify energy level',
      message: err.message 
    });
  }
});

/**
 * POST /api/intelligence/cluster-tasks
 * Cluster related tasks together (proxies to ai-intelligence service)
 */
router.post('/cluster-tasks', async (req, res) => {
  try {
    const { tasks } = req.body;

    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ error: 'Tasks array is required' });
    }

    logger.info(`Clustering ${tasks.length} tasks`);

    try {
      const result = await callMicroservice(
        AI_INTELLIGENCE_URL,
        '/cluster-tasks',
        'POST',
        { tasks }
      );
      return res.json(result);
    } catch (microserviceErr) {
      logger.warn(`AI Intelligence microservice unavailable (${AI_INTELLIGENCE_URL}): ${microserviceErr.message}`);
      logger.info('Falling back to local implementation');
      const { clusterTasks } = require('./intelligence-local');
      const result = await clusterTasks(tasks, req.profileId);
      return res.json(result);
    }

  } catch (err) {
    logger.error('Error clustering tasks:', err);
    res.status(500).json({ 
      error: 'Failed to cluster tasks',
      message: err.message 
    });
  }
});

/**
 * POST /api/intelligence/parse-task
 * Parse natural language task input (proxies to nl-parser service)
 */
router.post('/parse-task', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Task text is required' });
    }

    logger.info(`Parsing task: "${text.substring(0, 50)}..."`);

    try {
      const result = await callMicroservice(
        NL_PARSER_URL,
        '/parse',
        'POST',
        { text }
      );
      return res.json(result);
    } catch (microserviceErr) {
      logger.warn(`NL Parser microservice unavailable (${NL_PARSER_URL}): ${microserviceErr.message}`);
      logger.info('Falling back to local implementation');
      const { parseTask } = require('./intelligence-local');
      const result = await parseTask(text, req.profileId);
      return res.json(result);
    }

  } catch (err) {
    logger.error('Error parsing task:', err);
    res.status(500).json({ 
      error: 'Failed to parse task',
      message: err.message 
    });
  }
});

/**
 * POST /api/intelligence/analyze-patterns
 * Analyze user behavioral patterns (proxies to pattern-recognition service or uses local implementation)
 */
router.post('/analyze-patterns', async (req, res) => {
  try {
    const { user_id, time_range } = req.body;

    logger.info(`Analyzing patterns for user ${user_id || 'default'}`);

    // Try microservice first (has direct database access)
    try {
      const response = await axios.post(
        `${PATTERN_RECOGNITION_URL}/analyze-patterns`,
        { time_range },
        { timeout: 30000 }
      );
      logger.info('Pattern analysis completed by microservice');
      return res.json(response.data);
    } catch (microserviceErr) {
      logger.warn(`Pattern Recognition microservice unavailable (${PATTERN_RECOGNITION_URL}): ${microserviceErr.message} - using local implementation`);
      
      // Fall back to local implementation
      const { analyzeTaskPatterns } = require('./intelligence-local');
      const result = await analyzeTaskPatterns(req, time_range);
      return res.json(result);
    }

  } catch (err) {
    logger.error('Error analyzing patterns:', err);
    res.status(500).json({ 
      error: 'Failed to analyze patterns',
      message: err.message 
    });
  }
});

/**
 * GET /api/intelligence/insights
 * Get personalized insights (proxies to pattern-recognition service)
 */
router.get('/insights', async (req, res) => {
  try {
    const { user_id } = req.query;

    logger.info(`Getting insights for user ${user_id || 'default'}`);

    try {
      const result = await callMicroservice(
        PATTERN_RECOGNITION_URL,
        '/insights',
        'GET',
        null,
        { user_id }
      );
      return res.json(result);
    } catch (microserviceErr) {
      logger.warn(`Pattern Recognition microservice unavailable (${PATTERN_RECOGNITION_URL}): ${microserviceErr.message}`);
      logger.info('Falling back to local implementation');
      // Use analyze patterns as fallback for insights
      const { analyzeTaskPatterns } = require('./intelligence-local');
      const result = await analyzeTaskPatterns(req, '30d');
      return res.json(result);
    }

  } catch (err) {
    logger.error('Error getting insights:', err);
    res.status(500).json({ 
      error: 'Failed to get insights',
      message: err.message 
    });
  }
});



/**
 * POST /api/intelligence/extract-dates
 * Extract deadline and date information from text (proxies to nl-parser service)
 */
router.post('/extract-dates', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    logger.info(`Extracting dates from: "${text.substring(0, 50)}..."`);

    try {
      const result = await callMicroservice(
        NL_PARSER_URL,
        '/extract-dates',
        'POST',
        { text }
      );
      return res.json(result);
    } catch (microserviceErr) {
      logger.warn(`NL Parser microservice unavailable (${NL_PARSER_URL}): ${microserviceErr.message}`);
      logger.info('Falling back to local implementation');
      const { extractDates } = require('./intelligence-local');
      const result = await extractDates(text, req.profileId);
      return res.json(result);
    }

  } catch (err) {
    logger.error('Error extracting dates:', err);
    res.status(500).json({ 
      error: 'Failed to extract dates',
      message: err.message 
    });
  }
});

/**
 * POST /api/intelligence/predict-completion
 * Predict task completion time based on patterns (proxies to pattern-recognition service)
 */
router.post('/predict-completion', async (req, res) => {
  try {
    const { task_description, user_id } = req.body;

    if (!task_description) {
      return res.status(400).json({ error: 'Task description is required' });
    }

    logger.info(`Predicting completion for: "${task_description.substring(0, 50)}..."`);

    try {
      const result = await callMicroservice(
        PATTERN_RECOGNITION_URL,
        '/predict-completion',
        'POST',
        { task_description, user_id }
      );
      return res.json(result);
    } catch (microserviceErr) {
      logger.warn(`Pattern Recognition microservice unavailable (${PATTERN_RECOGNITION_URL}): ${microserviceErr.message}`);
      logger.info('Falling back to local effort estimation');
      // Use effort estimation as fallback
      const { estimateEffort } = require('./intelligence-local');
      const result = await estimateEffort(task_description, '', req.profileId);
      return res.json(result);
    }

  } catch (err) {
    logger.error('Error predicting completion:', err);
    res.status(500).json({ 
      error: 'Failed to predict completion',
      message: err.message 
    });
  }
});

/**
 * POST /api/intelligence/transcribe
 * Transcribe audio file to text (proxies to voice-processor service)
 */
router.post('/transcribe', (req, res) => {
  const upload = req.app.get('upload');
  
  upload.single('file')(req, res, async (err) => {
    if (err) {
      logger.error('File upload error:', err);
      return res.status(400).json({ error: 'File upload failed', message: err.message });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Audio file is required' });
      }

      const { language, temperature } = req.body;

      logger.info(`Transcribing audio: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(2)}MB)`);

      // Create form data for microservice
      const formData = new FormData();
      formData.append('file', req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype
      });
      if (language) formData.append('language', language);
      if (temperature) formData.append('temperature', temperature);

      try {
        const result = await axios.post(
          `${VOICE_PROCESSOR_URL}/transcribe`,
          formData,
          {
            headers: formData.getHeaders(),
            timeout: MICROSERVICE_TIMEOUT,
            maxContentLength: Infinity,
            maxBodyLength: Infinity
          }
        );

        res.json(result.data);
      } catch (microserviceErr) {
        logger.warn('Voice processor microservice unavailable');
        res.status(503).json({
          error: 'Voice processor unavailable',
          message: 'Audio transcription requires the voice-processor microservice to be running. Please use the Transcripts page to upload audio files via Plaud webhook.',
          alternative: 'Use POST /api/transcripts/upload for Plaud audio integration'
        });
      }

    } catch (err) {
      logger.error('Error transcribing audio:', err);
      res.status(500).json({ 
        error: 'Failed to transcribe audio',
        message: err.message 
      });
    }
  });
});

/**
 * GET /api/intelligence/supported-formats
 * Get list of supported audio formats (proxies to voice-processor service)
 */
router.get('/supported-formats', async (req, res) => {
  try {
    try {
      const result = await callMicroservice(
        VOICE_PROCESSOR_URL,
        '/supported-formats',
        'GET'
      );
      return res.json(result);
    } catch (microserviceErr) {
      logger.warn('Voice processor unavailable, returning default formats');
      // Return default supported formats
      return res.json({
        success: true,
        formats: ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac', 'wma'],
        note: 'Voice processor microservice not available. Upload feature requires microservice.'
      });
    }

  } catch (err) {
    logger.error('Error getting supported formats:', err);
    res.status(500).json({ 
      error: 'Failed to get supported formats',
      message: err.message 
    });
  }
});

/**
 * GET /api/intelligence/context
 * Get context entries with filtering (proxies to context-service)
 */
router.get('/context', async (req, res) => {
  try {
    const { category, source, limit, active_only } = req.query;

    logger.info(`Getting context: category=${category}, source=${source}, limit=${limit}`);

    try {
      const result = await callMicroservice(
        CONTEXT_SERVICE_URL,
        '/context',
        'GET',
        null,
        { category, source, limit, active_only }
      );
      return res.json(result);
    } catch (microserviceErr) {
      logger.warn(`Context Service microservice unavailable (${CONTEXT_SERVICE_URL}): ${microserviceErr.message}`);
      logger.info('Falling back to local implementation');
      const { getContext } = require('./intelligence-local');
      const result = await getContext(req, category, source, limit || 50, active_only !== 'false');
      return res.json(result);
    }

  } catch (err) {
    logger.error('Error getting context:', err);
    res.status(500).json({ 
      error: 'Failed to get context',
      message: err.message 
    });
  }
});

/**
 * GET /api/intelligence/context/rolling
 * Get 2-week rolling context window (proxies to context-service)
 */
router.get('/context/rolling', async (req, res) => {
  try {
    logger.info('Getting rolling 2-week context window');

    try {
      const result = await callMicroservice(
        CONTEXT_SERVICE_URL,
        '/context/rolling',
        'GET'
      );
      return res.json(result);
    } catch (microserviceErr) {
      logger.warn(`Context Service microservice unavailable (${CONTEXT_SERVICE_URL}): ${microserviceErr.message}`);
      logger.info('Falling back to local implementation');
      const { getContext } = require('./intelligence-local');
      const result = await getContext(null, null, 100, true);
      return res.json(result);
    }

  } catch (err) {
    logger.error('Error getting rolling context:', err);
    res.status(500).json({ 
      error: 'Failed to get rolling context',
      message: err.message 
    });
  }
});

/**
 * POST /api/intelligence/context/search
 * Search context entries (proxies to context-service)
 */
router.post('/context/search', async (req, res) => {
  try {
    const { query, category, limit } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    logger.info(`Searching context for: "${query}"`);

    try {
      const result = await callMicroservice(
        CONTEXT_SERVICE_URL,
        '/context/search',
        'POST',
        { query, category, limit }
      );
      return res.json(result);
    } catch (microserviceErr) {
      logger.warn(`Context Service microservice unavailable (${CONTEXT_SERVICE_URL}): ${microserviceErr.message}`);
      logger.info('Falling back to local implementation');
      const { searchContext } = require('./intelligence-local');
      const result = await searchContext(req, query, category, limit || 20);
      return res.json(result);
    }

  } catch (err) {
    logger.error('Error searching context:', err);
    res.status(500).json({ 
      error: 'Failed to search context',
      message: err.message 
    });
  }
});

/**
 * GET /api/intelligence/health
 * Check health of all microservices
 */
router.get('/health', async (req, res) => {
  const services = {
    'ai-intelligence': AI_INTELLIGENCE_URL,
    'pattern-recognition': PATTERN_RECOGNITION_URL,
    'nl-parser': NL_PARSER_URL,
    'voice-processor': VOICE_PROCESSOR_URL,
    'context-service': CONTEXT_SERVICE_URL
  };

  const healthStatus = {
    status: 'healthy',
    services: {}
  };

  // Check each service
  for (const [name, url] of Object.entries(services)) {
    try {
      const response = await axios.get(`${url}/health`, { 
        timeout: 5000,
        httpsAgent: httpsAgent 
      });
      healthStatus.services[name] = {
        status: 'healthy',
        url,
        ...response.data
      };
    } catch (error) {
      logger.warn(`Health check failed for ${name}`, { 
        url, 
        error: error.message,
        code: error.code 
      });
      healthStatus.services[name] = {
        status: 'unhealthy',
        url,
        error: error.message
      };
      healthStatus.status = 'degraded';
    }
  }

  const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(healthStatus);
});

module.exports = router;
