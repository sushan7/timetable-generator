import type { Batch, Allocation, Faculty, ConflictCheckResult, SchedulerSettings } from '../types';
import { getDailyLimit } from './storage';

/**
 * Strict time parser (Requirement M4)
 * Returns integer total minutes from midnight, or null if the string is invalid or ambiguous.
 */
export const parseTimeMinutesStrict = (timeStr: string): number | null => {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const trimmed = timeStr.trim();
  if (!trimmed) return null;

  // 12-hour format with required AM/PM (e.g. "09:30 AM", "1:30 PM")
  const match12 = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = parseInt(match12[2], 10);
    const ampm = match12[3].toUpperCase();

    if (hours < 1 || hours > 12) return null;
    if (minutes < 0 || minutes > 59) return null;

    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }

  // 24-hour format: requires exactly 2-digit hour (or 1-digit with leading zero), e.g. "08:40", "14:15", "00:00"
  // Reject ambiguous single-digit hour without AM/PM like "1:30"
  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const rawHourStr = match24[1];
    // Reject ambiguous non-zero-padded single digit hour like "1:30" (could mean 01:30 or 13:30)
    if (rawHourStr.length === 1 && parseInt(rawHourStr, 10) < 10) {
      return null;
    }

    const hours = parseInt(rawHourStr, 10);
    const minutes = parseInt(match24[2], 10);

    if (hours < 0 || hours > 23) return null;
    if (minutes < 0 || minutes > 59) return null;

    return hours * 60 + minutes;
  }

  return null;
};

/**
 * Backward-compatible parse function: returns 0 if invalid (safe for calculations),
 * but checks validity via parseTimeMinutesStrict.
 */
export const parseTimeMinutes = (timeStr: string): number => {
  const result = parseTimeMinutesStrict(timeStr);
  return result !== null ? result : 0;
};

/**
 * Validates a single time string
 */
export const isValidTime = (timeStr: string): boolean => {
  return parseTimeMinutesStrict(timeStr) !== null;
};

/**
 * Formats minutes from midnight to canonical 24-hour "HH:mm"
 */
