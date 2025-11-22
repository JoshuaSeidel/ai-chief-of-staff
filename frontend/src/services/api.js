import axios from 'axios';

// Auto-detect API base URL
// Priority:
// 1. REACT_APP_API_URL environment variable (for custom setups)
// 2. If on localhost:3000 (development), use localhost:3001/api
// 3. Otherwise (production/SWAG/etc), use relative path /api (same origin)
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
  update: (id, data) => api.put(`/commitments/${id}`, data),
  delete: (id) => api.delete(`/commitments/${id}`),
  getOverdue: () => api.get('/commitments/status/overdue'),
};

// Keep old name for backwards compatibility
export const commitmentsAPI = tasksAPI;

export default api;
