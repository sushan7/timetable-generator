import { describe, it, expect } from 'vitest';
import { getDailyLimit, canAssign, validateFrozenAllocations } from '../utils/constraints';
import type { Faculty, Batch, Allocation, SchedulerSettings } from '../types';

describe('M5 & C2: Constraints & Frozen Validation Suite', () => {
  const dummySettings: SchedulerSettings = {
    pcmbWeight: 60,
    languageWeight: 40,
    maxDailyPeriods: 4,
    weekStartDay: 'Monday',
    enableGapOptimization: true,
    enableConsecutivePeriodAvoidance: true,
  };

  describe('getDailyLimit', () => {
    it('handles 0, undefined and valid numbers', () => {
      // 1. Valid positive numbers
      expect(getDailyLimit({ maxPeriodsPerDay: 6 }, dummySettings)).toBe(6);
      expect(getDailyLimit({ maxPeriodsPerDay: 1 }, dummySettings)).toBe(1);
      expect(getDailyLimit({ maxPeriodsPerDay: 3 }, dummySettings)).toBe(3);

      // 2. undefined and null faculty / settings
      expect(getDailyLimit({ maxPeriodsPerDay: undefined }, dummySettings)).toBe(4);
      expect(getDailyLimit(null, dummySettings)).toBe(4);
      expect(getDailyLimit(undefined, undefined)).toBe(4);

      // 3. 0 and invalid numbers (defaults from settings)
      expect(getDailyLimit({ maxPeriodsPerDay: 0 }, dummySettings)).toBe(4);
      expect(getDailyLimit({ maxPeriodsPerDay: -2 }, dummySettings)).toBe(4);
      expect(getDailyLimit({ maxPeriodsPerDay: 3.7 }, dummySettings)).toBe(4);

      // 4. Custom settings default
      const customSettings: SchedulerSettings = { ...dummySettings, maxDailyPeriods: 5 };
      expect(getDailyLimit({ maxPeriodsPerDay: 0 }, customSettings)).toBe(5);
      expect(getDailyLimit({ maxPeriodsPerDay: undefined }, customSettings)).toBe(5);
    });
  });

  describe('Frozen Slot Validation (C2)', () => {
    const sampleBatch1: Batch = {
      id: 'batch_1',
      name: 'Section A1',
      building: 'Building 1',
      yearCategory: 'First PU',
      roomNumber: '101',
      subjects: [{ subject: 'Physics', count: 4, category: 'Core' }],
      periods: [
        { startTime: '08:30', endTime: '09:30' },
        { startTime: '09:30', endTime: '10:30' },
      ],
    };

    const sampleBatch2: Batch = {
      id: 'batch_2',
      name: 'Section B1',
      building: 'Building 1',
      yearCategory: 'First PU',
      roomNumber: '102',
      subjects: [{ subject: 'Physics', count: 4, category: 'Core' }],
      periods: [
        { startTime: '08:30', endTime: '09:30' },
        { startTime: '09:30', endTime: '10:30' },
      ],
    };

    it('reports frozen absent teacher', () => {
      const absentFaculty: Faculty = {
        id: 'f_absent',
        name: 'Prof. Absent',
        subjects: ['Physics'],
        isAbsent: true,
      };

      const frozenAlloc: Allocation = {
        batchId: sampleBatch1.id,
        periodIndex: 0,
        facultyId: absentFaculty.id,
        subject: 'Physics',
        frozen: true,
      };

      const result = validateFrozenAllocations(
        [frozenAlloc],
        [sampleBatch1],
        [absentFaculty],
        dummySettings
      );

      expect(result.valid).toBe(false);
      expect(result.invalidEntries.length).toBe(1);
      expect(result.invalidEntries[0].type).toBe('ABSENT');
      expect(result.invalidEntries[0].allocation.facultyId).toBe('f_absent');
      expect(result.invalidEntries[0].reason).toContain('is marked as absent');
    });

    it('reports two frozen overlapping slots for one teacher', () => {
      const teacher: Faculty = {
        id: 'f_busy',
        name: 'Prof. Clashing',
        subjects: ['Physics'],
        isAbsent: false,
      };

      // Both allocations are frozen at the exact same wall-clock time (08:30 - 09:30) in two different batches
      const alloc1: Allocation = {
        batchId: sampleBatch1.id,
        periodIndex: 0,
        facultyId: teacher.id,
        subject: 'Physics',
        frozen: true,
      };

      const alloc2: Allocation = {
        batchId: sampleBatch2.id,
        periodIndex: 0,
        facultyId: teacher.id,
        subject: 'Physics',
        frozen: true,
      };

      const result = validateFrozenAllocations(
        [alloc1, alloc2],
        [sampleBatch1, sampleBatch2],
        [teacher],
        dummySettings
      );

      expect(result.valid).toBe(false);
      expect(result.invalidEntries.length).toBeGreaterThanOrEqual(1);
      const overlapEntry = result.invalidEntries.find(e => e.type === 'TIME_OVERLAP');
      expect(overlapEntry).toBeDefined();
      expect(overlapEntry?.reason).toContain('Time clash');
    });

    it('reports frozen teacher exceeding daily limit', () => {
      const teacher: Faculty = {
        id: 'f_capped',
        name: 'Prof. Capped',
        subjects: ['Physics'],
        maxPeriodsPerDay: 1,
        isAbsent: false,
      };

      const alloc1: Allocation = {
        batchId: sampleBatch1.id,
        periodIndex: 0,
        facultyId: teacher.id,
        subject: 'Physics',
        frozen: true,
      };

      const alloc2: Allocation = {
        batchId: sampleBatch1.id,
        periodIndex: 1,
        facultyId: teacher.id,
        subject: 'Physics',
        frozen: true,
      };

      const result = validateFrozenAllocations(
        [alloc1, alloc2],
        [sampleBatch1],
        [teacher],
        dummySettings
      );

      expect(result.valid).toBe(false);
      const maxLoadEntry = result.invalidEntries.find(e => e.type === 'MAX_LOAD');
      expect(maxLoadEntry).toBeDefined();
      expect(maxLoadEntry?.reason).toContain('daily maximum limit');
    });

    it('reports frozen slot with deleted teacher or batch', () => {
      const allocMissingFaculty: Allocation = {
        batchId: sampleBatch1.id,
        periodIndex: 0,
        facultyId: 'f_deleted',
        subject: 'Physics',
        frozen: true,
      };

      const resultFaculty = validateFrozenAllocations(
        [allocMissingFaculty],
        [sampleBatch1],
        [],
        dummySettings
      );
      expect(resultFaculty.valid).toBe(false);
      expect(resultFaculty.invalidEntries[0].type).toBe('FACULTY_NOT_FOUND');

      const allocMissingBatch: Allocation = {
        batchId: 'batch_deleted',
        periodIndex: 0,
        facultyId: 'f_ok',
        subject: 'Physics',
        frozen: true,
      };

      const resultBatch = validateFrozenAllocations(
        [allocMissingBatch],
        [],
        [{ id: 'f_ok', name: 'Ok', subjects: ['Physics'] }],
        dummySettings
      );
      expect(resultBatch.valid).toBe(false);
      expect(resultBatch.invalidEntries[0].type).toBe('BATCH_NOT_FOUND');
    });
  });

  describe('Manual Override Flow (C2)', () => {
    it('sets the overridden and hasConflictOverride flags when manual override is confirmed', () => {
      const conflictingFaculty: Faculty = {
        id: 'f_overlap',
        name: 'Dr. Overlap',
        subjects: ['Physics'],
        isAbsent: true,
      };

      const batch: Batch = {
        id: 'b1',
        name: 'Batch 1',
        building: 'Building 1',
        yearCategory: 'First PU',
        roomNumber: '101',
        subjects: [{ subject: 'Physics', count: 4, category: 'Core' }],
        periods: [{ startTime: '08:30', endTime: '09:30' }],
      };

      // 1. Evaluate assignment conflict with canAssign
      const evaluation = canAssign(
        conflictingFaculty,
        batch,
        0,
        [],
        [batch],
        dummySettings
      );

      expect(evaluation.ok).toBe(false);
      expect(evaluation.type).toBe('ABSENT');

      // 2. Simulating handleSaveSlotOverride:
      // Hard conflict types: TIME_OVERLAP, ABSENT, MAX_LOAD, BATCH_RESTRICTION
      const isHardConflict = ['TIME_OVERLAP', 'ABSENT', 'MAX_LOAD', 'BATCH_RESTRICTION'].includes(
        evaluation.type || ''
      );
      expect(isHardConflict).toBe(true);

      const allowConflictOverride = true; // User checks "Override anyway"

      const savedAllocation: Allocation = {
        batchId: batch.id,
        periodIndex: 0,
        facultyId: conflictingFaculty.id,
        subject: 'Physics',
        autoGenerated: false,
        manualEdited: true,
        frozen: true,
        hasConflictOverride: !evaluation.ok,
        overridden: isHardConflict && allowConflictOverride,
        conflictNote: evaluation.reason,
      };

      expect(savedAllocation.hasConflictOverride).toBe(true);
      expect(savedAllocation.overridden).toBe(true);
      expect(savedAllocation.conflictNote).toContain('is marked as absent');
    });
  });
});
