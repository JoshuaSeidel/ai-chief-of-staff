# Production Deployment Guide

Complete guide for deploying AI Chief of Staff with PostgreSQL and SWAG reverse proxy.

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/JoshuaSeidel/plaud-ai-chief-of-staff.git
cd plaud-ai-chief-of-staff

# 2. Copy and configure environment variables
cp env.example .env
nano .env  # Edit with your values

# 3. Start the stack
docker-compose -f docker-compose.production.yml up -d

# 4. Check logs
docker-compose -f docker-compose.production.yml logs -f
```

## Prerequisites

### 1. Domain Name
- Own a domain name (e.g., `aicos.yourdomain.com`)
- Point DNS A record to your server's public IP
- For SWAG DNS validation, you'll need API access to your DNS provider

### 2. Ports
Forward these ports to your server:
- **80** (HTTP - for Let's Encrypt validation)
- **443** (HTTPS - for secure access)

### 3. DNS Provider API
For automated SSL certificate generation, you need API credentials for your DNS provider:
- **Cloudflare**: API token
- **DuckDNS**: Token
- **Route53**: AWS credentials
- See [SWAG DNS Plugins](https://github.com/linuxserver/docker-swag#parameters)

## Configuration

### Step 1: Environment Variables

Edit `.env` file:

```bash
# Your domain
DOMAIN=aicos.yourdomain.com
EMAIL=admin@yourdomain.com

# Secure database password (generate with: openssl rand -base64 32)
POSTGRES_PASSWORD=your-secure-password-here

# DNS provider for Let's Encrypt
DNS_PLUGIN=cloudflare
```

### Step 2: DNS Provider Credentials

#### For Cloudflare:
```bash
# After starting, edit:
docker exec -it swag nano /config/dns-conf/cloudflare.ini

# Add:
dns_cloudflare_email = your@email.com
dns_cloudflare_api_key = your-api-key

# Restart SWAG:
docker restart swag
```

#### For Other DNS Providers:
See: https://github.com/linuxserver/docker-swag#parameters

### Step 3: SWAG Subdomain Configuration

The `swag-config/aicos.subdomain.conf` file is already included. It will be automatically loaded by SWAG.

If you need to customize it:
```bash
docker exec -it swag nano /config/nginx/proxy-confs/aicos.subdomain.conf
docker exec -it swag nginx -s reload
```

## Initial Setup

### 1. Start the Stack
```bash
docker-compose -f docker-compose.production.yml up -d
```

### 2. Watch the Logs
```bash
# All services
docker-compose -f docker-compose.production.yml logs -f

# Specific service
docker-compose -f docker-compose.production.yml logs -f swag
docker-compose -f docker-compose.production.yml logs -f app
docker-compose -f docker-compose.production.yml logs -f postgres
```

### 3. Verify SSL Certificate
Wait 2-5 minutes for SWAG to generate the SSL certificate. Check logs:
```bash
docker logs swag 2>&1 | grep -i "certificate"
```

You should see:
```
Server ready
Certificate exists
```

### 4. Access the Application
Open: `https://aicos.yourdomain.com`

You should see the AI Chief of Staff login/dashboard.

## Post-Installation Configuration

### 1. Configure in Web UI
Navigate to **Configuration** page and set:

#### Required:
- **Anthropic API Key**: Get from https://console.anthropic.com
- **Claude Model**: `claude-sonnet-4-5-20250929` (recommended)

#### Optional:
- **Google Calendar OAuth**: Client ID & Secret from Google Cloud Console
- **Calendar ID**: Your Google Calendar ID
- **Max Tokens**: 4096-8192 (adjust based on needs)
- **Custom AI Prompts**: Customize task extraction, descriptions, reports

### 2. Generate VAPID Keys (Optional - for Push Notifications)
```bash
# On your server
npx web-push generate-vapid-keys

# Add to .env file:
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...

# Restart app
docker-compose -f docker-compose.production.yml restart app
```

Then enable notifications in the Configuration UI.

### 3. Google Calendar OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable **Google Calendar API**
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI:
   ```
   https://aicos.yourdomain.com/api/calendar/google/callback
   ```
6. Copy Client ID and Client Secret to the Configuration UI
7. Click "Connect Google Calendar"

## Backup & Restore

### Backup
```bash
# Backup database
docker exec ai-chief-postgres pg_dump -U aicos ai_chief_of_staff > backup.sql

# Backup app data
docker run --rm -v ai-chief-of-staff_app-data:/data -v $(pwd):/backup alpine tar czf /backup/app-data.tar.gz -C /data .
```

### Restore
```bash
# Restore database
cat backup.sql | docker exec -i ai-chief-postgres psql -U aicos ai_chief_of_staff

# Restore app data
docker run --rm -v ai-chief-of-staff_app-data:/data -v $(pwd):/backup alpine tar xzf /backup/app-data.tar.gz -C /data
```

## Maintenance

### Update to Latest Version
```bash
docker-compose -f docker-compose.production.yml pull
docker-compose -f docker-compose.production.yml up -d
```

### View Logs
```bash
docker-compose -f docker-compose.production.yml logs -f app
```

### Restart Services
```bash
# Restart all
docker-compose -f docker-compose.production.yml restart

# Restart specific service
docker-compose -f docker-compose.production.yml restart app
```

### Database Console
```bash
docker exec -it ai-chief-postgres psql -U aicos ai_chief_of_staff
```

## Troubleshooting

### SSL Certificate Not Generated
```bash
# Check SWAG logs
docker logs swag 2>&1 | tail -50

# Common issues:
# - DNS not propagated (wait 24-48 hours)
# - Incorrect DNS API credentials
# - Firewall blocking port 80/443

# Force renewal
docker exec swag certbot renew --force-renewal
docker restart swag
```

### Database Connection Failed
```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Check logs
docker logs ai-chief-postgres

# Verify credentials in .env match
```

### App Not Starting
```bash
# Check logs
docker logs ai-chief-of-staff

# Common issues:
# - Database not ready (wait 30s after first start)
# - Missing environment variables
# - Port already in use
```

## Security Recommendations

1. **Strong Database Password**: Use `openssl rand -base64 32`
2. **Firewall**: Only expose ports 80 and 443
3. **Updates**: Regularly update with `docker-compose pull`
4. **Backups**: Automate daily backups
5. **API Keys**: Keep secure, rotate regularly
6. **HTTPS Only**: Never use HTTP in production

## Support

- **Documentation**: [README.md](README.md)
- **Issues**: https://github.com/JoshuaSeidel/plaud-ai-chief-of-staff/issues
- **SWAG**: https://docs.linuxserver.io/images/docker-swag

## Architecture

```
Internet (HTTPS/443)
    ↓
SWAG Reverse Proxy (SSL Termination)
    ↓
AI Chief of Staff App (:3001)
    ↓
PostgreSQL Database (:5432)
```

All services communicate over a private Docker network (`ai-chief-network`).

