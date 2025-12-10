const { getDb } = require('../database/db');
const pushService = require('./push-notifications');
const { createModuleLogger } = require('../utils/logger');

const logger = createModuleLogger('TASK-SCHEDULER');

// Check for reminders every 15 minutes for more responsive notifications
const CHECK_INTERVAL = 15 * 60 * 1000;

// Track last daily digest send to avoid duplicates
let lastDailyDigestDate = null;

/**
 * Check if current time is within quiet hours
 */
async function isQuietHours() {
  try {
    const db = getDb();
    const enabledRow = await db.get('SELECT value FROM config WHERE key = ?', ['notification_quiet_hours_enabled']);

    if (enabledRow?.value !== 'true') {
      return false;
    }

    const startRow = await db.get('SELECT value FROM config WHERE key = ?', ['notification_quiet_hours_start']);
    const endRow = await db.get('SELECT value FROM config WHERE key = ?', ['notification_quiet_hours_end']);

    const start = startRow?.value || '22:00';
    const end = endRow?.value || '08:00';

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    const [startHour, startMin] = start.split(':').map(Number);
    const [endHour, endMin] = end.split(':').map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    // Handle overnight quiet hours (e.g., 22:00 to 08:00)
    if (startMinutes > endMinutes) {
      return currentTime >= startMinutes || currentTime < endMinutes;
    }

    return currentTime >= startMinutes && currentTime < endMinutes;
  } catch (error) {
    logger.error('Error checking quiet hours:', error);
    return false;
  }
}

/**
 * Get reminder timing setting (hours before deadline)
 */
async function getReminderTiming() {
  try {
    const db = getDb();
    const row = await db.get('SELECT value FROM config WHERE key = ?', ['notification_reminder_timing']);
    return parseInt(row?.value || '24', 10);
  } catch (error) {
    logger.error('Error getting reminder timing:', error);
    return 24;
  }
}

/**
 * Check if task reminders are enabled
 */
async function isTaskRemindersEnabled() {
  try {
    const db = getDb();
    const row = await db.get('SELECT value FROM config WHERE key = ?', ['notification_task_reminders']);
    return row?.value !== 'false';
  } catch (error) {
    return true; // Default to enabled
  }
}

/**
 * Check if overdue alerts are enabled
 */
async function isOverdueAlertsEnabled() {
  try {
    const db = getDb();
    const row = await db.get('SELECT value FROM config WHERE key = ?', ['notification_overdue_alerts']);
    return row?.value !== 'false';
  } catch (error) {
    return true; // Default to enabled
  }
}

/**
 * Check if daily digest is enabled
 */
async function isDailyDigestEnabled() {
  try {
    const db = getDb();
    const row = await db.get('SELECT value FROM config WHERE key = ?', ['notification_daily_digest']);
    return row?.value === 'true';
  } catch (error) {
    return false; // Default to disabled
  }
}

/**
 * Get daily digest time setting
 */
async function getDailyDigestTime() {
  try {
    const db = getDb();
    const row = await db.get('SELECT value FROM config WHERE key = ?', ['notification_daily_digest_time']);
    return row?.value || '08:00';
  } catch (error) {
    return '08:00';
  }
}

/**
 * Check for tasks due soon and send reminders
 */
async function checkTaskReminders() {
  try {
    // Check if in quiet hours
    if (await isQuietHours()) {
      logger.debug('In quiet hours, skipping task reminders');
      return;
    }

    // Check if task reminders are enabled
    if (!(await isTaskRemindersEnabled())) {
      logger.debug('Task reminders disabled, skipping');
      return;
    }

    const db = getDb();
    const now = new Date();
    const reminderHours = await getReminderTiming();
    const reminderWindow = new Date(now.getTime() + reminderHours * 60 * 60 * 1000);

    // Find tasks due within the reminder window that haven't been completed
    const tasks = await db.all(
      `SELECT * FROM commitments
       WHERE deadline <= ?
       AND deadline >= ?
       AND status != 'completed'
       ORDER BY deadline ASC`,
      [reminderWindow.toISOString(), now.toISOString()]
    );

    if (tasks.length === 0) {
      logger.debug('No upcoming task reminders');
      return;
    }

    logger.info(`Found ${tasks.length} tasks due within ${reminderHours} hours`);

    // Send notifications for each task
    for (const task of tasks) {
      try {
        await pushService.sendTaskReminder(task);
        logger.info(`Sent reminder for task ${task.id}: ${task.description.substring(0, 50)}`);
      } catch (error) {
        logger.error(`Failed to send reminder for task ${task.id}:`, error);
      }
    }
  } catch (error) {
    logger.error('Error checking task reminders:', error);
  }
}

