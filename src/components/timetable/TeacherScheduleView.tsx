import React, { useState, useMemo } from 'react';
import {
  Printer,
  Search,
} from 'lucide-react';
import type { Faculty, Batch, DayOfWeek, WeekTimetables, SchedulerSettings, Allocation } from '../../types';
import { WEEKDAYS } from '../../types';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Card from '../ui/Card';
import { getDailyLimit, isFacultyAbsent } from '../../utils/constraints';

interface TeacherScheduleViewProps {
  faculties: Faculty[];
  batches: Batch[];
  weekTimetables: WeekTimetables;
  settings: SchedulerSettings;
}

export const TeacherScheduleView: React.FC<TeacherScheduleViewProps> = ({
  faculties,
  batches,
  weekTimetables,
  settings,
}) => {
  const [selectedFacultyId, setSelectedFacultyId] = useState<string>(() => faculties[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');

  // Reorder weekdays according to settings.weekStartDay
  const orderedWeekdays = useMemo((): DayOfWeek[] => {
    const startDay = settings.weekStartDay || 'Monday';
    const startIndex = (WEEKDAYS as readonly DayOfWeek[]).indexOf(startDay);
    if (startIndex <= 0) return [...WEEKDAYS];
    return [...WEEKDAYS.slice(startIndex), ...WEEKDAYS.slice(0, startIndex)];
  }, [settings.weekStartDay]);

  const filteredFaculties = useMemo(() => {
    if (!searchQuery.trim()) return faculties;
    const q = searchQuery.toLowerCase();
    return faculties.filter(
      f => f.name.toLowerCase().includes(q) || f.subjects.some(s => s.toLowerCase().includes(q))
    );
  }, [faculties, searchQuery]);

  const selectedFaculty = useMemo(() => {
    return faculties.find(f => f.id === selectedFacultyId) || faculties[0];
  }, [faculties, selectedFacultyId]);

  const batchMap = useMemo(() => new Map<string, Batch>(batches.map(b => [b.id, b])), [batches]);

  // Determine max periods across all batches
  const maxPeriods = useMemo(() => {
    return Math.max(...batches.map(b => b.periods.length), 6);
  }, [batches]);

  // Aggregate weekly assignments for the selected faculty
  // Map key: `${day}-${periodIndex}` -> { batch: Batch, subject: string, time: string }[]
  const scheduleMatrix = useMemo(() => {
    const matrix: Record<string, { batchName: string; roomNumber?: string; subject: string; time: string }[]> = {};
    if (!selectedFaculty) return matrix;

    orderedWeekdays.forEach(day => {
      const dayData = weekTimetables[day];
      if (!dayData || !dayData.allocations) return;

      dayData.allocations.forEach((alloc: Allocation) => {
        if (alloc.facultyId === selectedFaculty.id) {
          const key = `${day}-${alloc.periodIndex}`;
          const batch = batchMap.get(alloc.batchId);
          const timing = batch?.periods[alloc.periodIndex];
          const timeStr = timing && timing.startTime ? `${timing.startTime} - ${timing.endTime}` : '';

          if (!matrix[key]) matrix[key] = [];
          matrix[key].push({
            batchName: batch?.name || alloc.batchId,
            roomNumber: batch?.roomNumber,
            subject: alloc.subject,
            time: timeStr,
          });
        }
      });
    });

    return matrix;
  }, [selectedFaculty, orderedWeekdays, weekTimetables, batchMap]);

  // Daily period counts
  const dailyCounts = useMemo(() => {
    const counts: Partial<Record<DayOfWeek, number>> = {};
    WEEKDAYS.forEach(d => { counts[d] = 0; });
    if (!selectedFaculty) return counts;

    orderedWeekdays.forEach(day => {
      const dayData = weekTimetables[day];
      if (!dayData || !dayData.allocations) return;
      counts[day] = dayData.allocations.filter((a: Allocation) => a.facultyId === selectedFaculty.id).length;
    });

    return counts;
  }, [selectedFaculty, orderedWeekdays, weekTimetables]);

  const totalWeeklyPeriods = useMemo(() => {
    return Object.values(dailyCounts).reduce((sum, n) => sum + n, 0);
  }, [dailyCounts]);

  const handlePrint = () => {
    window.print();
  };

  if (!selectedFaculty) {
    return (
      <div className="p-8 text-center text-xs text-[#252326]/60 bg-white rounded border border-[#A89B8A]/30">
        No instructors registered.
      </div>
    );
  }

  const dailyLimit = getDailyLimit(selectedFaculty, settings);

  return (
    <div className="space-y-4">
      {/* Controls Bar (hidden during print) */}
      <div className="no-print p-4 bg-white rounded-lg border border-[#A89B8A]/30 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
          <div className="relative min-w-[220px]">
            <Search className="w-4 h-4 text-[#252326]/40 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search instructors..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F3EEE6]/50 border border-[#A89B8A]/40 rounded-md focus:border-[#6B2638] focus:ring-1 focus:ring-[#6B2638] text-[#252326]"
            />
          </div>

          <select
            value={selectedFacultyId}
            onChange={e => setSelectedFacultyId(e.target.value)}
            className="text-xs bg-[#F3EEE6]/70 border border-[#A89B8A]/40 rounded-md px-3 py-2 text-[#252326] font-semibold focus:border-[#6B2638] focus:ring-1 focus:ring-[#6B2638] max-w-xs"
          >
            {filteredFaculties.map(f => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.subjects.join(', ')})
              </option>
            ))}
          </select>
        </div>

        <Button
          variant="secondary"
          size="sm"
          icon={<Printer className="w-4 h-4" />}
          onClick={handlePrint}
        >
          Print Teacher Schedule
        </Button>
      </div>

      {/* Printable Schedule Container */}
      <Card className="print-section-page border border-[#A89B8A]/30 space-y-4 p-4 sm:p-6 bg-white">
        {/* Schedule Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-[#A89B8A]/20">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold text-[#6B2638]">{selectedFaculty.name}</h3>
              <Badge tone="burgundy">Faculty Schedule</Badge>
              {selectedFaculty.isAbsent && <Badge tone="danger">Global Absent</Badge>}
            </div>
            <p className="text-xs text-[#252326]/70 mt-0.5">
              Qualified in: <strong>{selectedFaculty.subjects.join(', ')}</strong> · Daily Limit: <strong>{dailyLimit} periods</strong>
            </p>
          </div>

          <div className="flex items-center gap-3 text-right">
            <div className="p-2 bg-[#F3EEE6] rounded border border-[#A89B8A]/30 text-center min-w-[100px]">
              <span className="text-[10px] uppercase font-bold text-[#252326]/60 block">Weekly Total</span>
              <span className="text-base font-bold text-[#6B2638]">{totalWeeklyPeriods} periods</span>
            </div>
            <div className="p-2 bg-[#F3EEE6] rounded border border-[#A89B8A]/30 text-center min-w-[100px]">
              <span className="text-[10px] uppercase font-bold text-[#252326]/60 block">Max Weekly</span>
              <span className="text-base font-bold text-[#252326]">{dailyLimit * 6} periods</span>
            </div>
          </div>
        </div>

        {/* 6-Day Full Week Table */}
        <div className="overflow-x-auto border border-[#A89B8A]/30 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#6B2638] text-white">
                <th className="p-2.5 font-bold uppercase tracking-wider text-[11px] w-24 text-center border-r border-[#6B2638]/40">
                  Period
                </th>
                {orderedWeekdays.map(day => {
                  const isAbsent = isFacultyAbsent(selectedFaculty, day);
                  return (
                    <th key={day} className="p-2.5 font-bold uppercase tracking-wider text-[11px] border-r border-[#6B2638]/40 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <span>{day}</span>
                        {isAbsent && (
                          <span className="text-[9px] bg-white text-[#6B2638] px-1 rounded font-bold">
                            ABSENT
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#A89B8A]/20">
              {Array.from({ length: maxPeriods }).map((_, pIdx) => (
                <tr key={pIdx} className="hover:bg-[#F3EEE6]/30 transition-colors">
                  <td className="p-2.5 font-bold text-[#252326] bg-[#F3EEE6]/60 border-r border-[#A89B8A]/20 text-center">
                    Period {pIdx + 1}
                  </td>
                  {orderedWeekdays.map(day => {
                    const key = `${day}-${pIdx}`;
                    const slots = scheduleMatrix[key] || [];
                    const isAbsent = isFacultyAbsent(selectedFaculty, day);

                    if (isAbsent && slots.length === 0) {
                      return (
                        <td key={day} className="p-2.5 bg-[#FAF0F2]/40 border-r border-[#A89B8A]/20 text-center text-[11px] text-[#6B2638]/60 italic">
                          On Leave
                        </td>
                      );
                    }

                    if (slots.length === 0) {
                      return (
                        <td key={day} className="p-2.5 border-r border-[#A89B8A]/20 text-center text-[#252326]/30 font-mono">
                          —
                        </td>
                      );
                    }

                    return (
                      <td key={day} className="p-2 border-r border-[#A89B8A]/20 bg-[#FDFBF7]">
                        {slots.map((slot, sIdx) => (
                          <div
                            key={sIdx}
                            className={`p-2 rounded border space-y-1 ${
                              slots.length > 1
                                ? 'bg-[#FAF0F2] border-[#ECD9DE] text-[#6B2638]'
                                : 'bg-white border-[#B08D57]/30 text-[#252326]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-bold text-xs truncate">{slot.batchName}</span>
                              {slot.roomNumber && (
                                <span className="text-[10px] text-[#252326]/60 bg-[#F3EEE6] px-1 rounded font-mono">
                                  R.{slot.roomNumber}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-[#6B2638] font-semibold">
                              <span>{slot.subject}</span>
                              {slot.time && <span className="text-[10px] text-[#252326]/50">{slot.time}</span>}
                            </div>
                            {slots.length > 1 && (
                              <div className="text-[10px] font-bold text-[#6B2638]">
                                Overlap conflict!
                              </div>
                            )}
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[#F3EEE6] font-bold text-xs border-t-2 border-[#A89B8A]/40 text-[#252326]">
                <td className="p-2.5 text-center uppercase tracking-wider text-[10px] border-r border-[#A89B8A]/30">
                  Daily Load
                </td>
                {orderedWeekdays.map(day => {
                  const count = dailyCounts[day] || 0;
                  const isOver = count > dailyLimit;
                  return (
                    <td
                      key={day}
                      className={`p-2.5 text-center border-r border-[#A89B8A]/30 ${
                        isOver ? 'bg-[#FAF0F2] text-[#6B2638]' : ''
                      }`}
                    >
                      {count} / {dailyLimit}
                      {isOver && <span className="block text-[10px] font-bold text-[#6B2638]">Exceeded</span>}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
};
