/**
 * ProfileSelector Component
 * Dropdown to switch between profiles in the header
 */

import React, { useState, useRef, useEffect } from 'react';
import { useProfile } from '../contexts/ProfileContext';

function ProfileSelector() {
  const { currentProfile, profiles, switchProfile } = useProfile();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  if (!currentProfile || profiles.length === 0) {
    return null;
  }

  const handleProfileSwitch = (profileId) => {
    setIsOpen(false);
    if (profileId !== currentProfile.id) {
      switchProfile(profileId);
    }
  };

  return (
    <div className="profile-selector" ref={dropdownRef}>
      <button
        className="profile-selector-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Select profile"
        aria-expanded={isOpen}
      >
        <span className="profile-icon" style={{ backgroundColor: currentProfile.color }}>
          {currentProfile.icon || '👤'}
        </span>
        <span className="profile-name">{currentProfile.name}</span>
        <span className="profile-chevron">{isOpen ? '▴' : '▾'}</span>
      </button>

      {isOpen && (
        <div className="profile-dropdown">
          {profiles.map(profile => (
            <button
              key={profile.id}
              className={`profile-option ${profile.id === currentProfile.id ? 'active' : ''}`}
              onClick={() => handleProfileSwitch(profile.id)}
            >
              <span className="profile-icon" style={{ backgroundColor: profile.color }}>
                {profile.icon || '👤'}
              </span>
              <span className="profile-info">
                <span className="profile-name">{profile.name}</span>
                {profile.description && (
                  <span className="profile-description">{profile.description}</span>
                )}
              </span>
              {profile.is_default && (
                <span className="profile-badge">Default</span>
              )}
              {profile.id === currentProfile.id && (
                <span className="profile-check">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ProfileSelector;
