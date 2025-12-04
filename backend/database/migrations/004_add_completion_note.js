/**
 * Migration: Add completion_note field to commitments table
 * 
 * This allows users to add a note when marking tasks complete,
 * which will be synced to Jira/Microsoft Planner as a closing comment.
 */

module.exports = {
  up: async (db) => {
    console.log('Running migration: Add completion_note to commitments table');
    
    // SQLite
    if (db.run) {
      await new Promise((resolve, reject) => {
        db.run(
          `ALTER TABLE commitments ADD COLUMN completion_note TEXT`,
          (err) => {
            if (err && !err.message.includes('duplicate column')) {
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });
    }
    // PostgreSQL
    else if (db.query) {
      try {
        await db.query(`
          ALTER TABLE commitments 
          ADD COLUMN IF NOT EXISTS completion_note TEXT
        `);
      } catch (err) {
        if (!err.message.includes('already exists')) {
          throw err;
        }
      }
    }
    
    console.log('✓ Added completion_note column to commitments table');
  },
  
  down: async (db) => {
    console.log('Rolling back: Remove completion_note from commitments table');
    
    // SQLite doesn't support DROP COLUMN easily, so we skip rollback
    // PostgreSQL
    if (db.query) {
      await db.query(`
        ALTER TABLE commitments 
        DROP COLUMN IF EXISTS completion_note
      `);
    }
    
    console.log('✓ Removed completion_note column from commitments table');
  }
};
