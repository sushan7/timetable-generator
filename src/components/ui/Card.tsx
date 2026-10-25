import type { ReactNode } from 'react';
import { cn } from './cn';

export default function Card({
  children,
  className,
  padding = true,
}: {
  children: ReactNode;
  className?: string;
  padding?: boolean;
}) {
  return (
    <div
      className={cn(
        'bg-white rounded-2xl border border-slate-200/90 shadow-xs transition-shadow',
        padding && 'p-6',
        className
      )}
    >
      {children}
    </div>
  );
}