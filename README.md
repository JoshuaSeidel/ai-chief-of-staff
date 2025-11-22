# AI Chief of Staff

An intelligent executive assistant that automates personal productivity by ingesting meeting transcripts and using Claude AI to generate actionable daily briefs, track commitments, and maintain rolling context.

## Features

### Core Functionality
- 📊 **Smart Dashboard**: AI-generated priorities, patterns, and insights
- 📝 **Transcript Processing**: Upload transcripts (file or paste) with automatic AI extraction
- 🤖 **Claude AI Integration**: Extracts tasks, actions, follow-ups, and risks
- 💾 **Dual Database Support**: SQLite or PostgreSQL with unified interface
- ⚙️ **Configuration UI**: Easy setup for API keys, prompts, and integrations
- 🐳 **Docker Deployment**: Single container, works on Unraid or any Docker host

### Task Management
- 📋 **Unified Task System**: Commitments, Actions, Follow-ups, Risks in one view
- 🎨 **Visual Organization**: Color-coded badges and type-based filtering
- ⏰ **Smart Deadlines**: AI assigns intelligent deadlines (default 2 weeks)
- 📊 **Task Analytics**: Stats by type and status
- ✅ **Status Tracking**: Mark complete, view overdue, filter by status

### Calendar Integration
- 📅 **Google Calendar**: Full OAuth integration with event creation
- 🔄 **Two-Way Sync**: Events from calendar, create events for tasks
- 📝 **Rich Descriptions**: AI-generated 3-5 paragraph event details
- 🔔 **Smart Event Titles**: Task type emojis and descriptive titles
- 🗑️ **Auto Cleanup**: Deletes old events when reprocessing transcripts

### AI Customization
- 🎛️ **Editable Prompts**: Customize all AI prompts via UI
- 🔄 **Live Updates**: Changes apply immediately (no restart needed)
- 📋 **Template System**: Use variables like {{transcriptText}}, {{taskType}}
- 🔙 **Reset to Default**: Restore original prompts anytime

### Progressive Web App
- 📱 **Installable**: Add to home screen on iOS/Android/Desktop
- 🌐 **Offline Support**: Works without internet connection
- 🔔 **Push Notifications**: Task reminders and overdue alerts
- 📲 **Background Sync**: Offline tasks sync when online
- 🚀 **Fast Loading**: Service worker caching for instant load

### Notifications & Reminders
- ⏰ **Task Reminders**: Notifications 24 hours before deadline
- ⚠️ **Overdue Alerts**: Daily summary of overdue tasks
- 📅 **Event Reminders**: Upcoming calendar event notifications
- 🔄 **Auto Scheduling**: Checks every 30 minutes
- ✅ **Sync Alerts**: Success notifications for offline task sync

### Weekly Reports
- 📊 **Executive Summaries**: AI-generated weekly reports
- 📈 **Progress Tracking**: What shipped, what's at risk
- 🎯 **Next Week Focus**: Priorities and commitments
- 📋 **All Task Types**: Includes commitments, actions, follow-ups, risks

## Tech Stack

- **Frontend**: React 18 with modern hooks
- **Backend**: Node.js with Express
- **Database**: SQLite for storing context
- **AI**: Anthropic Claude API (claude-3-5-sonnet)
- **Deployment**: Single all-in-one Docker container

## Prerequisites

