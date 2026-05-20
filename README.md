# AI Chief of Staff

**Modern AI-powered productivity assistant with microservices architecture** that automates personal productivity by processing meeting transcripts, generating daily briefs, tracking commitments with intelligent calendar integration, and providing behavioral insights.

[![Docker](https://img.shields.io/badge/Docker-Ready-blue)](https://github.com/JoshuaSeidel/ai-chief-of-staff)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-black)](https://github.com/JoshuaSeidel/ai-chief-of-staff)

## ✨ Highlights

- 🎨 **Modern Glassmorphism UI** - Elegant design with backdrop-blur effects
- 🤖 **AI-Powered Intelligence** - Claude/GPT/Ollama support with semantic task clustering
- 📊 **Smart Insights** - Pattern recognition and productivity analytics
- 📝 **Auto-Task Extraction** - Upload meeting notes, get structured tasks
- 📅 **Calendar Integration** - Google Calendar, Microsoft, and self-hosted CalDAV
- 🔔 **Push Notifications** - Auto-configured VAPID keys, task reminders
- 📱 **Progressive Web App** - Install on any device, works offline
- 🐳 **Microservices Architecture** - Scalable specialized AI services

---

## 🚀 Quick Start

### Production Deployment (Microservices)

**Recommended for production** - Full feature set with specialized AI services:

```bash
# Clone repository
git clone https://github.com/JoshuaSeidel/ai-chief-of-staff.git
cd ai-chief-of-staff

# Configure environment
cp env.example .env
# Edit .env: Set ANTHROPIC_API_KEY and OPENAI_API_KEY

# Start all services
docker-compose -f docker-compose.microservices.yml up -d

# Access at http://localhost:3001
```

**Multi-Architecture Support:**
- ✅ **AMD64** - Windows, Linux, Intel Macs, most servers
- ✅ **ARM64** - Apple Silicon Macs (M1/M2/M3), Raspberry Pi 4/5, ARM servers

Docker automatically pulls the correct architecture for your system. All images are built for both platforms.

**Includes:**
- Main Application (Backend + Frontend)
- PostgreSQL Database
- Redis Cache
- AI Intelligence (task clustering, effort estimation)
- Pattern Recognition (productivity insights)
- NL Parser (natural language task extraction)
- Voice Processor (audio transcription)
- Context Service (high-performance Go service)

---

## 📚 Documentation

### Core Documentation
- **[Microservices Integration Guide](docs/MICROSERVICES-INTEGRATION.md)** - How services work together, when they trigger, data flows
- **[Production Setup](docs/PRODUCTION-SETUP.md)** - Deployment with SWAG/SSL, reverse proxy configuration
- **[Architecture Flows](docs/ARCHITECTURE_FLOWS.md)** - System architecture diagrams and data flows

### Integration Guides  
- **[Microsoft 365 Setup](docs/MICROSOFT-365-SETUP.md)** - Connect Microsoft email, meetings, Planner/To Do, and Teams artifacts
- **[Microsoft Planner Setup](docs/MICROSOFT-PLANNER-SETUP.md)** - Legacy pointer to the shared Microsoft 365 setup
- **[Implementation Status](docs/IMPLEMENTATION-STATUS.md)** - Current features and development roadmap

---

## 🎯 Key Features

### Intelligent Task Management

**Smart Grouping** - AI-powered semantic clustering organizes related tasks:
- Click "🤖 Smart Grouping..." in Tasks tab
- AI analyzes task descriptions, deadlines, and context
- Groups saved to database with blue 📁 badges
- Syncs groups to Jira labels and Planner categories
- Pattern analysis uses groups for deeper insights

**Auto-Task Extraction** - Upload meeting notes, get structured commitments:
- Drag & drop transcripts or paste text directly
- NL-Parser extracts tasks, deadlines, assignees automatically
- Tasks appear in Tasks tab instantly with AI-suggested priorities
- Supports 25+ languages via Whisper transcription

**Pattern Recognition** - Behavioral insights on Dashboard:
- Analyzes last 7 days of completed tasks
- Shows completion rate, best productive day of week
- AI-generated insights about working patterns
- Updates automatically when tasks are grouped or completed

### Calendar Integration

**Supported Platforms:**
- ✅ **Google Calendar** - Full OAuth2 flow, automatic event creation
- ✅ **Microsoft Calendar** - Multi-tenant support (personal + work)
- ✅ **Radicale CalDAV** - Self-hosted privacy-focused option

**Features:**
- Two-way sync (import events, create from tasks)
- AI-generated rich event descriptions (3-5 paragraphs)
- Automatic deadline-based event creation
- Calendar block management with task context

### Progressive Web App

- 📱 **Install to Home Screen** - Works like native app on all platforms
- 🌐 **Offline Mode** - Full functionality without internet
- 🔄 **Background Sync** - Changes sync automatically when connection returns
- 🔔 **Push Notifications** - Auto-generated VAPID keys (no manual setup required)
- 📐 **Mobile Optimized** - Safe area support for notches and navigation bars

### AI Provider Flexibility

Configure per-service in UI (Settings → AI Models):
- **Anthropic Claude** - Sonnet 4.5, 4, 3.5, 3 Opus
- **OpenAI GPT** - GPT-4, GPT-4 Turbo, GPT-3.5
- **Ollama** - Local models (Mistral, Llama 2, Code Llama)
- **AWS Bedrock** - Enterprise Claude access with SLA

**All configuration stored in database** - No environment variables needed for AI settings.

---

## 🏗️ Architecture

### Microservices Overview

```mermaid
graph TD
    Frontend["Frontend<br/>(React PWA)<br/>Port 3000"] --> Backend["Backend<br/>(Node.js/Express)<br/>Port 3001"]
    
    Backend --> AIIntel["AI Intelligence<br/>(Python)<br/>Port 8001"]
    Backend --> PatternRecog["Pattern Recognition<br/>(Python)<br/>Port 8002"]
    Backend --> NLParser["NL Parser<br/>(Python)<br/>Port 8003"]
    Backend --> VoiceProc["Voice Processor<br/>(Python)<br/>Port 8004"]
    Backend --> ContextSvc["Context Service<br/>(Go)<br/>Port 8005"]
    
    AIIntel --> Database["PostgreSQL<br/>+ Redis<br/>Shared Database"]
    PatternRecog --> Database
    NLParser --> Database
    VoiceProc --> Database
    ContextSvc --> Database
    Backend --> Database
```

### Service Responsibilities

| Service | Purpose | When Used | Port |
|---------|---------|-----------|------|
| **Backend** | API gateway, database, auth | Always | 3001 |
| **AI Intelligence** | Task clustering, effort estimation | Smart Grouping button | 8001 |
| **Pattern Recognition** | Productivity insights, trends | Dashboard load | 8002 |
| **NL Parser** | Extract tasks from text | Transcript upload | 8003 |
| **Voice Processor** | Audio → text transcription | Audio file upload | 8004 |
| **Context Service** | High-speed context retrieval | Brief generation | 8005 |

**See [Microservices Integration Guide](docs/MICROSERVICES-INTEGRATION.md) for detailed flows, troubleshooting, and integration examples.**

---

## ⚙️ Configuration

### First-Time Setup

1. **Access the Application**
   ```
   http://localhost:3001
   ```

2. **Navigate to Settings Tab**
   - Click ⚙️ Settings in the bottom navigation

3. **Configure AI Provider**
   - Settings → **AI Models & Providers**
   - Choose provider (Anthropic/OpenAI/Ollama)
   - Select model
   - Enter API key (stored encrypted in database)
   - Set max tokens (2048-8192)

4. **Set Your Name**
   - Settings → **Your Name**
   - Enter name as it appears in transcripts
   - Used for auto-assigning tasks to you

5. **Optional: Calendar Integration**
   - Settings → **Calendar Integration**
   - Choose Google, Microsoft, or Radicale
   - Follow OAuth flow or enter CalDAV credentials

### Database-Driven Configuration

**All settings stored in PostgreSQL** - No environment variables needed:
- ✅ AI provider and model selection
- ✅ API keys (encrypted at rest)
- ✅ Calendar credentials and OAuth tokens
- ✅ Jira/Planner integration settings
- ✅ Push notification keys (auto-generated)
- ✅ User preferences and dashboard settings

**Required environment variables (infrastructure only):**
```yaml
# Database connection
DATABASE_URL=postgresql://user:pass@postgres:5432/aicos
DB_TYPE=postgres

# Cache connection
REDIS_URL=redis://redis:6379

# Runtime environment
NODE_ENV=production
PORT=3001

# Microservice discovery (auto-configured in Docker network)
AI_INTELLIGENCE_URL=http://aicos-ai-intelligence:8001
PATTERN_RECOGNITION_URL=http://aicos-pattern-recognition:8002
NL_PARSER_URL=http://aicos-nl-parser:8003
VOICE_PROCESSOR_URL=http://aicos-voice-processor:8004
CONTEXT_SERVICE_URL=http://aicos-context-service:8005

# External API keys (sensitive - must be env vars)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

**Everything else configurable via UI.**

---

## 🐳 Docker Compose Files

### Production: `docker-compose.microservices.yml`

Full microservices stack with:
- Frontend (React PWA)
- Backend (Node.js API)
- PostgreSQL 15 (persistent data)
- Redis (caching and rate limiting)
- All AI microservices

**Multi-Architecture Images:**
All services are built for both **AMD64** (x86_64) and **ARM64** (aarch64) platforms:
- GitHub Actions automatically builds both architectures on push
- Images tagged with `latest` or `dev` include both platforms
- `docker-compose` pulls the correct architecture for your system
- Pre-built images available on GitHub Container Registry: `ghcr.io/joshuaseidel/ai-chief-of-staff`

**Persistent volumes:**
- `backend-data` - Configuration (config.json) and logs
- `postgres-data` - Database storage
- `redis-data` - Cache persistence
- `pattern-models` - ML model storage
- `voice-recordings` - Audio file storage

**Networks:**
- `aicos-network` - Internal microservices communication
- `swag` (optional) - Reverse proxy for HTTPS
- `psql` (optional) - External PostgreSQL
- `redis` (optional) - External Redis

### Development: `docker-compose.yml`

Minimal setup for local development with hot reload.

### Legacy: `docker-compose.production.yml`

Old production setup with SWAG reverse proxy (deprecated - use microservices).

---

## 📋 Usage Examples

### Daily Workflow

1. **Morning:** View Dashboard for daily brief and productivity insights
2. **Upload Transcript:** Drag meeting notes → Auto-extracts tasks with deadlines
3. **Smart Grouping:** Click "🤖 Smart Grouping..." to organize related tasks
4. **Review Tasks:** Check Tasks tab, mark completed, filter by type
5. **Calendar Sync:** Auto-creates events for upcoming deadlines
6. **Evening:** Check Productivity Insights for completion patterns

### Smart Grouping Example

**Before:**
```
❌ No groups
- Fix login bug
- Update user profile API
- Write deployment docs
- Add unit tests for auth
- Configure CI/CD pipeline
```

**After Smart Grouping:**
```
📁 Authentication & Security
  - Fix login bug
  - Add unit tests for auth
  
📁 API Development
  - Update user profile API
  
📁 DevOps & Deployment
  - Write deployment docs
  - Configure CI/CD pipeline
```

Groups automatically sync to:
- **Jira** - Applied as labels on issues
- **Microsoft Planner** - Organized in buckets
- **Pattern Analysis** - Used for deeper behavioral insights

---

## 🔧 Advanced Configuration

### Microservice URLs (Optional Override)

If deploying services separately, configure in backend environment:

```yaml
environment:
  - AI_INTELLIGENCE_URL=http://custom-host:8001
  - PATTERN_RECOGNITION_URL=http://custom-host:8002
  - NL_PARSER_URL=http://custom-host:8003
```

**Default:** Auto-discovered via Docker network (`aicos-network`)

### Custom Database Configuration

PostgreSQL recommended for production:

```yaml
environment:
  - DATABASE_URL=postgresql://user:pass@host:5432/dbname
  - DB_TYPE=postgres
```

**Supported:** PostgreSQL (recommended), SQLite (local dev only)

### Resource Limits

Adjust in `docker-compose.microservices.yml`:

```yaml
deploy:
  resources:
    limits:
      cpus: '2.0'
      memory: 4G
    reservations:
      cpus: '0.5'
      memory: 1G
```

### AI Model Optimization

Configure per microservice in Settings UI:
- **max_tokens**: 1024-8192 (lower = faster, higher = more detailed)
- **temperature**: 0.0-1.0 (lower = deterministic, higher = creative)
- **Brief generation**: 4096 tokens recommended
- **Smart grouping**: 2048 tokens recommended
- **Pattern insights**: 1024 tokens recommended

---

## 🔒 Security & Privacy

- ✅ **API Keys** - Encrypted at rest in PostgreSQL using AES-256
- ✅ **OAuth Tokens** - Stored encrypted with PKCE flow
- ✅ **Local AI Option** - Use Ollama for on-premise processing (no data leaves server)
- ✅ **No Tracking** - No telemetry or analytics sent anywhere
- ✅ **Self-Hosted** - Full control of your data and infrastructure
- ✅ **HTTPS Ready** - TLS termination via SWAG/nginx reverse proxy

---

## 🚢 Production Deployment

### With SWAG Reverse Proxy

See **[Production Setup Guide](docs/PRODUCTION-SETUP.md)** for:
- SWAG/nginx reverse proxy configuration
- SSL certificate setup (Let's Encrypt)
- Domain configuration and DNS
- Production environment variables
- Network configuration for multi-container setups

### Unraid Deployment

See **[unraid/README.md](unraid/README.md)** for Community Apps template and installation guide.

---

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Setup

```bash
# Clone and install
git clone https://github.com/JoshuaSeidel/ai-chief-of-staff.git
cd ai-chief-of-staff

# Start development stack
docker-compose up -d

# View logs
docker-compose logs -f

# Access application
open http://localhost:3001
```

---

## 📄 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file.

---

## 🙏 Acknowledgments

- **Anthropic Claude** - Primary AI provider for intelligent task processing
- **OpenAI** - GPT models and Whisper transcription
- **Plaud Note** - Inspiration for transcript processing workflow
- **SWAG** - Secure web application gateway for production deployments

---

## 📞 Support

- **Issues:** [GitHub Issues](https://github.com/JoshuaSeidel/ai-chief-of-staff/issues)
- **Documentation:** [docs/](docs/)
- **Discussions:** [GitHub Discussions](https://github.com/JoshuaSeidel/ai-chief-of-staff/discussions)

---

**Built with ❤️ for productivity enthusiasts who want AI-powered task management without sacrificing privacy**
