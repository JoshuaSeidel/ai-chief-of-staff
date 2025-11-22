const webpush = require('web-push');
const { getDb } = require('../database/db');
const { createModuleLogger } = require('../utils/logger');

const logger = createModuleLogger('PUSH-NOTIFICATIONS');

// VAPID keys for push notifications
// In production, generate these once with: npx web-push generate-vapid-keys
// Then store in environment variables
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
  logger.info('Push notifications configured');
} else {
  logger.warn('VAPID keys not configured - push notifications disabled');
  logger.warn('Generate keys with: npx web-push generate-vapid-keys');
}

/**
 * Subscribe a device to push notifications
 */
async function subscribe(subscription, userId = 'default') {
  try {
    const db = getDb();
    
    // Store subscription in database
    await db.run(
      'INSERT OR REPLACE INTO push_subscriptions (user_id, endpoint, keys, created_date) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
      [userId, subscription.endpoint, JSON.stringify(subscription.keys)]
    );
    
    logger.info(`Push subscription saved for user: ${userId}`);
    return true;
  } catch (error) {
    logger.error('Error saving push subscription:', error);
    throw error;
  }
}

/**
 * Unsubscribe a device
 */
async function unsubscribe(endpoint) {
  try {
    const db = getDb();
    await db.run('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
    logger.info('Push subscription removed');
    return true;
  } catch (error) {
    logger.error('Error removing push subscription:', error);
    throw error;
  }
}

/**
 * Send push notification to all subscribed devices
 */
async function sendToAll(payload) {
  try {
    const db = getDb();
    const subscriptions = await db.all('SELECT * FROM push_subscriptions');
    
    if (subscriptions.length === 0) {
      logger.info('No push subscriptions found');
      return { sent: 0, failed: 0 };
    }
    
    logger.info(`Sending push notification to ${subscriptions.length} devices`);
    
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: JSON.parse(sub.keys)
          };
          
          await webpush.sendNotification(
            pushSubscription,
            JSON.stringify(payload)
          );
          
          return { success: true };
        } catch (error) {
          logger.warn(`Failed to send to ${sub.endpoint}:`, error.message);
          
          // If subscription is invalid, remove it
          if (error.statusCode === 410 || error.statusCode === 404) {
            await unsubscribe(sub.endpoint);
          }
          
          return { success: false, error: error.message };
        }
      })
    );
    
    const sent = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.length - sent;
    
    logger.info(`Push notifications sent: ${sent} succeeded, ${failed} failed`);
    return { sent, failed };
  } catch (error) {
    logger.error('Error sending push notifications:', error);
    throw error;
  }
}

/**
 * Send push notification for task reminder
 */
async function sendTaskReminder(task) {
  const payload = {
    title: `📋 Task Reminder: ${task.task_type || 'Task'}`,
    body: task.description.substring(0, 100),
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: `task-${task.id}`,
    data: {
      taskId: task.id,
      deadline: task.deadline,
      url: '/#commitments'
    },
    actions: [
      { action: 'view', title: 'View Task' },
      { action: 'complete', title: 'Mark Complete' }
    ]
  };
  
  return await sendToAll(payload);
}

/**
 * Send push notification for overdue tasks
 */
async function sendOverdueNotification(count) {
  const payload = {
    title: '⚠️ Overdue Tasks',
    body: `You have ${count} overdue task${count > 1 ? 's' : ''}`,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'overdue-tasks',
    data: {
      url: '/#commitments'
    },
    actions: [
      { action: 'view', title: 'View Tasks' }
    ]
  };
  
  return await sendToAll(payload);
}

/**
 * Send push notification for upcoming calendar events
 */
async function sendEventReminder(event) {
  const payload = {
    title: `📅 Upcoming: ${event.summary}`,
    body: event.description || 'Event starting soon',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: `event-${event.id}`,
    data: {
      eventId: event.id,
      startTime: event.start,
      url: '/#calendar'
    },
    actions: [
      { action: 'view', title: 'View Calendar' }
    ]
  };
  
  return await sendToAll(payload);
}

/**
 * Get public VAPID key for client
 */
function getPublicKey() {
  return VAPID_PUBLIC_KEY;
}

module.exports = {
  subscribe,
  unsubscribe,
  sendToAll,
  sendTaskReminder,
  sendOverdueNotification,
  sendEventReminder,
  getPublicKey
};

