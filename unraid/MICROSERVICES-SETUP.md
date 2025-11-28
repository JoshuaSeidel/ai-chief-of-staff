# AI Chief of Staff - Unraid Microservices Setup

## Deployment Options

### Option 1: Standalone Mode (Simpler - Recommended for Most Users)
Run AI Chief of Staff as a single container. All AI processing happens in the main container.

**Best For**: Small teams, personal use, getting started quickly

### Option 2: Microservices Mode (Advanced - Better Performance)
Run AI Chief of Staff with separate microservice containers for heavy AI/ML operations.

**Best For**: Heavy usage, large teams, maximum performance

---

## Option 1: Standalone Mode Setup

### Quick Start (5 minutes)

1. **Install PostgreSQL** (from Community Apps)
   - Search "PostgreSQL" in Apps tab
   - Install and configure with secure password
   - Note the database credentials

2. **Install AI Chief of Staff**
   - Search "AI Chief of Staff" in Apps tab
   - Configure:
     - `POSTGRES_HOST`: Your PostgreSQL container name or IP
     - `POSTGRES_USER`: `aicos`
     - `POSTGRES_PASSWORD`: Your PostgreSQL password
     - `POSTGRES_DB`: `ai_chief_of_staff`
   - Click Apply

3. **Configure Anthropic API**
   - Open WebUI: `http://[UNRAID-IP]:3001`
   - Go to Configuration tab
   - Enter Anthropic API key
   - Click Save

✅ **Done!** You now have a working AI Chief of Staff.

---

## Option 2: Microservices Mode Setup

### Architecture

```
┌─────────────────────────────────────────────────────┐
│                  AI Chief of Staff                   │
│               (Main Container - Node.js)             │
│                    Port 3001                         │
└──────────────┬──────────────────────────────────────┘
               │
        ┌──────┴──────────────────────────┐
        │                                 │
┌───────▼─────────┐            ┌─────────▼──────────┐
│ AI Intelligence │            │  Pattern Recognition│
│ (Python/FastAPI)│            │  (Python/ML)        │
│   Port 8001     │            │   Port 8002         │
└─────────────────┘            └─────────────────────┘
        │                                 │
        └────────────┬────────────────────┘
                     │
        ┌────────────▼─────────────────┐
        │        PostgreSQL            │
        │        Port 5432             │
        └──────────────────────────────┘
        ┌──────────────────────────────┐
        │         Redis                │
        │        Port 6379             │
        └──────────────────────────────┘
```

### Prerequisites

- Unraid 6.10+ with Docker Compose Manager plugin
- At least 8GB RAM available
- 20GB free disk space

### Step-by-Step Setup

#### 1. Install Docker Compose Manager Plugin

```bash
# In Unraid terminal
wget https://raw.githubusercontent.com/dcflachs/compose.manager/master/compose.manager.plg -P /boot/config/plugins/
# Then install via Plugins tab in WebUI
```

Or search "Compose Manager" in Community Apps.

#### 2. Create Directory Structure

```bash
# In Unraid terminal
mkdir -p /mnt/user/appdata/ai-chief-of-staff-microservices
cd /mnt/user/appdata/ai-chief-of-staff-microservices
```

#### 3. Download Docker Compose File

```bash
# Download the microservices compose file
wget https://raw.githubusercontent.com/JoshuaSeidel/plaud-ai-chief-of-staff/main/docker-compose.microservices.yml

# Or use curl
curl -O https://raw.githubusercontent.com/JoshuaSeidel/plaud-ai-chief-of-staff/main/docker-compose.microservices.yml
```

#### 4. Create Environment File

```bash
cat > .env << 'EOF'
# === Required: Anthropic API ===
ANTHROPIC_API_KEY=sk-ant-your-key-here

# === Optional: OpenAI (for voice transcription) ===
OPENAI_API_KEY=sk-your-key-here

# === Database Configuration ===
POSTGRES_USER=aicos
POSTGRES_PASSWORD=change-this-secure-password
POSTGRES_DB=ai_chief_of_staff

# === Google Calendar (Optional) ===
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://your-unraid-ip:3001/api/calendar/google/callback

# === Push Notifications (Optional) ===
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@example.com

# === System ===
NODE_ENV=production
EOF

# Secure the file
chmod 600 .env
```

#### 5. Update Paths for Unraid

Edit `docker-compose.microservices.yml`:

```yaml
# Update volume paths to Unraid paths
volumes:
  postgres_data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /mnt/user/appdata/ai-chief-of-staff-microservices/postgres
  
  redis_data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /mnt/user/appdata/ai-chief-of-staff-microservices/redis
```

#### 6. Start Services

