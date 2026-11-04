import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'gold' | 'danger' | 'ghost' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
}

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-canvas hover:bg-primary-hover active:bg-primary-hover/90 border border-primary-hover/50 shadow-xs focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1',
  gold:
    'bg-accent text-ink hover:bg-accent-hover active:bg-accent-hover/90 border border-accent-hover/50 shadow-xs focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 font-semibold',
  secondary:
    'bg-surface text-ink border border-border hover:bg-surface-muted hover:border-taupe/40 active:bg-canvas shadow-2xs focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1',
  outline:
    'bg-transparent text-ink border border-border hover:bg-surface-muted hover:border-taupe/40 active:bg-canvas focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1',
  danger:
    'bg-burgundy-soft text-burgundy border border-burgundy/20 hover:bg-burgundy-soft/80 active:bg-burgundy-soft/60 focus-visible:ring-2 focus-visible:ring-burgundy focus-visible:ring-offset-1',
  ghost:
    'bg-transparent text-ink-muted hover:text-ink hover:bg-surface-muted active:bg-canvas focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1',
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs rounded-md gap-1.5',
  md: 'px-3.5 py-2 text-sm rounded-md gap-2',
  lg: 'px-4.5 py-2.5 text-base rounded-md gap-2.5',
};

export default function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconPosition = 'left',
  loading,
  disabled,
  children,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors duration-150 select-none disabled:opacity-40 disabled:pointer-events-none',
        VARIANT_STYLES[variant],
        SIZE_STYLES[size],
        className
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin text-current shrink-0" />
      ) : (
        icon && iconPosition === 'left' && <span className="shrink-0">{icon}</span>
      )}
      {children && <span>{children}</span>}
      {!loading && icon && iconPosition === 'right' && (
        <span className="shrink-0">{icon}</span>
      )}
    </button>
  );
}
