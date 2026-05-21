# AI Chief of Staff

AI Chief of Staff is a self-hosted executive operating system for turning
meetings, Teams artifacts, email, recordings, and notes into tasks, briefs,
context, and daily priorities.

The application is designed to run privately, connect to Microsoft 365 and task
systems, and keep sensitive operational data under your control.

## What It Handles

| Area | Capabilities |
| --- | --- |
| Dashboard | Daily brief, productivity signals, connection health, quick actions |
| Transcripts | Upload text, meeting notes, and supported audio/video files |
| Email | Pull Microsoft 365 mailbox messages and process them like meeting records |
| Meetings | Pull Microsoft 365 meetings and capture Teams transcripts/recordings when tenant permissions allow it |
| Tasks | Track commitments, actions, follow-ups, risks, priorities, deadlines, and completion |
| Calendar | Google Calendar and Microsoft Calendar connection flows |
| Planning | Jira and Microsoft Planner/To Do task-system integrations |
| AI | Task extraction, effort/energy analysis, grouping, patterns, and brief generation |
| Admin | Cache clearing and protected history wipe for starting fresh |

## Critical Security Requirement

Set `AICOS_AUTH_TOKEN` or `API_TOKEN` before exposing the app or using
destructive admin tools.

The admin history wipe feature in `Settings > System > Danger Zone` will not run
unless one of those tokens is configured. This is intentional. The wipe tool
permanently removes stored transcripts, imported email/meeting records, tasks,
briefs, context, insights, and notification history while preserving profiles,
prompts, provider settings, and integrations.

Generate strong secrets:

```bash
openssl rand -base64 48   # API and OAuth secrets
openssl rand -hex 32      # PostgreSQL password
```

For public deployments, keep `VITE_API_TOKEN` blank. Users enter the backend API
token through the app prompt instead of shipping a shared token inside frontend
assets.

## Architecture

```text
Browser
  |
  v
React PWA frontend                 :3000
  |
  v
Node/Express backend API           :3001
  |
  +-- PostgreSQL                   primary database
  +-- Redis                        cache and coordination
  +-- AI Intelligence              task analysis
  +-- Pattern Recognition          productivity insights
  +-- NL Parser                    task parsing
  +-- Voice Processor              audio transcription
  +-- Context Service              fast context retrieval
  +-- Integrations Service         external workflow integrations
```

Most product behavior is configured in the app UI. Environment files should
hold deployment, security, database, service discovery, and OAuth callback
fallbacks.

## Repository Layout

| Path | Purpose |
| --- | --- |
| [frontend/](frontend/) | React 19 PWA and responsive app shell |
| [backend/](backend/) | Express API, security middleware, database access, OAuth flows |
| [services/](services/) | AI, parser, context, voice, and integration microservices |
| [docs/](docs/) | Production, Microsoft 365, architecture, and styling docs |
| [unraid/](unraid/) | Unraid templates and deployment notes |
| [swag-config/](swag-config/) | SWAG reverse proxy example |
| [docker-compose.yml](docker-compose.yml) | Main Docker Compose stack |
| [env.example](env.example) | Environment template |

## Quick Start

Prerequisites:

- Docker and Docker Compose
- Git
- A strong API token
- A strong PostgreSQL password

```bash
git clone https://github.com/JoshuaSeidel/ai-chief-of-staff.git
cd ai-chief-of-staff

cp env.example .env
```

Edit `.env` before starting:

```env
AICOS_AUTH_TOKEN=replace-with-a-long-random-token
OAUTH_STATE_SECRET=replace-with-a-long-random-oauth-state-secret
POSTGRES_PASSWORD=replace-with-a-secure-postgres-password
FRONTEND_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
TRUST_PROXY=false
```

Start the stack:

```bash
docker compose up --build -d
docker compose logs -f aicos-backend
```

Open:

```text
http://localhost:3000
```

The frontend will prompt for the API token when the backend returns `401`.

## First-Run Setup

1. Open the app and enter the API token.
2. Go to `Settings`.
3. Select or create a profile.
4. Configure an AI provider.
5. Configure Microsoft 365, Google Calendar, Jira, or Planner if needed.
6. Confirm the header shows only connectivity pills for configured services.
7. Import a transcript, email, or meeting and review extracted tasks.

## Docker Compose Notes

The compose stack now reads deployment values from `.env` and no longer hardcodes
weak database credentials.

Fresh installs generate the backend `config.json` from `DB_TYPE`,
`DATABASE_URL`, or `POSTGRES_*` values. Existing installs keep their saved
database configuration until changed in Settings.

Important variables:

