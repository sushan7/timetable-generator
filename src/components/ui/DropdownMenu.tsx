import { useState, useRef, useEffect, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from './cn';

export interface DropdownItem {
  id: string;
  label: string;
  icon?: ReactNode;
  description?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export interface DropdownMenuProps {
  label: ReactNode;
  icon?: ReactNode;
  items: DropdownItem[];
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md';
  align?: 'left' | 'right';
  className?: string;
  disabled?: boolean;
}

export default function DropdownMenu({
  label,
  icon,
  items,
  variant = 'secondary',
  size = 'md',
  align = 'right',
  className,
  disabled,
}: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const buttonVariantStyles = {
    primary: 'bg-[#6B2638] text-white hover:bg-[#581E2D] border border-[#581E2D]/50 shadow-xs',
    secondary: 'bg-white text-[#252326] border border-[#E5E0D8] hover:bg-[#FAF7F2] hover:border-[#D5CFC5] shadow-2xs',
    outline: 'bg-transparent text-[#252326] border border-[#E5E0D8] hover:bg-[#FAF7F2]',
    ghost: 'bg-transparent text-[#5E5B61] hover:text-[#252326] hover:bg-[#FAF7F2]',
  };

  const sizeStyles = {
    sm: 'px-2.5 py-1.5 text-xs rounded-md gap-1.5',
    md: 'px-3.5 py-2 text-sm rounded-md gap-2',
  };

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className={cn(
          'inline-flex items-center justify-between font-medium transition-colors duration-150 select-none disabled:opacity-40 disabled:pointer-events-none',
          buttonVariantStyles[variant],
          sizeStyles[size],
          className
        )}
      >
        <span className="inline-flex items-center gap-1.5">
          {icon && <span className="shrink-0">{icon}</span>}
          <span>{label}</span>
        </span>
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 text-[#5E5B61] shrink-0 transition-transform duration-150',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && (
        <div
          role="menu"
          className={cn(
            'absolute z-40 mt-1 w-56 rounded-md bg-white border border-[#E5E0D8] shadow-md py-1 focus:outline-none animate-in fade-in zoom-in-95 duration-100',
            align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left'
          )}
        >
          {items.map(item => (
            <button
              key={item.id}
              role="menuitem"
              type="button"
              disabled={item.disabled}
              onClick={() => {
                setIsOpen(false);
                item.onClick();
              }}
              className={cn(
                'w-full text-left px-3.5 py-2 text-sm flex items-start gap-2.5 transition-colors select-none',
                item.disabled && 'opacity-40 pointer-events-none',
                item.danger
                  ? 'text-[#A63232] hover:bg-[#FDF2F2]'
                  : 'text-[#252326] hover:bg-[#FAF7F2]'
              )}
            >
              {item.icon && (
                <span className="mt-0.5 shrink-0 text-[#5E5B61]">
                  {item.icon}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-[#252326] leading-tight">{item.label}</div>
                {item.description && (
                  <p className="text-[11px] text-[#5E5B61] mt-0.5 leading-snug">{item.description}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