/**
 * Check for overdue tasks and send notification
 */
async function checkOverdueTasks() {
  try {
    // Check if in quiet hours
    if (await isQuietHours()) {
      logger.debug('In quiet hours, skipping overdue check');
      return;
    }

    // Check if overdue alerts are enabled
    if (!(await isOverdueAlertsEnabled())) {
      logger.debug('Overdue alerts disabled, skipping');
      return;
    }

    const db = getDb();
    const now = new Date();

    // Find overdue tasks
    const count = await db.get(
      `SELECT COUNT(*) as count FROM commitments
       WHERE deadline < ?
       AND status != 'completed'`,
      [now.toISOString()]
    );

    if (count.count > 0) {
      logger.info(`Found ${count.count} overdue tasks`);
      await pushService.sendOverdueNotification(count.count);
    }
  } catch (error) {
    logger.error('Error checking overdue tasks:', error);
  }
}

/**
 * Send daily digest notification
 */
async function sendDailyDigest() {
  try {
    // Check if daily digest is enabled
    if (!(await isDailyDigestEnabled())) {
      return;
    }

    // Check if we should send now based on configured time
    const digestTime = await getDailyDigestTime();
    const [digestHour, digestMin] = digestTime.split(':').map(Number);

    const now = new Date();
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();

    // Check if we're within the digest time window (within 15 minutes)
    const currentTotalMin = currentHour * 60 + currentMin;
    const digestTotalMin = digestHour * 60 + digestMin;

    if (Math.abs(currentTotalMin - digestTotalMin) > 15) {
      return;
    }

    // Check if we already sent today
    const today = now.toDateString();
    if (lastDailyDigestDate === today) {
      return;
    }

    const db = getDb();

    // Get today's tasks
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const todaysTasks = await db.all(
      `SELECT * FROM commitments
       WHERE deadline >= ?
       AND deadline <= ?
       AND status != 'completed'
       ORDER BY deadline ASC`,
      [startOfDay.toISOString(), endOfDay.toISOString()]
    );

    const overdueTasks = await db.get(
      `SELECT COUNT(*) as count FROM commitments
       WHERE deadline < ?
       AND status != 'completed'`,
      [now.toISOString()]
    );

    const pendingTasks = await db.get(
      `SELECT COUNT(*) as count FROM commitments
       WHERE status != 'completed'`
    );

    // Build digest message
    let body = '';
    if (todaysTasks.length > 0) {
      body += `📅 ${todaysTasks.length} task${todaysTasks.length > 1 ? 's' : ''} due today`;
    }
    if (overdueTasks.count > 0) {
      body += body ? ' • ' : '';
      body += `⚠️ ${overdueTasks.count} overdue`;
    }
    if (!body && pendingTasks.count > 0) {
      body = `📋 ${pendingTasks.count} pending task${pendingTasks.count > 1 ? 's' : ''}`;
    }
    if (!body) {
      body = '✨ No tasks for today!';
    }

    const payload = {
      title: '📰 Daily Digest',
      body: body.substring(0, 110),
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'daily-digest',
      data: {
        url: '/#tasks',
        notificationTag: 'daily-digest'
      }
    };

    const result = await pushService.sendToAll(payload);

    if (result.sent > 0) {
      lastDailyDigestDate = today;
      logger.info(`Daily digest sent: ${body}`);
    }
  } catch (error) {
    logger.error('Error sending daily digest:', error);
  }
}

/**
 * Start the task scheduler
 */
function startScheduler() {
  logger.info(`Task scheduler started (checking every ${CHECK_INTERVAL / 1000 / 60} minutes)`);

  // Check immediately on start (with delay to let server initialize)
  setTimeout(() => {
    checkTaskReminders();
    checkOverdueTasks();
    sendDailyDigest();
  }, 5000);

  // Then check periodically
  setInterval(() => {
    checkTaskReminders();
    checkOverdueTasks();
    sendDailyDigest();
  }, CHECK_INTERVAL);
}

module.exports = {
  startScheduler,
  checkTaskReminders,
  checkOverdueTasks,
  sendDailyDigest,
  isQuietHours
};
