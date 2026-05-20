import React, { useCallback, useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Database, Monitor, Moon, RefreshCw, ShieldAlert, Sun, Trash2, XCircle } from 'lucide-react';
import { adminAPI, microservicesAPI } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { useTheme, THEMES } from '../../contexts/ThemeContext';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { CardSkeleton } from '../common/LoadingSkeleton';
import { Modal } from '../common/Modal';

const WIPE_CONFIRMATION = 'WIPE HISTORY';

function ThemeSettings() {
  const { themePreference, setTheme, isDark } = useTheme();

  const themeOptions = [
    { value: THEMES.SYSTEM, label: 'System', icon: Monitor, description: 'Follow system preference' },
    { value: THEMES.LIGHT, label: 'Light', icon: Sun, description: 'Light theme' },
    { value: THEMES.DARK, label: 'Dark', icon: Moon, description: 'Dark theme' }
  ];

  return (
    <div className="theme-settings">
      <div className="theme-options">
        {themeOptions.map(option => {
          const Icon = option.icon;

          return (
            <button
              key={option.value}
              className={`theme-option ${themePreference === option.value ? 'theme-option-active' : ''}`}
              onClick={() => setTheme(option.value)}
              aria-pressed={themePreference === option.value}
            >
              <span className="theme-option-icon" aria-hidden="true"><Icon size={17} /></span>
              <span className="theme-option-label">{option.label}</span>
            </button>
          );
        })}
      </div>
      <p className="theme-status">
        Current: <strong>{isDark ? 'Dark' : 'Light'}</strong>
        {themePreference === THEMES.SYSTEM && ' (following system)'}
      </p>
    </div>
  );
}

function VersionInfo() {
  const [version, setVersion] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/config/version')
      .then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
      .then(data => {
        setVersion(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch version:', err);
        setLoading(false);
      });
  }, []);

  if (loading) return <CardSkeleton lines={3} />;
  if (!version) return null;

  return (
    <div className="version-info-card">
      <h4>Application Version</h4>
      <div className="version-grid">
        <div className="version-item">
          <span className="version-label">Frontend</span>
          <span className="version-value">{version.frontendVersion || version.version || 'Unknown'}</span>
        </div>
        <div className="version-item">
          <span className="version-label">Backend</span>
          <span className="version-value">{version.backendVersion || version.version || 'Unknown'}</span>
        </div>
      </div>
      {version.buildDate && (
        <p className="version-date">Built: {new Date(version.buildDate).toLocaleString()}</p>
      )}
    </div>
  );
}

function ServiceHealthCard({ name, status, version, responseTime }) {
  const getStatusBadge = () => {
    if (status === 'healthy') return <Badge variant="success" icon={CheckCircle2}>Healthy</Badge>;
    if (status === 'degraded') return <Badge variant="warning" icon={AlertTriangle}>Degraded</Badge>;
    return <Badge variant="error" icon={XCircle}>Unavailable</Badge>;
  };

  return (
    <div className={`service-card service-${status}`}>
      <div className="service-header">
        <span className="service-name">{name}</span>
        {getStatusBadge()}
      </div>
      {version && <span className="service-version">v{version}</span>}
      {responseTime && <span className="service-latency">{responseTime}ms</span>}
    </div>
  );
}

