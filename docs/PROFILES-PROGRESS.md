# Profiles Implementation Progress

## Phase 1: Profiles System (In Progress)

### ✅ Completed (Backend Infrastructure)

1. **Database Schema**
   - ✅ Created `profiles` table with default Personal and Work profiles
   - ✅ Created `profile_integrations` table for per-profile calendar/task integrations
   - ✅ Created `profile_calendar_events` table for tracking calendar syncs
   - ✅ Created `profile_task_integrations` table for tracking task system syncs
   - ✅ Added `profile_id` column to 14 existing tables
   - ✅ Created 13 indexes for query performance
   - ✅ Migration 002 supports both SQLite and PostgreSQL

2. **Backend API**
   - ✅ Profile context middleware (`profileContext`) - extracts profile_id from requests
   - ✅ Profile CRUD endpoints:
     - `GET /api/profiles` - List all profiles
     - `GET /api/profiles/:id` - Get profile with stats
     - `POST /api/profiles` - Create new profile (with copy-from option)
     - `PUT /api/profiles/:id` - Update profile
     - `DELETE /api/profiles/:id` - Delete profile (with data migration)
     - `POST /api/profiles/:id/set-default` - Set default profile
     - `POST /api/profiles/:id/reorder` - Update display order
   - ✅ Added cookie-parser dependency
   - ✅ Registered routes in server.js

3. **Answered Design Questions**
   - ✅ #3 OAuth: Use state parameter with profileId (stateless, secure)
   - ✅ #4 Multiple integrations: Yes, multiple calendars AND multiple task systems per profile
   - ✅ #5 Calendar event tagging: Yes, implement
   - ✅ #6 Cross-profile syncing: Yes, good idea
   - ✅ #7 Integration inheritance: Yes, copy from existing option

---

## 🚧 Next Steps (Backend Query Updates)

### Priority 1: Update All Queries to Filter by profile_id

Need to update approximately 50+ queries across these files:

1. **backend/routes/brief.js** (~10 queries)
   - Line 32: `SELECT * FROM context` → Add `WHERE profile_id = ?`
   - Line 38: `SELECT * FROM commitments` → Add `WHERE profile_id = ?`
   - Line 44: `SELECT * FROM transcripts` → Add `WHERE profile_id = ?`
   - And more...

2. **backend/routes/transcripts.js** (~15 queries)
   - Line 450: `SELECT ... FROM transcripts` → Add `WHERE profile_id = ?`
   - Line 475: `SELECT * FROM transcripts WHERE id = ?` → Add `AND profile_id = ?`
   - And more...

3. **backend/routes/commitments.js** (~8 queries)
   - Line 20: `SELECT * FROM commitments` → Add `WHERE profile_id = ?`
   - And more...

4. **backend/routes/intelligence.js** (~12 queries)
   - Update all task_intelligence, user_patterns, goals queries

5. **backend/routes/planner.js** (~5 queries)
   - Update Microsoft Planner integration queries

6. **backend/routes/calendar.js** (~8 queries)
   - Update calendar sync queries

### Priority 2: Frontend Components

1. **Profile Selector Component**
   - Dropdown in top navigation
   - Show current profile with icon/color
   - List all profiles
   - "Create New Profile" option
   - Store selection in localStorage

2. **Profile Management Page**
   - List all profiles with stats
   - Create/Edit/Delete operations
   - Set default profile
   - Drag-and-drop reordering
   - Integration status display

3. **Profile Creation Modal**
   - Name, description, color picker, icon selector
   - "Copy integrations from" dropdown
   - Preview of what will be copied

4. **Update API Service**
   - Add profileId to all API calls via header
   - Create profileAPI service methods
   - Handle profile switching (re-fetch all data)

### Priority 3: Integration Migration

1. **Migrate Existing Global Integrations**
   - Move Google Calendar config from `config` table to `profile_integrations`
   - Move Microsoft Calendar config
   - Move Jira config
   - Move Trello config
   - Move Monday.com config
   - Associate all with default profile (Personal = ID 1)

2. **Update Integration Services**
   - Refactor calendar services to accept profile_id
   - Refactor task integration services
   - Update OAuth callbacks to include profile context

### Priority 4: Testing & Polish

1. **Backend Tests**
   - Test profile CRUD operations
   - Test profile_id filtering in queries
   - Test data isolation between profiles
   - Test profile deletion with data migration

2. **Frontend Tests**
   - Test profile switching
   - Test profile creation/editing
   - Test that data refreshes on profile change

3. **Migration Testing**
   - Test existing data defaults to profile 1
   - Test integration migration from config table

---

## Implementation Estimates

| Task | Estimated Time |
|------|----------------|
| ✅ Backend infrastructure | ~8 hours (DONE) |
| Backend query updates | ~8-12 hours |
| Frontend profile selector | ~4-6 hours |
| Frontend profile management | ~6-8 hours |
| Integration migration | ~6-8 hours |
| Testing & polish | ~8-12 hours |
| **Total Remaining** | **~32-46 hours** |

---

## Key Files Modified So Far

```
backend/
├── database/
│   ├── db.js (added migration runner)
│   └── migrations/
│       └── 002_add_profiles.js (NEW - 450 lines)
├── middleware/
│   └── profile-context.js (NEW - 70 lines)
├── routes/
│   └── profiles.js (NEW - 280 lines)
├── server.js (added middleware and routes)
└── package.json (added cookie-parser)
```

---

## Design Decisions Made

1. **Profile-Specific Integrations**: Each profile can connect to different calendars/task systems
2. **OAuth State Parameter**: Use state parameter for profile context during OAuth flows
3. **Multiple Integrations**: Support multiple calendars AND multiple task systems per profile
4. **Data Migration**: When deleting profile, move data to another profile (no orphans)
5. **Default Profile**: One profile marked as default for new sessions
6. **Copy Integrations**: New profiles can copy integration settings from existing profiles

---

## Next Immediate Action

Choose one:
1. **Continue with query updates** - Update all database queries to filter by profile_id
2. **Start frontend work** - Build profile selector and management UI
3. **Run migration test** - Test the migration on your Unraid deployment

Which would you like to tackle next?
