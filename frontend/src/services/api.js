import axios from 'axios';

// Auto-detect API base URL
// Priority:
// 1. REACT_APP_API_URL environment variable (for custom setups, including Docker: http://aicos-backend:3001/api)
// 2. If on localhost:3000 (development), use localhost:3001/api
// 3. Otherwise (production/SWAG/etc), use relative path /api (same origin)
// Note: In Docker microservices, REACT_APP_API_URL should be set to http://aicos-backend:3001/api
// However, since the browser can't resolve Docker container names, this typically needs to be
// proxied through nginx or use the host's exposed port
const API_BASE_URL = process.env.REACT_APP_API_URL || 
                     (window.location.hostname === 'localhost' && window.location.port === '3000' 
                       ? 'http://localhost:3001/api' 
                       : '/api');

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Brief API
export const briefAPI = {
  generate: () => api.post('/brief/generate'),
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
};

// Config API
export const configAPI = {
  getAll: () => api.get('/config'),
  update: (key, value) => api.post('/config', { key, value }),
  bulkUpdate: (config) => api.put('/config', config),
  getByKey: (key) => api.get(`/config/${key}`),
};

// Calendar API
export const calendarAPI = {
  getEvents: () => api.get('/calendar/events'),
  createBlock: (eventData) => api.post('/calendar/block', eventData),
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
  analyzePatterns: (user_id, time_range) => 
    api.post('/intelligence/analyze-patterns', { user_id, time_range }),
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
  
  // Health check
  checkHealth: () => 
    api.get('/intelligence/health'),
};

export default api;
