import { Lock, Unlock, AlertTriangle, Edit2, ShieldAlert } from 'lucide-react';
import type { Allocation, PeriodTiming } from '../../types';

export default function AllocationCell({
  period,
  allocation,
  facultyName,
  isUnfilled,
  unfilledReason,
  isViolated,
  violationReason,
  onToggleFreeze,
  onClickSlot,
}: {
  period: PeriodTiming | null;
  allocation: Allocation | undefined;
  facultyName: string;
  isUnfilled?: boolean;
  unfilledReason?: string;
  isViolated?: boolean;
  violationReason?: string;
  onToggleFreeze: () => void;
  onClickSlot?: () => void;
}) {
  const hasNoTiming = !period || !period.startTime;
  if (hasNoTiming) {
    return (
      <div className="h-18 flex items-center justify-center text-[11px] text-[#5E5B61]/50 italic select-none border border-dashed border-[#E5E0D8] rounded bg-[#FAF7F2]/40">
        Not in session
      </div>
    );
  }

  const isGap = !!(allocation && allocation.vacatedFacultyId && !allocation.facultyId);
  const isFree = !allocation || (!allocation.facultyId && !isUnfilled && !isGap);

  // Surface tone classes based on allocation state
  const getCellTone = () => {
    if (isViolated) {
      return 'bg-[#FEF2F2] border-2 border-red-600 text-red-950 shadow-xs ring-1 ring-red-500';
    }
    if (allocation?.overridden) {
      return 'bg-[#FFF7ED] border-2 border-[#EA580C] text-[#9A3412] shadow-xs';
    }
    if (allocation?.hasConflictOverride) {
      return 'bg-[#FDF2F2] border-2 border-[#A63232] text-[#8F2424] shadow-xs';
    }
    if (isGap) {
      return 'bg-[#FDF2F2] border border-[#F6CECE] hover:border-[#E8AAAA] text-[#A63232]';
    }
    if (isUnfilled) {
      return 'bg-[#FDF8EE] border border-[#F4E2C2] hover:border-[#D4BC92] text-[#8B5602]';
    }
    if (isFree) {
      return 'bg-[#FAF7F2]/60 border border-dashed border-[#E5E0D8] hover:border-[#6B2638] hover:bg-[#FAF7F2] text-[#5E5B61]';
    }
    if (allocation?.frozen) {
      return 'bg-[#F8F3EA] border border-[#E7D7BD] hover:border-[#CDB795] text-[#7A5B28] shadow-2xs';
    }
    if (allocation?.manualEdited) {
      return 'bg-white border-l-3 border-l-[#A65E3B] border-t border-r border-b border-[#E5E0D8] hover:border-[#6B2638] text-[#252326] shadow-2xs';
    }
    return 'bg-white border border-[#E5E0D8] hover:border-[#6B2638] text-[#252326] shadow-2xs';
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
      className={`group/cell relative flex flex-col justify-between h-18 p-2.5 rounded cursor-pointer transition-colors duration-120 select-none outline-none focus-visible:ring-2 focus-visible:ring-[#6B2638] focus-visible:ring-offset-1 ${getCellTone()}`}
      title={
        isViolated
          ? `LOCKED SLOT CONSTRAINT VIOLATION:\n${violationReason || 'Slot violates constraints'}`
          : allocation?.overridden
            ? `OVERRIDDEN MANUAL ASSIGNMENT:\n${allocation.conflictNote || 'Forced assignment bypassing constraints'}`
            : allocation?.hasConflictOverride
              ? `WARNING: Schedule conflict override!\n${allocation.conflictNote || ''}`
              : isUnfilled
                ? `UNFILLED SHORTAGE: ${unfilledReason || 'No teacher available'}`
                : allocation?.explanation
                  ? allocation.explanation.join('\n')
                  : 'Click to assign or edit this slot'
      }
    >
      {/* Main slot content */}
      {isViolated ? (
        <div className="flex flex-col justify-between h-full">
          <div className="flex items-center justify-between gap-1">
            <span className="font-bold text-xs text-red-900 truncate">
              {allocation?.subject || 'Locked Slot'}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <span title="Locked constraint violation" className="inline-flex items-center">
                <Lock className="w-3 h-3 text-red-600" />
              </span>
              <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
            </div>
          </div>
          <div className="text-[10px] text-red-700 font-medium truncate">
            {facultyName}
          </div>
          <div className="text-[9px] text-red-600 truncate font-semibold uppercase">
            Violation
          </div>
        </div>
      ) : allocation?.overridden ? (
        <div className="flex flex-col justify-between h-full">
          <div className="flex items-center justify-between gap-1">
            <span className="font-bold text-xs text-[#9A3412] truncate">
              {allocation.subject}
            </span>
            <span className="text-[9px] font-bold px-1 py-0.5 bg-[#FFEDD5] text-[#C2410C] rounded border border-[#FDBA74]">
              OVERRIDDEN
            </span>
          </div>
          <div className="text-[11px] text-[#9A3412] font-medium truncate">
            {facultyName}
          </div>
        </div>
      ) : allocation?.hasConflictOverride ? (
        <div className="flex flex-col justify-center h-full text-center">
          <div className="flex items-center justify-center gap-1 text-xs font-bold text-[#A63232]">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-[#A63232]" />
            <span className="truncate">{allocation.subject}</span>
          </div>
          <div className="text-[10px] text-[#A63232]/90 mt-0.5 truncate font-medium">
            Override: {facultyName}
          </div>
        </div>
      ) : isGap ? (
        <div className="flex flex-col justify-center h-full text-center">
          <div className="flex items-center justify-center gap-1 text-xs font-semibold text-[#A63232]">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-[#A65E3B]" />
            <span>Gap (Absent)</span>
          </div>
          <div className="text-[11px] text-[#A63232]/80 line-through mt-0.5 truncate font-medium">
            {allocation?.vacatedFacultyName || 'Teacher absent'}
          </div>
        </div>
      ) : isUnfilled ? (
        <div className="flex flex-col justify-center h-full text-center">
          <div className="flex items-center justify-center gap-1 text-xs font-semibold text-[#8B5602]">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-[#B08D57]" />
            <span>Unfilled Shortage</span>
          </div>
          <div className="text-[10px] text-[#8B5602]/90 mt-0.5 truncate">
            {unfilledReason || 'No teacher available'}
          </div>
        </div>
      ) : isFree ? (
        <div className="flex items-center justify-center h-full text-xs font-medium text-[#5E5B61]">
          <span>Free Period</span>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-1">
            <span className="font-semibold text-xs sm:text-sm text-[#252326] leading-snug truncate">
              {allocation?.subject}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {allocation?.manualEdited && !allocation?.frozen && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-[#A65E3B] shrink-0 mt-1"
                  title="Manually edited slot"
                />
              )}
              {allocation?.frozen && (
                <span title="Locked slot" className="shrink-0 inline-flex items-center">
                  <Lock className="w-3 h-3 text-[#B08D57]" />
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-[#5E5B61] mt-1">
            <span className="truncate font-medium">
              {facultyName}
            </span>
          </div>
        </>
      )}

      {/* Quick Action Overlay (Freeze Lock & Edit) - visible on hover, and accessible via keyboard/touch */}
      <div className="absolute top-1.5 right-1.5 flex items-center gap-1 opacity-0 group-hover/cell:opacity-100 focus-within:opacity-100 transition-opacity z-10">
        {allocation && !isGap && (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onToggleFreeze();
            }}
            className={`p-1 rounded shadow-2xs transition-colors ${
              allocation.frozen
                ? 'bg-[#B08D57] text-white hover:bg-[#9A7947]'
                : 'bg-white text-[#5E5B61] border border-[#E5E0D8] hover:text-[#6B2638] hover:border-[#6B2638]'
            }`}
            title={allocation.frozen ? 'Unlock slot' : 'Lock slot against regeneration'}
            aria-label={allocation.frozen ? 'Unlock slot' : 'Lock slot'}
          >
            {allocation.frozen ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
          </button>
        )}
        <span
          className="p-1 rounded bg-white text-[#5E5B61] border border-[#E5E0D8] shadow-2xs hover:text-[#6B2638]"
          title="Edit assignment"
        >
          <Edit2 className="w-3 h-3" />
        </span>
      </div>
    </div>
  );
}
