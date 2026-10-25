import { Lock, Unlock, Clock, AlertTriangle, Edit3 } from 'lucide-react';
import type { Allocation, PeriodTiming } from '../../types';

const formatTime = (time24: string) => {
  if (!time24) return '';
  const [h, m] = time24.split(':');
  if (!m) return '';
  let hours = parseInt(h, 10);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${m} ${ampm}`;
};

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
      <div className="h-20 flex items-center justify-center text-[11px] text-slate-300 italic select-none">
        No period slot
      </div>
    );
  }

  const isGap = !!(allocation && allocation.vacatedFacultyId && !allocation.facultyId);

  const toneClass = isGap
    ? 'bg-rose-50 border-2 border-dashed border-rose-300 text-rose-700 hover:bg-rose-100/70 shadow-xs'
    : !allocation || !allocation.facultyId
      ? 'bg-slate-50/80 border-2 border-dashed border-slate-200 text-slate-400 hover:border-indigo-300 hover:bg-indigo-50/30'
      : allocation.frozen
        ? 'bg-amber-50/90 border border-amber-200 text-amber-900 shadow-xs hover:border-amber-300'
        : allocation.manualEdited
          ? 'bg-purple-50/90 border border-purple-200 text-purple-900 shadow-xs hover:border-purple-300'
          : 'bg-indigo-50/80 border border-indigo-100 text-indigo-950 shadow-xs hover:border-indigo-300 hover:bg-indigo-50';

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-400 mb-1.5">
        <Clock className="w-3 h-3 text-slate-400 shrink-0" />
        <span>{formatTime(period.startTime)} – {formatTime(period.endTime)}</span>
      </div>

      <div
        onClick={onClickSlot}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClickSlot?.();
          }
        }}
        className={`relative group/card flex flex-col justify-center h-20 px-3 py-2 rounded-xl cursor-pointer transition-all duration-150 select-none ${toneClass}`}
        title={
          allocation?.explanation
            ? allocation.explanation.join('\n')
            : 'Click to assign or edit this period'
        }
      >
        {isGap ? (
          <>
            <div className="font-bold text-xs leading-tight text-center flex items-center justify-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500 animate-pulse" /> Gap
            </div>
            <div className="text-[11px] text-center mt-1 font-medium text-rose-600 line-through truncate">
              {allocation?.vacatedFacultyName || 'Faculty'}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-center gap-1">
              <span className={`font-bold text-sm leading-tight text-center truncate ${!allocation?.facultyId ? 'text-slate-400 italic' : ''}`}>
                {allocation?.subject || 'Free Period'}
              </span>
              {allocation?.manualEdited && (
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" title="Manual override" />
              )}
            </div>
            {allocation?.facultyId && (
              <div className={`text-xs text-center mt-1 font-semibold truncate ${
                allocation.frozen ? 'text-amber-700' : allocation.manualEdited ? 'text-purple-700' : 'text-indigo-600'
              }`}>
                {facultyName}
              </div>
            )}
          </>
        )}

        {/* Hover quick action overlay buttons */}
        <div className="absolute top-1 right-1 flex items-center gap-1 z-10">
          {allocation && !isGap && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFreeze();
              }}
              className={`p-1 rounded-full shadow-xs transition-all duration-150 ${
                allocation.frozen
                  ? 'bg-amber-500 text-white hover:bg-amber-600 opacity-100'
                  : 'bg-white text-slate-400 border border-slate-200 opacity-0 group-hover/card:opacity-100 hover:text-indigo-600 hover:border-indigo-200'
              }`}
              title={allocation.frozen ? 'Unfreeze Slot' : 'Freeze Slot'}
            >
              {allocation.frozen ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            </button>
          )}
          <span
            className="p-1 rounded-full bg-white text-slate-400 border border-slate-200 opacity-0 group-hover/card:opacity-100 hover:text-indigo-600 hover:border-indigo-200 shadow-xs transition-all"
            title="Edit Slot"
          >
            <Edit3 className="w-3 h-3" />
          </span>
        </div>
      </div>
    </div>
  );
}