import { Lock, Unlock, Clock, AlertTriangle } from 'lucide-react';
import type { Allocation, PeriodTiming } from '../../types';

const formatTime = (time24: string) => {
  if (!time24) return '';
  const [h, m] = time24.split(':');
  if (!m) return '';
  let hours = parseInt(h);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${m} ${ampm}`;
};

export default function AllocationCell({
  period,
  allocation,
  facultyName,
  onToggleFreeze,
}: {
  period: PeriodTiming | null;
  allocation: Allocation | undefined;
  facultyName: string;
  onToggleFreeze: () => void;
}) {
  const hasNoTiming = !period || !period.startTime;
  if (hasNoTiming) {
    return <div className="h-20 flex items-center justify-center text-[11px] text-slate-300 italic">No period slot</div>;
  }

  const isGap = !!(allocation && allocation.vacatedFacultyId && !allocation.facultyId);

  const toneClass = isGap
    ? 'bg-red-50 border-2 border-dashed border-red-300 text-red-600'
    : !allocation
      ? 'bg-slate-50 border-2 border-dashed border-slate-200 text-slate-400 hover:border-slate-300'
      : allocation.frozen
        ? 'bg-amber-50 border border-amber-200 text-amber-900'
        : 'bg-indigo-50 border border-indigo-100 text-indigo-900 hover:border-indigo-200';

  return (
    <div>
      <div className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-400 mb-2">
        <Clock className="w-3 h-3" />
        {formatTime(period!.startTime)} - {formatTime(period!.endTime)}
      </div>

      <div
        className={`relative group/card flex flex-col justify-center h-20 px-3 py-2 rounded-xl transition-colors duration-150 ${toneClass}`}
        title={allocation?.explanation ? allocation.explanation.join('\n') : 'Unassigned — free period'}
      >
        {isGap ? (
          <>
            <div className="font-bold text-xs leading-tight text-center flex items-center justify-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Gap
            </div>
            <div className="text-[11px] text-center mt-1 font-medium">was {allocation!.vacatedFacultyName} (absent)</div>
          </>
        ) : (
          <>
            <div className={`font-bold text-sm leading-tight text-center ${!allocation ? 'text-slate-400' : ''}`}>
              {allocation?.subject || 'Free Period'}
            </div>
            {allocation && (
              <div className={`text-xs text-center mt-1 font-medium ${allocation.frozen ? 'text-amber-700' : 'text-indigo-600'}`}>
                {facultyName}
              </div>
            )}
          </>
        )}

        {allocation && !isGap && (
          <button
            onClick={onToggleFreeze}
            className={`absolute -top-2 -right-2 p-1.5 rounded-full shadow-sm transition-all duration-150 ${
              allocation.frozen
                ? 'bg-amber-400 text-white hover:bg-amber-500 z-10'
                : 'bg-white text-slate-400 border border-slate-200 opacity-0 group-hover/card:opacity-100 hover:text-indigo-600 hover:border-indigo-200 z-10'
            }`}
            title={allocation.frozen ? 'Unfreeze Slot' : 'Freeze Slot'}
          >
            {allocation.frozen ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
}