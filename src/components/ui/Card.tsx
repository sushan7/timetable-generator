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
        'bg-white rounded-xl border border-slate-200 shadow-sm',
        padding && 'p-5',
        className
      )}
    >
      {children}
    </div>
  );
}