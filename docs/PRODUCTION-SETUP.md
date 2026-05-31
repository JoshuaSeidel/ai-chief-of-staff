# Production Setup

This guide deploys AI Chief of Staff with the repository `docker-compose.yml`,
PostgreSQL, Redis, the frontend, backend, and the microservices stack.

For a production or internet-accessible deployment, API token authentication is
required. Destructive admin tools, including history wipe, are disabled unless
`AICOS_AUTH_TOKEN` or `API_TOKEN` is configured.

## 1. Prerequisites

- Docker and Docker Compose
- A public DNS name, such as `aicos.yourdomain.com`
- HTTPS reverse proxy, such as SWAG, Traefik, Nginx Proxy Manager, or Caddy
- SMTP or mail access only if you use external notification workflows
- Microsoft Entra admin access if using Microsoft 365

Expose only the reverse proxy publicly. Do not publish PostgreSQL or Redis to
the internet.

## 2. Clone And Configure

```bash
git clone https://github.com/JoshuaSeidel/ai-chief-of-staff.git
cd ai-chief-of-staff

cp env.example .env
```

Edit `.env`.

Required production values:

```env
AICOS_AUTH_TOKEN=replace-with-a-long-random-token
POSTGRES_PASSWORD=replace-with-a-secure-postgres-password
FRONTEND_URL=https://aicos.yourdomain.com
ALLOWED_ORIGINS=https://aicos.yourdomain.com
TRUST_PROXY=true
NODE_ENV=production
VITE_API_URL=/api
```

Generate secrets:

```bash
openssl rand -base64 48   # AICOS_AUTH_TOKEN
openssl rand -hex 32      # POSTGRES_PASSWORD (URL-safe for DATABASE_URL)
openssl rand -base64 48   # OAUTH_STATE_SECRET
```

Recommended:

```env
OAUTH_STATE_SECRET=replace-with-a-long-random-oauth-secret
ALLOW_LOCALHOST_CORS=false
ALLOW_INSECURE_TLS=false
```

Use `ALLOW_INSECURE_TLS=true` only while running the included self-signed
inter-service certificates without a trusted internal CA. The `tls-certs` named
volume is created automatically and shared by the backend and microservices.

## 3. Validate Compose Configuration

```bash
docker compose --env-file .env config
```

If this command reports that `AICOS_AUTH_TOKEN` or `POSTGRES_PASSWORD` is
missing, fix `.env` before starting the stack.

On fresh installs, the backend writes its initial `config.json` from `DB_TYPE`,
`DATABASE_URL`, or `POSTGRES_*` values. Existing installs keep their saved
database settings until changed in Settings.

## 4. Start The Stack

```bash
docker compose up --build -d
docker compose ps
docker compose logs -f aicos-backend
```

Local service ports default to:

| Service | Port |
| --- | --- |
| Frontend | `3000` |
| Backend | `3001` |
| PostgreSQL | `5432` |
| Redis | `6379` |
| AI Intelligence | `8001` |
| Pattern Recognition | `8002` |
| NL Parser | `8003` |
| Voice Processor | `8004` |
| Context Service | `8005` |
| Integrations | `8006` |

You can override host ports in `.env`, for example `FRONTEND_PORT=8080`.

## 5. Reverse Proxy

Proxy your public hostname to the frontend container:

```text
https://aicos.yourdomain.com -> http://aicos-frontend:3000
```

The frontend nginx container proxies `/api` to the backend over the internal
Docker network.

Required proxy headers:

