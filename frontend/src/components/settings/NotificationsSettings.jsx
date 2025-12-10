import React, { useState, useEffect } from 'react';
import { configAPI } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';

export function NotificationsSettings() {
  const toast = useToast();

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState('default');
  const [maxRepeat, setMaxRepeat] = useState(3);
  const [repeatIntervalHours, setRepeatIntervalHours] = useState(24);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Check notification permission
    if (typeof Notification !== 'undefined') {
      setNotificationPermission(Notification.permission);
      setNotificationsEnabled(Notification.permission === 'granted');
    }

    // Load settings
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await configAPI.getAll();
      const data = response.data;
      if (data.notification_max_repeat !== undefined) {
        setMaxRepeat(parseInt(data.notification_max_repeat) || 3);
      }
      if (data.notification_repeat_interval_hours !== undefined) {
        setRepeatIntervalHours(parseInt(data.notification_repeat_interval_hours) || 24);
      }
    } catch (err) {
      console.error('Failed to load notification settings:', err);
    }
  };

  const requestPermission = async () => {
    if (typeof Notification === 'undefined') {
      toast.error('Notifications are not supported in this browser');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      setNotificationsEnabled(permission === 'granted');

      if (permission === 'granted') {
        toast.success('Notifications enabled!');
        // Send a test notification
        new Notification('AI Chief of Staff', {
          body: 'Notifications are now enabled!',
          icon: '/icon-192.png'
        });
      } else if (permission === 'denied') {
        toast.warning('Notification permission denied. You can enable it in your browser settings.');
      }
    } catch (err) {
      toast.error('Failed to request notification permission');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await configAPI.bulkUpdate({
        notification_max_repeat: maxRepeat.toString(),
        notification_repeat_interval_hours: repeatIntervalHours.toString()
      });
      toast.success('Notification settings saved');
    } catch (err) {
      toast.error('Failed to save notification settings');
    } finally {
      setSaving(false);
    }
  };

  const getPermissionBadge = () => {
    if (notificationPermission === 'granted') {
      return <Badge variant="success" icon="✓">Enabled</Badge>;
    }
    if (notificationPermission === 'denied') {
      return <Badge variant="error" icon="✕">Blocked</Badge>;
    }
    return <Badge variant="warning" icon="?">Not Set</Badge>;
  };

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <h3>Push Notifications</h3>
        {getPermissionBadge()}
      </div>

      <div className="notification-status-card">
        <div className="notification-status-info">
          <h4>Browser Notifications</h4>
          <p className="text-muted text-sm">
            {notificationsEnabled
              ? 'You will receive notifications for task reminders and daily briefs.'
              : 'Enable notifications to receive reminders about tasks and deadlines.'}
          </p>
        </div>

        {!notificationsEnabled && notificationPermission !== 'denied' && (
          <Button variant="primary" onClick={requestPermission}>
            Enable Notifications
          </Button>
        )}

        {notificationPermission === 'denied' && (
          <div className="notification-blocked-info">
            <p className="text-warning text-sm">
              Notifications are blocked. To enable them:
            </p>
            <ol className="text-muted text-sm">
              <li>Click the lock/info icon in your browser&apos;s address bar</li>
              <li>Find &quot;Notifications&quot; and set it to &quot;Allow&quot;</li>
              <li>Refresh this page</li>
            </ol>
          </div>
        )}
      </div>

      {notificationsEnabled && (
        <>
          <div className="settings-divider" />

          <div className="settings-section-header">
            <h4>Notification Settings</h4>
          </div>

          <div className="grid-2-col">
            <div className="form-group">
              <label className="form-label">Max Repeat Notifications</label>
              <input
                type="number"
                min="1"
                max="10"
                value={maxRepeat}
                onChange={(e) => setMaxRepeat(parseInt(e.target.value) || 3)}
                className="form-input"
              />
              <span className="form-hint">
                Maximum times to notify about the same overdue task
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">Repeat Interval (hours)</label>
              <input
                type="number"
                min="1"
                max="168"
                value={repeatIntervalHours}
                onChange={(e) => setRepeatIntervalHours(parseInt(e.target.value) || 24)}
                className="form-input"
              />
              <span className="form-hint">
                Hours between repeat notifications
              </span>
            </div>
          </div>

          <div className="settings-actions">
            <Button variant="primary" onClick={handleSave} loading={saving}>
              Save Notification Settings
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export default NotificationsSettings;
