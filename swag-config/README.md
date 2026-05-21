# SWAG Reverse Proxy

This directory contains an example SWAG proxy configuration for publishing AI
Chief of Staff over HTTPS.

The current Docker Compose stack exposes the frontend on port `3000`. The
frontend nginx container proxies `/api` to the backend, so SWAG should normally
proxy only to the frontend.

## Required App Environment

Set these in `.env` before exposing the app:

```env
AICOS_AUTH_TOKEN=replace-with-a-long-random-token
FRONTEND_URL=https://aicos.yourdomain.com
ALLOWED_ORIGINS=https://aicos.yourdomain.com
TRUST_PROXY=true
VITE_API_URL=/api
```

Destructive admin tools, including history wipe, require `AICOS_AUTH_TOKEN` or
`API_TOKEN`. Do not leave API authentication disabled on a public SWAG deployment.

## DNS And Certificate

1. Create a DNS record for your app, for example:

   ```text
   aicos.yourdomain.com -> your server IP
   ```

2. Configure SWAG with your DNS provider plugin.
3. Confirm ports `80` and `443` reach SWAG.
4. Wait for SWAG to issue the Let's Encrypt certificate.

## Container Networking

SWAG and `aicos-frontend` must share a Docker network. If you use a separate
proxy network:

```bash
docker network create proxynet
docker network connect proxynet swag
docker network connect proxynet aicos-frontend
```

If you use the included compose network, connect SWAG to `aicos-network`.

## Proxy Target

Use this upstream:

```text
http://aicos-frontend:3000
```

Required headers:

```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

The included `aicos.subdomain.conf` also uses extended timeouts because AI and
transcript processing requests can take longer than normal web requests.

## OAuth Redirect URIs

Use public HTTPS callback URLs in Google and Microsoft app registrations:

```text
https://aicos.yourdomain.com/api/calendar/google/callback
https://aicos.yourdomain.com/api/calendar/microsoft/callback
```

Set the same values in `.env` or in the app Settings:

```env
GOOGLE_REDIRECT_URI=https://aicos.yourdomain.com/api/calendar/google/callback
MICROSOFT_REDIRECT_URI=https://aicos.yourdomain.com/api/calendar/microsoft/callback
```

Redirect URI values must match exactly, including scheme, host, and path.

## Install The SWAG Config

Copy the proxy file:

```bash
cp swag-config/aicos.subdomain.conf /mnt/user/appdata/swag/nginx/proxy-confs/
docker restart swag
```

Then open:

```text
https://aicos.yourdomain.com
```

## Troubleshooting

### 401 API responses

This is expected when `AICOS_AUTH_TOKEN` or `API_TOKEN` is set. Enter the token
in the app prompt.

### 403 on DELETE/POST/PUT

Check:

- `FRONTEND_URL=https://aicos.yourdomain.com`
- `ALLOWED_ORIGINS=https://aicos.yourdomain.com`
- `TRUST_PROXY=true`
- SWAG sends `X-Forwarded-Proto`

### 502 Bad Gateway

Check:

- SWAG and `aicos-frontend` are on the same Docker network
- The frontend container name is `aicos-frontend`
- `docker compose ps` shows the frontend healthy
- SWAG logs with `docker logs swag`

### OAuth redirect mismatch

The Entra or Google redirect URI must exactly match the public callback URL.
Update the provider registration, then reconnect the integration in Settings.

### Admin wipe disabled

Set `AICOS_AUTH_TOKEN` or `API_TOKEN`, restart the backend, and enter the token
in the app. The wipe endpoint will not run without backend API authentication.
