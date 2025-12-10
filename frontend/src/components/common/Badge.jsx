import React from 'react';

const BADGE_VARIANTS = {
  commitment: { bg: '#3b82f620', color: '#3b82f6', icon: '📋' },
  action: { bg: '#10b98120', color: '#10b981', icon: '⚡' },
  'follow-up': { bg: '#f59e0b20', color: '#f59e0b', icon: '🔄' },
  risk: { bg: '#ef444420', color: '#ef4444', icon: '⚠️' },
  cluster: { bg: '#3b82f6', color: 'white', icon: '📁' },
  profile: { bg: '#8b5cf620', color: '#8b5cf6', icon: '👤' },
  global: { bg: '#6b728020', color: '#9ca3af', icon: '🌐' },
  success: { bg: '#22c55e20', color: '#22c55e', icon: '✓' },
  warning: { bg: '#f59e0b20', color: '#f59e0b', icon: '⚠' },
  error: { bg: '#ef444420', color: '#ef4444', icon: '✕' },
  info: { bg: '#3b82f620', color: '#3b82f6', icon: 'ℹ' },
  default: { bg: '#3f3f46', color: '#e5e5e7', icon: '' }
};

const BADGE_SIZES = {
  sm: { padding: '0.25rem 0.5rem', fontSize: '0.75rem' },
  md: { padding: '0.35rem 0.65rem', fontSize: '0.8rem' },
  lg: { padding: '0.5rem 0.85rem', fontSize: '0.9rem' }
};

export function Badge({
  children,
  variant = 'default',
  size = 'md',
  icon,
  showIcon = true,
  className = '',
  style = {}
}) {
  const variantStyle = BADGE_VARIANTS[variant] || BADGE_VARIANTS.default;
  const sizeStyle = BADGE_SIZES[size] || BADGE_SIZES.md;
  const displayIcon = icon !== undefined ? icon : (showIcon ? variantStyle.icon : '');

  return (
    <span
      className={`badge badge-${variant} badge-${size} ${className}`}
      style={{
        backgroundColor: variantStyle.bg,
        color: variantStyle.color,
        padding: sizeStyle.padding,
        fontSize: sizeStyle.fontSize,
        borderRadius: '6px',
        fontWeight: '600',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        whiteSpace: 'nowrap',
        ...style
      }}
    >
      {displayIcon && <span className="badge-icon">{displayIcon}</span>}
      {children}
    </span>
  );
}

export function TaskTypeBadge({ type }) {
  const labels = {
    commitment: 'Commitment',
    action: 'Action Item',
    'follow-up': 'Follow-up',
    risk: 'Risk'
  };

  return (
    <Badge variant={type || 'commitment'}>
      {labels[type] || 'Task'}
    </Badge>
  );
}

export function ClusterBadge({ name }) {
  return (
    <Badge variant="cluster" icon="📁">
      {name}
    </Badge>
  );
}

export function ScopeBadge({ scope }) {
  if (scope === 'profile') {
    return (
      <Badge variant="profile" size="sm" title="This setting is specific to the current profile">
        Profile
      </Badge>
    );
  }
  if (scope === 'global') {
    return (
      <Badge variant="global" size="sm" title="This setting applies to all profiles">
        Global
      </Badge>
    );
  }
  return null;
}

export function StatusBadge({ status }) {
  const statusMap = {
    pending: { variant: 'warning', label: 'Pending', icon: '⏳' },
    completed: { variant: 'success', label: 'Completed', icon: '✓' },
    overdue: { variant: 'error', label: 'Overdue', icon: '⚠️' },
    'in-progress': { variant: 'info', label: 'In Progress', icon: '🔄' }
  };

  const config = statusMap[status] || statusMap.pending;

  return (
    <Badge variant={config.variant} icon={config.icon}>
      {config.label}
    </Badge>
  );
}

export default Badge;
