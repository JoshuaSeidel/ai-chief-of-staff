# AI Chief of Staff

AI Chief of Staff is a self-hosted executive operating system for turning meetings,
emails, recordings, and ad hoc notes into a reliable command center for daily work.
It combines transcript intake, Microsoft 365 email and meeting capture, task
extraction, calendar planning, daily briefs, and AI-assisted prioritization in one
responsive web app.

[![Docker Ready](https://img.shields.io/badge/Docker-ready-blue)](docker-compose.yml)
[![PWA](https://img.shields.io/badge/PWA-enabled-success)](frontend/package.json)
[![License](https://img.shields.io/badge/License-custom-lightgrey)](LICENSE)
[![Repository](https://img.shields.io/badge/GitHub-ai--chief--of--staff-black)](https://github.com/JoshuaSeidel/ai-chief-of-staff)

## What It Does

AI Chief of Staff is designed for people who spend their day across meetings,
mail, calendars, and task systems. It helps answer:

- What did I commit to?
- What needs action from email or meetings?
- What should I focus on today?
- Which tasks belong together?
- Where are my calendar, email, meeting, Jira, or Planner connections broken?

The platform is self-hosted and database-driven. Most application settings are
managed in the UI instead of through environment files.

## Current Capabilities

| Area | Capability |
| --- | --- |
| Workspace UI | Modern responsive shell, dark/light mode, animated navigation, profile switcher, connection badges |
| Transcript intake | Upload text transcripts, meeting notes, and supported audio/video files for processing |
| Email intake | Pull Microsoft 365 mailbox messages, preview them, and process selected messages into the same workflow as meeting notes |
| Meeting intake | Pull Microsoft 365 calendar meetings, import meeting metadata, and capture Teams transcript/recording artifacts when tenant permissions are configured |
| Task command center | Track commitments, follow-ups, risks, priorities, deadlines, assignees, and completion state |
| Calendar planning | Google Calendar and Microsoft Calendar OAuth flows with profile-aware token storage |
| External task systems | Microsoft Planner/To Do and Jira integration points |
| AI intelligence | Brief generation, task extraction, task grouping, effort/energy analysis, and productivity patterns |
| Notifications | Web Push support with VAPID key generation and task reminders |
| Deployment | Docker Compose microservices stack with PostgreSQL, Redis, backend, frontend, and AI services |

## Screens And Workflows

The primary app surface is the redesigned command shell:

- Sidebar navigation on desktop, drawer navigation on mobile
- Header-level connectivity pills for configured services only
- Email and meeting intake page for Microsoft 365 workstreams
- Task, transcript, calendar, intelligence, and settings modules
- Responsive layouts for desktop, tablet, and phone
- API-token prompt when backend token protection is enabled

Typical workflow:

1. Open the dashboard and review the day.
2. Import a meeting transcript, Teams meeting artifact, or email message.
3. Let the system extract tasks, risks, deadlines, and follow-ups.
4. Review work in the task command center.
5. Group related tasks with AI assistance.
6. Sync or plan work through Calendar, Planner, Jira, or Microsoft 365.

## Architecture

The stack is split into a React frontend, an Express backend, persistent data
stores, and optional specialist AI services.

```text
Browser
  |
  v
React PWA frontend                 Port 3000
  |
  v
Node/Express backend API           Port 3001
  |
  +-- PostgreSQL                   Primary production database
  +-- Redis                        Cache and service coordination
  +-- AI Intelligence service      Task analysis and grouping
  +-- Pattern Recognition service  Productivity insights
  +-- NL Parser service            Task extraction
  +-- Voice Processor service      Audio transcription
  +-- Context Service              Fast context retrieval
  +-- Integrations service         External workflow integrations
```

The backend can also run with SQLite for local development and review.
PostgreSQL is recommended for production.

## Repository Layout

| Path | Purpose |
| --- | --- |
| [frontend/](frontend/) | React 19 PWA, responsive command shell, app screens, settings UI |
| [backend/](backend/) | Express API, database migrations, OAuth flows, security middleware, integration routes |
| [services/](services/) | Microservices for AI intelligence, parsing, context, voice, and integrations |
| [docs/](docs/) | Production setup, Microsoft 365 setup, architecture, styling, and integration docs |
| [unraid/](unraid/) | Unraid templates and deployment notes |
| [docker-compose.yml](docker-compose.yml) | Main local/microservices Docker Compose stack |
| [env.example](env.example) | Environment variable reference |

## Quick Start With Docker Compose

Prerequisites:

- Docker and Docker Compose
- Git
- API keys or local AI provider credentials if you want AI features immediately

```bash
git clone https://github.com/JoshuaSeidel/ai-chief-of-staff.git
cd ai-chief-of-staff

cp env.example .env
docker compose up --build
```

Then open:

```text
http://localhost:3000
```

The backend API listens on:

```text
http://localhost:3001
```

For production, review [docs/PRODUCTION-SETUP.md](docs/PRODUCTION-SETUP.md)
before exposing the app outside a trusted network.

## Local Development

Run the backend:

```bash
cd backend
npm install
CONFIG_DIR=./data PORT=3001 npm start
```

Run the frontend in another terminal:

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 3000
```

Useful checks:

```bash
cd frontend
npm run lint
npm run build

cd ../backend
npm audit --audit-level=low
node -c server.js
```

## First-Time App Setup

1. Open the app.
2. Go to Settings.
3. Create or select a profile.
4. Configure an AI provider.
5. Configure integrations you need.
6. Connect Microsoft 365, Google Calendar, Jira, or Planner as needed.
7. Confirm the header shows only the connection pills that are configured for the profile.

Important production settings:

```env
FRONTEND_URL=https://aicos.yourdomain.com
ALLOWED_ORIGINS=https://aicos.yourdomain.com
AICOS_AUTH_TOKEN=generate-a-long-random-token
OAUTH_STATE_SECRET=generate-a-long-random-secret
TRUST_PROXY=true
```

If `AICOS_AUTH_TOKEN` is set, API requests must include:

```text
Authorization: Bearer <token>
```

The frontend shows a secure API-token prompt when the backend returns `401`.
For public deployments, leave `VITE_API_TOKEN` blank and let authorized users
enter the token in the app.

## Microsoft 365 Integration

Microsoft 365 is the primary integration path for email, meeting, Planner/To Do,
and Teams meeting artifacts.

The system supports:

- Delegated mailbox access for email intake
- Delegated calendar access for meeting lists and meeting metadata
- Delegated Planner/To Do access for task workflows
- App-only Teams transcript and recording artifact capture when tenant permissions allow it

You need a real Microsoft Entra app registration for production. The complete
setup guide is in [docs/MICROSOFT-365-SETUP.md](docs/MICROSOFT-365-SETUP.md).

At a high level:

1. Register a single-tenant Microsoft Entra app.
2. Add delegated Microsoft Graph permissions for mail, calendar, tasks, and online meetings.
3. Add app-only permissions for Teams transcript and recording capture if needed.
4. Grant admin consent.
5. Grant a Teams application access policy for meeting artifact APIs.
6. Save the Client ID, Client Secret, Tenant ID, and Redirect URI in Settings.
7. Connect Microsoft from the app.

## AI Providers

Supported providers include:

- Anthropic Claude
- OpenAI
- Ollama
- AWS Bedrock

AI provider and model selection are managed in Settings. Environment variables
can still provide fallback API keys for deployment automation.

Recommended usage:

- Use Anthropic or OpenAI for highest quality brief and extraction workflows.
- Use Ollama when local processing and data locality are more important than model quality.
- Use separate provider/model settings per profile or service when needed.

## Integrations

| Integration | Status | Notes |
| --- | --- | --- |
| Microsoft 365 | Supported | Email, calendar, meetings, Planner/To Do, Teams artifacts with tenant setup |
| Google Calendar | Supported | OAuth flow, profile-aware token storage |
| Microsoft Planner | Supported | Shares Microsoft 365 OAuth configuration |
| Jira | Supported | Used for task synchronization workflows |
| Radicale CalDAV | Legacy/supporting | Self-hosted calendar option |

Connectivity pills in the app header are shown only when the corresponding
integration is configured for the active profile. This prevents users from seeing
irrelevant unavailable services.

## Security Model

The backend includes the following controls:

- API token authentication with `AICOS_AUTH_TOKEN` or `API_TOKEN`
- CORS allowlist through `FRONTEND_URL` and `ALLOWED_ORIGINS`
- Origin guard for browser write requests
- Rate limiting for API traffic, OAuth callbacks, and frontend fallback routes
- Security headers, including CSP in production mode
- Request IDs for traceability
- Sensitive config masking in API responses
- OAuth state signing
- Restricted SQLite and config-file permissions where the filesystem allows it
- Upload type allowlisting for transcript and supported media intake
- TLS verification enabled by default for internal service calls

Operational notes:

- Use HTTPS in production.
- Set `TRUST_PROXY=true` behind a trusted reverse proxy.
- Do not commit `.env`, Microsoft client secrets, OAuth tokens, API keys, or database files.
- Treat Microsoft Graph app-only permissions as high-impact tenant access.
- Use Teams application access policies to scope Teams artifact capture.

## Configuration Philosophy

Infrastructure belongs in environment variables:

- Database connection
- Redis URL
- Service discovery URLs
- Runtime mode
- CORS origins
- API token settings
- OAuth state secret

Product behavior belongs in the app database and Settings UI:

- AI provider and model preferences
- Calendar and integration settings
- Profile preferences
- Prompt customization
- Notification settings
- User-facing workflow preferences

This keeps production deployments stable while allowing operational changes
without rebuilding containers.

## Production Deployment

Read [docs/PRODUCTION-SETUP.md](docs/PRODUCTION-SETUP.md) before production use.

Minimum production checklist:

- Use PostgreSQL instead of SQLite.
- Set a strong `AICOS_AUTH_TOKEN`.
- Set `FRONTEND_URL` and `ALLOWED_ORIGINS`.
- Put the app behind HTTPS.
- Keep TLS verification enabled for internal service calls.
- Use secure persistent volumes for backend data and database files.
- Back up the database and configuration directory.
- Configure Microsoft 365 in a real tenant if email or meeting capture is required.

Unraid-specific deployment notes are in [unraid/README.md](unraid/README.md).

## Documentation

| Document | Purpose |
| --- | --- |
| [docs/MICROSOFT-365-SETUP.md](docs/MICROSOFT-365-SETUP.md) | Microsoft Entra app, Graph permissions, Teams policy, and verification |
| [docs/PRODUCTION-SETUP.md](docs/PRODUCTION-SETUP.md) | Production deployment and reverse proxy guidance |
| [docs/MICROSERVICES-INTEGRATION.md](docs/MICROSERVICES-INTEGRATION.md) | How backend and AI services work together |
| [docs/ARCHITECTURE_FLOWS.md](docs/ARCHITECTURE_FLOWS.md) | Architecture and data-flow diagrams |
| [docs/STYLING-GUIDE.md](docs/STYLING-GUIDE.md) | Frontend styling and design guidance |
| [docs/MICROSOFT-PLANNER-SETUP.md](docs/MICROSOFT-PLANNER-SETUP.md) | Legacy pointer to the shared Microsoft 365 setup |

## Troubleshooting

### The frontend cannot reach the backend

- Confirm the backend is running on port `3001`.
- Confirm `VITE_API_URL` or the default local API URL points to the backend.
- Check `FRONTEND_URL` and `ALLOWED_ORIGINS` if running production mode locally.

### The app asks for an API token

The backend is protected by `AICOS_AUTH_TOKEN` or `API_TOKEN`. Enter the matching
token in the prompt, or remove the token setting for local-only development.

### Microsoft email or meetings do not load

- Confirm Microsoft Client ID, Client Secret, Tenant ID, and Redirect URI are saved.
- Confirm the redirect URI matches the Entra app registration exactly.
- Reconnect Microsoft after changing Graph scopes.
- Check [docs/MICROSOFT-365-SETUP.md](docs/MICROSOFT-365-SETUP.md).

### Teams transcripts or recordings are unavailable

- Confirm app-only Graph permissions have admin consent.
- Confirm a Teams application access policy is granted to the organizer or tenant.
- Wait for Microsoft policy propagation.
- Verify the meeting includes a Teams join URL.

### Audio transcription fails with TLS errors

- Mount the internal CA certificate for service-to-service TLS.
- Use `ALLOW_INSECURE_TLS=true` only for local development.
- Keep TLS verification enabled in production.

## Contributing

1. Create a branch.
2. Keep changes scoped.
3. Run relevant local checks.
4. Open a pull request.

Recommended frontend checks:

```bash
cd frontend
npm run lint
npm run build
```

Recommended backend checks:

```bash
cd backend
npm audit --audit-level=low
node -c server.js
```

## License

This project is distributed under the custom AI Chief of Staff Software License.
See [LICENSE](LICENSE) for the full terms.

## Support

- Issues: [GitHub Issues](https://github.com/JoshuaSeidel/ai-chief-of-staff/issues)
- Discussions: [GitHub Discussions](https://github.com/JoshuaSeidel/ai-chief-of-staff/discussions)
- Documentation: [docs/](docs/)
