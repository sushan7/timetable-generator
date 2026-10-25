import type { Batch, Allocation, Faculty } from '../types';

export const parseTimeMinutes = (timeStr: string): number => {
  if (!timeStr) return 0;
  const trimmed = timeStr.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!match) {
    const parts = trimmed.split(':');
    return (Number(parts[0]) || 0) * 60 + (Number(parts[1]) || 0);
  }
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3]?.toUpperCase();
  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
};

export const isOverlapping = (startA: string, endA: string, startB: string, endB: string): boolean => {
  if (!startA || !endA || !startB || !endB) return false;
  const sA = parseTimeMinutes(startA);
  const eA = parseTimeMinutes(endA);
  const sB = parseTimeMinutes(startB);
  const eB = parseTimeMinutes(endB);
  return sA < eB && eA > sB;
};

export interface ConflictCheckResult {
  hasConflict: boolean;
  message: string | null;
  type?: 'TIME_OVERLAP' | 'MAX_LOAD' | 'ABSENT' | 'BATCH_RESTRICTION';
}

export const checkFacultyConflict = (
  faculty: Faculty,
  targetBatchId: string,
  targetPeriodIndex: number,
  batches: Batch[],
  allocations: Allocation[],
  maxDailyPeriods = 4
): ConflictCheckResult => {
  if (faculty.isAbsent) {
    return {
      hasConflict: true,
      type: 'ABSENT',
      message: `Faculty ${faculty.name} is currently marked as Absent.`,
    };
  }

  // Check batch restrictions if assigned
  if (faculty.assignedBatches && faculty.assignedBatches.length > 0) {
    if (!faculty.assignedBatches.includes(targetBatchId)) {
      return {
        hasConflict: true,
        type: 'BATCH_RESTRICTION',
        message: `Faculty ${faculty.name} is restricted to specific batches.`,
      };
    }
  }

  const targetBatch = batches.find(b => b.id === targetBatchId);
  if (!targetBatch) return { hasConflict: false, message: null };
  const targetTiming = targetBatch.periods[targetPeriodIndex];
  if (!targetTiming || !targetTiming.startTime || !targetTiming.endTime) {
    return { hasConflict: false, message: null };
  }

  // Check current daily workload (excluding current slot if editing existing)
  const currentWorkload = allocations.filter(
    a => a.facultyId === faculty.id && !(a.batchId === targetBatchId && a.periodIndex === targetPeriodIndex)
  ).length;

  const facultyLimit = faculty.maxPeriodsPerDay ?? maxDailyPeriods;
  if (currentWorkload >= facultyLimit) {
    return {
      hasConflict: true,
      type: 'MAX_LOAD',
      message: `Faculty has reached their maximum daily teaching limit (${currentWorkload}/${facultyLimit} periods).`,
    };
  }

  // Check if faculty is already teaching elsewhere at this overlapping time
  for (const alloc of allocations) {
    if (alloc.facultyId === faculty.id && !(alloc.batchId === targetBatchId && alloc.periodIndex === targetPeriodIndex)) {
      const otherBatch = batches.find(b => b.id === alloc.batchId);
      if (!otherBatch) continue;
      const otherTiming = otherBatch.periods[alloc.periodIndex];
      if (otherTiming && isOverlapping(targetTiming.startTime, targetTiming.endTime, otherTiming.startTime, otherTiming.endTime)) {
        return {
          hasConflict: true,
          type: 'TIME_OVERLAP',
          message: `Time clash: already teaching "${otherBatch.name}" during ${otherTiming.startTime} - ${otherTiming.endTime}.`,
        };
      }
    }
  }

  return { hasConflict: false, message: null };
};