# AI Chief of Staff

An intelligent executive assistant that automates personal productivity by ingesting meeting transcripts and using Claude AI to generate actionable daily briefs, track commitments, and maintain rolling context.

## Features

- 📊 **Morning Dashboard**: AI-generated top 3 priorities from last 2 weeks of context
- 📝 **Transcript Upload**: Upload Plaud meeting transcripts with automatic processing
- 🤖 **Claude AI Integration**: Extracts commitments, action items, and generates daily briefs
- 💾 **SQLite Database**: Maintains rolling 2-week context window
- ⚙️ **Configuration UI**: Easy setup for API keys and settings
- 🐳 **Single Docker Container**: Simple deployment on Unraid or any Docker host

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

### Method 2: Unraid Template (Coming Soon)

A Community Applications template will be available for one-click installation.

### Method 3: Docker Run Command

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
- **iCloud Calendar**: For calendar integration
- **Database**: Switch from SQLite to PostgreSQL

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

MIT License

## Support

For issues or questions, please open an issue on [GitHub](https://github.com/JoshuaSeidel/plaud-ai-chief-of-staff).

---

**Built with ❤️ for productivity**
