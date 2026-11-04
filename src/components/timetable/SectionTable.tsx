import { Building2, Users } from 'lucide-react';
import type { Batch, Allocation, UnfilledSlot, FrozenViolation } from '../../types';
import Badge from '../ui/Badge';
import AllocationCell from './AllocationCell';

export default function SectionTable({
  label,
  batches,
  allocations,
  unfilledSlots = [],
  frozenViolations = [],
  getFacultyName,
  isFacultyAbsent,
  onToggleFreeze,
  onCellClick,
}: {
  label: string;
  batches: Batch[];
  allocations: Allocation[];
  unfilledSlots?: UnfilledSlot[];
  frozenViolations?: FrozenViolation[];
  getFacultyName: (id: string) => string;
  isFacultyAbsent?: (id: string) => boolean;
  onToggleFreeze: (batchId: string, periodIndex: number) => void;
  onCellClick?: (batch: Batch, periodIndex: number) => void;
}) {
  const batchIds = new Set(batches.map(b => b.id));
  const sectionAllocations = allocations.filter(a => batchIds.has(a.batchId));
  const totalSlots = batches.reduce(
    (sum, b) => sum + b.periods.filter(p => p && p.startTime).length,
    0
  );
  const filled = sectionAllocations.filter(a => a.facultyId).length;
  const gaps = sectionAllocations.filter(a => a.vacatedFacultyId && !a.facultyId).length;
  const uniqueFaculty = new Set(
    sectionAllocations.filter(a => a.facultyId).map(a => a.facultyId)
  ).size;
  const fillPct = totalSlots === 0 ? 0 : Math.round((filled / totalSlots) * 100);

  // Dynamic maximum periods across batches
  const maxPeriods = Math.max(...batches.map(b => b.periods.length), 6);

  const getPeriodHeaderLabel = (index: number) => {
    const sampleTiming = batches.find(b => b.periods[index]?.startTime)?.periods[index];
    return sampleTiming?.startTime ? `${sampleTiming.startTime} - ${sampleTiming.endTime}` : null;
  };

  const isSlotUnfilled = (batchId: string, pIndex: number) => {
    const found = unfilledSlots.find(u => u.batchId === batchId && u.periodIndex === pIndex);
    return found
      ? { isUnfilled: true, reason: found.reason, requiredSubject: found.requiredSubject }
      : { isUnfilled: false };
  };

  const isSlotViolated = (batchId: string, pIndex: number) => {
    const found = frozenViolations.find(v => v.batchId === batchId && v.periodIndex === pIndex);
    return found ? { isViolated: true, reason: found.reason } : { isViolated: false };
  };

  return (
    <div className="bg-white rounded-lg border border-[#E5E0D8] shadow-2xs overflow-hidden">
      {/* Section Header */}
      <div className="p-4 sm:p-5 bg-[#FAF7F2] border-b border-[#E5E0D8] flex flex-col md:flex-row justify-between md:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white text-[#6B2638] rounded-md shrink-0 border border-[#E5E0D8] shadow-2xs">
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-[#252326] text-sm sm:text-base leading-tight">
              {label}
            </h3>
            <p className="text-xs text-[#5E5B61] mt-0.5">
              {batches.length} batch{batches.length !== 1 ? 'es' : ''} assigned to this section
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1.5 text-xs font-medium text-[#5E5B61] bg-white px-2.5 py-1 rounded-md border border-[#E5E0D8]">
            <Users className="w-3.5 h-3.5 text-[#5E5B61]" />
            <span>{uniqueFaculty} faculty active</span>
          </span>
          <Badge tone={fillPct >= 90 ? 'burgundy' : fillPct > 50 ? 'neutral' : 'warning'}>
            {filled}/{totalSlots} slots ({fillPct}%)
          </Badge>
          {gaps > 0 && <Badge tone="danger">{gaps} gap{gaps > 1 ? 's' : ''}</Badge>}
        </div>
      </div>

      {/* Mobile Card / List View (Below md breakpoint - Requirement U2) */}
      <div className="block md:hidden divide-y divide-[#E5E0D8]">
        {batches.map(batch => (
          <div key={batch.id} className="p-3.5 bg-white space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#E5E0D8]/60">
              <div>
                <h4 className="font-bold text-sm text-[#252326]">{batch.name}</h4>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[11px] text-[#5E5B61] font-medium">
                    Room {batch.roomNumber || '-'}
                  </span>
                  <span className="text-[#5E5B61]/40">·</span>
                  <Badge tone="neutral" className="text-[10px] py-0 px-1 font-normal">
                    {batch.yearCategory}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Period rows for this batch */}
            <div className="space-y-2">
              {Array.from({ length: batch.periods.length }).map((_, i) => {
                const period = batch.periods?.[i] ?? null;
                const allocation = allocations.find(
                  a => a.batchId === batch.id && a.periodIndex === i
                );
                const { isUnfilled, reason, requiredSubject } = isSlotUnfilled(batch.id, i);
                const { isViolated, reason: violationReason } = isSlotViolated(batch.id, i);
                const teacherAbsent = Boolean(
                  isFacultyAbsent && allocation?.facultyId && isFacultyAbsent(allocation.facultyId)
                );

                if (!period || !period.startTime) return null;

                return (
                  <div
                    key={i}
                    id={`cell-mobile-${batch.id}-${i}`}
                    className="flex flex-col sm:flex-row sm:items-center gap-1.5 p-1 rounded bg-[#FAF7F2]/40 border border-[#E5E0D8]/60 transition-all"
                  >
                    <div className="sm:w-28 shrink-0 flex items-center justify-between sm:flex-col sm:items-start px-1.5 py-0.5">
                      <span className="text-[11px] font-bold text-[#6B2638]">Period {i + 1}</span>
                      <span className="text-[10px] font-medium text-[#5E5B61]">
                        {period.startTime} - {period.endTime}
                      </span>
                    </div>
                    <div className="flex-1">
                      <AllocationCell
                        period={period}
                        allocation={allocation}
                        isUnfilled={isUnfilled}
                        unfilledReason={reason}
                        requiredSubject={requiredSubject}
                        isViolated={isViolated}
                        violationReason={violationReason}
                        isTeacherAbsent={teacherAbsent}
                        facultyName={getFacultyName(allocation?.facultyId || '')}
                        onToggleFreeze={() => onToggleFreeze(batch.id, i)}
                        onClickSlot={() => onCellClick?.(batch, i)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table Matrix (md and above - Reduced sticky column on small tablets) */}
      <div className="hidden md:block overflow-x-auto relative">
        <table className="w-full text-left border-collapse min-w-[900px]">
          <thead>
            <tr className="bg-[#FAF7F2] border-b border-[#E5E0D8] text-xs font-semibold text-[#5E5B61]">
              <th
                scope="col"
                className="p-3 w-44 md:w-48 lg:w-56 sticky left-0 z-20 bg-[#FAF7F2] border-r border-[#E5E0D8] shadow-[1px_0_0_0_#E5E0D8]"
              >
                Batch & Classroom
              </th>
              {Array.from({ length: maxPeriods }).map((_, i) => {
                const timing = getPeriodHeaderLabel(i);
                return (
                  <th
                    scope="col"
                    key={i}
                    className="p-3 text-center border-l border-[#E5E0D8] w-36 lg:w-44 font-semibold text-[#252326]"
                  >
                    <div>Period {i + 1}</div>
                    {timing && (
                      <div className="text-[11px] font-normal text-[#5E5B61] mt-0.5">
                        {timing}
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E0D8] text-sm">
            {batches.map(batch => (
              <tr key={batch.id} className="group hover:bg-[#FAF7F2]/40 transition-colors">
                {/* Sticky Batch Column with Reduced Width on Small Tablets */}
                <th
                  scope="row"
                  className="p-3 align-middle sticky left-0 z-10 bg-white group-hover:bg-[#FAF7F2] transition-colors border-r border-[#E5E0D8] shadow-[1px_0_0_0_#E5E0D8] font-normal text-left"
                >
                  <div className="font-bold text-[#252326] text-sm leading-snug">
                    {batch.name || 'Unnamed Batch'}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <Badge tone="neutral" className="text-[11px] py-0 px-1.5 font-normal">
                      {batch.yearCategory}
                    </Badge>
                    <span className="text-xs text-[#5E5B61] font-medium">
                      Room {batch.roomNumber || '-'}
                    </span>
                  </div>
                </th>

                {/* Allocation Slots for all periods */}
                {Array.from({ length: maxPeriods }).map((_, i) => {
                  const period = batch.periods?.[i] ?? null;
                  const allocation = allocations.find(
                    a => a.batchId === batch.id && a.periodIndex === i
                  );
                  const { isUnfilled, reason, requiredSubject } = isSlotUnfilled(batch.id, i);
                  const { isViolated, reason: violationReason } = isSlotViolated(batch.id, i);
                  const teacherAbsent = Boolean(
                    isFacultyAbsent && allocation?.facultyId && isFacultyAbsent(allocation.facultyId)
                  );

                  return (
                    <td
                      key={i}
                      id={`cell-${batch.id}-${i}`}
                      className="p-2 border-l border-[#E5E0D8] align-top bg-white group-hover:bg-[#FAF7F2]/60 transition-colors"
                    >
                      <AllocationCell
                        period={period}
                        allocation={allocation}
                        isUnfilled={isUnfilled}
                        unfilledReason={reason}
                        requiredSubject={requiredSubject}
                        isViolated={isViolated}
                        violationReason={violationReason}
                        isTeacherAbsent={teacherAbsent}
                        facultyName={getFacultyName(allocation?.facultyId || '')}
                        onToggleFreeze={() => onToggleFreeze(batch.id, i)}
                        onClickSlot={() => onCellClick?.(batch, i)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
