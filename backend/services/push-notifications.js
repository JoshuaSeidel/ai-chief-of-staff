const webpush = require('web-push');
const { getDb } = require('../database/db');
const { createModuleLogger } = require('../utils/logger');

const logger = createModuleLogger('PUSH-NOTIFICATIONS');

// VAPID keys are now managed by vapid-manager.js and loaded from database
// They are automatically generated on first startup if they don't exist

/**
 * Subscribe a device to push notifications
 */
async function subscribe(subscription, userId = 'default') {
  try {
    const db = getDb();
    
    // Check if subscription already exists
    const existing = await db.get(
      'SELECT id FROM push_subscriptions WHERE endpoint = ?',
      [subscription.endpoint]
    );
    
    if (existing) {
      // Update existing subscription
      await db.run(
        'UPDATE push_subscriptions SET user_id = ?, keys = ?, created_date = CURRENT_TIMESTAMP WHERE endpoint = ?',
        [userId, JSON.stringify(subscription.keys), subscription.endpoint]
      );
      logger.info(`Push subscription updated for user: ${userId}`);
    } else {
      // Insert new subscription
      await db.run(
        'INSERT INTO push_subscriptions (user_id, endpoint, keys, created_date) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
        [userId, subscription.endpoint, JSON.stringify(subscription.keys)]
      );
      logger.info(`Push subscription saved for user: ${userId}`);
    }
    
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
    // Ensure VAPID keys are set before attempting to send
    const { getVapidPublicKey } = require('../utils/vapid-manager');
    const publicKey = await getVapidPublicKey();
    
    if (!publicKey) {
      logger.error('VAPID keys not configured, cannot send push notifications');
      return { sent: 0, failed: 0, error: 'VAPID keys not configured' };
    }
    
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
          // Better error logging
          const errorMsg = error.body || error.message || 'Unknown error';
          const statusCode = error.statusCode || error.status || 'unknown';
          
          // Silently clean up expired subscriptions (common and expected)
          if (error.statusCode === 410 || error.statusCode === 404) {
            logger.debug(`Subscription expired/not found, removing: ${sub.endpoint.substring(0, 50)}...`);
            await unsubscribe(sub.endpoint);
            return { success: false, expired: true };
          }
          
          // Log authentication errors but don't spam logs
          if (error.statusCode === 401 || error.statusCode === 403) {
            logger.debug(`Subscription unauthorized (likely re-subscribed with new keys): ${sub.endpoint.substring(0, 50)}...`);
            await unsubscribe(sub.endpoint);
            return { success: false, unauthorized: true };
          }
          
          // Only log unexpected errors
          logger.warn(`Failed to send push notification (status ${statusCode}): ${errorMsg.substring(0, 100)}`);
          return { success: false, error: errorMsg, statusCode };
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
  try {
    const db = getDb();
    const tag = `task-${task.id}`;
    
    // Get max notification repeat limit from config (default 3)
    const { getConfigValue } = require('../config/manager');
    const maxRepeats = parseInt(await getConfigValue('notification_max_repeats') || '3', 10);
    
    // Check if this task notification was dismissed
    const dismissed = await db.get(
      `SELECT * FROM notification_history 
       WHERE notification_tag = ? 
       AND dismissed = ${db.constructor.name === 'Database' ? '1' : 'TRUE'}
       ORDER BY dismissed_date DESC LIMIT 1`,
      [tag]
    );
    
    if (dismissed) {
      logger.debug(`Task ${task.id} notification was dismissed, skipping`);
      return { sent: 0, failed: 0, skipped: true, reason: 'dismissed' };
    }
    
    // Count recent notifications for this specific task
    const recentCount = await db.get(
      `SELECT COUNT(*) as count FROM notification_history 
       WHERE notification_tag = ? 
       AND sent_date >= datetime('now', '-24 hours')
       AND dismissed = ${db.constructor.name === 'Database' ? '0' : 'FALSE'}`,
      [tag]
    );
    
    if (recentCount.count >= maxRepeats) {
      logger.debug(`Task ${task.id} notification sent ${recentCount.count} times in last 24h (max: ${maxRepeats}), skipping`);
      return { sent: 0, failed: 0, skipped: true, reason: 'max_repeats' };
    }
    
    // iOS limits: title 40 chars, body 4 lines (~120 chars), total payload 4KB
    const taskTypeEmoji = {
      'commitment': '📋',
      'action': '⚡',
      'follow-up': '🔄',
      'risk': '⚠️'
    }[task.task_type] || '📋';
    
    const title = `${taskTypeEmoji} Task Due Soon`.substring(0, 40);
    const body = task.description.substring(0, 110); // Keep under 4 lines
    
    const payload = {
      title,
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag,
      data: {
        taskId: task.id,
        url: '/#tasks',
        notificationTag: tag,
        dismissible: true
      },
      actions: [
        { action: 'dismiss', title: 'Dismiss' },
        { action: 'open', title: 'View Task' }
      ]
    };
    
    const result = await sendToAll(payload);
    
    // Record notification in history
    if (result.sent > 0) {
      await db.run(
        `INSERT INTO notification_history (notification_tag, task_id, notification_type, sent_date) 
         VALUES (?, ?, 'task_reminder', ${db.constructor.name === 'Database' ? 'CURRENT_TIMESTAMP' : 'NOW()'})`,
        [tag, task.id]
      );
      logger.info(`Task ${task.id} reminder sent (${recentCount.count + 1}/${maxRepeats} in 24h)`);
    }
    
    return result;
  } catch (error) {
    logger.error(`Error sending task reminder for task ${task.id}:`, error);
    throw error;
  }
}

/**
 * Send push notification for overdue tasks
 */
async function sendOverdueNotification(count) {
  try {
    const db = getDb();
    const tag = 'overdue-tasks';
    
    // Get max notification repeat limit from config (default 3)
    const { getConfigValue } = require('../config/manager');
    const maxRepeats = parseInt(await getConfigValue('notification_max_repeats') || '3', 10);
    const cooldownHours = parseInt(await getConfigValue('notification_cooldown_hours') || '24', 10);
    
    // Check if this notification was recently dismissed
    const dismissed = await db.get(
      `SELECT * FROM notification_history 
       WHERE notification_tag = ? 
       AND dismissed = ${db.constructor.name === 'Database' ? '1' : 'TRUE'}
       ORDER BY dismissed_date DESC LIMIT 1`,
      [tag]
    );
    
    if (dismissed) {
      const dismissedDate = new Date(dismissed.dismissed_date);
      const hoursSinceDismissed = (Date.now() - dismissedDate.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceDismissed < cooldownHours) {
        logger.debug(`Overdue notification dismissed ${hoursSinceDismissed.toFixed(1)}h ago, skipping (cooldown: ${cooldownHours}h)`);
        return { sent: 0, failed: 0, skipped: true, reason: 'dismissed' };
      }
    }
    
    // Count recent notifications (last 7 days) that weren't dismissed
    const recentCount = await db.get(
      `SELECT COUNT(*) as count FROM notification_history 
       WHERE notification_tag = ? 
       AND sent_date >= datetime('now', '-7 days')
       AND dismissed = ${db.constructor.name === 'Database' ? '0' : 'FALSE'}`,
      [tag]
    );
    
    if (recentCount.count >= maxRepeats) {
      logger.debug(`Overdue notification sent ${recentCount.count} times in last 7 days (max: ${maxRepeats}), skipping`);
      return { sent: 0, failed: 0, skipped: true, reason: 'max_repeats' };
    }
    
    const payload = {
      title: `⚠️ ${count} Overdue`,
      body: `You have ${count} overdue task${count > 1 ? 's' : ''}. Tap to review.`,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag,
      data: {
        url: '/#tasks',
        notificationTag: tag,
        dismissible: true
      },
      actions: [
        { action: 'dismiss', title: 'Dismiss' },
        { action: 'open', title: 'View Tasks' }
      ]
    };
    
    const result = await sendToAll(payload);
    
    // Record notification in history
    if (result.sent > 0) {
      await db.run(
        `INSERT INTO notification_history (notification_tag, notification_type, sent_date) 
         VALUES (?, 'overdue', ${db.constructor.name === 'Database' ? 'CURRENT_TIMESTAMP' : 'NOW()'})`,
        [tag]
      );
      logger.info(`Overdue notification sent (${recentCount.count + 1}/${maxRepeats} in 7 days)`);
    }
    
    return result;
  } catch (error) {
    logger.error('Error sending overdue notification:', error);
    throw error;
  }
}

/**
 * Send push notification for upcoming calendar events
 */
async function sendEventReminder(event) {
  const title = `📅 ${event.summary}`.substring(0, 40);
  const body = (event.description || 'Event starting soon').substring(0, 110);
  
  const payload = {
    title,
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: `event-${event.id}`,
    data: {
      eventId: event.id,
      url: '/#calendar'
    }
  };
  
  return await sendToAll(payload);
}

/**
 * Dismiss a notification to prevent future sends
 */
async function dismissNotification(notificationTag) {
  try {
    const db = getDb();
    
    await db.run(
      `INSERT INTO notification_history (notification_tag, notification_type, dismissed, dismissed_date) 
       VALUES (?, 'dismissed', ${db.constructor.name === 'Database' ? '1' : 'TRUE'}, ${db.constructor.name === 'Database' ? 'CURRENT_TIMESTAMP' : 'NOW()'})`,
      [notificationTag]
    );
    
    logger.info(`Notification dismissed: ${notificationTag}`);
    return true;
  } catch (error) {
    logger.error('Error dismissing notification:', error);
    throw error;
  }
}

/**
 * Get public VAPID key for client
 */
async function getPublicKey() {
  try {
    const { getVapidPublicKey } = require('../utils/vapid-manager');
    return await getVapidPublicKey();
  } catch (error) {
    logger.error('Failed to get VAPID public key', { error: error.message });
    return null;
  }
}

module.exports = {
  subscribe,
  unsubscribe,
  sendToAll,
  sendTaskReminder,
  sendOverdueNotification,
  sendEventReminder,
  dismissNotification,
  getPublicKey
};

