# TLS Implementation for AI Chief of Staff

This document provides instructions for implementing TLS/SSL encryption for all inter-container communication in the AI Chief of Staff microservices architecture.

## Overview

All HTTP communication between Docker containers will be encrypted using self-signed TLS certificates. This includes:
- Backend → Microservices (AI Intelligence, Pattern Recognition, etc.)
- Backend → Integrations Service
- Frontend → Backend (already handled by nginx in production)

## Security Benefits

- **Encryption in Transit**: All data between containers is encrypted
- **Defense in Depth**: Even if Docker network is compromised, traffic is encrypted
- **Certificate Validation**: Services validate each other's certificates
- **Industry Standard**: Follows Docker security best practices

## Implementation Status

### ✅ Completed
1. Certificate generation script (`scripts/generate-certs.sh`)
2. .gitignore updated to exclude certificates
3. Backend proxy routes for integrations service

### 🚧 To Be Implemented

#### Phase 1: Certificate Setup
1. **Generate Certificates**
   ```bash
   ./scripts/generate-certs.sh
   ```
   This creates certificates in `./certs/` directory (auto-created, git-ignored)

#### Phase 2: Docker Compose Updates
Add to each service in `docker-compose.yml`:

```yaml
volumes:
  - ./certs:/app/certs:ro  # Mount certificates as read-only
environment:
  - TLS_ENABLED=true
  - TLS_CERT_PATH=/app/certs
  - NODE_TLS_REJECT_UNAUTHORIZED=0  # Only for self-signed certs
```

Example for aicos-backend:
```yaml
aicos-backend:
  # ... existing config ...
  volumes:
    - ./backend:/app
    - /app/node_modules
    - backend-data:/app/data
    - ./certs:/app/certs:ro  # ADD THIS
  environment:
    # ... existing env vars ...
    - AI_INTELLIGENCE_URL=https://aicos-ai-intelligence:8001  # Change http → https
    - PATTERN_RECOGNITION_URL=https://aicos-pattern-recognition:8002  # Change http → https
    - NL_PARSER_URL=https://aicos-nl-parser:8003
    - VOICE_PROCESSOR_URL=https://aicos-voice-processor:8004
    - CONTEXT_SERVICE_URL=https://aicos-context-service:8005
    - INTEGRATIONS_URL=https://aicos-integrations:8006
    - TLS_ENABLED=true
    - TLS_CERT_PATH=/app/certs
    - NODE_TLS_REJECT_UNAUTHORIZED=0
```

#### Phase 3: Update Backend HTTP Clients
File: `backend/routes/integrations-proxy.js` (and similar files)

**Before:**
```javascript
const axios = require('axios');
const INTEGRATIONS_URL = process.env.INTEGRATIONS_URL || 'http://aicos-integrations:8006';
```

**After:**
```javascript
const axios = require('axios');
const https = require('https');
const fs = require('fs');

const INTEGRATIONS_URL = process.env.INTEGRATIONS_URL || 'https://aicos-integrations:8006';

// Create HTTPS agent with certificate validation
let httpsAgent;
if (process.env.TLS_ENABLED === 'true') {
  const certPath = process.env.TLS_CERT_PATH || '/app/certs';
  httpsAgent = new https.Agent({
    ca: fs.readFileSync(`${certPath}/ca-cert.pem`),
    rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0'
  });
}

const integrationsClient = axios.create({
  baseURL: INTEGRATIONS_URL,
  timeout: 30000,
  httpsAgent,  // Use HTTPS agent for certificate validation
  headers: {
    'Content-Type': 'application/json'
  }
});
```

#### Phase 4: Update Microservices to Serve HTTPS
File: `services/integrations/server.js` (example for Node.js services)

**Before:**
```javascript
const express = require('express');
const app = express();

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server listening on port ${PORT}`);
});
```

**After:**
```javascript
const express = require('express');
const https = require('https');
const fs = require('fs');
const app = express();

// Load TLS certificates if enabled
if (process.env.TLS_ENABLED === 'true') {
  const certPath = process.env.TLS_CERT_PATH || '/app/certs';
  const serviceName = 'integrations';  // Change per service
  
  const httpsOptions = {
    key: fs.readFileSync(`${certPath}/${serviceName}-key.pem`),
    cert: fs.readFileSync(`${certPath}/${serviceName}-cert.pem`),
    ca: fs.readFileSync(`${certPath}/ca-cert.pem`),
    requestCert: false,  // Don't require client certificates
    rejectUnauthorized: false  // Allow self-signed certs
  };
  
  https.createServer(httpsOptions, app).listen(PORT, '0.0.0.0', () => {
    logger.info(`HTTPS server listening on port ${PORT}`);
  });
} else {
  // Fallback to HTTP for development
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`HTTP server listening on port ${PORT}`);
  });
}
```

**Python Services (FastAPI example):**
```python
import ssl
import uvicorn

