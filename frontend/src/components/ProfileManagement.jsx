/**
 * ProfileManagement Component
 * Full profile CRUD interface in Settings
 */

import React, { useState } from 'react';
import { useProfile } from '../contexts/ProfileContext';

function ProfileManagement() {
  const { profiles, currentProfile, createProfile, updateProfile, deleteProfile, setDefaultProfile } = useProfile();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#3B82F6',
    icon: 'briefcase'
  });
  const [error, setError] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [migrateToId, setMigrateToId] = useState(null);

  const iconOptions = [
    { value: '💼', label: 'Briefcase' },
    { value: '🏠', label: 'Home' },
    { value: '📚', label: 'Books' },
    { value: '🎯', label: 'Target' },
    { value: '💡', label: 'Lightbulb' },
    { value: '🚀', label: 'Rocket' },
    { value: '🎨', label: 'Art' },
    { value: '🌟', label: 'Star' }
  ];
  const colorOptions = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#6366F1'];

  const resetForm = () => {
    setFormData({ name: '', description: '', color: '#3B82F6', icon: '💼' });
    setShowCreateForm(false);
    setEditingId(null);
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      if (editingId) {
        await updateProfile(editingId, formData);
      } else {
        await createProfile(formData);
      }
      resetForm();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save profile');
    }
  };

  const handleEdit = (profile) => {
    setFormData({
      name: profile.name,
      description: profile.description || '',
      color: profile.color,
      icon: profile.icon
    });
    setEditingId(profile.id);
    setShowCreateForm(true);
  };

  const handleDelete = async () => {
    if (!deleteConfirm || !migrateToId) return;

    try {
      await deleteProfile(deleteConfirm, migrateToId);
      setDeleteConfirm(null);
      setMigrateToId(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete profile');
    }
  };

  const handleSetDefault = async (id) => {
    try {
      await setDefaultProfile(id);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to set default profile');
    }
  };

  return (
    <div className="profile-management">
      <div className="section-header">
        <h2>Profiles</h2>
        {!showCreateForm && (
          <button className="btn-primary" onClick={() => setShowCreateForm(true)}>
            + New Profile
          </button>
        )}
      </div>

      {error && (
        <div className="message-error">
          {error}
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {showCreateForm && (
        <form className="form-box profile-form" onSubmit={handleSubmit}>
          <h3>{editingId ? 'Edit Profile' : 'Create Profile'}</h3>
          
          <div className="form-group">
            <label>Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder="e.g., Work, Personal, Side Project"
            />
          </div>

          <div className="form-group">
            <label>Description</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Optional description"
            />
          </div>

          <div className="form-group">
            <label>Icon</label>
            <div className="icon-picker">
              {iconOptions.map(icon => (
                <button
                  key={icon.value}
                  type="button"
                  className={`icon-option ${formData.icon === icon.value ? 'selected' : ''}`}
                  onClick={() => setFormData({ ...formData, icon: icon.value })}
                  title={icon.label}
                >
                  {icon.value}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Color</label>
            <div className="color-picker">
              {colorOptions.map(color => (
                <button
                  key={color}
                  type="button"
                  className={`color-option ${formData.color === color ? 'selected' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setFormData({ ...formData, color })}
                  aria-label={`Select ${color}`}
                />
              ))}
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn-primary">
              {editingId ? 'Save Changes' : 'Create Profile'}
            </button>
            <button type="button" className="btn-secondary" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="profiles-list">
        {profiles.map(profile => (
          <div key={profile.id} className="profile-card">
            <span className="profile-icon" style={{ backgroundColor: profile.color }}>
              {profile.icon || '👤'}
            </span>
            <div className="profile-card-info">
              <div className="profile-card-name">
                <h3>{profile.name}</h3>
                <div className="profile-badges">
                  {profile.is_default && (
                    <span className="profile-badge">Default</span>
                  )}
                  {profile.id === currentProfile?.id && (
                    <span className="profile-badge profile-badge-active">Active</span>
                  )}
                </div>
              </div>
              {profile.description && <p>{profile.description}</p>}
            </div>
            <div className="profile-card-actions">
              <button className="btn-secondary btn-sm" onClick={() => handleEdit(profile)} title="Edit profile">
                ✏️
              </button>
              {!profile.is_default && (
                <button className="btn-secondary btn-sm" onClick={() => handleSetDefault(profile.id)} title="Set as default">
                  ⭐
                </button>
              )}
              {profiles.length > 1 && (
                <button 
                  className="btn-danger btn-sm" 
                  onClick={() => {
                    setDeleteConfirm(profile.id);
                    // Set migrate target to first profile that's not this one
                    const firstOther = profiles.find(p => p.id !== profile.id);
                    setMigrateToId(firstOther?.id);
                  }}
                  title="Delete profile"
                >
                  🗑️
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Profile</h3>
            <p>
              This will delete the profile and all its data will be migrated to another profile.
              <br /><strong>This action cannot be undone.</strong>
            </p>
            
            <div className="form-group">
              <label>Migrate data to:</label>
              <select
                value={migrateToId || ''}
                onChange={(e) => setMigrateToId(parseInt(e.target.value))}
                required
              >
                <option value="">Select a profile...</option>
                {profiles
                  .filter(p => p.id !== deleteConfirm)
                  .map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="form-actions">
              <button
                className="btn-danger"
                onClick={handleDelete}
                disabled={!migrateToId}
              >
                Delete Profile
              </button>
              <button className="btn-secondary" onClick={() => {
                setDeleteConfirm(null);
                setMigrateToId(null);
              }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfileManagement;
