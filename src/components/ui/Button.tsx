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
    'bg-[#6B2638] text-white hover:bg-[#581E2D] active:bg-[#461724] border border-[#581E2D]/50 shadow-xs focus-visible:ring-2 focus-visible:ring-[#6B2638] focus-visible:ring-offset-1',
  gold:
    'bg-[#B08D57] text-white hover:bg-[#9A7947] active:bg-[#846638] border border-[#9A7947]/50 shadow-xs focus-visible:ring-2 focus-visible:ring-[#B08D57] focus-visible:ring-offset-1',
  secondary:
    'bg-white text-[#252326] border border-[#E5E0D8] hover:bg-[#FAF7F2] hover:border-[#D5CFC5] active:bg-[#F3EEE6] shadow-2xs',
  outline:
    'bg-transparent text-[#252326] border border-[#E5E0D8] hover:bg-[#FAF7F2] hover:border-[#D5CFC5] active:bg-[#F3EEE6]',
  danger:
    'bg-[#FDF2F2] text-[#A63232] border border-[#F6CECE] hover:bg-[#FAE5E5] active:bg-[#F5D8D8]',
  ghost:
    'bg-transparent text-[#5E5B61] hover:text-[#252326] hover:bg-[#FAF7F2] active:bg-[#F3EEE6]',
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
