import React, { useState, useMemo } from 'react';
import {
  Printer,
  Search,
  AlertTriangle,
} from 'lucide-react';
import type { Batch, DayOfWeek, WeekTimetables, SchedulerSettings, Faculty, Allocation } from '../../types';
import { WEEKDAYS } from '../../types';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Card from '../ui/Card';

interface RoomScheduleViewProps {
  batches: Batch[];
  faculties: Faculty[];
  weekTimetables: WeekTimetables;
  settings: SchedulerSettings;
}

export const RoomScheduleView: React.FC<RoomScheduleViewProps> = ({
  batches,
  faculties,
  weekTimetables,
  settings,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Extract all unique rooms from batches
  const allRooms = useMemo(() => {
    const set = new Set<string>();
    batches.forEach(b => {
      if (b.roomNumber && b.roomNumber.trim()) {
        set.add(b.roomNumber.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [batches]);

  const [selectedRoom, setSelectedRoom] = useState<string>(() => allRooms[0] || '');

  // Ordered weekdays based on settings.weekStartDay
  const orderedWeekdays = useMemo((): DayOfWeek[] => {
    const startDay = settings.weekStartDay || 'Monday';
    const startIndex = (WEEKDAYS as readonly DayOfWeek[]).indexOf(startDay);
    if (startIndex <= 0) return [...WEEKDAYS];
    return [...WEEKDAYS.slice(startIndex), ...WEEKDAYS.slice(0, startIndex)];
  }, [settings.weekStartDay]);

  const filteredRooms = useMemo(() => {
    if (!searchQuery.trim()) return allRooms;
    const q = searchQuery.toLowerCase();
    return allRooms.filter(r => r.toLowerCase().includes(q));
  }, [allRooms, searchQuery]);

  const facultyMap = useMemo(() => new Map<string, Faculty>(faculties.map(f => [f.id, f])), [faculties]);
  const batchesInRoom = useMemo(
    () => batches.filter(b => b.roomNumber?.trim().toLowerCase() === selectedRoom.toLowerCase()),
    [batches, selectedRoom]
  );
  const buildingsInRoom = useMemo(() => {
    const set = new Set<string>();
    batchesInRoom.forEach(b => set.add(b.building));
    return Array.from(set);
  }, [batchesInRoom]);

  const maxPeriods = useMemo(() => {
    return Math.max(...batches.map(b => b.periods.length), 6);
  }, [batches]);

  // Aggregate weekly assignments for the selected room
  // Key: `${day}-${periodIndex}` -> list of allocations in this room
  const roomScheduleMatrix = useMemo(() => {
    const matrix: Record<
      string,
      { batchName: string; batchId: string; subject: string; facultyName: string; time: string }[]
    > = {};
    if (!selectedRoom) return matrix;

    const roomBatchIds = new Set(batchesInRoom.map(b => b.id));

    orderedWeekdays.forEach(day => {
      const dayData = weekTimetables[day];
      if (!dayData || !dayData.allocations) return;

      dayData.allocations.forEach((alloc: Allocation) => {
        if (roomBatchIds.has(alloc.batchId)) {
          const key = `${day}-${alloc.periodIndex}`;
          const batch = batches.find(b => b.id === alloc.batchId);
          const timing = batch?.periods[alloc.periodIndex];
          const fac = alloc.facultyId ? facultyMap.get(alloc.facultyId) : undefined;
          const timeStr = timing && timing.startTime ? `${timing.startTime} - ${timing.endTime}` : '';

          if (!matrix[key]) matrix[key] = [];
          matrix[key].push({
            batchName: batch?.name || alloc.batchId,
            batchId: alloc.batchId,
            subject: alloc.subject,
            facultyName: fac?.name || (alloc.facultyId ? 'Unknown' : 'Unassigned'),
            time: timeStr,
          });
        }
      });
    });

    return matrix;
  }, [selectedRoom, batchesInRoom, orderedWeekdays, weekTimetables, batches, facultyMap]);

  // Daily occupancy count
  const dailyOccupancy = useMemo(() => {
    const counts: Partial<Record<DayOfWeek, number>> = {};
    WEEKDAYS.forEach(d => { counts[d] = 0; });
    if (!selectedRoom) return counts;

    orderedWeekdays.forEach(day => {
      let periodsOccupied = 0;
      for (let p = 0; p < maxPeriods; p++) {
        const key = `${day}-${p}`;
        if (roomScheduleMatrix[key] && roomScheduleMatrix[key].length > 0) {
          periodsOccupied++;
        }
      }
      counts[day] = periodsOccupied;
    });

    return counts;
  }, [selectedRoom, orderedWeekdays, maxPeriods, roomScheduleMatrix]);

  const totalWeeklyOccupancy = useMemo(() => {
    return Object.values(dailyOccupancy).reduce((sum, n) => sum + n, 0);
  }, [dailyOccupancy]);

  const handlePrint = () => {
    window.print();
  };

  if (allRooms.length === 0) {
    return (
      <div className="p-8 text-center text-xs text-[#252326]/60 bg-white rounded border border-[#A89B8A]/30">
        No room numbers configured in batches. Assign room numbers in the Batches tab to view room occupancy schedules.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls Bar (hidden during print) */}
      <div className="no-print p-4 bg-white rounded-lg border border-[#A89B8A]/30 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
          <div className="relative min-w-[200px]">
            <Search className="w-4 h-4 text-[#252326]/40 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search rooms..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F3EEE6]/50 border border-[#A89B8A]/40 rounded-md focus:border-[#6B2638] focus:ring-1 focus:ring-[#6B2638] text-[#252326]"
            />
          </div>

          <select
            value={selectedRoom}
            onChange={e => setSelectedRoom(e.target.value)}
            className="text-xs bg-[#F3EEE6]/70 border border-[#A89B8A]/40 rounded-md px-3 py-2 text-[#252326] font-semibold focus:border-[#6B2638] focus:ring-1 focus:ring-[#6B2638] max-w-xs"
          >
            {filteredRooms.map(room => (
              <option key={room} value={room}>
                Room {room}
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
          Print Room Schedule
        </Button>
      </div>

      {/* Printable Schedule Container */}
      <Card className="print-section-page border border-[#A89B8A]/30 space-y-4 p-4 sm:p-6 bg-white">
        {/* Room Header Banner */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-[#A89B8A]/20">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold text-[#6B2638]">Room {selectedRoom}</h3>
              <Badge tone="burgundy">Classroom Space</Badge>
              {buildingsInRoom.map(b => (
                <span
                  key={b}
                  className="text-xs bg-[#F3EEE6] border border-[#A89B8A]/30 px-2 py-0.5 rounded font-medium text-[#252326]"
                >
                  {b}
                </span>
              ))}
            </div>
            <p className="text-xs text-[#252326]/70 mt-0.5">
              Assigned batches:{' '}
              <strong>{batchesInRoom.map(b => b.name).join(', ') || 'None assigned'}</strong>
            </p>
          </div>

          <div className="flex items-center gap-3 text-right">
            <div className="p-2 bg-[#F3EEE6] rounded border border-[#A89B8A]/30 text-center min-w-[110px]">
              <span className="text-[10px] uppercase font-bold text-[#252326]/60 block">Weekly In-Use</span>
              <span className="text-base font-bold text-[#6B2638]">{totalWeeklyOccupancy} periods</span>
            </div>
            <div className="p-2 bg-[#F3EEE6] rounded border border-[#A89B8A]/30 text-center min-w-[110px]">
              <span className="text-[10px] uppercase font-bold text-[#252326]/60 block">Total Capacity</span>
              <span className="text-base font-bold text-[#252326]">{maxPeriods * 6} periods</span>
            </div>
          </div>
        </div>

        {/* 6-Day Full Week Matrix */}
        <div className="overflow-x-auto border border-[#A89B8A]/30 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#252326] text-white">
                <th className="p-2.5 font-bold uppercase tracking-wider text-[11px] w-24 text-center border-r border-[#252326]/40">
                  Period
                </th>
                {orderedWeekdays.map(day => (
                  <th key={day} className="p-2.5 font-bold uppercase tracking-wider text-[11px] border-r border-[#252326]/40 text-center">
                    {day}
                  </th>
                ))}
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
                    const slots = roomScheduleMatrix[key] || [];

                    if (slots.length === 0) {
                      return (
                        <td key={day} className="p-2.5 border-r border-[#A89B8A]/20 text-center text-[#252326]/30 font-mono">
                          Vacant
                        </td>
                      );
                    }

                    const hasClash = slots.length > 1;

                    return (
                      <td key={day} className="p-2 border-r border-[#A89B8A]/20 bg-[#FDFBF7]">
                        {slots.map((slot, sIdx) => (
                          <div
                            key={sIdx}
                            className={`p-2 rounded border space-y-1 ${
                              hasClash
                                ? 'bg-[#FAF0F2] border-[#ECD9DE] text-[#6B2638]'
                                : 'bg-white border-[#B08D57]/30 text-[#252326]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-bold text-xs truncate">{slot.batchName}</span>
                              {slot.time && <span className="text-[10px] text-[#252326]/50">{slot.time}</span>}
                            </div>
                            <div className="flex items-center justify-between text-[11px] font-semibold text-[#6B2638]">
                              <span>{slot.subject}</span>
                              <span className="text-[10px] text-[#252326]/70 truncate max-w-[100px]">
                                {slot.facultyName}
                              </span>
                            </div>
                            {hasClash && (
                              <div className="text-[10px] font-bold text-[#6B2638] flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                <span>Room Clash!</span>
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
                  Occupancy
                </td>
                {orderedWeekdays.map(day => {
                  const count = dailyOccupancy[day] || 0;
                  return (
                    <td key={day} className="p-2.5 text-center border-r border-[#A89B8A]/30">
                      {count} / {maxPeriods} periods
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
