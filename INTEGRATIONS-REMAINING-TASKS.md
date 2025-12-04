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

### Required Changes:

#### 1. Add State Variables (around line 150)
```javascript
const [trelloConnected, setTrelloConnected] = useState(false);
const [checkingTrello, setCheckingTrello] = useState(true);
const [mondayConnected, setMondayConnected] = useState(false);
const [checkingMonday, setCheckingMonday] = useState(true);
const [trelloBoards, setTrelloBoards] = useState([]);
const [trelloLists, setTrelloLists] = useState([]);
const [mondayBoards, setMondayBoards] = useState([]);
const [mondayGroups, setMondayGroups] = useState([]);
```

#### 2. Add Config Fields (around line 111)
```javascript
trelloApiKey: '',
trelloToken: '',
trelloBoardId: '',
trelloListId: '',
mondayApiToken: '',
mondayBoardId: '',
mondayGroupId: '',
```

#### 3. Add Enabled Integration Flags (around line 138)
```javascript
trello: false,
monday: false,
```

#### 4. Add Status Check Functions (after line 600)
```javascript
const checkTrelloStatus = async () => {
  try {
    setCheckingTrello(true);
    const response = await fetch('/api/integrations/tasks/trello/status');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    setTrelloConnected(data.connected || false);
    const hasConfig = config.trelloApiKey && config.trelloToken && config.trelloBoardId;
    if (hasConfig || data.connected) {
      setEnabledIntegrations(prev => ({ ...prev, trello: true }));
    }
  } catch (err) {
    console.error('Failed to check Trello status:', err);
    setTrelloConnected(false);
  } finally {
    setCheckingTrello(false);
  }
};

const checkMondayStatus = async () => {
  try {
    setCheckingMonday(true);
    const response = await fetch('/api/integrations/tasks/monday/status');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    setMondayConnected(data.connected || false);
    const hasConfig = config.mondayApiToken && config.mondayBoardId;
    if (hasConfig || data.connected) {
      setEnabledIntegrations(prev => ({ ...prev, monday: true }));
    }
  } catch (err) {
    console.error('Failed to check Monday status:', err);
    setMondayConnected(false);
  } finally {
    setCheckingMonday(false);
  }
};

const handleTrelloDisconnect = async () => {
  if (!window.confirm('Disconnect Trello?')) return;
  try {
    const response = await fetch('/api/integrations/tasks/trello/disconnect', { method: 'POST' });
    const data = await response.json();
    if (data.success) {
      setMessage({ type: 'success', text: '✅ Trello disconnected' });
      await checkTrelloStatus();
    }
  } catch (err) {
    setMessage({ type: 'error', text: `❌ Failed: ${err.message}` });
  }
};

const handleMondayDisconnect = async () => {
  if (!window.confirm('Disconnect Monday.com?')) return;
  try {
    const response = await fetch('/api/integrations/tasks/monday/disconnect', { method: 'POST' });
    const data = await response.json();
    if (data.success) {
      setMessage({ type: 'success', text: '✅ Monday.com disconnected' });
      await checkMondayStatus();
    }
  } catch (err) {
    setMessage({ type: 'error', text: `❌ Failed: ${err.message}` });
  }
};

const loadTrelloBoards = async () => {
  try {
    const response = await fetch('/api/integrations/tasks/trello/boards');
    if (!response.ok) throw new Error('Failed to fetch boards');
    const data = await response.json();
    setTrelloBoards(data.boards || []);
  } catch (err) {
    console.error('Failed to load Trello boards:', err);
  }
};

const loadTrelloLists = async (boardId) => {
  try {
    const response = await fetch(`/api/integrations/tasks/trello/boards/${boardId}/lists`);
    if (!response.ok) throw new Error('Failed to fetch lists');
    const data = await response.json();
    setTrelloLists(data.lists || []);
  } catch (err) {
    console.error('Failed to load Trello lists:', err);
  }
};

const loadMondayBoards = async () => {
  try {
    const response = await fetch('/api/integrations/tasks/monday/boards');
    if (!response.ok) throw new Error('Failed to fetch boards');
    const data = await response.json();
    setMondayBoards(data.boards || []);
  } catch (err) {
    console.error('Failed to load Monday boards:', err);
  }
};

const loadMondayGroups = async (boardId) => {
  try {
    const response = await fetch(`/api/integrations/tasks/monday/boards/${boardId}/groups`);
    if (!response.ok) throw new Error('Failed to fetch groups');
    const data = await response.json();
    setMondayGroups(data.groups || []);
  } catch (err) {
    console.error('Failed to load Monday groups:', err);
  }
};
```

#### 5. Call Status Checks in useEffect (around line 179)
```javascript
checkTrelloStatus();
checkMondayStatus();
```

#### 6. Add UI Sections (after line 2020, before CalDAV section)

