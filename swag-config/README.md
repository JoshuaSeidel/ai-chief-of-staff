# SWAG Reverse Proxy Configuration

This directory contains the SWAG (Secure Web Application Gateway) configuration for AI Chief of Staff.

## Prerequisites

1. **SWAG Container**: Install LinuxServer.io SWAG from Community Applications
2. **DNS Configuration**: Create a CNAME or A record: `aicos.yourdomain.com` → Your server IP
3. **Network**: Both SWAG and AI Chief of Staff containers must be on the same Docker network

## Installation Steps

### 1. Setup Docker Network (if needed)

```bash
docker network create proxynet
```

### 2. Update AI Chief of Staff Container

Add the container to the proxy network:

**Via Unraid Docker UI:**
- Edit the AI Chief of Staff container
- Under "Network Type", add `proxynet` as an additional network
- Or change Network Type to `proxynet` if you want it only on that network

**Via Docker Run:**
```bash
docker run -d \
  --name=ai-chief-of-staff \
  --network=proxynet \
  -v /mnt/user/appdata/ai-chief-of-staff/data:/app/data \
  -v /mnt/user/appdata/ai-chief-of-staff/uploads:/app/uploads \
  --restart=unless-stopped \
  ghcr.io/joshuaseidel/plaud-ai-chief-of-staff:latest
```

Note: Remove the `-p 3001:3001` port mapping since SWAG will handle external access.

### 3. Copy SWAG Configuration

Copy `aicos.subdomain.conf` to your SWAG config directory:

```bash
cp aicos.subdomain.conf /mnt/user/appdata/swag/nginx/proxy-confs/
```

Or manually copy via Unraid file browser:
- Source: `/mnt/user/appdata/ai-chief-of-staff/swag-config/aicos.subdomain.conf`
- Destination: `/mnt/user/appdata/swag/nginx/proxy-confs/aicos.subdomain.conf`

### 4. Update Google Calendar OAuth (if using)

If you've configured Google Calendar integration, you need to update the OAuth redirect URI:

1. Go to [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials)
2. Edit your OAuth 2.0 Client ID
3. Update **Authorized redirect URIs** to:
   ```
   https://aicos.yourdomain.com/api/calendar/google/callback
   ```
4. Save changes

Then in AI Chief of Staff Configuration, you may need to reconnect Google Calendar.

### 5. Restart SWAG

```bash
docker restart swag
```

Or via Unraid: Go to Docker tab → Click SWAG → Restart

### 6. Test Access

Visit: `https://aicos.yourdomain.com`

You should see:
- ✅ SSL certificate (automatic via Let's Encrypt)
- ✅ AI Chief of Staff dashboard
- ✅ No need to specify port 3001

## Configuration Details

### Upload Size Limit
The config allows uploads up to **50MB** (`client_max_body_size 50M`). 

To increase:
```nginx
client_max_body_size 100M;  # Allow 100MB uploads
```

### Timeouts
Long-running AI requests have extended timeouts (300 seconds):
- `proxy_connect_timeout 300s`
- `proxy_send_timeout 300s`
- `proxy_read_timeout 300s`

Adjust these if needed for very large transcripts.

### WebSocket Support
The config includes WebSocket support for real-time features:
```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

## Troubleshooting

### 502 Bad Gateway
- Check that both containers are on the same network
- Verify AI Chief of Staff container name is `ai-chief-of-staff`
- Check SWAG logs: `docker logs swag`

### SSL Certificate Issues
- Verify DNS is properly configured
- Check SWAG logs for Let's Encrypt errors
- Ensure ports 80 and 443 are forwarded to your server

### Can't Access Locally
If you want to access via both:
- External: `https://aicos.yourdomain.com`
- Internal: `http://192.168.x.x:3001`

Keep the port mapping `-p 3001:3001` in the AI Chief of Staff container.

### Google Calendar OAuth Fails
Make sure you've updated the redirect URI in Google Cloud Console to use `https://aicos.yourdomain.com`.

## Alternative: Custom Domain (Not Subdomain)

If you want to use `aichiefofstaff.com` instead of `aicos.domain.com`, rename the file:

```bash
mv aicos.subdomain.conf aichiefofstaff.conf
```

And update the `server_name` line:
```nginx
server_name aichiefofstaff.com;
```

## Security Notes

- SWAG provides automatic SSL/TLS encryption via Let's Encrypt
- All traffic is encrypted end-to-end
- API keys and sensitive data are protected in transit
- Consider adding HTTP authentication for additional security:

```nginx
# Add to location / block
auth_basic "Restricted";
auth_basic_user_file /config/nginx/.htpasswd;
```

