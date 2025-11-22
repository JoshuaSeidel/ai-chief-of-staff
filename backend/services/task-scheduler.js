const { getDb } = require('../database/db');
const pushService = require('./push-notifications');
const { createModuleLogger } = require('../utils/logger');

const logger = createModuleLogger('TASK-SCHEDULER');

// Check for reminders every 30 minutes
const CHECK_INTERVAL = 30 * 60 * 1000;

/**
 * Check for tasks due soon and send reminders
 */
async function checkTaskReminders() {
  try {
    const db = getDb();
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    // Find tasks due within 24 hours that haven't been completed
    const tasks = await db.all(
      `SELECT * FROM commitments 
       WHERE deadline <= ? 
       AND deadline >= ? 
       AND status != 'completed'
       ORDER BY deadline ASC`,
      [tomorrow.toISOString(), now.toISOString()]
    );
    
    if (tasks.length === 0) {
      logger.info('No upcoming task reminders');
      return;
    }
    
    logger.info(`Found ${tasks.length} tasks due within 24 hours`);
    
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
 * Start the task scheduler
 */
function startScheduler() {
  logger.info(`Task scheduler started (checking every ${CHECK_INTERVAL / 1000 / 60} minutes)`);
  
  // Check immediately on start
  setTimeout(() => {
    checkTaskReminders();
    checkOverdueTasks();
  }, 5000); // Wait 5 seconds after server start
  
  // Then check periodically
  setInterval(() => {
    checkTaskReminders();
    checkOverdueTasks();
  }, CHECK_INTERVAL);
}

module.exports = {
  startScheduler,
  checkTaskReminders,
  checkOverdueTasks
};