```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

For SWAG, see [../swag-config/README.md](../swag-config/README.md).

## 6. First Login

Open:

```text
https://aicos.yourdomain.com
```

When prompted, enter the value of `AICOS_AUTH_TOKEN` or `API_TOKEN`.

The browser stores the token locally for API requests. Do not set
`VITE_API_TOKEN` in public deployments unless you explicitly want the token
baked into frontend assets.

## 7. In-App Setup

In `Settings`:

1. Confirm the active profile.
2. Configure AI provider keys and model choices.
3. Configure Microsoft 365, Google Calendar, Jira, or Planner.
4. Confirm header connectivity pills appear only for configured services.
5. Test import of one transcript, email, or meeting.

## 8. Microsoft 365

Use [MICROSOFT-365-SETUP.md](MICROSOFT-365-SETUP.md) for:

- Microsoft Entra app registration
- Delegated Graph permissions
- Application permissions for Teams transcript/recording capture
- User-scoped Teams application access policy
- Redirect URI setup

Production callback:

```text
https://aicos.yourdomain.com/api/calendar/microsoft/callback
```

Set `MICROSOFT_REDIRECT_URI` in `.env` or save it in Settings.

For Teams recordings and transcripts, assign the Teams application access
policy to the same Microsoft 365 user that signs in through AI Chief of Staff.
The backend resolves artifacts through that connected user's
`/onlineMeetings` path, so meetings organized by other people are captured only
when the connected user is on the meeting invite and Microsoft Graph still
exposes the artifacts.

## 9. Admin History Wipe

The wipe tool is in:

```text
Settings > System > Danger Zone > Wipe History
```

It is intended for starting fresh, such as after changing jobs.

It deletes:

- Transcripts
- Imported email and meeting records
- Tasks, risks, follow-ups, and commitments
- Briefs
- Context and derived intelligence
- Project/task associations
- Notification history

It preserves:

- Profiles
- Prompts
- AI provider settings
- Microsoft/Google/Jira/Planner configuration and tokens
- OAuth and VAPID configuration

Safeguards:

- Backend requires `AICOS_AUTH_TOKEN` or `API_TOKEN`
- UI requires typing `WIPE HISTORY`
- User chooses all profiles or current profile only

Back up PostgreSQL before running the wipe if there is any chance you will need
the old job history again.

## 10. Backups

Database backup:

```bash
docker exec aicos-postgres pg_dump \
  -U "$POSTGRES_USER" \
  "$POSTGRES_DB" > aicos-backup.sql
```

Volume backup:

```bash
docker run --rm \
  -v ai-chief-of-staff_backend-data:/data \
  -v "$PWD":/backup \
  alpine tar czf /backup/backend-data.tar.gz -C /data .
```

Restore database:

```bash
cat aicos-backup.sql | docker exec -i aicos-postgres psql \
  -U "$POSTGRES_USER" \
  "$POSTGRES_DB"
```

## 11. Updates

```bash
git fetch origin
git pull --ff-only origin main
docker compose pull
docker compose up --build -d
docker compose logs -f aicos-backend
```

If you change `VITE_API_URL` or `VITE_API_TOKEN`, rebuild the frontend image:

```bash
docker compose build aicos-frontend
docker compose up -d aicos-frontend
```

## Troubleshooting

### Backend says API token authentication is disabled

Set `AICOS_AUTH_TOKEN` or `API_TOKEN` in `.env`, then restart:

```bash
docker compose up -d aicos-backend
```

### Admin wipe says a token is required

Same fix: configure `AICOS_AUTH_TOKEN` or `API_TOKEN`. The destructive endpoint
intentionally refuses to run without backend auth configured.

### Browser writes return 403

Check:

- `FRONTEND_URL`
- `ALLOWED_ORIGINS`
- `TRUST_PROXY=true`
- Reverse-proxy `X-Forwarded-Proto`

Same-host writes are accepted. Cross-origin writes must match `ALLOWED_ORIGINS`.

### Frontend calls the wrong backend

`VITE_API_URL` is build-time, not runtime. Set it in `.env`, then rebuild:

```bash
docker compose build aicos-frontend
docker compose up -d aicos-frontend
```

### Teams capture is forbidden

Confirm:

- Microsoft Graph application permissions have admin consent
- Teams application access policy is granted to the connected Microsoft user
- Tenant ID is a real tenant GUID, not `common`
- Policy propagation has completed

### Database will not start

Run:

```bash
docker compose logs aicos-postgres
docker compose --env-file .env config
```

Make sure `POSTGRES_PASSWORD` is set and old volumes are not initialized with a
different username/password pair.
