import type {
  Batch,
  Faculty,
  Allocation,
  SchedulerSettings,
  DayOfWeek,
  DayValidationReport,
  TimetableViolation,
} from '../types';
import { isOverlapping } from './validation';
import { getDailyLimit, isFacultyAbsent } from './constraints';

/**
 * Evaluates the timetable allocations of a specific day against hard constraints
 * and scheduling rules, returning a comprehensive validation report with cell jump targets.
 * (N3 Validation Report)
 */
export const generateDayValidationReport = (
  day: DayOfWeek,
  allocations: Allocation[],
  batches: Batch[],
  faculties: Faculty[],
  settings: SchedulerSettings,
  dateKey?: string
): DayValidationReport => {
  const violations: TimetableViolation[] = [];
  const facultyMap = new Map<string, Faculty>(faculties.map(f => [f.id, f]));
  const batchMap = new Map<string, Batch>(batches.map(b => [b.id, b]));

  let totalSlots = 0;
  let filledSlots = 0;

  // Track daily load per faculty
  const facultyLoad: Record<string, number> = {};
  allocations.forEach(a => {
    if (a.facultyId) {
      facultyLoad[a.facultyId] = (facultyLoad[a.facultyId] || 0) + 1;
    }
  });

  // -------------------------------------------------------------
  // 1. UNFILLED SLOTS CHECK
  // -------------------------------------------------------------
  batches.forEach(batch => {
    batch.periods.forEach((timing, pIdx) => {
      if (!timing || !timing.startTime || !timing.endTime) return;
      totalSlots++;

      const alloc = allocations.find(a => a.batchId === batch.id && a.periodIndex === pIdx);
      if (!alloc || !alloc.facultyId) {
        violations.push({
          id: `unfilled-${batch.id}-${pIdx}`,
          type: 'unfilled',
          severity: 'warning',
          batchId: batch.id,
          batchName: batch.name,
          periodIndex: pIdx,
          periodTime: `${timing.startTime} - ${timing.endTime}`,
          facultyId: undefined,
          facultyName: undefined,
          roomNumber: batch.roomNumber,
          description: alloc?.vacatedFacultyName
            ? `Vacated slot: previously taught by ${alloc.vacatedFacultyName} (${alloc.subject || 'Subject'}).`
            : `Unfilled slot: Period ${pIdx + 1} (${timing.startTime} - ${timing.endTime}) has no assigned instructor.`,
        });
      } else {
        filledSlots++;
      }
    });
  });

  // -------------------------------------------------------------
  // 2. TEACHER TIME OVERLAPS (Double Booking)
  // -------------------------------------------------------------
  const teacherAllocations = allocations.filter(a => a.facultyId);
  const reportedOverlapPairs = new Set<string>();

  for (let i = 0; i < teacherAllocations.length; i++) {
    for (let j = i + 1; j < teacherAllocations.length; j++) {
      const a1 = teacherAllocations[i];
      const a2 = teacherAllocations[j];

      if (a1.facultyId === a2.facultyId && a1.batchId !== a2.batchId) {
        const batch1 = batchMap.get(a1.batchId);
        const batch2 = batchMap.get(a2.batchId);
        const timing1 = batch1?.periods[a1.periodIndex];
        const timing2 = batch2?.periods[a2.periodIndex];

        if (
          batch1 &&
          batch2 &&
          timing1?.startTime &&
          timing1?.endTime &&
          timing2?.startTime &&
          timing2?.endTime &&
          isOverlapping(timing1.startTime, timing1.endTime, timing2.startTime, timing2.endTime)
        ) {
          const pairKey = [a1.batchId, a1.periodIndex, a2.batchId, a2.periodIndex].sort().join(':');
          if (!reportedOverlapPairs.has(pairKey)) {
            reportedOverlapPairs.add(pairKey);
            const fac = facultyMap.get(a1.facultyId!);
            const facName = fac?.name || a1.facultyId;

            violations.push({
              id: `overlap-${a1.batchId}-${a1.periodIndex}-${a2.batchId}-${a2.periodIndex}`,
              type: 'overlap',
              severity: 'error',
              batchId: a1.batchId,
              batchName: batch1.name,
              periodIndex: a1.periodIndex,
              periodTime: `${timing1.startTime} - ${timing1.endTime}`,
              facultyId: a1.facultyId,
              facultyName: facName,
              roomNumber: batch1.roomNumber,
              description: `Time conflict: Instructor ${facName} is simultaneously scheduled in ${batch1.name} (P${a1.periodIndex + 1}: ${timing1.startTime}-${timing1.endTime}) and ${batch2.name} (P${a2.periodIndex + 1}: ${timing2.startTime}-${timing2.endTime}).`,
            });
          }
        }
      }
    }
  }

  // -------------------------------------------------------------
  // 3. TEACHER OVER LIMIT CHECK
  // -------------------------------------------------------------
  const reportedOverLimitTeachers = new Set<string>();
  allocations.forEach(a => {
    if (!a.facultyId) return;
    const fac = facultyMap.get(a.facultyId);
    if (!fac) return;

    const limit = getDailyLimit(fac, settings);
    const count = facultyLoad[fac.id] || 0;

    if (count > limit && !reportedOverLimitTeachers.has(fac.id)) {
      reportedOverLimitTeachers.add(fac.id);
      const batch = batchMap.get(a.batchId);
      const timing = batch?.periods[a.periodIndex];

      violations.push({
        id: `overlimit-${fac.id}-${a.batchId}-${a.periodIndex}`,
        type: 'over_limit',
        severity: 'error',
        batchId: a.batchId,
        batchName: batch?.name || a.batchId,
        periodIndex: a.periodIndex,
        periodTime: timing ? `${timing.startTime} - ${timing.endTime}` : undefined,
        facultyId: fac.id,
        facultyName: fac.name,
        roomNumber: batch?.roomNumber,
        description: `Daily limit exceeded: ${fac.name} is assigned ${count} periods today (maximum allowed is ${limit}).`,
      });
    }
  });

  // -------------------------------------------------------------
  // 4. TEACHER ABSENT CHECK
  // -------------------------------------------------------------
  allocations.forEach(a => {
    if (!a.facultyId) return;
    const fac = facultyMap.get(a.facultyId);
    if (!fac) return;

    if (isFacultyAbsent(fac, day, dateKey)) {
      const batch = batchMap.get(a.batchId);
      const timing = batch?.periods[a.periodIndex];

      violations.push({
        id: `absent-${fac.id}-${a.batchId}-${a.periodIndex}`,
        type: 'absent',
        severity: 'error',
        batchId: a.batchId,
        batchName: batch?.name || a.batchId,
        periodIndex: a.periodIndex,
        periodTime: timing ? `${timing.startTime} - ${timing.endTime}` : undefined,
        facultyId: fac.id,
        facultyName: fac.name,
        roomNumber: batch?.roomNumber,
        description: `Absent instructor: ${fac.name} is marked absent on ${day} but assigned to ${batch?.name || a.batchId} (Period ${a.periodIndex + 1}).`,
      });
    }
  });

  // -------------------------------------------------------------
  // 5. ROOM CLASHES CHECK (N5: Building + Room Overlap)
  // -------------------------------------------------------------
  const reportedRoomClashes = new Set<string>();
  const batchesWithRooms = batches.filter(
    b => b.roomNumber && b.roomNumber.trim() && b.roomNumber.trim() !== '-' && b.building && b.building.trim()
  );

  for (let i = 0; i < batchesWithRooms.length; i++) {
    for (let j = i + 1; j < batchesWithRooms.length; j++) {
      const b1 = batchesWithRooms[i];
      const b2 = batchesWithRooms[j];

      const sameBuilding = b1.building.trim().toLowerCase() === b2.building.trim().toLowerCase();
      const sameRoom = b1.roomNumber.trim().toLowerCase() === b2.roomNumber.trim().toLowerCase();

      if (sameBuilding && sameRoom) {
        b1.periods.forEach((t1, p1) => {
          if (!t1 || !t1.startTime || !t1.endTime) return;
          b2.periods.forEach((t2, p2) => {
            if (!t2 || !t2.startTime || !t2.endTime) return;

            if (isOverlapping(t1.startTime, t1.endTime, t2.startTime, t2.endTime)) {
              // Check if both batches have an active class in that room
              const alloc1 = allocations.find(a => a.batchId === b1.id && a.periodIndex === p1 && a.facultyId);
              const alloc2 = allocations.find(a => a.batchId === b2.id && a.periodIndex === p2 && a.facultyId);

              const clashKey = [b1.id, p1, b2.id, p2].sort().join(':');
              if (!reportedRoomClashes.has(clashKey)) {
                reportedRoomClashes.add(clashKey);
                const hasBothAllocated = Boolean(alloc1 && alloc2);
                violations.push({
                  id: `room-${b1.building}-${b1.roomNumber}-${b1.id}-${p1}-${b2.id}-${p2}`,
                  type: 'room_clash',
                  severity: hasBothAllocated ? 'error' : 'warning',
                  batchId: b1.id,
                  batchName: b1.name,
                  periodIndex: p1,
                  periodTime: `${t1.startTime} - ${t1.endTime}`,
                  roomNumber: b1.roomNumber,
                  description: `Room clash: Room ${b1.roomNumber} is simultaneously booked for ${b1.name} (P${p1 + 1}: ${t1.startTime}-${t1.endTime}) and ${b2.name} (P${p2 + 1}: ${t2.startTime}-${t2.endTime}) in ${b1.building}.`,
                });
              }
            }
          });
        });
      }
    }
  }

  // Summary counts
  const overlaps = violations.filter(v => v.type === 'overlap').length;
  const overLimit = violations.filter(v => v.type === 'over_limit').length;
  const absent = violations.filter(v => v.type === 'absent').length;
  const roomClashes = violations.filter(v => v.type === 'room_clash').length;
  const unfilled = violations.filter(v => v.type === 'unfilled').length;

  const errorCount = violations.filter(v => v.severity === 'error').length;

  return {
    day,
    totalSlots,
    filledSlots,
    violations,
    summary: {
      overlaps,
      overLimit,
      absent,
      roomClashes,
      unfilled,
      totalIssues: violations.length,
    },
    isValid: errorCount === 0,
  };
};