export const formatCanonicalTime = (minutes: number): string => {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

/**
 * Validates a period's start and end times
 */
export const isTimeRangeValid = (
  startStr: string,
  endStr: string
): { valid: boolean; reason?: string } => {
  const start = parseTimeMinutesStrict(startStr);
  if (start === null) {
    return { valid: false, reason: `Invalid start time format: "${startStr}"` };
  }
  const end = parseTimeMinutesStrict(endStr);
  if (end === null) {
    return { valid: false, reason: `Invalid end time format: "${endStr}"` };
  }
  if (start >= end) {
    return { valid: false, reason: `Start time (${startStr}) must be before end time (${endStr}).` };
  }
  return { valid: true };
};

/**
 * Returns true if two time intervals overlap (strictly sA < eB && eA > sB)
 */
export const isOverlapping = (
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean => {
  const sA = parseTimeMinutesStrict(startA);
  const eA = parseTimeMinutesStrict(endA);
  const sB = parseTimeMinutesStrict(startB);
  const eB = parseTimeMinutesStrict(endB);
  if (sA === null || eA === null || sB === null || eB === null) return false;
  return sA < eB && eA > sB;
};

/**
 * Centralised Assignment Validator (canAssign / checkFacultyConflict)
 * Enforces hard constraints:
 * 1. Absence (legacy isAbsent and date-specific unavailableDates)
 * 2. Assigned-batch restriction (exclusive batch lock)
 * 3. Daily workload cap (maxPeriodsPerDay)
 * 4. Time clash (teacher teaching other batch at same wall-clock time)
 * 5. Room clash (another batch using same roomNumber at same wall-clock time)
 */
export const checkFacultyConflict = (
  faculty: Faculty,
  targetBatchId: string,
  targetPeriodIndex: number,
  batches: Batch[],
  allocations: Allocation[],
  settings?: SchedulerSettings,
  options?: { dateKey?: string }
): ConflictCheckResult => {
  // 1. Absence check
  const dateKey = options?.dateKey;
  const isAbsent = Boolean(
    faculty.isAbsent ||
    (dateKey && faculty.unavailableDates && faculty.unavailableDates.includes(dateKey))
  );

  if (isAbsent) {
    return {
      hasConflict: true,
      type: 'ABSENT',
      severity: 'hard_error',
      message: `Faculty ${faculty.name} is marked as absent${dateKey ? ` on ${dateKey}` : ''}.`,
    };
  }

  // 2. Batch restrictions
  if (faculty.assignedBatches && faculty.assignedBatches.length > 0) {
    if (!faculty.assignedBatches.includes(targetBatchId)) {
      return {
        hasConflict: true,
        type: 'BATCH_RESTRICTION',
        severity: 'hard_error',
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

  // 3. Workload cap
  const effectiveSettings = settings || { maxDailyPeriods: 4, pcmbWeight: 60, languageWeight: 40, weekStartDay: 'Monday', enableGapOptimization: true, enableConsecutivePeriodAvoidance: true };
  const dailyLimit = getDailyLimit(faculty, effectiveSettings);

  const currentWorkload = allocations.filter(
    a =>
      a.facultyId === faculty.id &&
      !(a.batchId === targetBatchId && a.periodIndex === targetPeriodIndex)
  ).length;

  if (currentWorkload >= dailyLimit) {
    return {
      hasConflict: true,
      type: 'MAX_LOAD',
      severity: 'hard_error',
      message: `Faculty ${faculty.name} has reached their daily maximum limit (${currentWorkload}/${dailyLimit} periods).`,
    };
  }

  // 4. Wall-clock Time overlap check across other batches
  for (const alloc of allocations) {
    if (
      alloc.facultyId === faculty.id &&
      !(alloc.batchId === targetBatchId && alloc.periodIndex === targetPeriodIndex)
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
          hasConflict: true,
          type: 'TIME_OVERLAP',
          severity: 'hard_error',
          conflictingBatchName: otherBatch.name,
          conflictingPeriod: alloc.periodIndex + 1,
          message: `Time clash: already teaching "${otherBatch.name}" during ${otherTiming.startTime} - ${otherTiming.endTime}.`,
        };
      }
    }
  }

  // 5. Room conflict check (Phase 5E)
  if (targetBatch.roomNumber && targetBatch.roomNumber.trim()) {
    for (const alloc of allocations) {
      if (!(alloc.batchId === targetBatchId && alloc.periodIndex === targetPeriodIndex)) {
        const otherBatch = batches.find(b => b.id === alloc.batchId);
        if (
          otherBatch &&
          otherBatch.roomNumber &&
          otherBatch.roomNumber.trim().toLowerCase() === targetBatch.roomNumber.trim().toLowerCase()
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
              hasConflict: true,
              type: 'ROOM_OVERLAP',
              severity: 'soft_warning',
              conflictingBatchName: otherBatch.name,
              conflictingPeriod: alloc.periodIndex + 1,
              message: `Room conflict: Room ${targetBatch.roomNumber} is simultaneously scheduled for "${otherBatch.name}" (${otherTiming.startTime} - ${otherTiming.endTime}).`,
            };
          }
        }
      }
    }
  }

  return { hasConflict: false, message: null };
};

/**
 * Validates all frozen allocations before running automatic scheduling (C2)
 */
export const validateFrozenAllocations = (
  frozenAllocations: Allocation[],
  batches: Batch[],
  faculties: Faculty[],
  settings?: SchedulerSettings,
  dateKey?: string
): { valid: boolean; invalidEntries: { allocation: Allocation; reason: string; type: string }[] } => {
  const invalidEntries: { allocation: Allocation; reason: string; type: string }[] = [];

  for (let i = 0; i < frozenAllocations.length; i++) {
    const alloc = frozenAllocations[i];
    if (!alloc.facultyId) continue;

    const faculty = faculties.find(f => f.id === alloc.facultyId);
    if (!faculty) {
      invalidEntries.push({
        allocation: alloc,
        reason: 'Assigned faculty record no longer exists in faculty directory.',
        type: 'FACULTY_NOT_FOUND',
      });
      continue;
    }

    const otherFrozen = frozenAllocations.filter((_, idx) => idx !== i);
    const check = checkFacultyConflict(
      faculty,
      alloc.batchId,
      alloc.periodIndex,
      batches,
      otherFrozen,
      settings,
      { dateKey }
    );

    if (check.hasConflict) {
      invalidEntries.push({
        allocation: alloc,
        reason: check.message || 'Violates scheduling constraints.',
        type: check.type || 'CONFLICT',
      });
    }
  }

  return {
    valid: invalidEntries.length === 0,
    invalidEntries,
  };
};
