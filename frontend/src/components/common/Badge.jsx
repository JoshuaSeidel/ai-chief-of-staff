import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  FolderKanban,
  Globe2,
  Info,
  RotateCcw,
  UserRound,
  XCircle,
  Zap
} from 'lucide-react';

const BADGE_VARIANTS = {
  commitment: { bg: '#2dd4bf20', color: '#2dd4bf', icon: ClipboardList },
  action: { bg: '#7dd87d20', color: '#7dd87d', icon: Zap },
  'follow-up': { bg: '#f4bd5020', color: '#f4bd50', icon: RotateCcw },
  risk: { bg: '#fb718520', color: '#fb7185', icon: AlertTriangle },
  cluster: { bg: '#a78bfa24', color: '#c4b5fd', icon: FolderKanban },
  profile: { bg: '#a78bfa20', color: '#a78bfa', icon: UserRound },
  global: { bg: '#9aa39a20', color: '#9aa39a', icon: Globe2 },
  success: { bg: '#7dd87d20', color: '#7dd87d', icon: CheckCircle2 },
  warning: { bg: '#f4bd5020', color: '#f4bd50', icon: AlertTriangle },
  error: { bg: '#fb718520', color: '#fb7185', icon: XCircle },
  info: { bg: '#8ab4ff20', color: '#8ab4ff', icon: Info },
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
  const Icon = displayIcon && typeof displayIcon !== 'string' && !React.isValidElement(displayIcon)
    ? displayIcon
    : null;

  return (
    <span
      className={`badge badge-${variant} badge-${size} ${className}`}
      style={{
        '--badge-bg': variantStyle.bg,
        '--badge-color': variantStyle.color,
        padding: sizeStyle.padding,
        fontSize: sizeStyle.fontSize,
        ...style
      }}
    >
      {displayIcon && (
        <span className="badge-icon" aria-hidden="true">
          {Icon ? React.createElement(Icon, { size: 12, strokeWidth: 2.4 }) : displayIcon}
        </span>
      )}
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
    <Badge variant="cluster" icon={FolderKanban}>
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
    pending: { variant: 'warning', label: 'Pending', icon: AlertTriangle },
    completed: { variant: 'success', label: 'Completed', icon: CheckCircle2 },
    overdue: { variant: 'error', label: 'Overdue', icon: XCircle },
    'in-progress': { variant: 'info', label: 'In Progress', icon: RotateCcw }
  };

  const config = statusMap[status] || statusMap.pending;

  return (
    <Badge variant={config.variant} icon={config.icon}>
      {config.label}
    </Badge>
  );
}

export default Badge;
