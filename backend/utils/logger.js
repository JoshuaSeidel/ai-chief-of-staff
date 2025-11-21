const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Determine log directory - use /data in production (Docker), ./data in development
const LOG_DIR = process.env.LOG_DIR || process.env.CONFIG_DIR || (process.env.NODE_ENV === 'production' ? '/data' : './data');

// Ensure log directory exists
try {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    console.log(`[LOGGER] Created log directory: ${LOG_DIR}`);
  }
} catch (err) {
  console.error(`[LOGGER] Warning: Could not create log directory ${LOG_DIR}:`, err.message);
  console.error('[LOGGER] Logging to files will be disabled, console logging only');
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(metadata).length > 0 && metadata.module) {
      msg = `${timestamp} [${level}] [${metadata.module}]: ${message}`;
      delete metadata.module;
    }
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

// Create transports array
const transports = [
  // Always write to console
  new winston.transports.Console({
    format: consoleFormat
  })
];

// Add file transports only if log directory is writable
try {
  if (fs.existsSync(LOG_DIR)) {
    transports.push(
      // Write all logs with level 'error' and below to error.log
      new winston.transports.File({ 
        filename: path.join(LOG_DIR, 'error.log'), 
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      }),
      // Write all logs to combined.log
      new winston.transports.File({ 
        filename: path.join(LOG_DIR, 'combined.log'),
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      })
    );
  }
} catch (err) {
  console.warn('[LOGGER] File logging disabled:', err.message);
}

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'ai-chief-of-staff' },
  transports: transports
});

// Add exception handlers only if log directory exists
try {
  if (fs.existsSync(LOG_DIR)) {
    logger.exceptions.handle(
      new winston.transports.File({ filename: path.join(LOG_DIR, 'exceptions.log') })
    );
    logger.rejections.handle(
      new winston.transports.File({ filename: path.join(LOG_DIR, 'rejections.log') })
    );
  }
} catch (err) {
  console.warn('[LOGGER] Exception/rejection file logging disabled:', err.message);
}

// Create child loggers for different modules
function createModuleLogger(moduleName) {
  return {
    debug: (message, meta = {}) => logger.debug(message, { module: moduleName, ...meta }),
    info: (message, meta = {}) => logger.info(message, { module: moduleName, ...meta }),
    warn: (message, meta = {}) => logger.warn(message, { module: moduleName, ...meta }),
    error: (message, meta = {}) => {
      // If meta is an Error object, extract stack trace
      if (meta instanceof Error) {
        logger.error(message, { 
          module: moduleName, 
          error: meta.message, 
          stack: meta.stack 
        });
      } else {
        logger.error(message, { module: moduleName, ...meta });
      }
    }
  };
}

// Export both the main logger and the factory function
module.exports = logger;
module.exports.createModuleLogger = createModuleLogger;
