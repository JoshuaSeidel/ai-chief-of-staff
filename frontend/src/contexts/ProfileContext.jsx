/**
 * Profile Context
 * Provides current profile state and profile management functions to all components
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import profileService from '../services/profileService';

const ProfileContext = createContext();

export function ProfileProvider({ children }) {
  const [currentProfile, setCurrentProfile] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load profiles and set current profile
  useEffect(() => {
    loadProfiles();
  }, []);

  // Update API header when profile changes
  useEffect(() => {
    if (currentProfile) {
      profileService.addProfileHeader(currentProfile.id);
    }
  }, [currentProfile]);

  const loadProfiles = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const allProfiles = await profileService.getAll();
      setProfiles(allProfiles);

      // Set current profile from localStorage or default
      const storedProfileId = profileService.getCurrentProfileId();
      const profile = allProfiles.find(p => p.id === storedProfileId) || 
                     allProfiles.find(p => p.is_default) ||
                     allProfiles[0];
      
      if (profile) {
        setCurrentProfile(profile);
        profileService.setCurrentProfileId(profile.id);
      }
    } catch (err) {
      console.error('Error loading profiles:', err);
      setError('Failed to load profiles');
    } finally {
      setLoading(false);
    }
  };

  const switchProfile = (profileId) => {
    const profile = profiles.find(p => p.id === profileId);
    if (profile) {
      setCurrentProfile(profile);
      profileService.setCurrentProfileId(profileId);
      
      // Trigger page reload to refresh all data with new profile
      window.location.reload();
    }
  };

  const createProfile = async (data) => {
    try {
      const newProfile = await profileService.create(data);
      await loadProfiles(); // Reload to get updated list
      return newProfile;
    } catch (err) {
      console.error('Error creating profile:', err);
      throw err;
    }
  };

  const updateProfile = async (id, data) => {
    try {
      const updated = await profileService.update(id, data);
      await loadProfiles(); // Reload to get updated list
      
      // If we updated the current profile, refresh it
      if (currentProfile && currentProfile.id === id) {
        setCurrentProfile(updated);
      }
      return updated;
    } catch (err) {
      console.error('Error updating profile:', err);
      throw err;
    }
  };

  const deleteProfile = async (id, migrateToProfileId) => {
    try {
      await profileService.delete(id, migrateToProfileId);
      
      // If deleting current profile, switch to the migrate target
      if (currentProfile && currentProfile.id === id) {
        switchProfile(migrateToProfileId);
      } else {
        await loadProfiles();
      }
    } catch (err) {
      console.error('Error deleting profile:', err);
      throw err;
    }
  };

  const setDefaultProfile = async (id) => {
    try {
      await profileService.setDefault(id);
      await loadProfiles();
    } catch (err) {
      console.error('Error setting default profile:', err);
      throw err;
    }
  };

  const value = {
    currentProfile,
    profiles,
    loading,
    error,
    switchProfile,
    createProfile,
    updateProfile,
    deleteProfile,
    setDefaultProfile,
    refreshProfiles: loadProfiles
  };

  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile must be used within ProfileProvider');
  }
  return context;
}

export default ProfileContext;
