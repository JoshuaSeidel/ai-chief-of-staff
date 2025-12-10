import React, { useState, useEffect } from 'react';
import { PullToRefresh } from './PullToRefresh';
import ProfileManagement from './ProfileManagement';
import { useToast } from '../contexts/ToastContext';
import {
  SettingsTabs,
  AISettings,
  IntegrationsSettings,
  SystemSettings,
  NotificationsSettings,
  PromptsSettings
} from './settings';

function Configuration() {
  const [activeTab, setActiveTab] = useState('ai');
  const toast = useToast();

  // Check for OAuth callback messages in URL
  useEffect(() => {
    const hash = window.location.hash;
    const hashParams = new URLSearchParams(hash.split('?')[1] || '');
    const error = hashParams.get('error');
    const success = hashParams.get('success');

    if (success === 'google_calendar_connected') {
      toast.success('Google Calendar connected successfully!');
      setActiveTab('integrations');
      cleanupUrl();
    } else if (success === 'microsoft_planner_connected' || success === 'microsoft_calendar_connected' || success === 'microsoft_integration_connected') {
      toast.success('Microsoft Integration connected successfully!');
      setActiveTab('integrations');
      cleanupUrl();
    } else if (error === 'microsoft_oauth_failed') {
      toast.error('Failed to connect Microsoft Integration. Please try again.');
      setActiveTab('integrations');
      cleanupUrl();
    } else if (error === 'microsoft_oauth_access_denied') {
      toast.warning('Microsoft Integration connection was cancelled.');
      setActiveTab('integrations');
      cleanupUrl();
    } else if (error === 'microsoft_oauth_wrong_account_type') {
      toast.error('Account type mismatch. Please use the correct Microsoft account type.');
      setActiveTab('integrations');
      cleanupUrl();
    }
  }, [toast]);

  const cleanupUrl = () => {
    const hash = window.location.hash;
    const cleanHash = hash.split('?')[0];
    window.history.replaceState({}, '', window.location.pathname + cleanHash);
  };

  const handleRefresh = async () => {
    // Trigger re-render by updating state
    setActiveTab(prev => prev);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'ai':
        return <AISettings />;
      case 'integrations':
        return <IntegrationsSettings />;
      case 'prompts':
        return <PromptsSettings />;
      case 'profiles':
        return (
          <div className="settings-section">
            <ProfileManagement />
          </div>
        );
      case 'notifications':
        return <NotificationsSettings />;
      case 'system':
        return <SystemSettings />;
      default:
        return <AISettings />;
    }
  };

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="configuration">
        <div className="card">
          <h2 className="mt-0 mb-lg">Settings</h2>
          <SettingsTabs activeTab={activeTab} onTabChange={setActiveTab} />
        </div>

        <div className="card settings-content">
          {renderTabContent()}
        </div>
      </div>
    </PullToRefresh>
  );
}

export default Configuration;
