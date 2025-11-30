const express = require('express');
const router = express.Router();
const pushService = require('../services/push-notifications');
const { createModuleLogger } = require('../utils/logger');

const logger = createModuleLogger('NOTIFICATIONS-API');

/**
 * Get VAPID public key for client
 */
router.get('/vapid-public-key', async (req, res) => {
  try {
    const publicKey = await pushService.getPublicKey();
    
    if (!publicKey) {
      return res.status(503).json({ 
        error: 'Push notifications not configured',
        message: 'VAPID keys are not set on the server'
      });
    }
    
    res.json({ publicKey });
  } catch (error) {
    logger.error('Failed to get VAPID public key:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve VAPID key',
      message: error.message
    });
  }
});

/**
 * Subscribe to push notifications
 */
router.post('/subscribe', async (req, res) => {
  try {
    const { subscription } = req.body;
    
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription object' });
    }
    
    await pushService.subscribe(subscription);
    logger.info('Device subscribed to push notifications');
    
    res.json({ message: 'Subscription successful' });
  } catch (error) {
    logger.error('Error subscribing to push notifications:', error);
    res.status(500).json({ 
      error: 'Failed to subscribe',
      message: error.message
    });
  }
});

/**
 * Unsubscribe from push notifications
 */
router.post('/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    
    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint required' });
    }
    
    await pushService.unsubscribe(endpoint);
    logger.info('Device unsubscribed from push notifications');
    
    res.json({ message: 'Unsubscribed successfully' });
  } catch (error) {
    logger.error('Error unsubscribing from push notifications:', error);
    res.status(500).json({ 
      error: 'Failed to unsubscribe',
      message: error.message
    });
  }
});

/**
 * Send test notification (for testing purposes)
 */
router.post('/test', async (req, res) => {
  try {
    const result = await pushService.sendToAll({
      title: '🧪 Test Notification',
      body: 'This is a test notification from AI Chief of Staff',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'test'
    });
    
    logger.info('Test notification sent', result);
    res.json({ 
      message: 'Test notification sent',
      ...result
    });
  } catch (error) {
    logger.error('Error sending test notification:', error);
    res.status(500).json({ 
      error: 'Failed to send test notification',
      message: error.message
    });
  }
});

/**
 * Dismiss a notification to prevent future sends
 */
router.post('/dismiss', async (req, res) => {
  try {
    const { notificationTag } = req.body;
    
    if (!notificationTag) {
      return res.status(400).json({ error: 'notificationTag required' });
    }
    
    await pushService.dismissNotification(notificationTag);
    logger.info(`Notification dismissed: ${notificationTag}`);
    
    res.json({ message: 'Notification dismissed successfully' });
  } catch (error) {
    logger.error('Error dismissing notification:', error);
    res.status(500).json({ 
      error: 'Failed to dismiss notification',
      message: error.message
    });
  }
});

/**
 * Regenerate VAPID keys (will invalidate all existing subscriptions)
 */
router.post('/regenerate-vapid', async (req, res) => {
  try {
    const { regenerateVapidKeys } = require('../utils/vapid-manager');
    const keys = await regenerateVapidKeys();
    
    logger.info('VAPID keys regenerated - all existing subscriptions invalidated');
    res.json({ 
      message: 'VAPID keys regenerated successfully',
      publicKey: keys.publicKey,
      note: 'All users will need to re-enable notifications'
    });
  } catch (error) {
    logger.error('Error regenerating VAPID keys:', error);
    res.status(500).json({ 
      error: 'Failed to regenerate VAPID keys',
      message: error.message
    });
  }
});

module.exports = router;

