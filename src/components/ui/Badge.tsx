import type { ReactNode } from 'react';
import { cn } from './cn';

export type BadgeTone =
  | 'neutral'
  | 'burgundy'
  | 'gold'
  | 'accent'
  | 'cognac'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'terracotta'
  | 'ochre'
  | 'forest';

const TONE_STYLES: Record<string, string> = {
  neutral: 'bg-surface-muted text-ink border-border',
  burgundy: 'bg-burgundy-soft text-burgundy border-burgundy/20',
  gold: 'bg-accent-soft text-ink border-accent/40',
  accent: 'bg-accent-soft text-ink border-accent/40',
  cognac: 'bg-cognac-soft text-cognac border-cognac/30',
  primary: 'bg-primary text-canvas border-primary',
  success: 'bg-accent-soft text-ink border-accent/40',
  warning: 'bg-cognac-soft text-cognac border-cognac/30',
  danger: 'bg-burgundy-soft text-burgundy border-burgundy/20',
  info: 'bg-surface-muted text-ink border-border',
  // Aliases for backward compatibility
  terracotta: 'bg-cognac-soft text-cognac border-cognac/30',
  ochre: 'bg-accent-soft text-ink border-accent/40',
  forest: 'bg-surface-muted text-ink border-border',
};

export default function Badge({
  tone = 'neutral',
  icon,
  children,
  className,
}: {
  tone?: BadgeTone | 'purple';
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const normalizedTone = tone === 'purple' ? 'burgundy' : tone;
  const style = TONE_STYLES[normalizedTone] || TONE_STYLES.neutral;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border select-none w-max leading-tight',
        style,
        className
      )}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  );
}
