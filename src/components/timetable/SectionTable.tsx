import { Building2, Users } from 'lucide-react';
import type { Batch, Allocation } from '../../types';
import type { SectionId } from '../../utils/sections';
import Badge from '../ui/Badge';
import AllocationCell from './AllocationCell';

export default function SectionTable({
  label,
  batches,
  allocations,
  getFacultyName,
  onToggleFreeze,
}: {
  label: string;
  batches: Batch[];
  allocations: Allocation[];
  getFacultyName: (id: string) => string;
  onToggleFreeze: (batchId: string, periodIndex: number) => void;
}) {
  const batchIds = new Set(batches.map(b => b.id));
  const sectionAllocations = allocations.filter(a => batchIds.has(a.batchId));
  const totalSlots = batches.reduce((sum, b) => sum + b.periods.filter(p => p.startTime).length, 0);
  const filled = sectionAllocations.filter(a => a.facultyId).length;
  const gaps = sectionAllocations.filter(a => a.vacatedFacultyId && !a.facultyId).length;
  const uniqueFaculty = new Set(sectionAllocations.filter(a => a.facultyId).map(a => a.facultyId)).size;
  const fillPct = totalSlots === 0 ? 0 : Math.round((filled / totalSlots) * 100);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-5 bg-slate-50/60 border-b border-slate-200 flex flex-col md:flex-row justify-between md:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-base">{label}</h3>
            <p className="text-xs text-slate-500">{batches.length} batch{batches.length !== 1 ? 'es' : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <Users className="w-3.5 h-3.5" /> {uniqueFaculty} faculty involved
          </span>
          <Badge tone="success">{filled}/{totalSlots} filled ({fillPct}%)</Badge>
          {gaps > 0 && <Badge tone="danger">{gaps} gap{gaps > 1 ? 's' : ''}</Badge>}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1100px]">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200">
              <th className="p-4 font-bold text-slate-600 uppercase tracking-wider text-xs w-60">Batch Information</th>
              {Array.from({ length: 6 }).map((_, i) => (
                <th key={i} className="p-4 font-bold text-slate-600 uppercase tracking-wider text-xs text-center border-l border-slate-200 w-44">
                  Period {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {batches.map(batch => (
              <tr key={batch.id} className="hover:bg-slate-50/60 transition-colors">
                <td className="p-4 align-top">
                  <div className="font-bold text-slate-800 text-sm mb-2">{batch.name || 'Unnamed Batch'}</div>
                  <div className="flex flex-col gap-1.5">
                    <Badge tone="neutral">{batch.yearCategory}</Badge>
                    <Badge tone="info">Room {batch.roomNumber || '-'}</Badge>
                  </div>
                </td>
                {Array.from({ length: 6 }).map((_, i) => {
                  const period = batch.periods?.[i] ?? null;
                  const allocation = allocations.find(a => a.batchId === batch.id && a.periodIndex === i);
                  return (
                    <td key={i} className="p-3 border-l border-slate-100 align-top">
                      <AllocationCell
                        period={period}
                        allocation={allocation}
                        facultyName={getFacultyName(allocation?.facultyId || '')}
                        onToggleFreeze={() => onToggleFreeze(batch.id, i)}
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