- Docker (for production deployment)
- Anthropic API key from [console.anthropic.com](https://console.anthropic.com/) - configured in UI after installation
- (Optional) PostgreSQL database if you don't want to use SQLite
- (Optional) Node.js 18+ and npm (for local development)

## Unraid Installation

### Method 1: Docker Hub (Easiest)

1. Open Unraid WebUI and go to the **Docker** tab
2. Click **Add Container**
3. Fill in the following:

**Container Settings:**
- **Name**: `ai-chief-of-staff`
- **Repository**: `ghcr.io/joshuaseidel/plaud-ai-chief-of-staff:latest`
- **Network Type**: `bridge`

**Port Mapping:**
- **Container Port**: `3001` → **Host Port**: `3001`

**Volume Mappings:**
- **Container Path**: `/app/data` → **Host Path**: `/mnt/user/appdata/ai-chief-of-staff/data`
- **Container Path**: `/app/uploads` → **Host Path**: `/mnt/user/appdata/ai-chief-of-staff/uploads`

**Environment Variables (Optional):**
- **Variable**: `NODE_ENV` → **Value**: `production`
- **Variable**: `PORT` → **Value**: `3001`

**Note:** All API keys and database credentials are configured through the web UI at Settings page after first launch.

4. Click **Apply** to start the container
5. Access at `http://YOUR-UNRAID-IP:3001`

### Method 2: SWAG Reverse Proxy (Recommended for External Access)

For secure external access with SSL (e.g., `https://aicos.yourdomain.com`):

1. Install **SWAG** (Secure Web Application Gateway) from Community Applications
2. Copy the SWAG config file:
   ```bash
   cp swag-config/aicos.subdomain.conf /mnt/user/appdata/swag/nginx/proxy-confs/
   ```
3. Update DNS: Create CNAME `aicos.yourdomain.com` → Your server IP
4. Add both containers to the same Docker network (or use bridge)
5. Restart SWAG container

**Result:** Access your app at `https://aicos.yourdomain.com` with automatic SSL!

📖 See detailed setup guide: [swag-config/README.md](swag-config/README.md)

### Method 3: Unraid Template (Coming Soon)

A Community Applications template will be available for one-click installation.

### Method 4: Docker Run Command

SSH into your Unraid server and run:

```bash
docker run -d \
  --name=ai-chief-of-staff \
  -p 3001:3001 \
  -v /mnt/user/appdata/ai-chief-of-staff/data:/app/data \
  -v /mnt/user/appdata/ai-chief-of-staff/uploads:/app/uploads \
  --restart=unless-stopped \
  ghcr.io/joshuaseidel/plaud-ai-chief-of-staff:latest
```

## Configuration

After starting the container:

1. Navigate to `http://YOUR-IP:3001`
2. Click on the **Configuration** tab
3. Configure the following:

### Required Configuration
- **Anthropic API Key**: Get from [console.anthropic.com](https://console.anthropic.com/)
- **Claude Model**: Select the model (default: Claude Sonnet 4.5)

### Optional Configuration
- **Plaud API**: For automatic transcript pulling
- **Google Calendar**: OAuth integration for automatic event creation (recommended)
- **iCloud Calendar**: Read-only calendar viewing (alternative to Google Calendar)
- **Database**: Switch from SQLite to PostgreSQL
- **Push Notifications**: Enable task reminders and alerts
- **AI Prompts**: Customize AI behavior via the Prompts tab

### Database Configuration

The app stores all configuration in `/app/data/config.json` and uses it at startup. You have two database options:

#### SQLite (Default)
- Zero configuration required
- Database stored in `/app/data/ai-chief-of-staff.db`
- Perfect for single-user deployments

#### PostgreSQL
- For multi-user or high-volume deployments
- Configure in the Settings page:
  - PostgreSQL Host
  - Port (default: 5432)
  - Database Name
  - Username
  - Password
- The app will automatically:
  - Create the database if it doesn't exist
  - Create all tables
  - Migrate data from SQLite when you switch

**To switch databases:**
1. Go to Configuration page
2. Select "PostgreSQL" as Database Type
3. Enter your PostgreSQL connection details
4. Click Save
5. Restart the container - data will be migrated automatically

**Note:** All credentials are stored in `/app/data/config.json` which persists across container restarts when `/app/data` is mounted to a host volume.

## Docker Installation (Other Platforms)

```bash
docker run -d \
  --name=ai-chief-of-staff \
  -p 3001:3001 \
  -v ai-chief-data:/app/data \
  -v ai-chief-uploads:/app/uploads \
  --restart=unless-stopped \
  ghcr.io/joshuaseidel/plaud-ai-chief-of-staff:latest
```

Access at: http://localhost:3001

**After installation, configure through the web UI:**
1. Open http://localhost:3001
2. Go to Configuration tab
3. Enter your Anthropic API key
4. Configure optional integrations (Plaud, iCloud Calendar, PostgreSQL)

## Local Development

### Development with Docker Compose

```bash
# Clone the repository
git clone git@github.com:JoshuaSeidel/plaud-ai-chief-of-staff.git
cd plaud-ai-chief-of-staff

# Copy and configure environment
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# Start with docker-compose (for local testing)
docker-compose up -d
```

### Development without Docker

**Backend:**
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your API key
npm run dev
```

**Frontend:**
```bash
cd frontend
npm install
npm start
```

## Configuration

All configuration is done through the web UI Configuration tab:

### AI Configuration
- **Anthropic API Key** (Required): Get from https://console.anthropic.com/
- **Claude Model**: Choose from Claude Sonnet 4.5 (latest), Sonnet 4, 3.5 Sonnet, or 3 Opus

### Integrations (Optional)

#### Google Calendar Integration (Recommended)

Automatically create calendar events for commitments with deadlines:

1. **Get Google OAuth Credentials:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   - Create a new project or select an existing one
   - Enable the **Google Calendar API**:
     - Search for "Google Calendar API" in the API Library
     - Click **Enable**
   - Create **OAuth 2.0 Client ID**:
     - Go to **Credentials** → **Create Credentials** → **OAuth client ID**
     - Application type: **Web application**
     - Name: `AI Chief of Staff`
     - **Authorized redirect URIs**: Add `http://YOUR-IP:3001/api/calendar/google/callback`
       - For local dev: `http://localhost:3001/api/calendar/google/callback`
       - For production: Replace `YOUR-IP` with your server's IP or domain
   - Copy the **Client ID** and **Client Secret**

2. **Configure in the App:**
   - Open the Configuration tab
   - Scroll to "Calendar Integration"
   - Paste your **Google Client ID** and **Client Secret**
   - Click **Save Configuration**
   - Click **Connect Google Calendar** button
   - Authorize the app in the Google OAuth flow
   - ✅ Done! Commitments with deadlines will now automatically create calendar events

**Features:**
- Auto-creates calendar events for all extracted commitments with deadlines
- Events include deadline, suggested approach, and urgency
- Syncs across all your devices
- One-click disconnect in settings

**Environment Variables (Optional):**
If running in Docker, you can also set:
```
GOOGLE_REDIRECT_URI=http://YOUR-IP:3001/api/calendar/google/callback
```

#### Plaud API Integration
- **Plaud API**: Automatic transcript pulling from Plaud
- **iCloud Calendar**: Calendar integration for event context

### Database
- **SQLite** (Default): No setup required, uses local file storage
- **PostgreSQL**: Configure host, port, database name, and credentials for external database

### Environment Variables (Optional)
- **NODE_ENV**: Environment mode (default: production)
- **PORT**: Port to run on (default: 3001)
- **DB_TYPE**: `sqlite` or `postgres` (can also be set in UI)

## How to Use

1. **Access the Application**: Open `http://YOUR-IP:3001` in your browser

2. **Initial Configuration**: 
   - Go to Configuration tab
   - Enter your Anthropic API key (required)
   - Select Claude model (default: Claude Sonnet 4.5)
   - Configure optional integrations:
     - Plaud API for automatic transcript pulling
     - iCloud Calendar for calendar integration
     - PostgreSQL if you don't want to use SQLite
   - Click Save Configuration

3. **Upload Transcripts**:
   - Go to Transcripts tab
   - Upload meeting transcripts (.txt, .doc, .docx, .pdf)
   - System automatically extracts commitments and action items

4. **Generate Daily Brief**:
   - Go to Dashboard tab
   - Click "Generate Brief"
   - Get your top 3 priorities, deliverables, and commitments in 10 seconds

## Updating

### Unraid

1. Go to Docker tab
2. Click the container name
3. Click **Force Update**
4. Apply changes

### Docker Command Line

```bash
docker pull ghcr.io/joshuaseidel/plaud-ai-chief-of-staff:latest
docker stop ai-chief-of-staff
docker rm ai-chief-of-staff
# Run the docker run command again (see installation section)
```

## Backup

Your data is stored in two locations:

- `/app/data` - SQLite database
- `/app/uploads` - Uploaded transcripts

**Backup on Unraid:**
```bash
tar -czf ai-chief-backup-$(date +%Y%m%d).tar.gz \
  /mnt/user/appdata/ai-chief-of-staff/data \
  /mnt/user/appdata/ai-chief-of-staff/uploads
```

**Restore:**
```bash
tar -xzf ai-chief-backup-YYYYMMDD.tar.gz -C /mnt/user/appdata/
```

## Push Notifications Setup

Enable task reminders and overdue alerts on your devices.

### 1. Generate VAPID Keys

VAPID keys are required for web push notifications. Generate them once:

```bash
docker exec -it ai-chief-of-staff npx web-push generate-vapid-keys
```

This will output:
```
=======================================
Public Key:
BNxW...your-public-key...xyz

Private Key:
AbC...your-private-key...123
=======================================
```

### 2. Configure Environment Variables

Add these to your container's environment variables:

```bash
VAPID_PUBLIC_KEY=your-public-key-from-above
VAPID_PRIVATE_KEY=your-private-key-from-above
VAPID_SUBJECT=mailto:your-email@example.com
```

**Unraid:**
1. Stop the container
2. Edit container settings
3. Add the three environment variables above
4. Start the container

**Docker Compose:**
Add to `environment:` section in `docker-compose.yml`

### 3. Enable Notifications in Browser

1. Open the app in your browser
2. Grant notification permission when prompted
3. App will automatically subscribe to push notifications

### 4. Test Notifications

Send a test notification:
```bash
curl -X POST http://YOUR-IP:3001/api/notifications/test
```

### Notification Types

The app sends these automated notifications:

- **📋 Task Reminders**: 24 hours before deadline
- **⚠️ Overdue Alerts**: Daily summary of overdue tasks
- **📅 Event Reminders**: Before calendar events (future)
- **✅ Sync Success**: When offline tasks sync

### Scheduler

The task scheduler runs automatically and checks:
- Every **30 minutes** for upcoming tasks
- Tasks due within **24 hours**
- Overdue tasks

No configuration needed - starts with the server.

### Mobile Installation

For push notifications on mobile:

**iOS (Safari):**
1. Open app in Safari
2. Tap Share → "Add to Home Screen"
3. Grant notification permission when prompted

**Android (Chrome):**
1. Open app in Chrome
2. Tap menu → "Install app"
3. Grant notification permission when prompted

### Troubleshooting Notifications

**Notifications not working?**
1. Check VAPID keys are set correctly
2. Verify browser supports push (Chrome, Firefox, Edge, Safari 16+)
3. Check notification permission in browser settings
4. Look for errors in browser console
5. Verify task scheduler is running (check server logs)

**Check subscription status:**
```bash
# Check database for subscriptions
docker exec -it ai-chief-of-staff sqlite3 /app/data/ai-chief-of-staff.db "SELECT * FROM push_subscriptions;"
```

## Offline Mode & Background Sync

The app works offline and syncs when connection is restored.

### How It Works

1. **Offline Detection**: App detects when internet is unavailable
2. **Local Storage**: Tasks created offline are saved to IndexedDB
3. **Background Sync**: When connection restored, tasks sync automatically
4. **Success Notification**: You're notified when sync completes

### Creating Tasks Offline

All task creation features work offline:
- Upload transcripts (saved locally until online)
- Manual task creation (future feature)
- Task updates and completions

### Monitoring Offline Status

- Connection status visible in app (future)
- Offline tasks viewable in Tasks page (future)
- Success notification when tasks sync

### Manual Sync Trigger

If auto-sync fails, manually trigger:
```javascript
// In browser console
navigator.serviceWorker.ready.then(reg => reg.sync.register('sync-tasks'));
```

## Customizing AI Prompts

All AI prompts are editable via the **🤖 AI Prompts** tab.

### Available Prompts

1. **Task Extraction**: Extracts commitments, actions, follow-ups, risks from transcripts
2. **Calendar Event Description**: Generates detailed event descriptions
3. **Weekly Report**: Creates executive summaries

### Editing Prompts

1. Open the **AI Prompts** tab
2. Select prompt to edit
3. Modify text in the editor
4. Use template variables: `{{transcriptText}}`, `{{taskType}}`, etc.
5. Click **Save Changes**
6. Test with new transcript upload

### Template Variables

Available in prompts:

- `{{transcriptText}}` - Full meeting transcript
- `{{dateContext}}` - Meeting date information
- `{{taskType}}` - Type of task (commitment, action, etc.)
- `{{description}}` - Task description
- `{{assignee}}` - Person assigned
- `{{priority}}` - Task priority/urgency
- `{{weekData}}` - Weekly summary data

### Reset to Defaults

If you want to restore original prompts:
1. Select the prompt
2. Click **Reset to Default**
3. Confirm

### Tips for Custom Prompts

- Be specific about output format (JSON structure)
- Include examples for better results
- Test with sample transcripts
- Use template variables for dynamic content
- Changes apply immediately (no restart)

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker logs ai-chief-of-staff

# Common issues:
# - Port 3001 already in use
# - Missing ANTHROPIC_API_KEY environment variable
# - Volume permission issues
```

### Cannot Access Web Interface

- Verify container is running: `docker ps | grep ai-chief`
- Check port is accessible: `curl http://localhost:3001/api/health`
- Verify firewall settings on your server

### API Key Issues

- Get key from https://console.anthropic.com/
- Key should start with `sk-ant-`
- Configure in the Configuration tab, not as environment variable
- If brief generation fails, verify API key is correctly entered

### Database Not Connecting / Configuration Not Persisting

If your database configuration keeps resetting or PostgreSQL won't connect:

```bash
# 1. Check current database configuration
docker exec ai-chief-of-staff node /app/check-db-config.js

# 2. View the startup logs to see what database is being used
docker logs ai-chief-of-staff | grep -A 20 "DATABASE INITIALIZATION"

# 3. Verify the config file exists and is correct
docker exec ai-chief-of-staff cat /app/data/config.json

# 4. If config is being lost, check volume mounting
docker inspect ai-chief-of-staff | grep -A 10 Mounts
# Should show: /app/data mounted to host path
```

**Common Issues:**
- **Config keeps resetting**: Volume mount may not be properly configured. Ensure `/app/data` is mounted to a persistent host path.
- **PostgreSQL won't connect**: 
  - Verify PostgreSQL server is accessible from the container
  - Check host uses the correct hostname (use `host.docker.internal` for localhost on Mac/Windows)
  - Verify credentials in `/app/data/config.json`
  - Check logs for specific connection errors
- **Falls back to SQLite**: If PostgreSQL connection fails, the app automatically falls back to SQLite. Check logs for the error message.

**To manually set PostgreSQL configuration:**
```bash
# Edit the config file directly in the container
docker exec -it ai-chief-of-staff vi /app/data/config.json

# Or edit it on the Unraid host (recommended)
# Stop the container first
docker stop ai-chief-of-staff
# Edit the file on the host at the mapped path:
# /mnt/user/appdata/ai-chief-of-staff/data/config.json
# Then restart
docker start ai-chief-of-staff
```

**Example config.json for PostgreSQL:**
```json
{
  "dbType": "postgres",
  "postgres": {
    "host": "192.168.1.100",
    "port": 5432,
    "database": "ai_chief_of_staff",
    "user": "postgres",
    "password": "your_password"
  },
  "anthropicApiKey": "sk-ant-...",
  "claudeModel": "claude-sonnet-4.5"
}
```

### Reset Database

```bash
# Stop container
docker stop ai-chief-of-staff

# Remove database file (SQLite)
rm /mnt/user/appdata/ai-chief-of-staff/ai-chief-of-staff.db

# Remove entire config (starts fresh)
rm /mnt/user/appdata/ai-chief-of-staff/config.json

# Restart container
docker start ai-chief-of-staff
```

## Roadmap

- [x] Email forwarding webhook for automatic email ingestion
- [x] Commitment tracking with overdue notifications
- [x] Weekly report generator
- [x] Pattern detection across meetings
- [x] Risk flagging for unaddressed items
- [ ] Mobile app
- [ ] Slack integration
- [ ] Teams integration for automatic transcript pulling

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

**AI Chief of Staff - Custom Proprietary License**

Copyright © 2025 Joshua Seidel. All Rights Reserved.

**Permitted:**
- ✅ Use for personal, educational, or commercial purposes
- ✅ Deploy on your own infrastructure
- ✅ View and study the source code
- ✅ Submit bug reports and feature requests

**Not Permitted Without Permission:**
- ❌ Modify or create derivative works
- ❌ Distribute modified versions
- ❌ Fork for competing products
- ❌ Remove copyright notices

**To Request Permission:**
- Email: me@joshuaseidel.com
- Include detailed description of intended use
- Response within 30 days

See [LICENSE](LICENSE) file for complete terms and conditions.

## Support

For issues or questions, please open an issue on [GitHub](https://github.com/JoshuaSeidel/plaud-ai-chief-of-staff).

**Author:** Joshua Seidel  
**Email:** me@joshuaseidel.com

---

**Built with ❤️ for productivity**
