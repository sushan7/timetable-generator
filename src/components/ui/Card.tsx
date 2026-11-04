import type { ReactNode } from 'react';
import { cn } from './cn';

export default function Card({
  children,
  className,
  padding = true,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  padding?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-surface rounded-lg border border-border shadow-2xs',
        padding && 'p-5 sm:p-6',
        onClick && 'cursor-pointer hover:border-taupe transition-colors',
        className
      )}
    >
      {children}
    </div>
  );
}