| Variable | Required | Notes |
| --- | --- | --- |
| `AICOS_AUTH_TOKEN` or `API_TOKEN` | Yes | API auth and destructive admin tool gate |
| `POSTGRES_PASSWORD` | Yes | Used by PostgreSQL and all services |
| `FRONTEND_URL` | Production | Public browser origin |
| `ALLOWED_ORIGINS` | Production | Comma-separated browser origins allowed to write to the API |
| `TRUST_PROXY` | Reverse proxy | Set `true` behind SWAG, Nginx Proxy Manager, Traefik, etc. |
| `VITE_API_URL` | Usually `/api` | Build-time frontend API URL |
| `ALLOW_INSECURE_TLS` | Local only | Use `true` for local self-signed service certs; harden to `false` with trusted certs |

The `tls-certs` named volume is created automatically and shared by the backend
and microservices for internal HTTPS certificates.

Useful commands:

```bash
docker compose config
docker compose ps
docker compose logs -f
docker compose pull
docker compose up --build -d
```

## Production Checklist

Before exposing the system outside a trusted LAN:

- Replace every placeholder secret in `.env`.
- Set `AICOS_AUTH_TOKEN` or `API_TOKEN`.
- Leave `VITE_API_TOKEN` blank unless this is a private controlled build.
- Set `FRONTEND_URL=https://your.domain`.
- Set `ALLOWED_ORIGINS=https://your.domain`.
- Set `TRUST_PROXY=true` behind a trusted reverse proxy.
- Use HTTPS only.
- Back up PostgreSQL and persistent volumes.
- Review Microsoft Graph application permissions before enabling Teams artifact capture.
- Test transcript deletion and the admin history summary after deployment.

See [docs/PRODUCTION-SETUP.md](docs/PRODUCTION-SETUP.md) for the full guide.

## Microsoft 365

Microsoft 365 powers:

- Email intake
- Meeting list import
- Microsoft Calendar
- Planner/To Do
- Teams transcript and recording capture

Production setup requires a Microsoft Entra app registration. Teams transcript
and recording capture also require Graph application permissions plus a Teams
application access policy.

Read [docs/MICROSOFT-365-SETUP.md](docs/MICROSOFT-365-SETUP.md).

## Admin History Wipe

Use `Settings > System > Danger Zone > Wipe History` when you need to start
fresh, such as after changing jobs.

The wipe can target:

- All profiles
- Current profile only

It deletes history tables and derived records, including transcripts, imported
emails/meetings, tasks, briefs, context, insights, project/task associations,
and notification history.

It preserves:

- Profiles
- Prompts
- AI provider settings
- Microsoft 365 tokens/configuration
- Google/Jira/Planner integration settings
- VAPID and OAuth configuration

The UI requires typing `WIPE HISTORY`, and the backend requires
`AICOS_AUTH_TOKEN` or `API_TOKEN` to be configured.

## Local Development

Backend:

```bash
cd backend
npm install
CONFIG_DIR=./data PORT=3001 npm start
```

Frontend:

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 3000
```

Checks:

```bash
cd frontend
npm run lint
npm run build

cd ../backend
node -c server.js
npm audit --audit-level=high
```

## Troubleshooting

### The app asks for an API token

Enter the value of `AICOS_AUTH_TOKEN` or `API_TOKEN`. This is expected when API
auth is enabled.

### Admin wipe says a token is required

Set `AICOS_AUTH_TOKEN` or `API_TOKEN`, restart the backend, and try again.

### DELETE requests return 403

Check `FRONTEND_URL`, `ALLOWED_ORIGINS`, and reverse-proxy headers. Same-host
browser writes are allowed, but cross-origin writes must match the allowlist.

### Frontend cannot reach the backend

For Docker Compose, `VITE_API_URL=/api` should be built into the frontend image
and nginx proxies `/api` to the backend. Rebuild the frontend after changing
Vite build-time variables:

```bash
docker compose build aicos-frontend
docker compose up -d aicos-frontend
```

### Microsoft email or meetings do not load

Reconnect Microsoft after changing Graph scopes. Confirm the redirect URI in
Microsoft Entra exactly matches the app setting or env fallback.

## Documentation

| Document | Purpose |
| --- | --- |
| [docs/PRODUCTION-SETUP.md](docs/PRODUCTION-SETUP.md) | Production and reverse proxy deployment |
| [docs/MICROSOFT-365-SETUP.md](docs/MICROSOFT-365-SETUP.md) | Microsoft Entra, Graph permissions, Teams policy |
| [docs/MICROSERVICES-INTEGRATION.md](docs/MICROSERVICES-INTEGRATION.md) | Service architecture and integration behavior |
| [docs/ARCHITECTURE_FLOWS.md](docs/ARCHITECTURE_FLOWS.md) | Data-flow diagrams and architecture notes |
| [swag-config/README.md](swag-config/README.md) | SWAG reverse proxy setup |
| [unraid/README.md](unraid/README.md) | Unraid deployment notes |

## License

This project is distributed under the custom AI Chief of Staff Software License.
See [LICENSE](LICENSE) for the full terms.
