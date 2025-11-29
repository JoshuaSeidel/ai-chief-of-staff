# AI Chief of Staff

An intelligent executive assistant that automates personal productivity by ingesting meeting transcripts and using Claude AI to generate actionable daily briefs, track commitments, and maintain rolling context.

## Features

### Core Functionality
- 📊 **Smart Dashboard**: AI-generated priorities, patterns, and insights
- 📝 **Transcript Processing**: Upload transcripts (file or paste) with automatic AI extraction
- 🤖 **Multi-Provider AI Integration**: Choose from Anthropic, OpenAI, Ollama (local), or AWS Bedrock per service
- 💾 **Dual Database Support**: SQLite or PostgreSQL with unified interface
- ⚙️ **Configuration UI**: Easy setup for API keys, prompts, and integrations
- 🐳 **Docker Deployment**: Single container or microservices architecture
- 🚀 **Microservices Architecture**: Optional specialized AI services with independent provider selection
- 🎨 **Liquid Glass UI Theme**: Beautiful Apple-style morphism effect with mouse-responsive refraction

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
- 📊 **Microsoft Planner**: Multi-tenant OAuth integration for enterprise task management

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
- 📐 **Mobile Optimized**: Responsive design with mobile-first approach
- 🎨 **Safe Area Support**: Proper handling of device notches and status bars

### Liquid Glass UI Theme
- ✨ **Modern Glass Morphism**: Subtle liquid glass effect across entire interface
- 🌈 **Gradient Background**: Elegant dark gradient (slate blue to navy) with fixed attachment
- 💎 **Glassmorphic Cards**: Semi-transparent cards with backdrop blur and saturation
- 🎨 **Hover Effects**: Smooth transitions with subtle lift and glow on hover
- 🔮 **Enhanced Depth**: Shadows and borders create multi-layer depth perception
- ⚡ **Performance Optimized**: CSS-based effects with hardware acceleration
- 🎯 **Consistent Theme**: Applied uniformly across all pages and components

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

### AI Microservices (Optional)
The application supports an optional microservices architecture with specialized AI services:

#### 🧠 AI Intelligence Service
- **Effort Estimation**: Predict task duration with confidence scores
- **Energy Classification**: Categorize tasks by cognitive load (deep work, administrative, etc.)
- **Task Clustering**: Group related tasks semantically
- **Access**: Available in the "AI Tools" tab

#### 📝 Natural Language Parser Service
- **Task Parsing**: Convert natural language into structured task data
- **Quick Add**: Ultra-fast parsing for minimal input ("coffee 2pm tomorrow")
- **Commitment Extraction**: Pull action items from meeting notes/emails
- **Smart Date Parsing**: Handles "tomorrow", "next Tuesday", "in 3 days"
- **Priority Detection**: Auto-detects urgent, high, medium, low priorities
- **Access**: Available in the "AI Tools" tab

#### 🎤 Voice Processor Service
- **Audio Transcription**: Convert speech to text using OpenAI Whisper
- **Multi-language Support**: Automatic language detection or specify language
- **Format Support**: mp3, mp4, mpeg, mpga, m4a, wav, webm (max 25MB)
- **Translation**: Translate any language audio to English
- **Access**: Available in the "AI Tools" tab

#### 🗄️ Context Service (Go)
- **Fast Retrieval**: 10x faster than Node.js for high-throughput queries
- **Filtering**: By category, source, date range, active status
- **Rolling Window**: 2-week context window for AI processing
- **Text Search**: Search across context entries
- **Access**: Available in the "AI Tools" tab

#### 📊 Pattern Recognition Service
- **Pattern Detection**: Identifies working hours, energy levels, task clustering
- **Focus Time Analysis**: Finds optimal hours for deep work
- **Anomaly Detection**: Spots unusual task patterns (spikes, urgent deadlines)
- **Streak Analysis**: Tracks completion streaks for motivation
- **AI-Powered Insights**: Uses Claude to detect complex behavioral patterns
- **Access**: Available in the "AI Tools" tab

**Note**: Microservices are optional. The application works perfectly in standalone mode. Microservices provide enhanced AI capabilities when deployed with `docker-compose.microservices.yml`.

