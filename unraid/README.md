# Unraid Deployment

AI Chief of Staff can run on Unraid as an all-in-one container or as the full
Docker Compose microservices stack.

For v2.3.0 and later, configure API token authentication before using the app in
production. Destructive admin tools, including history wipe, require
`AICOS_AUTH_TOKEN` or `API_TOKEN`.

## Recommended Setup

Use PostgreSQL for production-style Unraid deployments:

1. Install PostgreSQL from Community Apps or run the official PostgreSQL image.
2. Create a database and user for AI Chief of Staff.
3. Install the AI Chief of Staff template.
4. Set API auth and origin variables.
5. Configure AI and integrations in the app UI.

SQLite is acceptable for local testing, but PostgreSQL is the recommended
long-term database.

## Required Template Values

| Variable | Required | Notes |
| --- | --- | --- |
| `AICOS_AUTH_TOKEN` or `API_TOKEN` | Yes | Required for API auth and admin history wipe |
| `DB_TYPE` | Yes | `postgres` recommended |
| `POSTGRES_HOST` | PostgreSQL | Hostname/IP of PostgreSQL |
| `POSTGRES_PORT` | PostgreSQL | Usually `5432` |
| `POSTGRES_DB` | PostgreSQL | Database name |
| `POSTGRES_USER` | PostgreSQL | Database user |
| `POSTGRES_PASSWORD` | PostgreSQL | Database password |
| `FRONTEND_URL` | Reverse proxy | Public app origin, for example `https://aicos.yourdomain.com` |
| `ALLOWED_ORIGINS` | Reverse proxy | Same public origin, comma-separated if multiple |
| `TRUST_PROXY` | Reverse proxy | `true` behind SWAG/NPM/Traefik |

Generate token values with:

```bash
openssl rand -base64 48   # API and OAuth secrets
openssl rand -hex 32      # PostgreSQL password
```

Leave `VITE_API_TOKEN` blank unless the deployment is private and you
intentionally want the token built into frontend assets.

## PostgreSQL Example

```bash
docker run -d \
  --name=aicos-postgres \
  --net=bridge \
  -e POSTGRES_DB=aicos \
  -e POSTGRES_USER=aicos \
  -e POSTGRES_PASSWORD=replace-with-secure-password \
  -v /mnt/user/appdata/aicos-postgres:/var/lib/postgresql/data \
  postgres:15-alpine
```

Template values:

```text
DB_TYPE=postgres
POSTGRES_HOST=aicos-postgres
POSTGRES_PORT=5432
POSTGRES_DB=aicos
POSTGRES_USER=aicos
POSTGRES_PASSWORD=replace-with-secure-password
```

On a fresh appdata directory, the app generates `/app/data/config.json` from
`DB_TYPE`, `DATABASE_URL`, or the `POSTGRES_*` values in the template. Existing
installs keep their saved database config until changed in Settings.

## SWAG / HTTPS

If publishing through SWAG:

```text
FRONTEND_URL=https://aicos.yourdomain.com
ALLOWED_ORIGINS=https://aicos.yourdomain.com
TRUST_PROXY=true
GOOGLE_REDIRECT_URI=https://aicos.yourdomain.com/api/calendar/google/callback
MICROSOFT_REDIRECT_URI=https://aicos.yourdomain.com/api/calendar/microsoft/callback
```

Copy the SWAG proxy file:

```bash
cp /mnt/user/appdata/ai-chief-of-staff/swag-config/aicos.subdomain.conf \
  /mnt/user/appdata/swag/nginx/proxy-confs/
docker restart swag
```

More detail is in [../swag-config/README.md](../swag-config/README.md).

## Microsoft 365

Microsoft 365 supports email intake, meeting import, Planner/To Do, calendar,
and optional Teams transcript/recording capture.

Teams transcript/recording capture needs Microsoft Graph application
permissions and a Teams application access policy assigned to the same Microsoft
365 user that signs in through the AI Chief of Staff UI. The backend resolves
Teams artifacts through that connected user, so meetings organized by someone
else are captured only when that connected user is on the invite and Microsoft
Graph exposes the meeting artifacts for that user.

Use [../docs/MICROSOFT-365-SETUP.md](../docs/MICROSOFT-365-SETUP.md). For
Unraid behind HTTPS, use this callback:

```text
https://aicos.yourdomain.com/api/calendar/microsoft/callback
```

## Admin History Wipe

The wipe tool is in:

```text
Settings > System > Danger Zone > Wipe History
```

It is designed for starting fresh after a job change or workspace reset. It
deletes history and derived work data while preserving profiles, prompts,
provider settings, and integrations.

It requires:

- `AICOS_AUTH_TOKEN` or `API_TOKEN` configured in the container
- The browser user to enter the API token
- Typing `WIPE HISTORY` in the confirmation modal

Back up PostgreSQL before using it if you may need the old records.

## Backup

PostgreSQL:

```bash
docker exec aicos-postgres pg_dump -U aicos aicos > aicos-backup.sql
```

App data:

```bash
cp -r /mnt/user/appdata/ai-chief-of-staff /mnt/user/backup/
```

## Troubleshooting

### The app asks for an API token

Enter `AICOS_AUTH_TOKEN` or `API_TOKEN`. This is expected when backend auth is
enabled.

### Admin wipe says token required

Set `AICOS_AUTH_TOKEN` or `API_TOKEN` in the template and restart the container.

### DELETE requests return 403

Check `FRONTEND_URL`, `ALLOWED_ORIGINS`, and `TRUST_PROXY`. Behind SWAG, all
three should use the public HTTPS origin/proxy setting.

### OAuth fails

The provider redirect URI must exactly match the public callback URL. Update
Google/Microsoft registration and reconnect the integration in Settings.

### Container cannot connect to PostgreSQL

Confirm the database container is running and reachable from the AI Chief of
Staff container network. Check credentials and database name.

## Support

- GitHub Issues: https://github.com/JoshuaSeidel/ai-chief-of-staff/issues
- Documentation: https://github.com/JoshuaSeidel/ai-chief-of-staff
