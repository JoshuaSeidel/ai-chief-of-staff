const express = require('express');
const cors = require('cors');
const https = require('https');
const fs = require('fs');
const dotenv = require('dotenv');
const multer = require('multer');
const path = require('path');
const logger = require('./utils/logger');
const { createModuleLogger } = require('./utils/logger');
const { runStartupChecks } = require('./startup-check');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const serverLogger = createModuleLogger('SERVER');

// Initialize database before loading routes
const { initializeDatabase } = require('./database/db');

serverLogger.info('=================================');
serverLogger.info('AI Chief of Staff - Starting...');
serverLogger.info('=================================');
serverLogger.info(`Environment: ${process.env.NODE_ENV || 'production'}`);
serverLogger.info(`Port: ${PORT}`);

// Middleware
// CORS configuration - allow requests from frontend container and common origins
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, or same-origin requests)
    if (!origin) return callback(null, true);
    
    // Allow requests from frontend container (when proxied through nginx)
    // Allow localhost for development
    // Allow any origin in development mode
    const allowedOrigins = [
      'http://aicos-frontend:3000',
      'http://localhost:3000',
      'http://localhost:3001',
      process.env.FRONTEND_URL,
      process.env.ALLOWED_ORIGINS?.split(',')
    ].filter(Boolean).flat();
    
    if (process.env.NODE_ENV === 'development' || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // In production, be more restrictive but still allow common patterns
      callback(null, true); // For now, allow all - can be tightened based on deployment
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-profile-id']
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cookie parser for profile context
const cookieParser = require('cookie-parser');
app.use(cookieParser());

// Profile context middleware - extract profile_id from requests
const { profileContext } = require('./middleware/profile-context');
app.use('/api', profileContext);

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  // Log when response is finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'info';
    
    logger[logLevel]('HTTP Request', {
      module: 'HTTP',
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
  });
  
  next();
});

// Serve static frontend files (for all-in-one container)
// Set cache headers: short cache for HTML, longer for assets
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: 0, // No cache for HTML files by default
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    // HTML files - no cache (always check for updates)
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    // JavaScript and CSS - short cache (1 hour) with revalidation
    else if (filePath.match(/\.(js|css)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
    }
    // Images and fonts - longer cache (1 day)
    else if (filePath.match(/\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
    // Service worker - no cache (critical for updates)
    else if (filePath.endsWith('service-worker.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    // Manifest - short cache
    else if (filePath.endsWith('manifest.json')) {
      res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
    }
  }
}));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Log file uploads
    serverLogger.info('File upload initiated', {
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });
    cb(null, true);
  }
});

// Make upload middleware available to routes
app.set('upload', upload);

// Health check (available before database is initialized)
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'AI Chief of Staff API is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Initialize and start server
async function startServer() {
  try {
    // Run pre-flight checks
    serverLogger.info('Running startup checks...');
    await runStartupChecks();
    
    // Initialize database first
    serverLogger.info('Initializing database...');
    await initializeDatabase();
    serverLogger.info('Database ready');
    
    // Import and setup routes after database is initialized
    const briefRoutes = require('./routes/brief');
    const transcriptRoutes = require('./routes/transcripts');
    const configRoutes = require('./routes/config');
    const configApiRoutes = require('./routes/config-api');
    const calendarRoutes = require('./routes/calendar');
    const commitmentsRoutes = require('./routes/commitments');
    const webhookRoutes = require('./routes/webhook');
    const integrationsProxyRoutes = require('./routes/integrations-proxy');
    
    app.use('/api/profiles', require('./routes/profiles')); // Profile management
    app.use('/api/brief', briefRoutes);
    app.use('/api/transcripts', transcriptRoutes);
    app.use('/api/config', configRoutes);
    app.use('/api/config-api', configApiRoutes); // Database-backed configuration management
    app.use('/api/calendar', calendarRoutes);
    app.use('/api/planner', require('./routes/planner'));
    app.use('/api/commitments', commitmentsRoutes);
    app.use('/api/prompts', require('./routes/prompts'));
    app.use('/api/notifications', require('./routes/notifications'));
    app.use('/api/webhook', webhookRoutes);
    app.use('/api/intelligence', require('./routes/intelligence'));
    app.use('/api/integrations', integrationsProxyRoutes); // Proxy to integrations microservice
    
    serverLogger.info('API routes initialized');
    
    // Serve frontend for any non-API routes (for all-in-one container)
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
    
    // 404 handler for API routes
    app.use('/api/*', (req, res) => {
      serverLogger.warn('API endpoint not found', { 
        method: req.method, 
        url: req.url 
      });
      res.status(404).json({ 
        error: 'API endpoint not found',
        path: req.url,
        method: req.method
      });
    });
    
    // Error handling middleware
    app.use((err, req, res, next) => {
      serverLogger.error('Unhandled error in request', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        body: req.body,
        params: req.params,
        query: req.query
      });
      
      // Multer errors
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ 
            error: 'File too large',
            message: 'File size limit is 10MB'
          });
        }
        return res.status(400).json({ 
          error: 'File upload error',
          message: err.message
        });
      }
      
      // Generic error response
      res.status(err.status || 500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
        requestId: req.id,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
      });
    });
    
    // Generate/load VAPID keys for push notifications
    const { ensureVapidKeys } = require('./utils/vapid-manager');
    await ensureVapidKeys();
    
    // Start task scheduler for push notifications
    const taskScheduler = require('./services/task-scheduler');
    taskScheduler.startScheduler();
    
    // Start server with HTTPS support for internal container communication
    const CERT_DIR = path.join(__dirname, 'certs');
    const CERT_PATH = path.join(CERT_DIR, 'aicos-backend.crt');
    const KEY_PATH = path.join(CERT_DIR, 'aicos-backend.key');
    
    // Check if certificates exist for HTTPS
    if (fs.existsSync(CERT_PATH) && fs.existsSync(KEY_PATH)) {
      // Start HTTPS server for encrypted internal communication
      const httpsOptions = {
        cert: fs.readFileSync(CERT_PATH),
        key: fs.readFileSync(KEY_PATH)
      };
      
      https.createServer(httpsOptions, app).listen(PORT, () => {
        serverLogger.info('=================================');
        serverLogger.info(`Server running on port ${PORT} (HTTPS)`);
        serverLogger.info(`Environment: ${process.env.NODE_ENV || 'production'}`);
        serverLogger.info(`Certificate: ${CERT_PATH}`);
        serverLogger.info('=================================');
      });
    } else {
      // Fallback to HTTP if certificates don't exist
      serverLogger.warn('TLS certificates not found, falling back to HTTP');
      serverLogger.warn(`Expected cert at: ${CERT_PATH}`);
      serverLogger.warn(`Expected key at: ${KEY_PATH}`);
      
      app.listen(PORT, () => {
        serverLogger.info('=================================');
        serverLogger.info(`Server running on port ${PORT} (HTTP - INSECURE)`);
        serverLogger.info(`Environment: ${process.env.NODE_ENV || 'production'}`);
        serverLogger.info('=================================');
      });
    }
    
  } catch (err) {
    serverLogger.error('Failed to start server', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  serverLogger.info('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  serverLogger.info('SIGINT signal received: closing HTTP server');
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  serverLogger.error('Uncaught Exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  serverLogger.error('Unhandled Rejection', { reason, promise });
  process.exit(1);
});

startServer();

module.exports = app;
