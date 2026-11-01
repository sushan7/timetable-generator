import { Lock, Unlock, AlertTriangle, Edit2 } from 'lucide-react';
import type { Allocation, PeriodTiming } from '../../types';

export default function AllocationCell({
  period,
  allocation,
  facultyName,
  onToggleFreeze,
  onClickSlot,
}: {
  period: PeriodTiming | null;
  allocation: Allocation | undefined;
  facultyName: string;
  onToggleFreeze: () => void;
  onClickSlot?: () => void;
}) {
  const hasNoTiming = !period || !period.startTime;
  if (hasNoTiming) {
    return (
      <div className="h-18 flex items-center justify-center text-[11px] text-[#77766F]/50 italic select-none border border-dashed border-[#E5E2DA] rounded bg-[#F0EFE9]/40">
        Not in session
      </div>
    );
  }

  const isGap = !!(allocation && allocation.vacatedFacultyId && !allocation.facultyId);
  const isFree = !allocation || !allocation.facultyId;

  // Surface tone classes based on allocation state
  const getCellTone = () => {
    if (isGap) {
      return 'bg-[#FDF2F0] border border-[#F5D5CF] hover:border-[#E8B8AE] text-[#9E4334]';
    }
    if (isFree) {
      return 'bg-[#F0EFE9]/50 border border-dashed border-[#E5E2DA] hover:border-[#C47B59] hover:bg-[#F0EFE9] text-[#77766F]';
    }
    if (allocation?.frozen) {
      return 'bg-[#FBF3EE] border border-[#EAD3C6] hover:border-[#D9B7A3] text-[#8A4C2E]';
    }
    if (allocation?.manualEdited) {
      return 'bg-white border-l-2 border-l-[#C47B59] border-t border-r border-b border-[#E5E2DA] hover:border-[#C47B59] text-[#252522]';
    }
    return 'bg-white border border-[#E5E2DA] hover:border-[#C47B59] text-[#252522] shadow-2xs';
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClickSlot}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClickSlot?.();
        }
      }}
      className={`group/cell relative flex flex-col justify-between h-18 p-2.5 rounded cursor-pointer transition-colors duration-120 select-none outline-none focus-visible:ring-2 focus-visible:ring-[#C47B59] focus-visible:ring-offset-1 ${getCellTone()}`}
      title={
        allocation?.explanation
          ? allocation.explanation.join('\n')
          : 'Click to assign or edit this slot'
      }
    >
      {/* Main slot content */}
      {isGap ? (
        <div className="flex flex-col justify-center h-full text-center">
          <div className="flex items-center justify-center gap-1 text-xs font-semibold text-[#9E4334]">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-[#C47B59]" />
            <span>Gap (Absent)</span>
          </div>
          <div className="text-[11px] text-[#9E4334]/80 line-through mt-0.5 truncate font-medium">
            {allocation?.vacatedFacultyName || 'Teacher absent'}
          </div>
        </div>
      ) : isFree ? (
        <div className="flex items-center justify-center h-full text-xs font-medium text-[#77766F]">
          <span>Free Period</span>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-1">
            <span className="font-semibold text-xs sm:text-sm text-[#252522] leading-snug truncate">
              {allocation?.subject}
            </span>
            {allocation?.manualEdited && !allocation?.frozen && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-[#C47B59] shrink-0 mt-1"
                title="Manually edited slot"
              />
            )}
            {allocation?.frozen && (
              <Lock className="w-3 h-3 text-[#C47B59] shrink-0 mt-0.5" title="Locked slot" />
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-[#77766F] mt-1">
            <span className="truncate font-medium">
              {facultyName}
            </span>
          </div>
        </>
      )}

      {/* Quick Action Overlay (Freeze Lock & Edit) */}
      <div className="absolute top-1.5 right-1.5 flex items-center gap-1 opacity-0 group-hover/cell:opacity-100 transition-opacity z-10">
        {allocation && !isGap && (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onToggleFreeze();
            }}
            className={`p-1 rounded shadow-2xs transition-colors ${
              allocation.frozen
                ? 'bg-[#C47B59] text-white hover:bg-[#B06D4D]'
                : 'bg-white text-[#77766F] border border-[#E5E2DA] hover:text-[#C47B59] hover:border-[#C47B59]'
            }`}
            title={allocation.frozen ? 'Unlock slot' : 'Lock slot against regeneration'}
            aria-label={allocation.frozen ? 'Unlock slot' : 'Lock slot'}
          >
            {allocation.frozen ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
          </button>
        )}
        <span
          className="p-1 rounded bg-white text-[#77766F] border border-[#E5E2DA] shadow-2xs hover:text-[#C47B59]"
          title="Edit assignment"
        >
          <Edit2 className="w-3 h-3" />
        </span>
      </div>
    </div>
  );
}
