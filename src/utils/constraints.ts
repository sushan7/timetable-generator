import type { Faculty, Batch, Allocation, SchedulerSettings } from '../types';
import { isOverlapping } from './validation';

export const DEFAULT_MAX_DAILY_PERIODS = 4;

export interface CanAssignResult {
  ok: boolean;
  reason?: string;
  type?: 'ABSENT' | 'TIME_OVERLAP' | 'MAX_LOAD' | 'BATCH_RESTRICTION' | 'ROOM_OVERLAP' | 'FACULTY_NOT_FOUND' | 'BATCH_NOT_FOUND';
  severity?: 'hard_error' | 'soft_warning';
  conflictingBatchName?: string;
  conflictingPeriod?: number;
}

export interface FrozenViolation {
  allocation: Allocation;
  batchId: string;
  periodIndex: number;
  facultyId?: string;
  reason: string;
  type: 'ABSENT' | 'TIME_OVERLAP' | 'MAX_LOAD' | 'FACULTY_NOT_FOUND' | 'BATCH_NOT_FOUND' | 'BATCH_RESTRICTION' | 'ROOM_OVERLAP';
}

/**
 * Validates whether a value is a strict positive integer (> 0).
 */
export const isValidPositiveInteger = (val: unknown): val is number => {
  return typeof val === 'number' && Number.isInteger(val) && val > 0;
};

/**
 * Centralized Faculty Daily Limit Resolver (M5)
 * Uses ??, validates positive integers, and defaults from settings.
 * If neither is a valid positive integer, falls back to DEFAULT_MAX_DAILY_PERIODS (4).
 */
export const getDailyLimit = (
  faculty?: Partial<Faculty> | null,
  settings?: Partial<SchedulerSettings> | null
): number => {
  const fallback = isValidPositiveInteger(settings?.maxDailyPeriods)
    ? settings!.maxDailyPeriods!
    : DEFAULT_MAX_DAILY_PERIODS;

  const facultyLimit = faculty?.maxPeriodsPerDay;
  if (isValidPositiveInteger(facultyLimit)) {
    return facultyLimit;
  }

  return fallback;
};

export type DayState =
  | Allocation[]
  | {
      allocations: Allocation[];
      dateKey?: string;
    };

/**
 * Single Source of Truth for Assignment Constraints (M5)
 * Returns { ok, reason, type?, severity?, conflictingBatchName?, conflictingPeriod? }
 */
