/**
 * ProfileSelector Component
 * Dropdown to switch between profiles in the header
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  BookOpen,
  BriefcaseBusiness,
  Brush,
  Check,
  ChevronDown,
  ChevronUp,
  Home,
  Lightbulb,
  Rocket,
  Star,
  Target,
  UserRound
} from 'lucide-react';
import { useProfile } from '../contexts/ProfileContext';

const PROFILE_ICONS = {
  briefcase: BriefcaseBusiness,
  home: Home,
  books: BookOpen,
  target: Target,
  lightbulb: Lightbulb,
  rocket: Rocket,
  art: Brush,
  star: Star,
  user: UserRound,
  '💼': BriefcaseBusiness,
  '🏠': Home,
  '📚': BookOpen,
  '🎯': Target,
  '💡': Lightbulb,
  '🚀': Rocket,
  '🎨': Brush,
  '🌟': Star
};

function ProfileIcon({ value }) {
  const Icon = PROFILE_ICONS[value] || UserRound;
  return <Icon size={16} strokeWidth={2} />;
}

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
          <ProfileIcon value={currentProfile.icon} />
        </span>
        <span className="profile-name">{currentProfile.name}</span>
        <span className="profile-chevron" aria-hidden="true">
          {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </span>
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
                <ProfileIcon value={profile.icon} />
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
                <span className="profile-check"><Check size={15} /></span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ProfileSelector;
