import type { Batch, Allocation, Faculty, ConflictCheckResult, SchedulerSettings, DayOfWeek } from '../types';
import { WEEKDAYS } from '../types';
import { canAssign, getDailyLimit, validateFrozenAllocations, isFacultyAbsent } from './constraints';

export { canAssign, getDailyLimit, validateFrozenAllocations, isFacultyAbsent };

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
  options?: { dateKey?: string; dayOfWeek?: DayOfWeek }
): ConflictCheckResult => {
  const targetBatch = batches.find(b => b.id === targetBatchId);
  if (!targetBatch) return { hasConflict: false, message: null };

  const result = canAssign(
    faculty,
    targetBatch,
    targetPeriodIndex,
    options?.dateKey || options?.dayOfWeek ? { allocations, dateKey: options.dateKey, dayOfWeek: options.dayOfWeek } : allocations,
    batches,
    settings,
    options
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

/**
 * Hand-written Schema Validator for Faculty Import (Requirement H7)
 * Validates each imported record against strict criteria without external libraries.
 */
export type FacultyRecordValidation =
  | { valid: true; faculty: Faculty }
  | { valid: false; reason: string; record: unknown };

export const validateFacultyRecord = (
  raw: unknown,
  index = 0
): FacultyRecordValidation => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, reason: `Item #${index + 1} is not a valid object`, record: raw };
  }

  const rec = raw as Record<string, unknown>;

  // 1. name: non-empty string
  if (typeof rec.name !== 'string' || !rec.name.trim()) {
    return { valid: false, reason: `Item #${index + 1} is missing a required non-empty 'name'`, record: raw };
  }

  // 2. subjects: string[] (must be array of strings, at least one non-empty string)
  if (
    !Array.isArray(rec.subjects) ||
    rec.subjects.length === 0 ||
    !rec.subjects.every(s => typeof s === 'string' && s.trim().length > 0)
  ) {
    return {
      valid: false,
      reason: `Faculty "${rec.name}" must have a non-empty array of strings in 'subjects'`,
      record: raw,
    };
  }

  // 3. maxPeriodsPerDay: positive integer if present
  if (rec.maxPeriodsPerDay !== undefined && rec.maxPeriodsPerDay !== null) {
    if (
      typeof rec.maxPeriodsPerDay !== 'number' ||
      !Number.isInteger(rec.maxPeriodsPerDay) ||
      rec.maxPeriodsPerDay <= 0
    ) {
      return {
        valid: false,
        reason: `Faculty "${rec.name}" has invalid 'maxPeriodsPerDay'. Must be a positive integer if present.`,
        record: raw,
      };
    }
  }

  // 4. assignedBatches: string[] if present
  if (rec.assignedBatches !== undefined && rec.assignedBatches !== null) {
    if (
      !Array.isArray(rec.assignedBatches) ||
      !rec.assignedBatches.every(b => typeof b === 'string')
    ) {
      return {
        valid: false,
        reason: `Faculty "${rec.name}" has invalid 'assignedBatches'. Must be an array of strings if present.`,
        record: raw,
      };
    }
  }

  // 5. isAbsent: boolean if present
  if (rec.isAbsent !== undefined && rec.isAbsent !== null) {
    if (typeof rec.isAbsent !== 'boolean') {
      return {
        valid: false,
        reason: `Faculty "${rec.name}" has invalid 'isAbsent'. Must be a boolean if present.`,
        record: raw,
      };
    }
  }

  // Generate an id if missing or empty
  const id =
    typeof rec.id === 'string' && rec.id.trim()
      ? rec.id.trim()
      : `fac_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 7)}`;

  const absentDays: DayOfWeek[] = Array.isArray(rec.absentDays)
    ? ((rec.absentDays as string[]).filter(d => (WEEKDAYS as readonly string[]).includes(d as DayOfWeek)) as DayOfWeek[])
    : rec.isAbsent === true
      ? [...WEEKDAYS]
      : [];

  const faculty: Faculty = {
    id,
    name: (rec.name as string).trim(),
    subjects: (rec.subjects as string[]).map(s => s.trim()),
    maxPeriodsPerDay: typeof rec.maxPeriodsPerDay === 'number' ? rec.maxPeriodsPerDay : 4,
    isAbsent: Boolean(rec.isAbsent || absentDays.length > 0),
    absentDays,
    assignedBatches: Array.isArray(rec.assignedBatches) ? (rec.assignedBatches as string[]).map(b => b.trim()) : [],
  };

  return { valid: true, faculty };
};

/**
 * Re-validate stored week timetable allocations for teacher overlaps when batch timings change (Requirement H6).
 */
export interface TimetableOverlapConflict {
  day: DayOfWeek;
  facultyId: string;
  facultyName: string;
  batch1Id: string;
  batch1Name: string;
  period1: number;
  timing1: string;
  batch2Id: string;
  batch2Name: string;
  period2: number;
  timing2: string;
}

export const checkTimetableOverlaps = (
  week: Record<string, { allocations: Allocation[] } | undefined>,
  batches: Batch[],
  faculties: Faculty[]
): TimetableOverlapConflict[] => {
  const conflicts: TimetableOverlapConflict[] = [];
  const batchMap = new Map(batches.map(b => [b.id, b]));
  const facultyMap = new Map(faculties.map(f => [f.id, f]));

  (WEEKDAYS as readonly DayOfWeek[]).forEach(day => {
    const tt = week[day];
    if (!tt?.allocations) return;

    // Group active allocations by facultyId
    const facultyAllocations = new Map<string, Allocation[]>();
    tt.allocations.forEach(a => {
      if (!a.facultyId) return;
      const list = facultyAllocations.get(a.facultyId) || [];
      list.push(a);
      facultyAllocations.set(a.facultyId, list);
    });

    facultyAllocations.forEach((allocs, facId) => {
      if (allocs.length < 2) return;
      for (let i = 0; i < allocs.length; i++) {
        for (let j = i + 1; j < allocs.length; j++) {
          const a1 = allocs[i];
          const a2 = allocs[j];
          const b1 = batchMap.get(a1.batchId);
          const b2 = batchMap.get(a2.batchId);
          const t1 = b1?.periods?.[a1.periodIndex];
          const t2 = b2?.periods?.[a2.periodIndex];

          if (t1?.startTime && t1?.endTime && t2?.startTime && t2?.endTime) {
            if (isOverlapping(t1.startTime, t1.endTime, t2.startTime, t2.endTime)) {
              conflicts.push({
                day,
                facultyId: facId,
                facultyName: facultyMap.get(facId)?.name || facId,
                batch1Id: a1.batchId,
                batch1Name: b1?.name || a1.batchId,
                period1: a1.periodIndex,
                timing1: `${t1.startTime} - ${t1.endTime}`,
                batch2Id: a2.batchId,
                batch2Name: b2?.name || a2.batchId,
                period2: a2.periodIndex,
                timing2: `${t2.startTime} - ${t2.endTime}`,
              });
            }
          }
        }
      }
    });
  });

  return conflicts;
};
