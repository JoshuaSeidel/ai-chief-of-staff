import React, { useState, useEffect } from 'react';
import { microservicesAPI } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { CardSkeleton } from '../common/LoadingSkeleton';

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
    if (status === 'healthy') return <Badge variant="success" icon="✓">Healthy</Badge>;
    if (status === 'degraded') return <Badge variant="warning" icon="⚠">Degraded</Badge>;
    return <Badge variant="error" icon="✕">Unavailable</Badge>;
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

  useEffect(() => {
    loadServicesHealth();
  }, []);

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
          icon="🔄"
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
          Storage configuration is managed in the <strong>AI Settings</strong> tab under "Storage Configuration".
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
      </div>
    </div>
  );
}

export default SystemSettings;
