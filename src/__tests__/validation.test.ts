import { describe, it, expect } from 'vitest';
import {
  parseTimeMinutes,
  parseTimeMinutesStrict,
  normalizeTimeToHHmm,
  formatMinutesToHHmm,
  isTimeRangeValid,
  isOverlapping,
  checkFacultyConflict,
} from '../utils/validation';
import type { Faculty, Batch, Allocation, SchedulerSettings } from '../types';

describe('Validation Utilities', () => {
  describe('parseTimeMinutes (M4 Strict Time Parsing)', () => {
    it('correctly parses valid 24-hour HH:mm and H:mm format', () => {
      expect(parseTimeMinutes('00:00')).toBe(0);
      expect(parseTimeMinutes('08:30')).toBe(510);
      expect(parseTimeMinutes('8:30')).toBe(510); // H:mm single digit hour
      expect(parseTimeMinutes('1:30')).toBe(90); // M4 requirement: 1:30 -> 90 (1:30 AM)
      expect(parseTimeMinutes('12:00')).toBe(720);
      expect(parseTimeMinutes('15:45')).toBe(945);
      expect(parseTimeMinutes('23:59')).toBe(1439);
    });

    it('rejects invalid or out-of-range time strings with null', () => {
      expect(parseTimeMinutes('')).toBeNull(); // M4 requirement: empty returns null
      expect(parseTimeMinutes('   ')).toBeNull();
      expect(parseTimeMinutes('25:99')).toBeNull(); // M4 requirement: 25:99 returns null
      expect(parseTimeMinutes('24:00')).toBeNull(); // Hour >= 24
      expect(parseTimeMinutes('12:60')).toBeNull(); // Minute >= 60
      expect(parseTimeMinutes('13:30 PM')).toBeNull(); // 13 is invalid for 12h clock
      expect(parseTimeMinutes('abcd')).toBeNull();
      expect(parseTimeMinutes('null')).toBeNull();
    });

    it('parses valid 12-hour AM/PM formats (including 09:00 PM)', () => {
      expect(parseTimeMinutes('12:30 PM')).toBe(750);
      expect(parseTimeMinutes('09:15 AM')).toBe(555);
      expect(parseTimeMinutes('09:00 PM')).toBe(1260); // M4 requirement: 09:00 PM -> 1260
      expect(parseTimeMinutes('9:00 PM')).toBe(1260);
      expect(parseTimeMinutes('12:00 AM')).toBe(0);

      // Verify parseTimeMinutesStrict alias works identically
      expect(parseTimeMinutesStrict('09:00 PM')).toBe(1260);
      expect(parseTimeMinutesStrict('25:99')).toBeNull();
    });

    it('normalizes times to HH:mm with normalizeTimeToHHmm', () => {
      expect(normalizeTimeToHHmm('1:30')).toBe('01:30');
      expect(normalizeTimeToHHmm('09:00 PM')).toBe('21:00');
      expect(normalizeTimeToHHmm('9:00 PM')).toBe('21:00');
      expect(normalizeTimeToHHmm('25:99')).toBeNull();
      expect(normalizeTimeToHHmm('')).toBeNull();
      expect(formatMinutesToHHmm(90)).toBe('01:30');
      expect(formatMinutesToHHmm(1260)).toBe('21:00');
    });
  });

  describe('isTimeRangeValid', () => {
    it('returns true when start time is strictly before end time', () => {
      expect(isTimeRangeValid('08:30', '10:00').valid).toBe(true);
      expect(isTimeRangeValid('12:00', '13:30').valid).toBe(true);
    });

    it('returns false when start time is equal to or after end time', () => {
      expect(isTimeRangeValid('10:00', '10:00').valid).toBe(false);
      expect(isTimeRangeValid('14:00', '13:00').valid).toBe(false);
    });
  });

  describe('isOverlapping', () => {
    it('detects overlapping time ranges', () => {
      // Overlapping: 08:30-10:00 and 09:00-10:30
      expect(isOverlapping('08:30', '10:00', '09:00', '10:30')).toBe(true);
      // Nested: 08:00-11:00 and 08:30-10:00
      expect(isOverlapping('08:00', '11:00', '08:30', '10:00')).toBe(true);
      // Equal: 08:30-10:00 and 08:30-10:00
      expect(isOverlapping('08:30', '10:00', '08:30', '10:00')).toBe(true);
    });

    it('returns false for adjacent and disjoint intervals', () => {
      // Adjacent: one finishes exactly when the other starts
      expect(isOverlapping('08:30', '10:00', '10:00', '11:30')).toBe(false);
      // Disjoint
      expect(isOverlapping('08:30', '10:00', '11:00', '12:30')).toBe(false);
    });
  });

  describe('checkFacultyConflict', () => {
    const dummySettings: SchedulerSettings = {
      pcmbWeight: 60,
      languageWeight: 40,
      maxDailyPeriods: 3,
      weekStartDay: 'Monday',
      enableGapOptimization: true,
      enableConsecutivePeriodAvoidance: true,
      respectDailyLimits: true,
    };

    const facultyA: Faculty = {
      id: 'fac_1',
      name: 'Dr. Alan Turing',
      subjects: ['Mathematics'],
      maxPeriodsPerDay: 2,
      isAbsent: false,
    };

    const batches: Batch[] = [
      {
        id: 'b1',
        building: 'Building 1',
        yearCategory: 'First PU',
        name: 'Batch Alpha',
        roomNumber: '101',
        periods: [
          { startTime: '08:30', endTime: '10:00' },
          { startTime: '10:15', endTime: '11:45' },
        ],
        subjects: [{ subject: 'Mathematics', count: 1, category: 'Core' }],
      },
      {
        id: 'b2',
        building: 'Building 1',
        yearCategory: 'First PU',
        name: 'Batch Beta',
        roomNumber: '102',
        periods: [
          { startTime: '08:45', endTime: '09:45' }, // Overlaps with b1 period 0 (08:30-10:00)
          { startTime: '12:00', endTime: '13:30' },
        ],
        subjects: [{ subject: 'Mathematics', count: 1, category: 'Core' }],
      },
    ];

    it('reports conflict when faculty is absent', () => {
      const absentFac = { ...facultyA, isAbsent: true };
      const res = checkFacultyConflict(absentFac, 'b1', 0, batches, [], dummySettings);
      expect(res.hasConflict).toBe(true);
      expect(res.type).toBe('ABSENT');
    });

    it('reports conflict when batch is not in faculty restricted list', () => {
      const restrictedFac: Faculty = {
        ...facultyA,
        assignedBatches: ['b2'], // Only allowed for b2
      };
      const res = checkFacultyConflict(restrictedFac, 'b1', 0, batches, [], dummySettings);
      expect(res.hasConflict).toBe(true);
      expect(res.type).toBe('BATCH_RESTRICTION');
    });

    it('reports conflict when faculty is already teaching another batch at an overlapping time', () => {
      const existingAllocations: Allocation[] = [
        {
          batchId: 'b1',
          periodIndex: 0, // 08:30-10:00
          facultyId: 'fac_1',
          subject: 'Mathematics',
        },
      ];

      // Try assigning fac_1 to b2 at period 0 (08:45-09:45)
      const res = checkFacultyConflict(facultyA, 'b2', 0, batches, existingAllocations, dummySettings);
      expect(res.hasConflict).toBe(true);
      expect(res.type).toBe('TIME_OVERLAP');
      expect(res.message).toContain('Batch Alpha');
    });

    it('reports conflict when faculty reaches daily teaching limit', () => {
      const existingAllocations: Allocation[] = [
        { batchId: 'b1', periodIndex: 0, facultyId: 'fac_1', subject: 'Mathematics' },
        { batchId: 'b1', periodIndex: 1, facultyId: 'fac_1', subject: 'Mathematics' },
      ];

      // facultyA maxPeriodsPerDay is 2. Both slots used.
      const res = checkFacultyConflict(facultyA, 'b2', 1, batches, existingAllocations, dummySettings);
      expect(res.hasConflict).toBe(true);
      expect(res.type).toBe('MAX_LOAD');
    });

    it('approves assignment when there are no overlaps and within limits', () => {
      const res = checkFacultyConflict(facultyA, 'b1', 0, batches, [], dummySettings);
      expect(res.hasConflict).toBe(false);
      expect(res.message).toBeNull();
    });
  });
});
