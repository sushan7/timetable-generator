import { useState } from 'react';
import { Building2, Users, LayoutGrid, List } from 'lucide-react';
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
  onToggleFreeze,
  onCellClick,
}: {
  label: string;
  batches: Batch[];
  allocations: Allocation[];
  unfilledSlots?: UnfilledSlot[];
  frozenViolations?: FrozenViolation[];
  getFacultyName: (id: string) => string;
  onToggleFreeze: (batchId: string, periodIndex: number) => void;
  onCellClick?: (batch: Batch, periodIndex: number) => void;
}) {
  const [mobileViewMode, setMobileViewMode] = useState<'grid' | 'cards'>('grid');

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

  // Dynamic maximum periods across batches (M9 & Requirement 12)
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
          {/* Mobile view switch pill */}
          <div className="sm:hidden flex items-center bg-[#EFEBE3] p-0.5 rounded text-xs border border-[#DFD8CD]">
            <button
              type="button"
              onClick={() => setMobileViewMode('grid')}
              className={`p-1 rounded flex items-center gap-1 ${
                mobileViewMode === 'grid' ? 'bg-white text-[#6B2638] font-bold shadow-2xs' : 'text-[#5E5B61]'
              }`}
              title="Table view"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setMobileViewMode('cards')}
              className={`p-1 rounded flex items-center gap-1 ${
                mobileViewMode === 'cards' ? 'bg-white text-[#6B2638] font-bold shadow-2xs' : 'text-[#5E5B61]'
              }`}
              title="Card view"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

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

      {/* Mobile Card View (Section 9: Responsive Design) */}
      {mobileViewMode === 'cards' ? (
        <div className="sm:hidden divide-y divide-[#E5E0D8]">
          {batches.map(batch => (
            <div key={batch.id} className="p-3.5 bg-white space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-[#252326]">{batch.name}</h4>
                  <span className="text-[11px] text-[#5E5B61]">Room {batch.roomNumber || '-'} · {batch.yearCategory}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: batch.periods.length }).map((_, i) => {
                  const period = batch.periods?.[i] ?? null;
                  const allocation = allocations.find(
                    a => a.batchId === batch.id && a.periodIndex === i
                  );
                  const { isUnfilled, reason, requiredSubject } = isSlotUnfilled(batch.id, i);
                  const { isViolated, reason: violationReason } = isSlotViolated(batch.id, i);
                  return (
                    <div key={i} className="flex flex-col">
                      <span className="text-[10px] font-semibold text-[#5E5B61] mb-0.5">
                        P{i + 1} {period?.startTime ? `(${period.startTime})` : ''}
                      </span>
                      <AllocationCell
                        period={period}
                        allocation={allocation}
                        isUnfilled={isUnfilled}
                        unfilledReason={reason}
                        requiredSubject={requiredSubject}
                        isViolated={isViolated}
                        violationReason={violationReason}
                        facultyName={getFacultyName(allocation?.facultyId || '')}
                        onToggleFreeze={() => onToggleFreeze(batch.id, i)}
                        onClickSlot={() => onCellClick?.(batch, i)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Responsive Desktop Table Matrix with Sticky Batch Column */
        <div className="overflow-x-auto relative">
          <table className="w-full text-left border-collapse min-w-[950px]">
            <thead>
              <tr className="bg-[#FAF7F2] border-b border-[#E5E0D8] text-xs font-semibold text-[#5E5B61]">
                <th className="p-3 w-56 sticky left-0 z-20 bg-[#FAF7F2] border-r border-[#E5E0D8] shadow-[1px_0_0_0_#E5E0D8]">
                  Batch &amp; Classroom
                </th>
                {Array.from({ length: maxPeriods }).map((_, i) => {
                  const timing = getPeriodHeaderLabel(i);
                  return (
                    <th
                      key={i}
                      className="p-3 text-center border-l border-[#E5E0D8] w-44 font-semibold text-[#252326]"
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
                  {/* Sticky Batch Column */}
                  <td className="p-3 align-middle sticky left-0 z-10 bg-white group-hover:bg-[#FAF7F2] transition-colors border-r border-[#E5E0D8] shadow-[1px_0_0_0_#E5E0D8]">
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
                  </td>

                  {/* Allocation Slots for all periods */}
                  {Array.from({ length: maxPeriods }).map((_, i) => {
                    const period = batch.periods?.[i] ?? null;
                    const allocation = allocations.find(
                      a => a.batchId === batch.id && a.periodIndex === i
                    );
                    const { isUnfilled, reason, requiredSubject } = isSlotUnfilled(batch.id, i);
                    const { isViolated, reason: violationReason } = isSlotViolated(batch.id, i);
                    return (
                      <td key={i} className="p-2 border-l border-[#E5E0D8] align-top bg-white group-hover:bg-[#FAF7F2]/60 transition-colors">
                        <AllocationCell
                          period={period}
                          allocation={allocation}
                          isUnfilled={isUnfilled}
                          unfilledReason={reason}
                          requiredSubject={requiredSubject}
                          isViolated={isViolated}
                          violationReason={violationReason}
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
      )}
    </div>
  );
}
