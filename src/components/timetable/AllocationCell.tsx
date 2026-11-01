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
      <div className="h-18 flex items-center justify-center text-[11px] text-slate-300 italic select-none border border-dashed border-slate-100 rounded-lg">
        Not in session
      </div>
    );
  }

  const isGap = !!(allocation && allocation.vacatedFacultyId && !allocation.facultyId);
  const isFree = !allocation || !allocation.facultyId;

  // Surface tone classes based on allocation state
  const getCellTone = () => {
    if (isGap) {
      return 'bg-rose-50/90 border border-rose-300 hover:border-rose-400 text-rose-900';
    }
    if (isFree) {
      return 'bg-slate-50/70 border border-dashed border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 text-slate-400';
    }
    if (allocation?.frozen) {
      return 'bg-amber-50/70 border border-amber-200/90 hover:border-amber-300 text-amber-950';
    }
    if (allocation?.manualEdited) {
      return 'bg-purple-50/70 border border-purple-200/90 hover:border-purple-300 text-purple-950';
    }
    return 'bg-white border border-slate-200/90 hover:border-indigo-400 hover:bg-slate-50/60 text-slate-900 shadow-2xs';
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
      className={`group/cell relative flex flex-col justify-between h-18 p-2.5 rounded-lg cursor-pointer transition-colors duration-150 select-none outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-1 ${getCellTone()}`}
      title={
        allocation?.explanation
          ? allocation.explanation.join('\n')
          : 'Click to assign or edit this slot'
      }
    >
      {/* Main slot content */}
      {isGap ? (
        <div className="flex flex-col justify-center h-full text-center">
          <div className="flex items-center justify-center gap-1 text-xs font-bold text-rose-700">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-600" />
            <span>Gap (Absent)</span>
          </div>
          <div className="text-[11px] text-rose-600 line-through mt-0.5 truncate font-medium">
            {allocation?.vacatedFacultyName || 'Teacher absent'}
          </div>
        </div>
      ) : isFree ? (
        <div className="flex items-center justify-center h-full text-xs font-medium text-slate-400">
          <span>Free Period</span>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-1">
            <span className="font-bold text-xs sm:text-sm text-slate-900 leading-snug truncate">
              {allocation?.subject}
            </span>
            {allocation?.manualEdited && !allocation?.frozen && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-purple-600 shrink-0 mt-1"
                title="Manually edited slot"
              />
            )}
            {allocation?.frozen && (
              <Lock className="w-3 h-3 text-amber-700 shrink-0 mt-0.5" title="Locked slot" />
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-slate-600 mt-1">
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
            className={`p-1 rounded-md shadow-2xs transition-colors ${
              allocation.frozen
                ? 'bg-amber-600 text-white hover:bg-amber-700'
                : 'bg-white text-slate-500 border border-slate-200 hover:text-indigo-600 hover:border-indigo-300'
            }`}
            title={allocation.frozen ? 'Unlock slot' : 'Lock slot against regeneration'}
            aria-label={allocation.frozen ? 'Unlock slot' : 'Lock slot'}
          >
            {allocation.frozen ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
          </button>
        )}
        <span
          className="p-1 rounded-md bg-white text-slate-500 border border-slate-200 shadow-2xs hover:text-indigo-600"
          title="Edit assignment"
        >
          <Edit2 className="w-3 h-3" />
        </span>
      </div>
    </div>
  );
}
