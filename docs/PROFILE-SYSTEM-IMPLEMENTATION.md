# Profile System Implementation

## Overview
The profile system enables users to separate work and personal contexts within a single AI Chief of Staff instance. All data (transcripts, briefs, commitments, calendar events) is isolated by profile.

## Implementation Summary

### Backend (9 commits)
1. **Infrastructure** (`9d29cc5`)
   - Added `profiles` table with columns: id, name, description, icon, color, is_default, display_order
   - Created 2 default profiles: Personal (ID=1) and Work (ID=2, default)
   - Added profile_id columns to all data tables: transcripts, briefs, commitments, calendar_blocks, etc.
   - Created backend routes: GET /api/profiles, POST, PUT, DELETE endpoints
   - Implemented profile middleware that extracts profile_id from header/query/cookie (defaults to 2)

2. **Route Updates** (7 commits)
   - Updated 85+ database queries across all routes to filter by profile_id:
     - `commitments.js` - All commitment queries
     - `transcripts.js` - Upload and retrieval
     - `brief.js` - Brief generation and history
     - `intelligence.js` - Task intelligence filtering
     - `planner.js` - Task queries
     - `webhook.js` - External webhooks

3. **Migration Fix** (`ea9a085`)
   - Changed default profile from Personal (1) to Work (2)
   - Existing system data represents work context

### Frontend (1 commit: `82baf35`)

#### New Files Created
1. **`frontend/src/services/profileService.js`** (75 lines)
   - API wrapper for profile endpoints (getAll, getById, create, update, delete, setDefault, reorder)
   - localStorage persistence: getCurrentProfileId(), setCurrentProfileId()
   - Cookie management for server-side middleware
   - Axios header injection: addProfileHeader(profileId) adds X-Profile-Id to all requests

2. **`frontend/src/contexts/ProfileContext.jsx`** (135 lines)
   - React Context for global profile state
   - Provides: currentProfile, profiles array, loading state
   - Operations: switchProfile, createProfile, updateProfile, deleteProfile, setDefaultProfile
   - Page reload on profile switch ensures all components refresh with new context

3. **`frontend/src/components/ProfileSelector.jsx`** (85 lines)
   - Header dropdown button showing current profile icon and name
   - Dropdown menu listing all profiles with descriptions
   - Visual indicators: active profile highlighted, default badge
   - Click handler calls switchProfile() triggering page reload

4. **`frontend/src/components/ProfileManagement.jsx`** (258 lines)
   - Full CRUD interface in Settings tab
   - Create/edit form with:
     - Text inputs: name, description
     - Icon picker: 8 options (💼, 🏠, 📚, 🎯, 💡, 🚀, 🎨, 🌟)
     - Color picker: 8 options (blue, purple, green, orange, pink, red, yellow, teal)
   - Profile cards showing all profiles with Edit/Delete/Set Default actions
   - Delete confirmation modal with data migration dropdown
   - Reorder profiles with drag handles

#### Files Modified
1. **`frontend/src/services/api.js`**
   - Added profilesAPI object with 7 endpoints

2. **`frontend/src/App.jsx`**
   - Wrapped app with `<ProfileProvider>`
   - Added `<ProfileSelector />` in header

3. **`frontend/src/components/Configuration.jsx`**
   - Added `<ProfileManagement />` as first card in Settings

4. **`frontend/src/index.css`**
   - Added 250+ lines of CSS for profile components
   - Styles: .profile-selector, .profile-dropdown, .profile-management, .profile-card, .profile-form, .icon-picker, .color-picker
   - Mobile-responsive: profile name hidden on mobile, icon-only selector

## Data Flow

### Profile Selection
1. User clicks profile dropdown in header
2. Selects different profile
3. `switchProfile(profileId)` called from context
4. Updates localStorage: `currentProfileId`
5. Updates cookie: `currentProfileId` (1 year expiry)
6. Calls `window.location.reload()` to refresh all components
7. ProfileContext re-initializes with new profile
8. All API calls include `X-Profile-Id` header via axios interceptor

### Profile Isolation
- Backend middleware extracts profile_id from header/query/cookie
- All queries filter by: `WHERE profile_id = ?`
- Transcripts uploaded to Work profile invisible in Personal profile
- Briefs generated per-profile based on that profile's transcripts
- Calendar blocks, commitments, notifications all isolated

## Default Behavior
- New users: Work profile (ID=2) is default
- Existing installations: All data migrated to Work profile
- Missing profile_id in request: Defaults to 2 (Work)

## Database Schema

### Profiles Table
```sql
CREATE TABLE profiles (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT '💼',
  color TEXT DEFAULT '#3b82f6',
  is_default INTEGER DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Data Tables (profile_id column added)
- transcripts (profile_id INTEGER DEFAULT 2)
- briefs (profile_id INTEGER DEFAULT 2)
- commitments (profile_id INTEGER DEFAULT 2)
- calendar_blocks (profile_id INTEGER DEFAULT 2)
- context_data (profile_id INTEGER DEFAULT 2)
- notifications (profile_id INTEGER DEFAULT 2)
- tasks (profile_id INTEGER DEFAULT 2)

## API Endpoints

### Profile Management
- `GET /api/profiles` - List all profiles
- `GET /api/profiles/:id` - Get single profile
- `POST /api/profiles` - Create new profile
- `PUT /api/profiles/:id` - Update profile
- `DELETE /api/profiles/:id` - Delete profile (requires target_profile_id for data migration)
- `PUT /api/profiles/:id/default` - Set as default profile
- `PUT /api/profiles/reorder` - Update display order

### Profile Selection
- All endpoints accept profile_id via:
  - Header: `X-Profile-Id`
  - Query param: `?profile_id=2`
  - Cookie: `currentProfileId`
- Fallback: profile_id=2 (Work)

## Testing Checklist

### Backend
- [ ] GET /api/profiles returns both profiles
- [ ] POST /api/profiles creates new profile
- [ ] DELETE /api/profiles/:id migrates data correctly
- [ ] Middleware extracts profile_id from header
- [ ] Queries filter by profile_id correctly

### Frontend
- [ ] Profile selector shows in header
- [ ] Clicking selector shows dropdown with all profiles
- [ ] Switching profiles reloads page
- [ ] localStorage persists selected profile across sessions
- [ ] ProfileManagement shows in Settings tab
- [ ] Can create new profile with icon and color
- [ ] Can edit existing profile
- [ ] Can delete profile with data migration
- [ ] Can set default profile

### Integration
- [ ] Upload transcript to Work profile
- [ ] Switch to Personal profile
- [ ] Verify transcript not visible
- [ ] Switch back to Work profile
- [ ] Verify transcript appears
- [ ] Generate brief in Work profile
- [ ] Switch to Personal profile
- [ ] Verify brief not visible
- [ ] All API calls include X-Profile-Id header

## Branch Status
- Branch: `feature/profiles`
- Commits: 9 total (8 backend + 1 frontend)
- Ready to merge: Yes
- Conflicts expected: None (new feature)

## Next Steps
1. Manual testing on development environment
2. Test profile switching workflow
3. Test data isolation between profiles
4. Test CRUD operations in Settings
5. Merge feature/profiles → main
6. Deploy to production
7. Update user documentation
