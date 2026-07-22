import type { Batch, Allocation } from '../types';

const parseTime = (timeStr: string) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};

const isOverlapping = (startA: string, endA: string, startB: string, endB: string) => {
  if (!startA || !endA || !startB || !endB) return false;
  return parseTime(startA) < parseTime(endB) && parseTime(endA) > parseTime(startB);
};

export const checkFacultyConflict = (
  facultyId: string,
  targetBatchId: string,
  targetPeriodIndex: number,
  batches: Batch[],
  allocations: Allocation[]
): string | null => {
  const targetBatch = batches.find(b => b.id === targetBatchId);
  if (!targetBatch) return null;
  const targetTiming = targetBatch.periods[targetPeriodIndex];
  if (!targetTiming) return null;

  // Check if faculty is already teaching elsewhere at this time
  for (const alloc of allocations) {
    if (alloc.facultyId === facultyId && !(alloc.batchId === targetBatchId && alloc.periodIndex === targetPeriodIndex)) {
      const otherBatch = batches.find(b => b.id === alloc.batchId);
      if (!otherBatch) continue;
      const otherTiming = otherBatch.periods[alloc.periodIndex];
      if (otherTiming && isOverlapping(targetTiming.startTime, targetTiming.endTime, otherTiming.startTime, otherTiming.endTime)) {
        return `Conflict: Faculty is already assigned to batch "${otherBatch.name}" during this time slot (${otherTiming.startTime} - ${otherTiming.endTime}).`;
      }
    }
  }
  return null;
};