**Trello Section:**
```jsx
{enabledIntegrations.trello && (
<div className="mb-xl">
  <h3>📋 Trello Integration</h3>
  
  <div style={{ 
    backgroundColor: '#18181b', 
    border: '2px solid #3f3f46', 
    borderRadius: '12px', 
    padding: '1.5rem',
    marginBottom: '1.5rem'
  }}>
    <h4 className="mt-0-mb-md-flex-center">
      <span className="emoji-icon">📋</span>
      Trello Board Management
    </h4>
    
    {checkingTrello ? (
      <p className="text-muted">Checking connection...</p>
    ) : trelloConnected ? (
      <div>
        <div className="status-connected">
          <span>✓ Connected - Cards will be created in Trello</span>
          <button onClick={handleTrelloDisconnect} className="btn-disconnect">
            Disconnect
          </button>
        </div>
      </div>
    ) : (
      <div>
        <p className="text-muted-mb-md-lh">
          Connect Trello to create cards for commitments and action items.
        </p>
        
        <label className="form-label-muted">Trello API Key</label>
        <input
          type="text"
          value={config.trelloApiKey}
          onChange={(e) => handleChange('trelloApiKey', e.target.value)}
          placeholder="Your Trello API key"
          className="mb-md"
        />
        <p className="text-sm-muted-mt-negative-mb-md">
          Get your API key: <a href="https://trello.com/app-key" target="_blank" rel="noopener noreferrer">https://trello.com/app-key</a>
        </p>
        
        <label className="form-label-muted">Trello Token</label>
        <input
          type="password"
          value={config.trelloToken}
          onChange={(e) => handleChange('trelloToken', e.target.value)}
          placeholder="Your Trello token"
          className="mb-md"
        />
        <p className="text-sm-muted-mt-negative-mb-md">
          Generate token from the API key page above
        </p>
        
        {config.trelloApiKey && config.trelloToken && (
          <>
            <label className="form-label-muted">Board</label>
            <select
              value={config.trelloBoardId}
              onChange={(e) => {
                handleChange('trelloBoardId', e.target.value);
                loadTrelloLists(e.target.value);
              }}
              className="mb-md"
              onFocus={loadTrelloBoards}
            >
              <option value="">Select a board...</option>
              {trelloBoards.map(board => (
                <option key={board.id} value={board.id}>{board.name}</option>
              ))}
            </select>
            
            {config.trelloBoardId && (
              <>
                <label className="form-label-muted">List</label>
                <select
                  value={config.trelloListId}
                  onChange={(e) => handleChange('trelloListId', e.target.value)}
                  className="mb-md"
                >
                  <option value="">Select a list...</option>
                  {trelloLists.map(list => (
                    <option key={list.id} value={list.id}>{list.name}</option>
                  ))}
                </select>
              </>
            )}
          </>
        )}
      </div>
    )}
  </div>
</div>
)}
```

**Monday.com Section:**
```jsx
{enabledIntegrations.monday && (
<div className="mb-xl">
  <h3>📊 Monday.com Integration</h3>
  
  <div style={{ 
    backgroundColor: '#18181b', 
    border: '2px solid #3f3f46', 
    borderRadius: '12px', 
    padding: '1.5rem',
    marginBottom: '1.5rem'
  }}>
    <h4 className="mt-0-mb-md-flex-center">
      <span className="emoji-icon">📊</span>
      Monday.com Workspace
    </h4>
    
    {checkingMonday ? (
      <p className="text-muted">Checking connection...</p>
    ) : mondayConnected ? (
      <div>
        <div className="status-connected">
          <span>✓ Connected - Items will be created in Monday.com</span>
          <button onClick={handleMondayDisconnect} className="btn-disconnect">
            Disconnect
          </button>
        </div>
      </div>
    ) : (
      <div>
        <p className="text-muted-mb-md-lh">
          Connect Monday.com to create items for commitments and action items.
        </p>
        
        <label className="form-label-muted">API Token</label>
        <input
          type="password"
          value={config.mondayApiToken}
          onChange={(e) => handleChange('mondayApiToken', e.target.value)}
          placeholder="Your Monday.com API token"
          className="mb-md"
        />
        <p className="text-sm-muted-mt-negative-mb-md">
          Get your token: Monday.com → Profile → API → Generate API Token
        </p>
        
        {config.mondayApiToken && (
          <>
            <label className="form-label-muted">Board</label>
            <select
              value={config.mondayBoardId}
              onChange={(e) => {
                handleChange('mondayBoardId', e.target.value);
                loadMondayGroups(e.target.value);
              }}
              className="mb-md"
              onFocus={loadMondayBoards}
            >
              <option value="">Select a board...</option>
              {mondayBoards.map(board => (
                <option key={board.id} value={board.id}>{board.name}</option>
              ))}
            </select>
            
            {config.mondayBoardId && (
              <>
                <label className="form-label-muted">Group</label>
                <select
                  value={config.mondayGroupId}
                  onChange={(e) => handleChange('mondayGroupId', e.target.value)}
                  className="mb-md"
                >
                  <option value="">Select a group...</option>
                  {mondayGroups.map(group => (
                    <option key={group.id} value={group.id}>{group.title}</option>
                  ))}
                </select>
              </>
            )}
          </>
        )}
      </div>
    )}
  </div>
</div>
)}
```

#### 7. Add Integration Checkboxes (find section with Microsoft/Jira/Google checkboxes around line 1700)
Add these after existing integration checkboxes:
```jsx
<label className="checkbox-label">
  <input
    type="checkbox"
    checked={enabledIntegrations.trello}
    onChange={(e) => setEnabledIntegrations(prev => ({ ...prev, trello: e.target.checked }))}
  />
  <span className="checkbox-text">📋 Trello</span>
</label>

<label className="checkbox-label">
  <input
    type="checkbox"
    checked={enabledIntegrations.monday}
    onChange={(e) => setEnabledIntegrations(prev => ({ ...prev, monday: e.target.checked }))}
  />
  <span className="checkbox-text">📊 Monday.com</span>
</label>
```

### Pattern Reference:
Look at Jira integration (lines 1886-2020) for exact styling patterns to follow.

## 🔒 TLS/SSL Encryption Between Containers

### Status: Ready for Implementation
All scripts and documentation are complete. See **docs/TLS-IMPLEMENTATION.md** for comprehensive implementation guide.

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
