import type { ReactNode } from 'react';
import { cn } from './cn';

export type BadgeTone =
  | 'neutral'
  | 'burgundy'
  | 'gold'
  | 'cognac'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'terracotta'
  | 'ochre'
  | 'forest';

const TONE_STYLES: Record<string, string> = {
  neutral: 'bg-[#FAF7F2] text-[#252326] border-[#E5E0D8]',
  burgundy: 'bg-[#F5EBEE] text-[#6B2638] border-[#E5CAD1]',
  gold: 'bg-[#F8F3EA] text-[#7A5B28] border-[#E7D7BD]',
  cognac: 'bg-[#FAF0EB] text-[#8A4A29] border-[#EFCFC0]',
  success: 'bg-[#EEF5F0] text-[#235732] border-[#C6DEC9]',
  warning: 'bg-[#FDF8EE] text-[#8B5602] border-[#F4E2C2]',
  danger: 'bg-[#FDF2F2] text-[#8F2424] border-[#F6CECE]',
  info: 'bg-[#EFF5FA] text-[#1F4A75] border-[#C5DBEE]',
  // Aliases for backward compatibility
  terracotta: 'bg-[#F5EBEE] text-[#6B2638] border-[#E5CAD1]',
  ochre: 'bg-[#F8F3EA] text-[#7A5B28] border-[#E7D7BD]',
  forest: 'bg-[#F5EBEE] text-[#6B2638] border-[#E5CAD1]',
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
