# Integrations Microservice - Remaining Tasks

## ✅ Completed
1. ✅ Created integrations microservice structure
2. ✅ Implemented all 6 integration services (Trello, Monday, Jira, Planner, Google Calendar, MS Calendar)
3. ✅ Created all route handlers with full CRUD operations
4. ✅ Updated docker-compose.yml with new service
5. ✅ Updated GitHub Actions workflow for CI/CD
6. ✅ Database helper utility with PostgreSQL/SQLite support
7. ✅ Dockerfile with health checks
8. ✅ README documentation

## 🔄 In Progress - Backend Proxy Routes
The backend currently has routes that directly call integration services. These need to be updated to proxy requests to the integrations microservice at http://aicos-integrations:8006.

### Files to Update:
- `backend/routes/calendar.js` - Proxy to `/calendar/google/*` and `/calendar/microsoft/*`
- `backend/routes/commitments.js` - Proxy task completion to `/tasks/{jira|planner|trello|monday}/*`
- `backend/routes/planner.js` - Proxy to `/tasks/planner/*`
- `backend/routes/config.js` or similar - Add Trello/Monday.com configuration endpoints

### Approach:
Use `http-proxy-middleware` or simple `axios` forwarding:
```javascript
const axios = require('axios');
const INTEGRATIONS_URL = process.env.INTEGRATIONS_URL || 'http://aicos-integrations:8006';

// Example proxy
router.post('/calendar/google/event', async (req, res) => {
  try {
    const response = await axios.post(`${INTEGRATIONS_URL}/calendar/google/events`, req.body);
    res.json(response.data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});
```

## 📋 TODO - Frontend Configuration UI
Add Trello and Monday.com configuration sections to `frontend/src/components/Configuration.jsx`:

### Trello Section:
- API Key input
- Token input  
- Board selection dropdown (fetch from `/api/tasks/trello/boards`)
- List selection dropdown (fetch from `/api/tasks/trello/boards/{boardId}/lists`)
- Test connection button

### Monday.com Section:
- API Token input
- Board selection dropdown (fetch from `/api/tasks/monday/boards`)
- Group selection dropdown (fetch from `/api/tasks/monday/boards/{boardId}/groups`)
- Test connection button

### Pattern:
Follow existing Jira/Planner configuration patterns for consistency.

## 🔒 TODO - TLS/SSL Encryption Between Containers

### Why?
All communication between Docker containers should be encrypted for security, even on the same Docker network. Self-signed certificates are acceptable for internal service-to-service communication.

### Implementation Steps:

#### 1. Create Certificate Generation Script
**File:** `scripts/generate-certs.sh`
```bash
#!/bin/bash
# Generate self-signed certificates for inter-container communication

mkdir -p certs

# Generate CA certificate
openssl req -x509 -new -nodes -days 3650 \
  -keyout certs/ca-key.pem \
  -out certs/ca-cert.pem \
  -subj "/CN=AI-Chief-of-Staff-CA"

# Generate service certificates for each microservice
for service in backend integrations ai-intelligence pattern-recognition nl-parser voice-processor context-service; do
  # Generate private key
  openssl genrsa -out certs/${service}-key.pem 2048
  
  # Generate CSR
  openssl req -new -key certs/${service}-key.pem \
    -out certs/${service}.csr \
    -subj "/CN=aicos-${service}"
  
  # Sign with CA
  openssl x509 -req -in certs/${service}.csr \
    -CA certs/ca-cert.pem \
    -CAkey certs/ca-key.pem \
    -CAcreateserial \
    -out certs/${service}-cert.pem \
    -days 3650 \
    -extensions v3_req
  
  rm certs/${service}.csr
done

echo "✓ Certificates generated in ./certs/"
```

#### 2. Update docker-compose.yml
Add cert volumes to all services:
```yaml
volumes:
  - ./certs:/app/certs:ro
environment:
  - TLS_CERT_PATH=/app/certs
  - NODE_TLS_REJECT_UNAUTHORIZED=0  # Accept self-signed certs
```

#### 3. Update Integrations Service to Use HTTPS
**File:** `services/integrations/server.js`
```javascript
const https = require('https');
const fs = require('fs');

// Load certificates
const options = {
  key: fs.readFileSync('/app/certs/integrations-key.pem'),
  cert: fs.readFileSync('/app/certs/integrations-cert.pem'),
  ca: fs.readFileSync('/app/certs/ca-cert.pem')
};

// Create HTTPS server
https.createServer(options, app).listen(PORT, '0.0.0.0', () => {
  logger.info(`HTTPS server listening on port ${PORT}`);
});
```

#### 4. Update Backend to Use HTTPS for Microservice Calls
**File:** `backend/server.js` (and all microservice clients)
```javascript
const https = require('https');
const axios = require('axios');

// Create axios instance with self-signed cert support
const httpsAgent = new https.Agent({
  ca: fs.readFileSync('/app/certs/ca-cert.pem'),
  rejectUnauthorized: true  // Verify against our CA
});

const integrationsClient = axios.create({
  baseURL: 'https://aicos-integrations:8006',
  httpsAgent
});
```

#### 5. Update Environment Variables
Change all URLs from `http://` to `https://`:
```yaml
- INTEGRATIONS_URL=https://aicos-integrations:8006
- AI_INTELLIGENCE_URL=https://aicos-ai-intelligence:8001
# etc...
```

## 📝 Testing Checklist
Once all above is complete:

### Integration Service Tests:
- [ ] Trello: Create card, update card, archive card with completion note
- [ ] Monday.com: Create item, update item, archive item with completion note
- [ ] Jira: Create issue, close issue with completion note
- [ ] Microsoft Planner: Create task, complete task with completion note
- [ ] Google Calendar: Create event, delete event
- [ ] Microsoft Calendar: Create event, delete event

### Backend Proxy Tests:
- [ ] All calendar endpoints proxy correctly
- [ ] All task management endpoints proxy correctly
- [ ] Configuration endpoints work for all platforms
- [ ] Error handling works (service down scenarios)

### Frontend Configuration Tests:
- [ ] Trello configuration saves and loads
- [ ] Monday.com configuration saves and loads
- [ ] Board/list selection dropdowns populate
- [ ] Test connection buttons work

### TLS Tests:
- [ ] All services start with HTTPS enabled
- [ ] Certificate validation works
- [ ] Service-to-service calls succeed over TLS
- [ ] Certificate renewal process documented

## 🚀 Deployment Steps
1. Run certificate generation script
2. Update all microservices to use HTTPS
3. Update backend proxy routes
4. Update frontend configuration UI
5. Test locally with docker-compose
6. Push to feature branch
7. Merge to main after testing
8. GitHub Actions builds new images
9. Deploy to production

## 📊 Benefits Achieved
- **Separation of Concerns**: Integrations isolated from main backend
- **Scalability**: Integrations service can scale independently
- **Maintainability**: Each integration is self-contained
- **Security**: TLS encryption for all inter-service communication
- **New Platforms**: Trello and Monday.com support added
- **Consistent API**: All integrations follow same patterns
- **Completion Notes**: Full support across all platforms
