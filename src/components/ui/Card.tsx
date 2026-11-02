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
        'bg-white rounded-lg border border-[#E5E0D8] shadow-2xs',
        padding && 'p-5 sm:p-6',
        onClick && 'cursor-pointer hover:border-[#A89B8A] transition-colors',
        className
      )}
    >
      {children}
    </div>
  );
}
