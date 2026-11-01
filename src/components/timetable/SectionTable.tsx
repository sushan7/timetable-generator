import { Building2, Users } from 'lucide-react';
import type { Batch, Allocation } from '../../types';
import Badge from '../ui/Badge';
import AllocationCell from './AllocationCell';

export default function SectionTable({
  label,
  batches,
  allocations,
  getFacultyName,
  onToggleFreeze,
  onCellClick,
}: {
  label: string;
  batches: Batch[];
  allocations: Allocation[];
  getFacultyName: (id: string) => string;
  onToggleFreeze: (batchId: string, periodIndex: number) => void;
  onCellClick?: (batch: Batch, periodIndex: number) => void;
}) {
  const batchIds = new Set(batches.map(b => b.id));
  const sectionAllocations = allocations.filter(a => batchIds.has(a.batchId));
  const totalSlots = batches.reduce(
    (sum, b) => sum + b.periods.filter(p => p.startTime).length,
    0
  );
  const filled = sectionAllocations.filter(a => a.facultyId).length;
  const gaps = sectionAllocations.filter(a => a.vacatedFacultyId && !a.facultyId).length;
  const uniqueFaculty = new Set(
    sectionAllocations.filter(a => a.facultyId).map(a => a.facultyId)
  ).size;
  const fillPct = totalSlots === 0 ? 0 : Math.round((filled / totalSlots) * 100);

  const getPeriodHeaderLabel = (index: number) => {
    const sampleTiming = batches.find(b => b.periods[index]?.startTime)?.periods[index];
    return sampleTiming?.startTime ? `${sampleTiming.startTime} - ${sampleTiming.endTime}` : null;
  };

  return (
    <div className="bg-white rounded-lg border border-[#E5E2DA] shadow-2xs overflow-hidden">
      {/* Section Header */}
      <div className="p-4 sm:p-5 bg-[#F8F7F3] border-b border-[#E5E2DA] flex flex-col md:flex-row justify-between md:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white text-[#252522] rounded-md shrink-0 border border-[#E5E2DA] shadow-2xs">
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-[#252522] text-sm sm:text-base leading-tight">
              {label}
            </h3>
            <p className="text-xs text-[#77766F] mt-0.5">
              {batches.length} batch{batches.length !== 1 ? 'es' : ''} assigned to this section
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1.5 text-xs font-medium text-[#77766F] bg-white px-2.5 py-1 rounded-md border border-[#E5E2DA]">
            <Users className="w-3.5 h-3.5 text-[#77766F]" />
            <span>{uniqueFaculty} faculty active</span>
          </span>
          <Badge tone={fillPct >= 90 ? 'terracotta' : fillPct > 50 ? 'neutral' : 'warning'}>
            {filled}/{totalSlots} slots ({fillPct}%)
          </Badge>
          {gaps > 0 && <Badge tone="danger">{gaps} gap{gaps > 1 ? 's' : ''}</Badge>}
        </div>
      </div>

      {/* Responsive Swiss Matrix with Sticky Left Column */}
      <div className="overflow-x-auto relative">
        <table className="w-full text-left border-collapse min-w-[1000px]">
          <thead>
            <tr className="bg-[#F0EFE9] border-b border-[#E5E2DA] text-xs font-semibold text-[#77766F]">
              <th className="p-3 w-56 sticky left-0 z-20 bg-[#F0EFE9] border-r border-[#E5E2DA] shadow-[1px_0_0_0_#E5E2DA]">
                Batch &amp; Classroom
              </th>
              {Array.from({ length: 6 }).map((_, i) => {
                const timing = getPeriodHeaderLabel(i);
                return (
                  <th
                    key={i}
                    className="p-3 text-center border-l border-[#E5E2DA] w-44 font-semibold text-[#252522]"
                  >
                    <div>Period {i + 1}</div>
                    {timing && (
                      <div className="text-[11px] font-normal text-[#77766F] mt-0.5">
                        {timing}
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E2DA] text-sm">
            {batches.map(batch => (
              <tr key={batch.id} className="group hover:bg-[#F0EFE9]/40 transition-colors">
                {/* Sticky Batch Details Column */}
                <td className="p-3 align-middle sticky left-0 z-10 bg-white group-hover:bg-[#FBFBFA] transition-colors border-r border-[#E5E2DA] shadow-[1px_0_0_0_#E5E2DA]">
                  <div className="font-bold text-[#252522] text-sm leading-snug">
                    {batch.name || 'Unnamed Batch'}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <Badge tone="neutral" className="text-[11px] py-0 px-1.5 font-normal">
                      {batch.yearCategory}
                    </Badge>
                    <span className="text-xs text-[#77766F] font-medium">
                      Room {batch.roomNumber || '-'}
                    </span>
                  </div>
                </td>

                {/* 6 Period Allocation Slots */}
                {Array.from({ length: 6 }).map((_, i) => {
                  const period = batch.periods?.[i] ?? null;
                  const allocation = allocations.find(
                    a => a.batchId === batch.id && a.periodIndex === i
                  );
                  return (
                    <td key={i} className="p-2 border-l border-[#E5E2DA] align-top bg-white group-hover:bg-[#FBFBFA]/70 transition-colors">
                      <AllocationCell
                        period={period}
                        allocation={allocation}
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
