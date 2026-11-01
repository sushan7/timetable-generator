import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
}

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-[#476B52] text-white hover:bg-[#3D5C46] active:bg-[#334D3A] border border-[#3D5C46]/40 shadow-xs',
  secondary: 'bg-white text-[#252522] border border-[#E5E2DA] hover:bg-[#F0EFE9] hover:border-[#D9D5CC] active:bg-[#EAE8E0] shadow-2xs',
  outline: 'bg-transparent text-[#252522] border border-[#E5E2DA] hover:bg-[#F0EFE9] hover:border-[#D9D5CC] active:bg-[#EAE8E0]',
  danger: 'bg-[#FDF2F0] text-[#9E4334] border border-[#F5D5CF] hover:bg-[#FAE8E4] active:bg-[#F5DDD8]',
  ghost: 'bg-transparent text-[#77766F] hover:text-[#252522] hover:bg-[#F0EFE9] active:bg-[#EAE8E0]',
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
        <Loader2 className="w-4 h-4 animate-spin text-current" />
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