```bash
cd /mnt/user/appdata/ai-chief-of-staff-microservices

# Build services
docker-compose -f docker-compose.microservices.yml build

# Start services
docker-compose -f docker-compose.microservices.yml up -d

# Check status
docker-compose -f docker-compose.microservices.yml ps
```

#### 7. Verify Services

```bash
# Check health of each service
curl http://localhost:8001/health  # AI Intelligence
curl http://localhost:8002/health  # Pattern Recognition (when implemented)
curl http://localhost:3001/health  # Main app

# Check logs
docker-compose -f docker-compose.microservices.yml logs -f
```

#### 8. Access WebUI

Open: `http://[UNRAID-IP]:3001`

---

## Using Individual Containers (Alternative)

If you prefer not to use Docker Compose, you can run containers individually:

### 1. Create Network

```bash
docker network create aicos-network
```

### 2. Start PostgreSQL

```bash
docker run -d \
  --name=aicos-postgres \
  --network=aicos-network \
  -e POSTGRES_DB=ai_chief_of_staff \
  -e POSTGRES_USER=aicos \
  -e POSTGRES_PASSWORD=your-secure-password \
  -v /mnt/user/appdata/ai-chief-of-staff-microservices/postgres:/var/lib/postgresql/data \
  --restart=unless-stopped \
  postgres:15-alpine
```

### 3. Start Redis

```bash
docker run -d \
  --name=aicos-redis \
  --network=aicos-network \
  -v /mnt/user/appdata/ai-chief-of-staff-microservices/redis:/data \
  --restart=unless-stopped \
  redis:7-alpine redis-server --appendonly yes
```

### 4. Start AI Intelligence Service

```bash
docker run -d \
  --name=aicos-ai-intelligence \
  --network=aicos-network \
  -e ANTHROPIC_API_KEY=your-key \
  -e REDIS_URL=redis://aicos-redis:6379 \
  -p 8001:8001 \
  --restart=unless-stopped \
  ghcr.io/joshuaseidel/plaud-ai-chief-of-staff-ai-intelligence:latest
```

### 5. Start Main Application

```bash
docker run -d \
  --name=AI-Chief-of-Staff \
  --network=aicos-network \
  -e POSTGRES_HOST=aicos-postgres \
  -e POSTGRES_USER=aicos \
  -e POSTGRES_PASSWORD=your-secure-password \
  -e POSTGRES_DB=ai_chief_of_staff \
  -e ANTHROPIC_API_KEY=your-key \
  -e REDIS_URL=redis://aicos-redis:6379 \
  -e AI_INTELLIGENCE_URL=http://aicos-ai-intelligence:8001 \
  -p 3001:3001 \
  -v /mnt/user/appdata/ai-chief-of-staff:/app/data \
  -v /mnt/user/appdata/ai-chief-of-staff/uploads:/app/uploads \
  --restart=unless-stopped \
  ghcr.io/joshuaseidel/plaud-ai-chief-of-staff:latest
```

---

## Performance Tuning for Unraid

### Resource Allocation

**Minimum System Requirements (Microservices)**:
- RAM: 8GB available
- CPU: 4 cores
- Disk: 20GB free space

**Recommended**:
- RAM: 16GB available
- CPU: 8 cores
- SSD for appdata

### Docker Resource Limits

Edit `docker-compose.microservices.yml`:

```yaml
services:
  ai-intelligence:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '1.0'
          memory: 1G
```

### Enable CPU Pinning (Optional)

For better performance, pin services to specific CPU cores:

```yaml
services:
  ai-intelligence:
    cpuset: "0,1"  # Use cores 0-1
  backend:
    cpuset: "2,3"  # Use cores 2-3
```

---

## Monitoring

### View Logs

```bash
# All services
docker-compose -f docker-compose.microservices.yml logs -f

# Specific service
docker-compose -f docker-compose.microservices.yml logs -f ai-intelligence

# Last 100 lines
docker-compose -f docker-compose.microservices.yml logs --tail=100
```

### Resource Usage

```bash
# Real-time stats
docker stats

# Specific container
docker stats AI-Chief-of-Staff
```

### Health Checks

```bash
# Check all services
for port in 3001 8001 8002; do
  echo "Checking port $port..."
  curl -s http://localhost:$port/health | jq .
done
```

---

## Backup & Restore

### Backup

```bash
#!/bin/bash
# /mnt/user/scripts/backup-aicos.sh

BACKUP_DIR="/mnt/user/backups/ai-chief-of-staff"
DATE=$(date +%Y%m%d-%H%M%S)

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup database
docker exec aicos-postgres pg_dump -U aicos ai_chief_of_staff | gzip > "$BACKUP_DIR/database-$DATE.sql.gz"

# Backup app data
tar czf "$BACKUP_DIR/appdata-$DATE.tar.gz" /mnt/user/appdata/ai-chief-of-staff-microservices

# Keep only last 7 days
find "$BACKUP_DIR" -name "*.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR"
```

