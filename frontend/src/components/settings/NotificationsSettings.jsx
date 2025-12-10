import React, { useState, useEffect } from 'react';
import { configAPI } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import api from '../../services/api';

export function NotificationsSettings() {
  const toast = useToast();

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState('default');
  const [saving, setSaving] = useState(false);
  const [testingNotification, setTestingNotification] = useState(false);
  const [regeneratingVapid, setRegeneratingVapid] = useState(false);
  const [vapidPublicKey, setVapidPublicKey] = useState(null);

  // Notification settings
  const [settings, setSettings] = useState({
    // Notification types
    taskReminders: true,
    overdueAlerts: true,
    dailyDigest: false,

    // Reminder timing (hours before deadline)
    reminderTiming: '24',

    // Repeat settings
    maxRepeat: 3,
    repeatIntervalHours: 24,

    // Quiet hours
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',

    // Daily digest time
    dailyDigestTime: '08:00'
  });

  useEffect(() => {
    // Check notification permission
    if (typeof Notification !== 'undefined') {
      setNotificationPermission(Notification.permission);
      setNotificationsEnabled(Notification.permission === 'granted');
    }

    // Load settings and VAPID key
    loadSettings();
    loadVapidKey();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await configAPI.getAll();
      const data = response.data;

      setSettings(prev => ({
        ...prev,
        taskReminders: data.notification_task_reminders !== 'false',
        overdueAlerts: data.notification_overdue_alerts !== 'false',
        dailyDigest: data.notification_daily_digest === 'true',
        reminderTiming: data.notification_reminder_timing || '24',
        maxRepeat: parseInt(data.notification_max_repeat) || 3,
        repeatIntervalHours: parseInt(data.notification_repeat_interval_hours) || 24,
        quietHoursEnabled: data.notification_quiet_hours_enabled === 'true',
        quietHoursStart: data.notification_quiet_hours_start || '22:00',
        quietHoursEnd: data.notification_quiet_hours_end || '08:00',
        dailyDigestTime: data.notification_daily_digest_time || '08:00'
      }));
    } catch (err) {
      console.error('Failed to load notification settings:', err);
    }
  };

  const loadVapidKey = async () => {
    try {
      const response = await api.get('/notifications/vapid-public-key');
      setVapidPublicKey(response.data.publicKey);
    } catch (err) {
      console.error('Failed to load VAPID key:', err);
      setVapidPublicKey(null);
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
        notification_task_reminders: settings.taskReminders.toString(),
        notification_overdue_alerts: settings.overdueAlerts.toString(),
        notification_daily_digest: settings.dailyDigest.toString(),
        notification_reminder_timing: settings.reminderTiming,
        notification_max_repeat: settings.maxRepeat.toString(),
        notification_repeat_interval_hours: settings.repeatIntervalHours.toString(),
        notification_quiet_hours_enabled: settings.quietHoursEnabled.toString(),
        notification_quiet_hours_start: settings.quietHoursStart,
        notification_quiet_hours_end: settings.quietHoursEnd,
        notification_daily_digest_time: settings.dailyDigestTime
      });
      toast.success('Notification settings saved');
    } catch (err) {
      toast.error('Failed to save notification settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTestNotification = async () => {
    setTestingNotification(true);
    try {
      const response = await api.post('/notifications/test');
      if (response.data.sent > 0) {
        toast.success('Test notification sent!');
      } else {
        toast.warning('No devices subscribed to receive notifications');
      }
    } catch (err) {
      toast.error('Failed to send test notification');
    } finally {
      setTestingNotification(false);
    }
  };

  const handleRegenerateVapid = async () => {
    if (!window.confirm('Regenerating VAPID keys will invalidate all existing push subscriptions. All users will need to re-enable notifications. Continue?')) {
      return;
    }

    setRegeneratingVapid(true);
    try {
      const response = await api.post('/notifications/regenerate-vapid');
      setVapidPublicKey(response.data.publicKey);
      toast.success('VAPID keys regenerated. Users will need to re-enable notifications.');
    } catch (err) {
      toast.error('Failed to regenerate VAPID keys');
    } finally {
      setRegeneratingVapid(false);
    }
  };

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
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

          {/* Test Notification */}
          <div className="settings-subsection">
            <h4 className="settings-subsection-title">Test Notification</h4>
            <p className="text-muted text-sm mb-md">Send a test notification to verify your setup.</p>
            <Button
              variant="secondary"
              onClick={handleTestNotification}
              loading={testingNotification}
            >
              🔔 Send Test Notification
            </Button>
          </div>

          <div className="settings-divider" />

          {/* Notification Types */}
          <div className="settings-subsection">
            <h4 className="settings-subsection-title">Notification Types</h4>
            <p className="text-muted text-sm mb-md">Choose which notifications you want to receive.</p>

            <div className="notification-toggle-list">
              <label className="notification-toggle-item">
                <div className="notification-toggle-info">
                  <span className="notification-toggle-label">📋 Task Reminders</span>
                  <span className="notification-toggle-desc">Get notified before tasks are due</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.taskReminders}
                  onChange={(e) => updateSetting('taskReminders', e.target.checked)}
                  className="toggle-checkbox"
                />
              </label>

              <label className="notification-toggle-item">
                <div className="notification-toggle-info">
                  <span className="notification-toggle-label">⚠️ Overdue Alerts</span>
                  <span className="notification-toggle-desc">Get notified about overdue tasks</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.overdueAlerts}
                  onChange={(e) => updateSetting('overdueAlerts', e.target.checked)}
                  className="toggle-checkbox"
                />
              </label>

              <label className="notification-toggle-item">
                <div className="notification-toggle-info">
                  <span className="notification-toggle-label">📰 Daily Digest</span>
                  <span className="notification-toggle-desc">Morning summary of today&apos;s tasks</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.dailyDigest}
                  onChange={(e) => updateSetting('dailyDigest', e.target.checked)}
                  className="toggle-checkbox"
                />
              </label>
            </div>

            {settings.dailyDigest && (
              <div className="form-group mt-md">
                <label className="form-label">Daily Digest Time</label>
                <input
                  type="time"
                  value={settings.dailyDigestTime}
                  onChange={(e) => updateSetting('dailyDigestTime', e.target.value)}
                  className="form-input form-input-time"
                />
                <span className="form-hint">When to receive your daily summary</span>
              </div>
            )}
          </div>

          <div className="settings-divider" />

          {/* Reminder Timing */}
          <div className="settings-subsection">
            <h4 className="settings-subsection-title">Reminder Timing</h4>
            <p className="text-muted text-sm mb-md">When to notify you before a task is due.</p>

            <div className="form-group">
              <label className="form-label">Remind me</label>
              <select
                value={settings.reminderTiming}
                onChange={(e) => updateSetting('reminderTiming', e.target.value)}
                className="form-select"
              >
                <option value="1">1 hour before</option>
                <option value="2">2 hours before</option>
                <option value="4">4 hours before</option>
                <option value="12">12 hours before</option>
                <option value="24">24 hours before</option>
                <option value="48">48 hours before</option>
              </select>
            </div>
          </div>

          <div className="settings-divider" />

          {/* Quiet Hours */}
          <div className="settings-subsection">
            <h4 className="settings-subsection-title">Quiet Hours</h4>
            <p className="text-muted text-sm mb-md">Pause notifications during specific hours.</p>

            <label className="notification-toggle-item mb-md">
              <div className="notification-toggle-info">
                <span className="notification-toggle-label">🌙 Enable Quiet Hours</span>
                <span className="notification-toggle-desc">No notifications during these times</span>
              </div>
              <input
                type="checkbox"
                checked={settings.quietHoursEnabled}
                onChange={(e) => updateSetting('quietHoursEnabled', e.target.checked)}
                className="toggle-checkbox"
              />
            </label>

            {settings.quietHoursEnabled && (
              <div className="grid-2-col">
                <div className="form-group">
                  <label className="form-label">Start Time</label>
                  <input
                    type="time"
                    value={settings.quietHoursStart}
                    onChange={(e) => updateSetting('quietHoursStart', e.target.value)}
                    className="form-input form-input-time"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">End Time</label>
                  <input
                    type="time"
                    value={settings.quietHoursEnd}
                    onChange={(e) => updateSetting('quietHoursEnd', e.target.value)}
                    className="form-input form-input-time"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="settings-divider" />

          {/* Advanced Settings */}
          <details className="settings-advanced">
            <summary className="settings-advanced-toggle">
              ⚙️ Advanced Settings
            </summary>
            <div className="settings-advanced-content">
              <div className="grid-2-col">
                <div className="form-group">
                  <label className="form-label">Max Repeat Notifications</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={settings.maxRepeat}
                    onChange={(e) => updateSetting('maxRepeat', parseInt(e.target.value) || 3)}
                    className="form-input"
                  />
                  <span className="form-hint">
                    Maximum times to notify about the same task
                  </span>
                </div>

                <div className="form-group">
                  <label className="form-label">Repeat Interval (hours)</label>
                  <input
                    type="number"
                    min="1"
                    max="168"
                    value={settings.repeatIntervalHours}
                    onChange={(e) => updateSetting('repeatIntervalHours', parseInt(e.target.value) || 24)}
                    className="form-input"
                  />
                  <span className="form-hint">
                    Hours between repeat notifications
                  </span>
                </div>
              </div>

              <div className="settings-divider" />

              {/* VAPID Key Management */}
              <div className="form-group">
                <label className="form-label">VAPID Public Key</label>
                <p className="text-muted text-sm mb-sm">
                  Used for Web Push authentication. Only regenerate if you have issues with push notifications.
                </p>
                {vapidPublicKey ? (
                  <code className="vapid-key-display">{vapidPublicKey.substring(0, 40)}...</code>
                ) : (
                  <span className="text-warning text-sm">Not configured</span>
                )}
                <div className="mt-md">
                  <Button
                    variant="danger"
                    size="small"
                    onClick={handleRegenerateVapid}
                    loading={regeneratingVapid}
                  >
                    🔄 Regenerate VAPID Keys
                  </Button>
                </div>
              </div>
            </div>
          </details>

          <div className="settings-actions mt-lg">
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
