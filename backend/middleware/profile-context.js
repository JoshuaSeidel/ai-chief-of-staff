/**
 * Profile Context Middleware
 * 
 * Extracts and validates the current profile_id from requests.
 * Attaches req.profileId for use in route handlers.
 */

const { createModuleLogger } = require('../utils/logger');
const { getDb } = require('../database/db');

const logger = createModuleLogger('PROFILE-CONTEXT');

/**
 * Extract profile ID from request
 * Priority: header > query > cookie > default
 */
async function profileContext(req, res, next) {
  try {
    const db = getDb();
    
    // Extract profile_id from multiple sources (header > query > cookie)
    // Default to 2 (Work) as existing system is work-focused
    let profileId = parseInt(
      req.headers['x-profile-id'] || 
      req.query.profile_id || 
      req.cookies?.currentProfileId ||
      '2' // Default to Work profile
    );

    // Validate that profile exists
    const profile = await db.get(
      'SELECT id, name, is_default FROM profiles WHERE id = ?',
      [profileId]
    );

    if (!profile) {
      logger.warn(`Invalid profile ID ${profileId}, falling back to default`);
      
      // Get default profile
      const defaultProfile = await db.get(
        'SELECT id FROM profiles WHERE is_default = ? LIMIT 1',
        [true]
      );
      
      req.profileId = defaultProfile ? defaultProfile.id : 2;
    } else {
      req.profileId = profileId;
    }

    // Add profile info to request for logging/debugging
    req.profileName = profile?.name || 'Personal';
    
    next();
  } catch (err) {
    logger.error('Error in profile context middleware:', err);
    // Default to profile 1 on error
    req.profileId = 1;
    req.profileName = 'Personal';
    next();
  }
}

/**
 * Optional: Require specific profile (for admin/debugging endpoints)
 */
function requireProfile(profileId) {
  return (req, res, next) => {
    if (req.profileId !== profileId) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: `This endpoint requires profile ${profileId}` 
      });
    }
    next();
  };
}

module.exports = {
  profileContext,
  requireProfile
};
