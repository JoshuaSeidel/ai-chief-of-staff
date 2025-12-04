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

Add the container to the proxy network and set the redirect URI:

**Via Unraid Docker UI:**
- Edit the AI Chief of Staff container
- Under "Network Type", add `proxynet` as an additional network
- Add Environment Variable:
  - **Variable**: `GOOGLE_REDIRECT_URI`
  - **Value**: `https://aicos.yourdomain.com/api/calendar/google/callback`
- Apply changes

**Via Docker Run:**
```bash
docker run -d \
  --name=ai-chief-of-staff \
  --network=proxynet \
  -e GOOGLE_REDIRECT_URI=https://aicos.yourdomain.com/api/calendar/google/callback \
  -v /mnt/user/appdata/ai-chief-of-staff/data:/app/data \
  -v /mnt/user/appdata/ai-chief-of-staff/uploads:/app/uploads \
  --restart=unless-stopped \
  ghcr.io/joshuaseidel/plaud-ai-chief-of-staff:latest
```

**Important:** Replace `aicos.yourdomain.com` with your actual domain!

Note: Remove the `-p 3001:3001` port mapping since SWAG will handle external access.

### 3. Copy SWAG Configuration

Copy `aicos.subdomain.conf` to your SWAG config directory:

```bash
cp aicos.subdomain.conf /mnt/user/appdata/swag/nginx/proxy-confs/
```

Or manually copy via Unraid file browser:
- Source: `/mnt/user/appdata/ai-chief-of-staff/swag-config/aicos.subdomain.conf`
- Destination: `/mnt/user/appdata/swag/nginx/proxy-confs/aicos.subdomain.conf`

### 4. Configure Google Calendar OAuth (if using)

If you're using Google Calendar integration with SWAG, you have **TWO options**:

#### Option A: Environment Variable (Recommended - Easiest)

Set the `GOOGLE_REDIRECT_URI` environment variable when creating the container (see step 2 above).

Then:
1. **In Google Cloud Console:**
   - Go to [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials)
   - Edit your OAuth 2.0 Client ID
   - Add to **Authorized redirect URIs**:
     ```
     https://aicos.s1m0n.app/api/calendar/google/callback
     ```
   - Save changes

2. **In AI Chief of Staff Configuration:**
   - Enter your Google Client ID and Secret
   - Leave Redirect URI field blank (uses environment variable)
   - Click "Connect Google Calendar"

#### Option B: Database Configuration

If you didn't set the environment variable:

1. **In Google Cloud Console:** (same as above)
   - Add the redirect URI to authorized list

2. **In AI Chief of Staff Configuration:**
   - Go to Configuration → Google Calendar section
   - Enter Client ID, Client Secret, **AND Redirect URI**:
     ```
     https://aicos.s1m0n.app/api/calendar/google/callback
     ```
   - Click Save Configuration
   - **Restart the container**
   - Click "Connect Google Calendar"

**Important:** 
- The redirect URI must match exactly (https, domain, path)
- Replace `aicos.s1m0n.app` with YOUR actual domain
- Environment variable takes precedence over database config

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

**Note on Timeouts:**
The SWAG configuration includes 180-second timeouts for proxy requests. This is required because AI operations (brief generation, pattern analysis) can take 30-120 seconds. If you see 502 Bad Gateway errors during AI operations, check:
1. SWAG timeout settings in the subdomain config
2. Frontend nginx timeout settings (in the container)
3. Backend is running and healthy

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

