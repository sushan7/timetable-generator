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

  // Derive common period timing label across batches for header display if available
  const getPeriodHeaderLabel = (index: number) => {
    // Find the first batch that has timing for this period
    const sampleTiming = batches.find(b => b.periods[index]?.startTime)?.periods[index];
    return sampleTiming?.startTime ? `${sampleTiming.startTime} – ${sampleTiming.endTime}` : null;
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
      {/* Section Header */}
      <div className="p-4 sm:p-5 bg-slate-50/80 border-b border-slate-200 flex flex-col md:flex-row justify-between md:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white text-slate-700 rounded-lg shrink-0 border border-slate-200/80 shadow-2xs">
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm sm:text-base leading-tight">
              {label}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {batches.length} batch{batches.length !== 1 ? 'es' : ''} assigned to this section
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-white px-2.5 py-1 rounded-md border border-slate-200">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <span>{uniqueFaculty} faculty active</span>
          </span>
          <Badge tone={fillPct >= 90 ? 'success' : fillPct > 50 ? 'info' : 'warning'}>
            {filled}/{totalSlots} slots ({fillPct}%)
          </Badge>
          {gaps > 0 && <Badge tone="danger">{gaps} gap{gaps > 1 ? 's' : ''}</Badge>}
        </div>
      </div>

      {/* Responsive Matrix Grid with Sticky Left Column */}
      <div className="overflow-x-auto relative">
        <table className="w-full text-left border-collapse min-w-[1000px]">
          <thead>
            <tr className="bg-slate-50/90 border-b border-slate-200 text-xs font-semibold text-slate-600">
              <th className="p-3.5 w-56 sticky left-0 z-20 bg-slate-50/95 backdrop-blur-xs border-r border-slate-200 shadow-[1px_0_0_0_#e2e8f0]">
                Batch &amp; Classroom
              </th>
              {Array.from({ length: 6 }).map((_, i) => {
                const timing = getPeriodHeaderLabel(i);
                return (
                  <th
                    key={i}
                    className="p-3.5 text-center border-l border-slate-200 w-44 font-semibold text-slate-700"
                  >
                    <div>Period {i + 1}</div>
                    {timing && (
                      <div className="text-[11px] font-normal text-slate-400 mt-0.5">
                        {timing}
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {batches.map(batch => (
              <tr key={batch.id} className="group hover:bg-slate-50/70 transition-colors">
                {/* Sticky Batch Details Column */}
                <td className="p-3.5 align-middle sticky left-0 z-10 bg-white group-hover:bg-slate-50 transition-colors border-r border-slate-200 shadow-[1px_0_0_0_#e2e8f0]">
                  <div className="font-bold text-slate-900 text-sm leading-snug">
                    {batch.name || 'Unnamed Batch'}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <Badge tone="neutral" className="text-[11px] py-0 px-1.5 font-medium">
                      {batch.yearCategory}
                    </Badge>
                    <span className="text-xs text-slate-500 font-medium">
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
                    <td key={i} className="p-2 border-l border-slate-100 align-top">
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
