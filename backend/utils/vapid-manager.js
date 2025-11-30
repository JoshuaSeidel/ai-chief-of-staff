const webpush = require('web-push');
const { getDb } = require('../database/db');
const { createModuleLogger } = require('./logger');

const logger = createModuleLogger('VAPID');

/**
 * Generate and store VAPID keys for push notifications
 * This runs automatically on server startup if keys don't exist
 */
async function ensureVapidKeys() {
  try {
    const db = getDb();
    
    // Check if VAPID keys already exist in database
    const publicKeyRow = await db.get('SELECT value FROM config WHERE key = ?', ['vapidPublicKey']);
    const privateKeyRow = await db.get('SELECT value FROM config WHERE key = ?', ['vapidPrivateKey']);
    
    if (publicKeyRow && privateKeyRow && publicKeyRow.value && privateKeyRow.value) {
      logger.info('VAPID keys already configured');
      
      // Set them in web-push for use
      try {
        webpush.setVapidDetails(
          'mailto:notifications@aicos.app',
          publicKeyRow.value,
          privateKeyRow.value
        );
        logger.info('VAPID keys loaded and configured for push notifications');
      } catch (error) {
        logger.warn('Failed to set VAPID details, will regenerate', { error: error.message });
        // Continue to regenerate if invalid
      }
      
      return {
        publicKey: publicKeyRow.value,
        privateKey: privateKeyRow.value
      };
    }
    
    // Generate new VAPID keys
    logger.info('Generating new VAPID keys for push notifications...');
    const vapidKeys = webpush.generateVAPIDKeys();
    
    // Store in database
    await db.run(
      'INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)',
      ['vapidPublicKey', vapidKeys.publicKey]
    );
    await db.run(
      'INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)',
      ['vapidPrivateKey', vapidKeys.privateKey]
    );
    
    // Set subject for VAPID (required)
    await db.run(
      'INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)',
      ['vapidSubject', 'mailto:notifications@aicos.app']
    );
    
    // Configure web-push with new keys
    webpush.setVapidDetails(
      'mailto:notifications@aicos.app',
      vapidKeys.publicKey,
      vapidKeys.privateKey
    );
    
    logger.info('✅ VAPID keys generated and stored successfully');
    logger.info(`Public Key: ${vapidKeys.publicKey.substring(0, 20)}...`);
    
    return vapidKeys;
  } catch (error) {
    logger.error('Failed to ensure VAPID keys', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Get VAPID public key for frontend
 */
async function getVapidPublicKey() {
  try {
    const db = getDb();
    const row = await db.get('SELECT value FROM config WHERE key = ?', ['vapidPublicKey']);
    
    if (!row || !row.value) {
      logger.warn('VAPID public key not found, generating new keys...');
      const keys = await ensureVapidKeys();
      return keys.publicKey;
    }
    
    return row.value;
  } catch (error) {
    logger.error('Failed to get VAPID public key', { error: error.message });
    throw error;
  }
}

/**
 * Force regenerate VAPID keys
 * WARNING: This will invalidate all existing push subscriptions
 */
async function regenerateVapidKeys() {
  try {
    const db = getDb();
    
    logger.info('Force regenerating VAPID keys...');
    const vapidKeys = webpush.generateVAPIDKeys();
    
    // Replace existing keys in database
    await db.run(
      'INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)',
      ['vapidPublicKey', vapidKeys.publicKey]
    );
    await db.run(
      'INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)',
      ['vapidPrivateKey', vapidKeys.privateKey]
    );
    await db.run(
      'INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)',
      ['vapidSubject', 'mailto:notifications@aicos.app']
    );
    
    // Clear all existing subscriptions as they're now invalid
    await db.run('DELETE FROM push_subscriptions');
    logger.info('Cleared all push subscriptions (invalidated by new keys)');
    
    // Set new keys in web-push
    webpush.setVapidDetails(
      'mailto:notifications@aicos.app',
      vapidKeys.publicKey,
      vapidKeys.privateKey
    );
    
    logger.info('VAPID keys regenerated successfully');
    return vapidKeys;
  } catch (error) {
    logger.error('Failed to regenerate VAPID keys', { error: error.message });
    throw error;
  }
}

module.exports = {
  ensureVapidKeys,
  getVapidPublicKey,
  regenerateVapidKeys
};
