import axios from 'axios';

// Auto-detect if running in all-in-one container or separate containers
// In all-in-one, frontend is served from same origin, so use relative path
// In development/multi-container, use environment variable or default to localhost:3001
const API_BASE_URL = process.env.REACT_APP_API_URL || 
                     (window.location.port === '3001' ? '/api' : 'http://localhost:3001/api');

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

export default api;
