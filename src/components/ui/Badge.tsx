import type { ReactNode } from 'react';
import { cn } from './cn';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const TONE_STYLES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-600 border-slate-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  warning: 'bg-amber-50 text-amber-700 border-amber-100',
  danger: 'bg-red-50 text-red-700 border-red-100',
  info: 'bg-indigo-50 text-indigo-700 border-indigo-100',
};

export default function Badge({
  tone = 'neutral',
  icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border w-max',
        TONE_STYLES[tone],
        className
      )}
    >
      {icon}
      {children}
    </span>
  );
}