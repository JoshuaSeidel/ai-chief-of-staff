const express = require('express');
const router = express.Router();
const pushService = require('../services/push-notifications');
const { createModuleLogger } = require('../utils/logger');

const logger = createModuleLogger('NOTIFICATIONS-API');

/**
 * Get VAPID public key for client
 */
router.get('/vapid-public-key', (req, res) => {
  const publicKey = pushService.getPublicKey();
  
  if (!publicKey) {
    return res.status(503).json({ 
      error: 'Push notifications not configured',
      message: 'VAPID keys are not set on the server'
    });
  }
  
  res.json({ publicKey });
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

module.exports = router;

