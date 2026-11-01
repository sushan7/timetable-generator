import type { ReactNode } from 'react';
import { cn } from './cn';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'terracotta' | 'ochre' | 'forest';

const TONE_STYLES: Record<BadgeTone, string> = {
  neutral: 'bg-[#F0EFE9] text-[#252522] border-[#E5E2DA]',
  success: 'bg-[#FBF3EE] text-[#8A4C2E] border-[#F3DFD3]',
  forest: 'bg-[#FBF3EE] text-[#8A4C2E] border-[#F3DFD3]',
  warning: 'bg-[#FBF3EE] text-[#8A4C2E] border-[#F3DFD3]',
  terracotta: 'bg-[#FBF3EE] text-[#8A4C2E] border-[#F3DFD3]',
  ochre: 'bg-[#F7F4EF] text-[#7A6245] border-[#E6DECF]',
  danger: 'bg-[#FDF2F0] text-[#9E4334] border-[#F5D5CF]',
};

export default function Badge({
  tone = 'neutral',
  icon,
  children,
  className,
}: {
  tone?: BadgeTone | 'info' | 'purple';
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  // Normalize legacy 'info' to neutral and 'purple' to terracotta
  const normalizedTone: BadgeTone =
    tone === 'info' ? 'neutral' : tone === 'purple' ? 'terracotta' : tone;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border select-none w-max leading-tight',
        TONE_STYLES[normalizedTone],
        className
      )}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  );
}
