import axios from 'axios';

// Auto-detect API base URL
// Priority:
// 1. VITE_API_URL environment variable (for custom setups, including Docker: http://aicos-backend:3001/api)
// 2. If on localhost:3000 (development), use localhost:3001/api
// 3. Otherwise (production/SWAG/etc), use relative path /api (same origin)
// Note: In Docker microservices, VITE_API_URL should be set to http://aicos-backend:3001/api
// However, since the browser can't resolve Docker container names, this typically needs to be
// proxied through nginx or use the host's exposed port
const API_BASE_URL = import.meta.env.VITE_API_URL || 
  (window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : '/api')

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000, // 60 seconds default timeout
});

// Brief API
export const briefAPI = {
  generate: () => api.post('/brief/generate', {}, { timeout: 120000 }), // 2 minutes for AI generation
  getRecent: (limit = 7) => api.get(`/brief/recent?limit=${limit}`),
  getByDate: (date) => api.get(`/brief/${date}`),
  generateWeeklyReport: () => api.post('/brief/weekly-report'),
};

// Transcripts API
export const transcriptsAPI = {
  upload: (formData) => api.post('/transcripts/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  uploadText: (data) => api.post('/transcripts/upload-text', data),
  getAll: (limit = 50) => api.get(`/transcripts?limit=${limit}`),
  getById: (id) => api.get(`/transcripts/${id}`),
  delete: (id) => api.delete(`/transcripts/${id}`),
  reprocess: (id) => api.post(`/transcripts/${id}/reprocess`),
  getMeetingNotes: (id, regenerate = false) => api.get(`/transcripts/${id}/meeting-notes${regenerate ? '?regenerate=true' : ''}`),
  saveMeetingNotes: (id, notes) => api.post(`/transcripts/${id}/meeting-notes`, { notes }),
};

// Config API
export const configAPI = {
  getAll: () => api.get('/config'),
  update: (key, value) => api.post('/config', { key, value }),
  bulkUpdate: (config) => api.put('/config', config),
  getByKey: (key) => api.get(`/config/${key}`),
  getModels: (provider) => api.get(`/config/models/${provider}`),
};

// Calendar API
export const calendarAPI = {
  getEvents: () => api.get('/calendar/events'),
  createBlock: (eventData) => api.post('/calendar/block', eventData),
  // Google Calendar
  getGoogleStatus: () => api.get('/calendar/google/status'),
  getGoogleAuthUrl: () => api.get('/calendar/google/auth'),
  getGoogleConfig: () => api.get('/calendar/google/config'),
  saveGoogleConfig: (config) => api.post('/calendar/google/config', config),
  disconnectGoogle: () => api.post('/calendar/google/disconnect'),
  getGoogleCalendars: () => api.get('/calendar/google/calendars'),
  // Microsoft Calendar
  getMicrosoftStatus: () => api.get('/calendar/microsoft/status'),
  getMicrosoftAuthUrl: () => api.get('/calendar/microsoft/auth'),
  getMicrosoftConfig: () => api.get('/calendar/microsoft/config'),
  saveMicrosoftConfig: (config) => api.post('/calendar/microsoft/config', config),
  disconnectMicrosoft: () => api.post('/calendar/microsoft/disconnect'),
  getMicrosoftCalendars: () => api.get('/calendar/microsoft/calendars'),
};

// Planner API (Jira, Microsoft Planner, etc.)
export const plannerAPI = {
  // Jira
  getJiraStatus: () => api.get('/planner/jira/status'),
  getJiraConfig: () => api.get('/planner/jira/config'),
  saveJiraConfig: (config) => api.post('/planner/jira/config', config),
  disconnectJira: () => api.post('/planner/jira/disconnect'),
  syncJira: () => api.post('/planner/jira/sync'),
  syncJiraFailed: () => api.post('/planner/jira/sync-failed'),
  getJiraProjects: () => api.get('/planner/jira/projects'),
  // Microsoft Planner/To Do
  getMicrosoftStatus: () => api.get('/planner/microsoft/status'),
  disconnectMicrosoft: () => api.post('/planner/microsoft/disconnect'),
  syncMicrosoft: () => api.post('/planner/microsoft/sync'),
  getMicrosoftLists: () => api.get('/planner/microsoft/lists'),
};

// Integrations Proxy API (for microservice integrations)
export const integrationsAPI = {
  // Health check
  getHealth: () => api.get('/integrations/health'),

  // Jira
  getJiraStatus: () => api.get('/integrations/tasks/jira/status'),
  getJiraConfig: () => api.get('/integrations/tasks/jira/config'),
  saveJiraConfig: (config) => api.post('/integrations/tasks/jira/config', config),
  testJira: () => api.post('/integrations/tasks/jira/test'),
  getJiraProjects: () => api.get('/integrations/tasks/jira/projects'),

  // Trello
  getTrelloStatus: () => api.get('/integrations/tasks/trello/status'),
  getTrelloConfig: () => api.get('/integrations/tasks/trello/config'),
  saveTrelloConfig: (config) => api.post('/integrations/tasks/trello/config', config),
  testTrello: () => api.post('/integrations/tasks/trello/test'),
  getTrelloBoards: () => api.get('/integrations/tasks/trello/boards'),

  // Monday.com
  getMondayStatus: () => api.get('/integrations/tasks/monday/status'),
  getMondayConfig: () => api.get('/integrations/tasks/monday/config'),
  saveMondayConfig: (config) => api.post('/integrations/tasks/monday/config', config),
  testMonday: () => api.post('/integrations/tasks/monday/test'),
  getMondayBoards: () => api.get('/integrations/tasks/monday/boards'),

  // Radicale/CalDAV (placeholder for future)
  getRadicaleStatus: () => api.get('/integrations/calendar/radicale/status'),
  getRadicaleConfig: () => api.get('/integrations/calendar/radicale/config'),
  saveRadicaleConfig: (config) => api.post('/integrations/calendar/radicale/config', config),
  testRadicale: () => api.post('/integrations/calendar/radicale/test'),
};

// Tasks API (commitments, actions, follow-ups, risks)
export const tasksAPI = {
  getAll: (status = 'all') => api.get(`/commitments?status=${status}`),
  getById: (id) => api.get(`/commitments/${id}`),
  create: (data) => api.post('/commitments', data),
  update: (id, data) => api.put(`/commitments/${id}`, data),
  delete: (id) => api.delete(`/commitments/${id}`),
  getOverdue: () => api.get('/commitments/status/overdue'),
  confirm: (id, confirmed) => api.post(`/commitments/${id}/confirm`, { confirmed }),
};

// Keep old name for backwards compatibility
export const commitmentsAPI = tasksAPI;

// Intelligence API (AI-powered task analysis microservices)
export const intelligenceAPI = {
  // AI Intelligence Service (Claude-powered)
  estimateEffort: (description, context = '') => 
    api.post('/intelligence/estimate-effort', { description, context }),
  classifyEnergy: (description) => 
    api.post('/intelligence/classify-energy', { description }),
  clusterTasks: (tasks) => 
    api.post('/intelligence/cluster-tasks', { tasks }),
  
  // NL Parser Service (spaCy)
  parseTask: (text) => 
    api.post('/intelligence/parse-task', { text }),
  extractDates: (text) => 
    api.post('/intelligence/extract-dates', { text }),
  
  // Pattern Recognition Service (ML)
  analyzePatterns: (userId = null, timeRange = '30d') => 
    api.post('/intelligence/analyze-patterns', { user_id: userId, time_range: timeRange }, { timeout: 120000 }),
  getInsights: (user_id) => 
    api.get('/intelligence/insights', { params: { user_id } }),
  predictCompletion: (task_description, user_id) => 
    api.post('/intelligence/predict-completion', { task_description, user_id }),
  
  // Voice Processor Service (Whisper)
  transcribe: (audioFile, language = null, temperature = null) => {
    const formData = new FormData();
    formData.append('file', audioFile);
    if (language) formData.append('language', language);
    if (temperature) formData.append('temperature', temperature);
    return api.post('/intelligence/transcribe', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getSupportedFormats: () => 
    api.get('/intelligence/supported-formats'),
  
  // Context Service (Go)
  getContext: (category = null, source = null, limit = null, active_only = null) => 
    api.get('/intelligence/context', { params: { category, source, limit, active_only } }),
  getRollingContext: () => 
    api.get('/intelligence/context/rolling'),
  searchContext: (query, category = null, limit = null) => 
    api.post('/intelligence/context/search', { query, category, limit }),
};

// Microservices health check (moved to config API where it belongs)
export const microservicesAPI = {
  checkHealth: () => 
    api.get('/config/microservices'),
};

// Profiles API
export const profilesAPI = {
  getAll: () => api.get('/profiles'),
  getById: (id) => api.get(`/profiles/${id}`),
  create: (data) => api.post('/profiles', data),
  update: (id, data) => api.put(`/profiles/${id}`, data),
  delete: (id, migrateToProfileId) => api.delete(`/profiles/${id}`, { data: { migrateToProfileId } }),
  setDefault: (id) => api.post(`/profiles/${id}/set-default`),
  reorder: (profileIds) => api.post('/profiles/reorder', { profileIds }),
};

export default api;
// Version 2.0.0 - Force rebuild
