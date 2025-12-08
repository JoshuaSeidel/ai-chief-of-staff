/**
 * Profile Service
 * Handles profile-related API calls and local storage
 */

import api, { profilesAPI } from './api';

const CURRENT_PROFILE_KEY = 'currentProfileId';

export const profileService = {
  // Get current profile ID from localStorage
  getCurrentProfileId() {
    const stored = localStorage.getItem(CURRENT_PROFILE_KEY);
    return stored ? parseInt(stored) : 2; // Default to Work profile (ID=2)
  },

  // Set current profile ID in localStorage
  setCurrentProfileId(profileId) {
    localStorage.setItem(CURRENT_PROFILE_KEY, profileId.toString());
    // Also set cookie for server-side middleware
    document.cookie = `currentProfileId=${profileId}; path=/; max-age=31536000`; // 1 year
  },

  // Get all profiles
  async getAll() {
    const response = await profilesAPI.getAll();
    // Backend returns { success: true, profiles: [...] }
    return response.data.profiles || response.data;
  },

  // Get profile by ID
  async getById(id) {
    const response = await profilesAPI.getById(id);
    // Backend returns { success: true, profile: {...} }
    return response.data.profile || response.data;
  },

  // Create new profile
  async create(data) {
    const response = await profilesAPI.create(data);
    // Backend returns { success: true, profile: {...} }
    return response.data.profile || response.data;
  },

  // Update profile
  async update(id, data) {
    const response = await profilesAPI.update(id, data);
    // Backend returns { success: true, profile: {...} }
    return response.data.profile || response.data;
  },

  // Delete profile (migrates data to another profile)
  async delete(id, migrateToProfileId) {
    const response = await profilesAPI.delete(id, migrateToProfileId);
    // Backend returns { success: true, message: '...' }
    return response.data;
  },

  // Set default profile
  async setDefault(id) {
    const response = await profilesAPI.setDefault(id);
    // Backend returns { success: true, profile: {...} }
    return response.data.profile || response.data;
  },

  // Reorder profiles
  async reorder(profileIds) {
    const response = await profilesAPI.reorder(profileIds);
    // Backend returns { success: true, profiles: [...] }
    return response.data.profiles || response.data;
  },

  // Add profile_id header to API requests
  addProfileHeader(profileId) {
    api.defaults.headers.common['X-Profile-Id'] = profileId;
  },

  // Remove profile_id header
  removeProfileHeader() {
    delete api.defaults.headers.common['X-Profile-Id'];
  }
};

export default profileService;