### Restore

```bash
# Restore database
gunzip -c /mnt/user/backups/ai-chief-of-staff/database-YYYYMMDD.sql.gz | \
  docker exec -i aicos-postgres psql -U aicos ai_chief_of_staff

# Restore app data
tar xzf /mnt/user/backups/ai-chief-of-staff/appdata-YYYYMMDD.tar.gz -C /
```

---

## Updating

### Update All Services

```bash
cd /mnt/user/appdata/ai-chief-of-staff-microservices

# Pull latest images
docker-compose -f docker-compose.microservices.yml pull

# Restart with new images
docker-compose -f docker-compose.microservices.yml up -d

# Clean up old images
docker image prune -f
```

### Update Individual Service

```bash
# Update main app only
docker-compose -f docker-compose.microservices.yml pull backend frontend
docker-compose -f docker-compose.microservices.yml up -d backend frontend
```

---

## Troubleshooting

### Services Won't Start

```bash
# Check Docker Compose syntax
docker-compose -f docker-compose.microservices.yml config

# Check logs for errors
docker-compose -f docker-compose.microservices.yml logs

# Verify environment variables
docker-compose -f docker-compose.microservices.yml config | grep -i key
```

### Database Connection Issues

```bash
# Test PostgreSQL connectivity
docker exec AI-Chief-of-Staff ping -c 3 aicos-postgres

# Check PostgreSQL is accepting connections
docker exec aicos-postgres psql -U aicos -d ai_chief_of_staff -c "SELECT 1;"
```

### High Memory Usage

```bash
# Check resource usage
docker stats --no-stream

# Restart specific service
docker-compose -f docker-compose.microservices.yml restart ai-intelligence

# Scale down if needed
docker-compose -f docker-compose.microservices.yml up -d --scale ai-intelligence=1
```

### Redis Connection Issues

```bash
# Test Redis connectivity
docker exec AI-Chief-of-Staff ping -c 3 aicos-redis

# Check Redis is working
docker exec aicos-redis redis-cli ping
```

---

## Scaling (Advanced)

### Scale AI Intelligence Service

```bash
# Run 3 instances for high load
docker-compose -f docker-compose.microservices.yml up -d --scale ai-intelligence=3

# Check instances
docker-compose -f docker-compose.microservices.yml ps ai-intelligence
```

### Add Load Balancer (Optional)

Install nginx from Community Apps and configure:

```nginx
upstream ai_intelligence {
    server 192.168.1.10:8001;
    server 192.168.1.10:8002;
    server 192.168.1.10:8003;
}

server {
    listen 8000;
    location / {
        proxy_pass http://ai_intelligence;
    }
}
```

---

## Migration from Standalone to Microservices

### 1. Backup Current Data

```bash
# Backup database
docker exec AI-Chief-of-Staff sqlite3 /app/data/database.sqlite ".backup '/app/data/backup.sqlite'"

# Or if using PostgreSQL
docker exec postgres-container pg_dump -U aicos ai_chief_of_staff > backup.sql
```

### 2. Stop Standalone Container

```bash
docker stop AI-Chief-of-Staff
```

### 3. Set Up Microservices

Follow "Option 2: Microservices Mode Setup" above.

### 4. Restore Data

```bash
# PostgreSQL: Data is preserved in volume
# SQLite: Copy backup to new container
docker cp backup.sqlite AI-Chief-of-Staff:/app/data/database.sqlite
```

### 5. Verify

```bash
# Check all services
docker-compose -f docker-compose.microservices.yml ps

# Test WebUI
curl http://localhost:3001/health
```

---

## Support & Community

- **GitHub Issues**: https://github.com/JoshuaSeidel/plaud-ai-chief-of-staff/issues
- **Documentation**: https://github.com/JoshuaSeidel/plaud-ai-chief-of-staff
- **Unraid Forums**: [AI Chief of Staff Thread]

---

## FAQ

**Q: Do I need microservices?**  
A: No, standalone mode works great for most users. Microservices are for heavy usage or advanced performance needs.

**Q: Can I mix standalone and microservices?**  
A: Yes! You can run the main app standalone and optionally connect to external microservices.

**Q: What's the performance difference?**  
A: Microservices can be 3-10x faster for heavy AI operations and can scale independently.

**Q: How much RAM do I need?**  
A: Standalone: 2GB. Microservices: 8GB minimum, 16GB recommended.

**Q: Can I run this on a Raspberry Pi?**  
A: Standalone mode yes (if 4GB+ RAM). Microservices mode needs more resources.

**Q: How do I monitor costs?**  
A: Check Anthropic dashboard. Redis caching reduces API calls by 70-80%.

---

**Last Updated**: November 28, 2025  
**Version**: 2.0 (Microservices)
