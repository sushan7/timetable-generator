import type { Batch, Allocation, Faculty, ConflictCheckResult, SchedulerSettings } from '../types';
import { canAssign, getDailyLimit, validateFrozenAllocations } from './constraints';

export { canAssign, getDailyLimit, validateFrozenAllocations };

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
 * Centralised Assignment Validator (checkFacultyConflict)
 * Delegates to canAssign (M5 Single source of truth)
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
  const targetBatch = batches.find(b => b.id === targetBatchId);
  if (!targetBatch) return { hasConflict: false, message: null };

  const result = canAssign(
    faculty,
    targetBatch,
    targetPeriodIndex,
    options?.dateKey ? { allocations, dateKey: options.dateKey } : allocations,
    batches,
    settings
  );

  return {
    hasConflict: !result.ok,
    type: result.type as ConflictCheckResult['type'],
    severity: result.severity,
    message: result.reason || null,
    conflictingBatchName: result.conflictingBatchName,
    conflictingPeriod: result.conflictingPeriod,
  };
};
