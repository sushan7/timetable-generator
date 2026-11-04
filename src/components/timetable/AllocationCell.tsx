import { Lock, Unlock, AlertTriangle, Edit2, ShieldAlert, UserX } from 'lucide-react';
import type { Allocation, PeriodTiming } from '../../types';

export default function AllocationCell({
  period,
  allocation,
  facultyName,
  isUnfilled,
  unfilledReason,
  requiredSubject,
  isViolated,
  violationReason,
  isTeacherAbsent,
  onToggleFreeze,
  onClickSlot,
}: {
  period: PeriodTiming | null;
  allocation: Allocation | undefined;
  facultyName: string;
  isUnfilled?: boolean;
  unfilledReason?: string;
  requiredSubject?: string;
  isViolated?: boolean;
  violationReason?: string;
  isTeacherAbsent?: boolean;
  onToggleFreeze: () => void;
  onClickSlot?: () => void;
}) {
  const hasNoTiming = !period || !period.startTime;
  if (hasNoTiming) {
    return (
      <div className="h-18 flex items-center justify-center text-[11px] text-ink-muted/50 italic select-none border border-dashed border-border rounded bg-surface-muted/40">
        Not in session
      </div>
    );
  }

  const isGap = !!(allocation && allocation.vacatedFacultyId && !allocation.facultyId);
  const isFree = !allocation || (!allocation.facultyId && !isUnfilled && !isGap);

  // Surface tone classes based on allocation state
  const getCellTone = () => {
    if (isViolated) {
      return 'bg-burgundy-soft border-2 border-burgundy text-burgundy shadow-xs ring-1 ring-burgundy';
    }
    if (allocation?.overridden) {
      return 'bg-cognac-soft border-l-4 border-l-cognac border-t border-r border-b border-cognac/30 text-cognac shadow-xs';
    }
    if (allocation?.hasConflictOverride) {
      return 'bg-burgundy-soft border-2 border-burgundy text-burgundy shadow-xs';
    }
    if (isGap) {
      return 'bg-burgundy-soft border border-burgundy/30 hover:border-burgundy text-burgundy';
    }
    if (isTeacherAbsent && !isGap && allocation?.facultyId) {
      return 'bg-burgundy-soft border-2 border-dashed border-burgundy text-burgundy shadow-2xs';
    }
    if (isUnfilled) {
      return 'bg-surface border border-dashed border-taupe hover:border-cognac text-cognac shadow-2xs';
    }
    if (isFree) {
      return 'bg-surface-muted/40 border border-dashed border-border hover:border-accent hover:bg-surface-muted text-ink-muted';
    }
    if (allocation?.frozen) {
      return 'bg-accent-soft border border-accent/40 hover:border-accent text-ink shadow-2xs';
    }
    if (allocation?.subjectChanged) {
      return 'bg-accent-soft/30 border-l-4 border-l-accent border-t border-r border-b border-border hover:border-accent text-ink shadow-2xs';
    }
    if (allocation?.manualEdited) {
      return 'bg-surface border-l-4 border-l-cognac border-t border-r border-b border-border hover:border-accent text-ink shadow-2xs';
    }
    return 'bg-surface border border-border hover:border-accent text-ink shadow-2xs';
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
      className={`group/cell relative flex flex-col justify-between h-18 p-2.5 rounded cursor-pointer transition-colors duration-120 select-none outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 ${getCellTone()}`}
      title={
        isViolated
          ? `LOCKED SLOT CONSTRAINT VIOLATION:\n${violationReason || 'Slot violates constraints'}`
          : allocation?.overridden
            ? `OVERRIDDEN MANUAL ASSIGNMENT:\n${allocation.conflictNote || 'Forced assignment bypassing constraints'}`
            : allocation?.hasConflictOverride
              ? `WARNING: Schedule conflict override!\n${allocation.conflictNote || ''}`
              : isGap
                ? `GAP (TEACHER ABSENT): Click to assign a substitute teacher.`
                : isTeacherAbsent && allocation?.facultyId
                  ? `TEACHER ABSENT TODAY: ${facultyName} is marked absent for this day! Click to assign substitute.`
                  : isUnfilled
                    ? `UNFILLED SHORTAGE: ${unfilledReason || 'No teacher available'}`
                    : allocation?.subjectChanged
                      ? `SUBJECT CHANGED:\n${allocation.conflictNote || (Array.isArray(allocation.explanation) ? allocation.explanation.join('\n') : 'Subject changed')}`
                      : allocation?.explanation
                        ? allocation.explanation.join('\n')
                        : 'Click to assign or edit this slot'
      }
    >
      {/* Main slot content */}
      {isViolated ? (
        <div className="flex flex-col justify-between h-full">
          <div className="flex items-center justify-between gap-1">
            <span className="font-bold text-xs text-burgundy truncate">
              {allocation?.subject || 'Locked Slot'}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <span title="Locked constraint violation" className="inline-flex items-center">
                <Lock className="w-3 h-3 text-burgundy" />
              </span>
              <AlertTriangle className="w-3.5 h-3.5 text-burgundy shrink-0" />
            </div>
          </div>
          <div className="text-[10px] text-burgundy/90 font-medium truncate">
            {facultyName}
          </div>
          <div className="text-[9px] text-burgundy truncate font-semibold uppercase">
            Violation
          </div>
        </div>
      ) : allocation?.overridden ? (
        <div className="flex flex-col justify-between h-full">
          <div className="flex items-center justify-between gap-1">
            <span className="font-bold text-xs text-cognac truncate">
              {allocation.subject}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <ShieldAlert className="w-3.5 h-3.5 text-cognac" />
              <span className="text-[9px] font-bold px-1 py-0.5 bg-cognac-soft text-cognac rounded border border-cognac/30">
                OVERRIDDEN
              </span>
            </div>
          </div>
          <div className="text-[11px] text-cognac font-medium truncate">
            {facultyName}
          </div>
        </div>
      ) : allocation?.hasConflictOverride ? (
        <div className="flex flex-col justify-center h-full text-center">
          <div className="flex items-center justify-center gap-1 text-xs font-bold text-burgundy">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-burgundy" />
            <span className="truncate">{allocation.subject}</span>
          </div>
          <div className="text-[10px] text-burgundy/90 mt-0.5 truncate font-medium">
            Override: {facultyName}
          </div>
        </div>
      ) : isGap ? (
        <div className="flex flex-col justify-center h-full text-center">
          <div className="flex items-center justify-center gap-1 text-xs font-semibold text-burgundy">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-cognac" />
            <span>Gap (Absent)</span>
          </div>
          <div className="text-[11px] text-burgundy/80 line-through mt-0.5 truncate font-medium">
            {allocation?.vacatedFacultyName || 'Teacher absent'}
          </div>
        </div>
      ) : isUnfilled ? (
        <div className="flex flex-col justify-center h-full text-center p-1">
          <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-cognac">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-cognac" />
            <span className="truncate">Unfilled: {unfilledReason || 'Shortage'}</span>
          </div>
          {(allocation?.subject || requiredSubject) && (
            <div className="text-[10px] text-cognac truncate font-medium mt-0.5">
              {allocation?.subject || requiredSubject}
            </div>
          )}
        </div>
      ) : isFree ? (
        <div className="flex items-center justify-center h-full text-xs font-medium text-ink-muted">
          <span>Free Period</span>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-semibold text-xs sm:text-sm text-ink leading-snug truncate">
                {allocation?.subject}
              </span>
              {allocation?.subjectChanged && (
                <span
                  className="px-1 py-0.5 rounded text-[9px] font-bold bg-accent-soft text-ink border border-accent/40 shrink-0"
                  title={allocation.conflictNote || (Array.isArray(allocation.explanation) ? allocation.explanation.join('\n') : undefined)}
                >
                  Changed
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {allocation?.manualEdited && !allocation?.frozen && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-cognac shrink-0 mt-1"
                  title="Manually edited slot"
                />
              )}
              {/* Persistent Lock Icon & Text when frozen (U1 & Accessibility) */}
              {allocation?.frozen && (
                <span title="Locked slot (frozen)" className="shrink-0 inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-bold bg-accent-soft text-ink border border-accent/40">
                  <Lock className="w-2.5 h-2.5 text-accent" />
                  <span>Locked</span>
                </span>
              )}
              {/* Flag Absent Teacher on grid even before Sync (Accessibility) */}
              {isTeacherAbsent && !isGap && allocation?.facultyId && (
                <span title="Assigned teacher is absent today!" className="shrink-0 inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-bold bg-burgundy-soft text-burgundy border border-burgundy/20">
                  <UserX className="w-2.5 h-2.5" />
                  <span>Absent</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col text-xs text-ink-muted mt-0.5 min-w-0">
            <span className={`truncate font-medium ${isTeacherAbsent ? 'text-burgundy line-through' : ''}`}>
              {facultyName}
            </span>
            {allocation?.subjectChanged && (allocation?.conflictNote || allocation?.explanation?.[0]) && (
              <span
                className="text-[9px] text-cognac truncate italic mt-0.5 leading-tight"
                title={allocation.conflictNote || (Array.isArray(allocation.explanation) ? allocation.explanation.join(' ') : '')}
              >
                {allocation.conflictNote || (Array.isArray(allocation.explanation) ? allocation.explanation[0] : '')}
              </span>
            )}
          </div>
        </>
      )}

      {/* Quick Action Overlay (Freeze Lock & Edit) - persistent lock icon when frozen, always visible under hover:none touch devices (U1) */}
      <div className="absolute top-1.5 right-1.5 flex items-center gap-1 opacity-0 group-hover/cell:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 touch-show-actions transition-opacity z-10">
        {allocation && !isGap && (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onToggleFreeze();
            }}
            className={`p-1 rounded shadow-2xs transition-colors ${
              allocation.frozen
                ? 'bg-accent text-ink hover:bg-accent-hover'
                : 'bg-surface text-ink-muted border border-border hover:text-ink hover:border-accent'
            }`}
            title={allocation.frozen ? 'Unlock slot' : 'Lock slot against regeneration'}
            aria-label={allocation.frozen ? 'Unlock slot' : 'Lock slot'}
          >
            {allocation.frozen ? <Lock className="w-3 h-3 text-ink" /> : <Unlock className="w-3 h-3" />}
          </button>
        )}
        <span
          className="p-1 rounded bg-surface text-ink-muted border border-border shadow-2xs hover:text-ink hover:border-accent"
          title="Edit assignment"
        >
          <Edit2 className="w-3 h-3" />
        </span>
      </div>
    </div>
  );
}
