import React from 'react';

const SETTINGS_TABS = [
  { id: 'ai', label: 'AI Provider', icon: '🤖' },
  { id: 'integrations', label: 'Integrations', icon: '🔗' },
  { id: 'prompts', label: 'Prompts', icon: '📝' },
  { id: 'profiles', label: 'Profiles', icon: '👤' },
  { id: 'notifications', label: 'Notifications', icon: '🔔' },
  { id: 'system', label: 'System', icon: '⚙️' }
];

export function SettingsTabs({ activeTab, onTabChange }) {
  return (
    <div className="settings-tabs">
      {SETTINGS_TABS.map(tab => (
        <button
          key={tab.id}
          className={`settings-tab ${activeTab === tab.id ? 'settings-tab-active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          <span className="settings-tab-icon">{tab.icon}</span>
          <span className="settings-tab-label">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

export { SETTINGS_TABS };
export default SettingsTabs;