#### 🎛️ Multi-Provider AI Configuration
Each microservice can use a different AI provider independently:

- **Supported Providers**:
  - **Anthropic Claude**: Claude Sonnet 4.5, Claude 4, Claude 3.5 Sonnet, Claude 3 Opus
  - **OpenAI**: GPT-4, GPT-4 Turbo, GPT-3.5 Turbo, Whisper-1 (voice)
  - **Ollama (Local)**: Mistral, Llama 2, Code Llama - runs entirely on your hardware
  - **AWS Bedrock**: Claude models via AWS infrastructure

- **Per-Service Configuration**:
  - **AI Intelligence**: Choose provider for effort estimation and energy classification
  - **Voice Processor**: Choose provider for audio transcription (OpenAI Whisper recommended)
  - **Pattern Recognition**: Choose provider for behavioral pattern detection
  - **NL Parser**: Choose provider for natural language task parsing

- **Configuration Storage**:
  - All settings stored in database (persists across restarts)
  - No environment variables required for user-facing configuration
  - API endpoint for microservices: `GET /api/config/ai-provider/:serviceName`
  - Configure through intuitive UI in Configuration tab

- **Benefits**:
  - Cost optimization: Use local Ollama for high-volume tasks
  - Performance tuning: Match provider to task complexity
  - Redundancy: Switch providers if one has availability issues
  - Privacy: Keep sensitive tasks on local models

**Example Configuration**:
- AI Intelligence: Anthropic Claude Sonnet 4.5 (best reasoning)
- Voice Processor: OpenAI Whisper-1 (specialized audio)
- Pattern Recognition: Ollama Mistral (local, fast, cost-free)
- NL Parser: OpenAI GPT-4 (excellent natural language understanding)

## Tech Stack

- **Frontend**: React 18 with modern hooks, React Router, Axios, React Markdown
- **Backend**: Node.js with Express (API Gateway)
- **Database**: SQLite (default) or PostgreSQL with unified interface
- **AI**: Anthropic Claude API (claude-sonnet-4.5, claude-3-5-sonnet, claude-3-opus)
- **Deployment**: 
  - **Standalone**: Single all-in-one Docker container
  - **Microservices**: Optional specialized services (Python/FastAPI, Go)
- **PWA**: Service worker with offline support and push notifications
- **Microservices** (Optional):
  - AI Intelligence: Python/FastAPI (Port 8001)
  - Pattern Recognition: Python/FastAPI (Port 8002)
  - NL Parser: Python/FastAPI (Port 8003)
  - Voice Processor: Python/FastAPI (Port 8004)
  - Context Service: Go (Port 8005)

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
- **Microsoft Planner**: Multi-tenant OAuth integration for enterprise task management
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

#### Multi-Provider AI Configuration (New!)

Configure each microservice independently with different AI providers:

**Main Application (Required):**
Configure the primary AI provider used for transcript processing, daily briefs, and task extraction:
- **Provider**: Choose from Anthropic, OpenAI, Ollama (local), or AWS Bedrock
- **Model**: Select model based on provider (e.g., Claude Sonnet 4.5, GPT-4, Mistral)
- **API Keys**: Configure in the API Keys section below

**Per-Service AI Configuration (Optional - for Microservices):**
Each microservice can optionally use a different provider/model:

1. **AI Intelligence Service**:
   - Provider: Anthropic, OpenAI, Ollama, or AWS Bedrock
   - Model: Select from available models per provider
   - Use case: Effort estimation, energy classification

2. **Voice Processor Service**:
   - Provider: OpenAI (Whisper-1) or Ollama
   - Model: whisper-1 (OpenAI) or speech models (Ollama)
   - Use case: Audio transcription

3. **Pattern Recognition Service**:
   - Provider: Anthropic, OpenAI, Ollama, or AWS Bedrock
   - Model: Select from available models per provider
   - Use case: Behavioral pattern detection

4. **Natural Language Parser Service**:
   - Provider: Anthropic, OpenAI, Ollama, or AWS Bedrock
   - Model: Select from available models per provider
   - Use case: Task parsing from natural language

