import React, { type ReactNode, type MouseEvent, type ButtonHTMLAttributes } from 'react';

// =============================================================================
// Types
// =============================================================================

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'ghost' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type IconPosition = 'left' | 'right';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  /** Button content */
  children?: ReactNode;
  /** Visual style variant */
  variant?: ButtonVariant;
  /** Size of the button */
  size?: ButtonSize;
  /** Icon element to display */
  icon?: ReactNode;
  /** Position of the icon relative to text */
  iconPosition?: IconPosition;
  /** Shows loading spinner and disables button */
  loading?: boolean;
  /** Makes button take full width of container */
  fullWidth?: boolean;
  /** Additional CSS class names */
  className?: string;
  /** Click handler */
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
}

interface IconButtonProps extends Omit<ButtonProps, 'children' | 'iconPosition'> {
  /** Required icon for icon-only button */
  icon: ReactNode;
}

interface ButtonGroupProps {
  /** Button elements */
  children: ReactNode;
  /** Additional CSS class names */
  className?: string;
}

// =============================================================================
// Constants
// =============================================================================

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  success: 'btn-success',
  warning: 'btn-warning',
  error: 'btn-error',
  ghost: 'btn-ghost',
  link: 'btn-link'
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'btn-sm',
  md: 'btn-md',
  lg: 'btn-lg'
};

// =============================================================================
// Components
// =============================================================================

/**
 * Primary button component with multiple variants and sizes.
 *
 * @example
 * <Button variant="primary" onClick={handleClick}>
 *   Click Me
 * </Button>
 *
 * @example
 * <Button variant="success" icon={<Icon name="check" />} loading={isLoading}>
 *   Save
 * </Button>
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  fullWidth = false,
  className = '',
  type = 'button',
  onClick,
  title,
  ...props
}: ButtonProps) {
  const variantClass = BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.primary;
  const sizeClass = BUTTON_SIZES[size] || BUTTON_SIZES.md;

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (loading || disabled) return;
    onClick?.(e);
  };

  return (
    <button
      type={type}
      className={`btn ${variantClass} ${sizeClass} ${fullWidth ? 'btn-full' : ''} ${loading ? 'btn-loading' : ''} ${className}`}
      disabled={disabled || loading}
      onClick={handleClick}
      title={title}
      {...props}
    >
      {loading && <span className="btn-spinner">⏳</span>}
      {!loading && icon && iconPosition === 'left' && <span className="btn-icon-wrapper">{icon}</span>}
      {children && <span className="btn-text">{children}</span>}
      {!loading && icon && iconPosition === 'right' && <span className="btn-icon-wrapper">{icon}</span>}
    </button>
  );
}

/**
 * Icon-only button for compact actions.
 *
 * @example
 * <IconButton icon={<Icon name="trash" />} title="Delete" onClick={handleDelete} />
 */
export function IconButton({
  icon,
  variant = 'ghost',
  size = 'md',
  className = '',
  title,
  ...props
}: IconButtonProps) {
  return (
    <Button
      variant={variant}
      size={size}
      className={`btn-icon-only ${className}`}
      title={title}
      {...props}
    >
      {icon}
    </Button>
  );
}

/**
 * Groups multiple buttons together with proper spacing.
 *
 * @example
 * <ButtonGroup>
 *   <Button variant="secondary">Cancel</Button>
 *   <Button variant="primary">Save</Button>
 * </ButtonGroup>
 */
export function ButtonGroup({ children, className = '' }: ButtonGroupProps) {
  return (
    <div className={`btn-group ${className}`}>
      {children}
    </div>
  );
}

export default Button;
