import React from 'react';
import {
  Bell,
  Bot,
  Link2,
  MessageSquareText,
  SlidersHorizontal,
  Users
} from 'lucide-react';

const SETTINGS_TABS = [
  { id: 'ai', label: 'AI Provider', icon: Bot },
  { id: 'integrations', label: 'Integrations', icon: Link2 },
  { id: 'prompts', label: 'Prompts', icon: MessageSquareText },
  { id: 'profiles', label: 'Profiles', icon: Users },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'system', label: 'System', icon: SlidersHorizontal }
];

export function SettingsTabs({ activeTab, onTabChange }) {
  return (
    <div className="settings-tabs">
      {SETTINGS_TABS.map(tab => {
        const Icon = tab.icon;

        return (
          <button
            key={tab.id}
            className={`settings-tab ${activeTab === tab.id ? 'settings-tab-active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            <span className="settings-tab-icon" aria-hidden="true">
              <Icon size={16} />
            </span>
            <span className="settings-tab-label">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export { SETTINGS_TABS };
export default SettingsTabs;