export const canAssign = (
  faculty: Faculty,
  batch: Batch,
  periodIndex: number,
  dayState: DayState,
  batches: Batch[],
  settings?: SchedulerSettings,
  options?: { dateKey?: string }
): CanAssignResult => {
  const allocations = Array.isArray(dayState) ? dayState : dayState?.allocations || [];
  const dateKey =
    (typeof dayState === 'object' && !Array.isArray(dayState) ? dayState.dateKey : undefined) ||
    options?.dateKey;

  // 1. Faculty existence check
  if (!faculty) {
    return {
      ok: false,
      reason: 'Assigned faculty record does not exist in faculty directory.',
      type: 'FACULTY_NOT_FOUND',
      severity: 'hard_error',
    };
  }

  // 2. Absence check (isAbsent flag or date-specific unavailableDates)
  const isAbsent = Boolean(
    faculty.isAbsent ||
      (dateKey && faculty.unavailableDates && faculty.unavailableDates.includes(dateKey))
  );

  if (isAbsent) {
    return {
      ok: false,
      reason: `Faculty ${faculty.name} is marked as absent${dateKey ? ` on ${dateKey}` : ''}.`,
      type: 'ABSENT',
      severity: 'hard_error',
    };
  }

  // 3. Batch restriction check
  if (faculty.assignedBatches && faculty.assignedBatches.length > 0) {
    if (!batch || !faculty.assignedBatches.includes(batch.id)) {
      return {
        ok: false,
        reason: `Faculty ${faculty.name} is restricted to specific batches.`,
        type: 'BATCH_RESTRICTION',
        severity: 'hard_error',
      };
    }
  }

  // 4. Batch existence & timing check
  if (!batch) {
    return {
      ok: false,
      reason: 'Batch record does not exist.',
      type: 'BATCH_NOT_FOUND',
      severity: 'hard_error',
    };
  }

  const targetTiming = batch.periods[periodIndex];
  if (!targetTiming || !targetTiming.startTime || !targetTiming.endTime) {
    return { ok: true };
  }

  // 5. Daily workload cap check
  const dailyLimit = getDailyLimit(faculty, settings);
  const currentWorkload = allocations.filter(
    a => a.facultyId === faculty.id && !(a.batchId === batch.id && a.periodIndex === periodIndex)
  ).length;

  if (currentWorkload >= dailyLimit) {
    return {
      ok: false,
      reason: `Faculty ${faculty.name} has reached their daily maximum limit (${currentWorkload}/${dailyLimit} periods).`,
      type: 'MAX_LOAD',
      severity: 'hard_error',
    };
  }

  // 6. Wall-clock Time overlap check across other batches
  for (const alloc of allocations) {
    if (
      alloc.facultyId === faculty.id &&
      !(alloc.batchId === batch.id && alloc.periodIndex === periodIndex)
    ) {
      const otherBatch = batches.find(b => b.id === alloc.batchId);
      if (!otherBatch) continue;
      const otherTiming = otherBatch.periods[alloc.periodIndex];
      if (
        otherTiming &&
        isOverlapping(
          targetTiming.startTime,
          targetTiming.endTime,
          otherTiming.startTime,
          otherTiming.endTime
        )
      ) {
        return {
          ok: false,
          reason: `Time clash: already teaching "${otherBatch.name}" during ${otherTiming.startTime} - ${otherTiming.endTime}.`,
          type: 'TIME_OVERLAP',
          severity: 'hard_error',
          conflictingBatchName: otherBatch.name,
          conflictingPeriod: alloc.periodIndex + 1,
        };
      }
    }
  }

  // 7. Room clash check (within the same campus building)
  if (batch.roomNumber && batch.roomNumber.trim() && batch.roomNumber.trim() !== '-') {
    for (const alloc of allocations) {
      if (alloc.batchId !== batch.id) {
        const otherBatch = batches.find(b => b.id === alloc.batchId);
        if (
          otherBatch &&
          otherBatch.building &&
          batch.building &&
          otherBatch.building.trim().toLowerCase() === batch.building.trim().toLowerCase() &&
          otherBatch.roomNumber &&
          otherBatch.roomNumber.trim().toLowerCase() === batch.roomNumber.trim().toLowerCase()
        ) {
          const otherTiming = otherBatch.periods[alloc.periodIndex];
          if (
            otherTiming &&
            isOverlapping(
              targetTiming.startTime,
              targetTiming.endTime,
              otherTiming.startTime,
              otherTiming.endTime
            )
          ) {
            return {
              ok: false,
              reason: `Room conflict: Room ${batch.roomNumber} in ${batch.building} is simultaneously scheduled for "${otherBatch.name}" (${otherTiming.startTime} - ${otherTiming.endTime}).`,
              type: 'ROOM_OVERLAP',
              severity: 'soft_warning',
              conflictingBatchName: otherBatch.name,
              conflictingPeriod: alloc.periodIndex + 1,
            };
          }
        }
      }
    }
  }

  return { ok: true };
};

/**
 * Validates all frozen allocations before running automatic scheduling (C2)
 * Returns { valid, invalidEntries } with details of every violation.
 */
export const validateFrozenAllocations = (
  frozenAllocations: Allocation[],
  batches: Batch[],
  faculties: Faculty[],
  settings?: SchedulerSettings,
  dateKey?: string
): { valid: boolean; invalidEntries: FrozenViolation[] } => {
  const invalidEntries: FrozenViolation[] = [];

  for (let i = 0; i < frozenAllocations.length; i++) {
    const alloc = frozenAllocations[i];
    if (!alloc.facultyId) continue;

    const batch = batches.find(b => b.id === alloc.batchId);
    if (!batch) {
      invalidEntries.push({
        allocation: alloc,
        batchId: alloc.batchId,
        periodIndex: alloc.periodIndex,
        facultyId: alloc.facultyId,
        reason: 'Assigned batch record no longer exists in batches directory.',
        type: 'BATCH_NOT_FOUND',
      });
      continue;
    }

    const faculty = faculties.find(f => f.id === alloc.facultyId);
    if (!faculty) {
      invalidEntries.push({
        allocation: alloc,
        batchId: alloc.batchId,
        periodIndex: alloc.periodIndex,
        facultyId: alloc.facultyId,
        reason: 'Assigned faculty record no longer exists in faculty directory.',
        type: 'FACULTY_NOT_FOUND',
      });
      continue;
    }

    const otherFrozen = frozenAllocations.filter((_, idx) => idx !== i);
    const result = canAssign(
      faculty,
      batch,
      alloc.periodIndex,
      otherFrozen,
      batches,
      settings,
      { dateKey }
    );

    if (!result.ok) {
      invalidEntries.push({
        allocation: alloc,
        batchId: alloc.batchId,
        periodIndex: alloc.periodIndex,
        facultyId: alloc.facultyId,
        reason: result.reason || 'Violates scheduling constraints.',
        type: (result.type as FrozenViolation['type']) || 'TIME_OVERLAP',
      });
    }
  }

  return {
    valid: invalidEntries.length === 0,
    invalidEntries,
  };
};
