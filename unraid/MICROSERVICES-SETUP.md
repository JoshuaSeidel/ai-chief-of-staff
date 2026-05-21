# Unraid Microservices Setup

AI Chief of Staff can run two ways on Unraid:

- Standalone container: simplest path, using the Unraid XML template.
- Full Compose stack: frontend, backend, PostgreSQL, Redis, and optional
  microservices from the repository `docker-compose.yml`.

For most users, start with the standalone template. Use the Compose stack when
you want separately managed services, heavier voice processing, or easier
service-level scaling.

## Required Security

Set `AICOS_AUTH_TOKEN` or `API_TOKEN` before exposing the app or using
destructive admin tools.

History wipe is intentionally disabled until a backend token exists. The browser
will ask for that token when backend API auth is enabled.

## Option 1: Standalone Template

Use `unraid/ai-chief-of-staff.xml` for a single app container.

Recommended settings:

```text
AICOS_AUTH_TOKEN=<long-random-token>
DB_TYPE=postgres
POSTGRES_HOST=<postgres-container-or-ip>
POSTGRES_PORT=5432
POSTGRES_DB=ai_chief_of_staff
POSTGRES_USER=aicos
POSTGRES_PASSWORD=<secure-password>
FRONTEND_URL=http://<unraid-ip>:3001
ALLOWED_ORIGINS=http://<unraid-ip>:3001
TRUST_PROXY=false
```

For SWAG or another HTTPS reverse proxy:

```text
FRONTEND_URL=https://aicos.yourdomain.com
ALLOWED_ORIGINS=https://aicos.yourdomain.com
TRUST_PROXY=true
GOOGLE_REDIRECT_URI=https://aicos.yourdomain.com/api/calendar/google/callback
MICROSOFT_REDIRECT_URI=https://aicos.yourdomain.com/api/calendar/microsoft/callback
```

Fresh installs generate `/app/data/config.json` from `DB_TYPE`,
`DATABASE_URL`, or the `POSTGRES_*` values above.

## Option 2: Full Compose Stack

Use this when you want the full repository-managed stack on Unraid.

1. Install the Docker Compose Manager plugin.
2. Create an appdata directory:

```bash
mkdir -p /mnt/user/appdata/ai-chief-of-staff
cd /mnt/user/appdata/ai-chief-of-staff
```

3. Clone the repository or download the current files:

```bash
git clone https://github.com/JoshuaSeidel/ai-chief-of-staff.git .
cp env.example .env
chmod 600 .env
```

4. Edit `.env` and set at least:

```text
AICOS_AUTH_TOKEN=<long-random-token>
OAUTH_STATE_SECRET=<long-random-secret>
POSTGRES_PASSWORD=<secure-password>
FRONTEND_URL=http://<unraid-ip>:3000
ALLOWED_ORIGINS=http://<unraid-ip>:3000,http://<unraid-ip>:3001
TRUST_PROXY=false
VITE_API_URL=/api
```

5. Validate the generated Compose file:

```bash
docker compose --env-file .env config
```

6. Start the stack:

```bash
docker compose --env-file .env up --build -d
docker compose ps
```

7. Open the frontend:

```text
http://<unraid-ip>:3000
```

## Data Paths

The repository Compose file uses Docker named volumes by default:

- `backend-data`
- `uploads-data`
- `postgres-data`
- `redis-data`
- `pattern-models`
- `voice-recordings`

If you prefer explicit Unraid paths, change the relevant volumes to bind mounts
under `/mnt/user/appdata/ai-chief-of-staff`. Keep PostgreSQL and Redis data on
stable storage and back them up before updates.

## Images

GitHub Actions publishes these image names:

```text
ghcr.io/joshuaseidel/ai-chief-of-staff/aicos-monolith:latest
ghcr.io/joshuaseidel/ai-chief-of-staff/aicos-frontend:latest
ghcr.io/joshuaseidel/ai-chief-of-staff/aicos-backend:latest
ghcr.io/joshuaseidel/ai-chief-of-staff/aicos-ai-intelligence:latest
ghcr.io/joshuaseidel/ai-chief-of-staff/aicos-pattern-recognition:latest
ghcr.io/joshuaseidel/ai-chief-of-staff/aicos-nl-parser:latest
ghcr.io/joshuaseidel/ai-chief-of-staff/aicos-voice-processor:latest
ghcr.io/joshuaseidel/ai-chief-of-staff/aicos-context-service:latest
ghcr.io/joshuaseidel/ai-chief-of-staff/aicos-integrations:latest
```

The repository `docker-compose.yml` builds from source by default. Switch
`build:` blocks to these image names only if you want image-only deployment.

## Microsoft 365

Create an Entra app registration and configure:

```text
MICROSOFT_CLIENT_ID=<application-client-id>
MICROSOFT_CLIENT_SECRET=<client-secret-value>
MICROSOFT_TENANT_ID=<directory-tenant-id>
MICROSOFT_REDIRECT_URI=https://aicos.yourdomain.com/api/calendar/microsoft/callback
```

See `docs/MICROSOFT-365-SETUP.md` for app permissions and admin consent.

## Admin History Wipe

The admin wipe tool is available in Settings > System > Danger Zone.

It requires:

- `AICOS_AUTH_TOKEN` or `API_TOKEN` configured on the backend
- The API token entered in the browser when prompted
- The confirmation phrase `WIPE HISTORY`

It removes operational history such as transcripts, generated briefs, tasks,
commitments, notifications, and cached insights. It preserves configuration,
profiles, prompts, OAuth settings, integration settings, and app secrets.

## Operations

Common commands:

```bash
docker compose ps
docker compose logs -f
docker compose logs -f aicos-backend
docker compose pull
docker compose up --build -d
docker image prune -f
```

Health checks:

```bash
curl -k https://localhost:3001/api/health
curl -k https://localhost:8001/health
curl -k https://localhost:8006/health
```

## Troubleshooting

### Admin Wipe Disabled

Set `AICOS_AUTH_TOKEN` or `API_TOKEN`, restart the backend, then enter the token
in the browser.

### 401 or 403 API Calls

The backend token is configured and the browser is not sending it. Enter the
token when prompted, or clear the stored token and retry.

### Frontend Points at the Wrong API

`VITE_API_URL` is a Vite build-time value. Change it in `.env`, then rebuild the
frontend image:

```bash
docker compose build --no-cache aicos-frontend
docker compose up -d aicos-frontend
```

### PostgreSQL Not Used on First Run

Fresh installs use `DB_TYPE`, `DATABASE_URL`, or `POSTGRES_*` values to generate
`/app/data/config.json`. Existing installs keep their saved config. Update the
database settings in the app or remove the appdata config only after backing up.

### Reverse Proxy Issues

For SWAG, set:

```text
FRONTEND_URL=https://aicos.yourdomain.com
ALLOWED_ORIGINS=https://aicos.yourdomain.com
TRUST_PROXY=true
```

Then restart the backend.

## Support

- GitHub Issues: https://github.com/JoshuaSeidel/ai-chief-of-staff/issues
- Documentation: https://github.com/JoshuaSeidel/ai-chief-of-staff