export function SystemSettings() {
  const toast = useToast();
  const [servicesHealth, setServicesHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [historyScope, setHistoryScope] = useState('all-profiles');
  const [historySummary, setHistorySummary] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [wipeModalOpen, setWipeModalOpen] = useState(false);
  const [wipeConfirmation, setWipeConfirmation] = useState('');
  const [wipingHistory, setWipingHistory] = useState(false);

  const loadServicesHealth = async () => {
    setLoading(true);
    try {
      const response = await microservicesAPI.checkHealth();
      if (response?.data) {
        setServicesHealth(response.data);
      }
    } catch (err) {
      console.error('Health check failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadServicesHealth();
    setRefreshing(false);
    toast.success('Health check refreshed');
  };

  const loadHistorySummary = useCallback(async (scope = historyScope) => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const response = await adminAPI.getHistorySummary(scope);
      setHistorySummary(response.data);
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Failed to load history summary';
      setHistorySummary(null);
      setHistoryError(message);
    } finally {
      setHistoryLoading(false);
    }
  }, [historyScope]);

  useEffect(() => {
    loadServicesHealth();
  }, []);

  useEffect(() => {
    loadHistorySummary(historyScope);
  }, [historyScope, loadHistorySummary]);

  const handleOpenWipeModal = () => {
    setWipeConfirmation('');
    setWipeModalOpen(true);
  };

  const handleWipeHistory = async () => {
    setWipingHistory(true);
    try {
      const response = await adminAPI.wipeHistory({
        scope: historyScope,
        confirmation: wipeConfirmation
      });
      toast.success(`History wiped. Deleted ${response.data.totalDeleted || 0} records.`);
      setWipeModalOpen(false);
      setWipeConfirmation('');
      await loadHistorySummary(historyScope);
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Failed to wipe history';
      toast.error(message);
    } finally {
      setWipingHistory(false);
    }
  };

  const services = [
    { key: 'ai-intelligence', name: 'AI Intelligence', port: 8001 },
    { key: 'pattern-recognition', name: 'Pattern Recognition', port: 8002 },
    { key: 'nl-parser', name: 'NL Parser', port: 8003 },
    { key: 'voice-processor', name: 'Voice Processor', port: 8004 },
    { key: 'context-service', name: 'Context Service', port: 8005 },
    { key: 'integrations', name: 'Integrations', port: 8006 }
  ];

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <h3>Appearance</h3>
      </div>

      <ThemeSettings />

      <div className="settings-divider" />

      <div className="settings-section-header">
        <h3>System Information</h3>
      </div>

      <VersionInfo />

      <div className="settings-divider" />

      <div className="settings-section-header">
        <h3>Microservices Health</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          loading={refreshing}
          icon={<RefreshCw size={15} />}
        >
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="services-grid">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <CardSkeleton key={i} lines={2} />
          ))}
        </div>
      ) : (
        <div className="services-grid">
          {services.map(service => {
            const health = servicesHealth?.services?.[service.key] || {};
            return (
              <ServiceHealthCard
                key={service.key}
                name={service.name}
                status={health.status || 'unavailable'}
                version={health.version}
                responseTime={health.responseTime}
              />
            );
          })}
        </div>
      )}

      <div className="settings-divider" />

      <div className="settings-section-header">
        <h3>Storage</h3>
      </div>

      <div className="info-card">
        <p className="text-muted">
          Storage configuration is managed in the <strong>AI Settings</strong> tab under &quot;Storage Configuration&quot;.
          Choose between local filesystem or AWS S3 for storing voice recordings and transcripts.
        </p>
      </div>

      <div className="settings-divider" />

      <div className="settings-section-header">
        <h3>Danger Zone</h3>
      </div>

      <div className="danger-zone">
        <div className="danger-item">
          <div>
            <h4>Clear Cache</h4>
            <p className="text-muted text-sm">Clear local cache and refresh all data</p>
          </div>
          <Button
            variant="warning"
            size="sm"
            onClick={() => {
              localStorage.clear();
              toast.success('Cache cleared. Refreshing...');
              setTimeout(() => window.location.reload(), 1000);
            }}
          >
            Clear Cache
          </Button>
        </div>

        <div className="danger-divider" />

        <div className="danger-item danger-item-stacked">
          <div className="danger-copy">
            <div className="danger-title-row">
              <Trash2 size={17} aria-hidden="true" />
              <h4>Wipe History</h4>
              <Badge variant="error" size="sm" icon={ShieldAlert}>Destructive</Badge>
            </div>
            <p className="text-muted text-sm">
              Permanently deletes stored transcripts, imported email and meeting records, tasks, briefs, context, insights, and notification history.
              Integrations and provider configuration stay connected.
            </p>
          </div>

          <div className="history-wipe-panel">
            <label className="form-label" htmlFor="history-wipe-scope">Scope</label>
            <select
              id="history-wipe-scope"
              className="form-select"
              value={historyScope}
              onChange={(event) => setHistoryScope(event.target.value)}
              disabled={historyLoading || wipingHistory}
            >
              <option value="all-profiles">All profiles</option>
              <option value="current-profile">Current profile only</option>
            </select>

            <div className="history-summary-card" aria-live="polite">
              {historyLoading ? (
                <CardSkeleton lines={3} />
              ) : historyError ? (
                <div className="history-summary-error">
                  <ShieldAlert size={16} aria-hidden="true" />
                  <span>{historyError}</span>
                </div>
              ) : (
                <>
                  <div className="history-summary-total">
                    <Database size={16} aria-hidden="true" />
                    <span>{historySummary?.totalRows || 0} records ready to wipe</span>
                  </div>
                  <div className="history-summary-meta">
                    {(historySummary?.tables || [])
                      .filter(item => item.scoped && item.count > 0)
                      .slice(0, 4)
                      .map(item => (
                        <Badge key={item.table} variant="default" size="sm" showIcon={false}>
                          {item.table}: {item.count}
                        </Badge>
                      ))}
                  </div>
                </>
              )}
            </div>

            <div className="history-wipe-actions">
              <Button
                variant="ghost"
                size="sm"
                icon={<RefreshCw size={15} />}
                onClick={() => loadHistorySummary(historyScope)}
                loading={historyLoading}
              >
                Refresh
              </Button>
              <Button
                variant="error"
                size="sm"
                icon={<Trash2 size={15} />}
                onClick={handleOpenWipeModal}
                disabled={historyLoading || Boolean(historyError) || !historySummary}
              >
                Wipe History
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Modal
        isOpen={wipeModalOpen}
        onClose={wipingHistory ? undefined : () => setWipeModalOpen(false)}
        title="Wipe History"
        size="md"
        closeOnOverlay={!wipingHistory}
        closeOnEscape={!wipingHistory}
        footer={
          <div className="modal-actions">
            <Button variant="secondary" size="sm" onClick={() => setWipeModalOpen(false)} disabled={wipingHistory}>
              Cancel
            </Button>
            <Button
              variant="error"
              size="sm"
              icon={<Trash2 size={15} />}
              onClick={handleWipeHistory}
              loading={wipingHistory}
              disabled={wipeConfirmation !== WIPE_CONFIRMATION}
            >
              Wipe History
            </Button>
          </div>
        }
      >
        <div className="history-confirm">
          <div className="history-confirm-warning">
            <ShieldAlert size={18} aria-hidden="true" />
            <p>
              This permanently deletes {historySummary?.totalRows || 0} stored records for {historyScope === 'all-profiles' ? 'all profiles' : 'the current profile'}.
              Connected Microsoft 365, Jira, Planner, AI provider, and profile settings are preserved.
            </p>
          </div>
          <label className="form-label" htmlFor="wipe-confirmation">
            Type {WIPE_CONFIRMATION} to confirm
          </label>
          <input
            id="wipe-confirmation"
            className="form-input form-input-mono"
            value={wipeConfirmation}
            onChange={(event) => setWipeConfirmation(event.target.value)}
            disabled={wipingHistory}
            autoComplete="off"
          />
        </div>
      </Modal>
    </div>
  );
}

export default SystemSettings;