**API Keys Required (Based on Provider Selection)**:
- **Anthropic**: Get from https://console.anthropic.com/
- **OpenAI**: Get from https://platform.openai.com/api-keys
- **Ollama**: Local installation, configure base URL (default: http://localhost:11434)
- **AWS Bedrock**: Configure AWS Access Key ID and Secret Access Key

**Configuration Steps**:
1. Open Configuration tab in the UI
2. Scroll to "AI Provider Configuration" section
3. For each service, select provider and model
4. Enter required API keys in the "API Keys" section
5. Click "Save Configuration"
6. Microservices will automatically use their configured providers

**Benefits**:
- **Cost Optimization**: Use free local Ollama for high-volume tasks
- **Performance Tuning**: Match provider strengths to task type
- **Privacy**: Keep sensitive operations on local models
- **Redundancy**: Switch providers if availability issues occur

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

#### Microsoft Planner Integration

Enterprise task management integration with Microsoft Planner:

1. **Get Microsoft OAuth Credentials:**
   - Go to [Azure Portal](https://portal.azure.com/)
   - Create a new App Registration or select an existing one
   - Configure multi-tenant OAuth (supports both personal and work accounts)
   - Add redirect URI: `http://YOUR-IP:3001/api/planner/microsoft/callback`
   - Copy the **Application (client) ID** and **Client Secret**

2. **Configure in the App:**
   - Open the Configuration tab
   - Scroll to "Microsoft Planner Integration"
   - Paste your **Client ID** and **Client Secret**
   - Click **Save Configuration**
   - Click **Connect Microsoft Planner** button
   - Authorize the app in the Microsoft OAuth flow
   - ✅ Done! Tasks can now sync with Microsoft Planner

📖 See detailed setup guide: [MICROSOFT-PLANNER-SETUP.md](MICROSOFT-PLANNER-SETUP.md)

**Features:**
- Multi-tenant OAuth support (personal and work Microsoft accounts)
- Sync tasks with Microsoft Planner
- View Planner tasks in the app
- One-click disconnect in settings

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
     - Google Calendar OAuth for automatic event creation
     - Microsoft Planner OAuth for enterprise task management
     - Plaud API for automatic transcript pulling
     - iCloud Calendar for calendar integration
     - PostgreSQL if you don't want to use SQLite
     - Push notifications (VAPID keys) for task reminders
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

## Recent Updates

### v1.1.0 (Latest)
- ✨ **Liquid Glass UI Theme** - Modern glassmorphism design across entire interface
  - Subtle gradient background with glassmorphic cards
  - Backdrop blur and saturation effects
  - Smooth hover transitions with depth
- 🎛️ **Multi-Provider AI Configuration** - Independent provider selection per service
  - Main Application AI configuration (dedicated section)
  - Per-microservice provider configuration (optional)
  - Support for Anthropic, OpenAI, Ollama (local), and AWS Bedrock
  - Configure each service (AI Intelligence, Voice Processor, Pattern Recognition, NL Parser) independently
  - Database-backed configuration (persists across restarts)
  - API endpoint for microservices to query their configuration
- 🐛 **Bug Fixes**:
  - Fixed calendar `getConfig is not a function` error
  - Added missing configuration manager functions
  - Improved error handling in config routes

### v1.0.0
- ✅ **Mobile Optimizations** - Complete responsive redesign with mobile-first approach
- ✅ **Dashboard Enhancements** - Improved desktop layout with better section organization
- ✅ **Microsoft Planner Integration** - Multi-tenant OAuth support for enterprise users
- ✅ **Status Bar Fixes** - Proper safe area handling for mobile devices with notches
- ✅ **Code Quality** - ESLint enforcement with zero warnings policy
- ✅ **PWA Improvements** - Enhanced caching and offline support
- ✅ **Navigation** - Mobile-optimized hamburger menu and responsive navigation

## Roadmap

- [x] Email forwarding webhook for automatic email ingestion
- [x] Commitment tracking with overdue notifications
- [x] Weekly report generator
- [x] Pattern detection across meetings
- [x] Risk flagging for unaddressed items
- [x] Microsoft Planner integration
- [x] Mobile-responsive design
- [ ] Mobile app (native)
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