if __name__ == "__main__":
    tls_enabled = os.getenv('TLS_ENABLED', 'false').lower() == 'true'
    
    if tls_enabled:
        cert_path = os.getenv('TLS_CERT_PATH', '/app/certs')
        ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ssl_context.load_cert_chain(
            certfile=f"{cert_path}/ai-intelligence-cert.pem",
            keyfile=f"{cert_path}/ai-intelligence-key.pem"
        )
        ssl_context.load_verify_locations(cafile=f"{cert_path}/ca-cert.pem")
        
        uvicorn.run(app, host="0.0.0.0", port=8001, ssl=ssl_context)
    else:
        uvicorn.run(app, host="0.0.0.0", port=8001)
```

#### Phase 5: Update Health Checks
In `docker-compose.yml`, update health checks to use HTTPS:

**Before:**
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8001/health"]
```

**After:**
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "--insecure", "https://localhost:8001/health"]
```

## Deployment Steps

1. **Generate Certificates**
   ```bash
   ./scripts/generate-certs.sh
   ```

2. **Update docker-compose.yml**
   - Add certificate volumes to all services
   - Change all `http://` URLs to `https://`
   - Add TLS environment variables
   - Update health checks

3. **Update Backend Code**
   - Modify HTTP clients to use HTTPS agents
   - Add certificate validation

4. **Update Microservice Code**
   - Modify servers to use HTTPS if TLS_ENABLED=true
   - Load service-specific certificates

5. **Test Locally**
   ```bash
   docker-compose down
   docker-compose build
   docker-compose up
   ```

6. **Verify TLS**
   - Check logs for "HTTPS server listening"
   - Test API endpoints
   - Verify certificate validation errors are handled

## Certificate Management

### Certificate Validity
- Certificates are valid for **10 years**
- Expiration dates visible in generation script output

### Certificate Rotation
To regenerate certificates (e.g., before expiration):
```bash
# Stop containers
docker-compose down

# Regenerate certificates
./scripts/generate-certs.sh

# Restart containers
docker-compose up -d
```

### Backup Certificates
```bash
# Backup certificates to secure location
tar -czf certs-backup-$(date +%Y%m%d).tar.gz certs/

# Store backup securely (not in git!)
```

## Security Considerations

### ✅ Secure
- Private keys are never committed to git
- Certificates mounted read-only in containers
- Certificate validation between services
- 4096-bit RSA keys

### ⚠️ Important Notes
- `NODE_TLS_REJECT_UNAUTHORIZED=0` needed for self-signed certs
- Only use self-signed certs for internal services
- For external traffic, use proper CA-signed certificates
- Keep `ca-key.pem` and `*-key.pem` files secure

### 🔒 Production Hardening
For production deployments:
1. Use proper CA-signed certificates for public-facing services
2. Consider using Let's Encrypt for external endpoints
3. Enable `rejectUnauthorized: true` if using CA-signed certs
4. Implement certificate rotation automation
5. Monitor certificate expiration dates

## Troubleshooting

### Service Won't Start
```bash
# Check certificate files exist
ls -la certs/

# Verify certificate permissions
ls -l certs/*-key.pem  # Should be 600
ls -l certs/*-cert.pem  # Should be 644

# Check Docker logs
docker-compose logs aicos-backend
```

### Certificate Validation Errors
```bash
# Verify certificate chain
openssl verify -CAfile certs/ca-cert.pem certs/backend-cert.pem

# Check certificate details
openssl x509 -in certs/backend-cert.pem -text -noout
```

### Connection Refused
- Ensure all URLs are `https://` not `http://`
- Check health checks use `--insecure` flag
- Verify TLS_ENABLED=true in all service configs

## Testing TLS

### Test Backend → Integrations
```bash
# From host machine (requires certificates)
curl --cacert certs/ca-cert.pem https://localhost:8006/health

# From within backend container
docker exec -it aicos-backend curl --insecure https://aicos-integrations:8006/health
```

### Test Certificate Validation
```bash
# Should succeed (with CA cert)
curl --cacert certs/ca-cert.pem https://localhost:8006/health

# Should fail (without CA cert)
curl https://localhost:8006/health
```

## Rollback Plan

If TLS causes issues, rollback by:
1. Change all `https://` back to `http://` in docker-compose.yml
2. Remove TLS environment variables
3. Remove certificate volumes
4. Restart containers: `docker-compose restart`

## Future Enhancements

- [ ] Certificate expiration monitoring
- [ ] Automatic certificate rotation
- [ ] Mutual TLS (mTLS) with client certificates
- [ ] Integration with Vault for secret management
- [ ] Let's Encrypt integration for external endpoints
- [ ] Certificate revocation list (CRL) support

## References

- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [OpenSSL Certificate Management](https://www.openssl.org/docs/man1.1.1/man1/openssl.html)
- [Node.js TLS/SSL](https://nodejs.org/api/tls.html)
- [Python SSL](https://docs.python.org/3/library/ssl.html)
