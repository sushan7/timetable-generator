import { describe, it, expect, beforeEach } from 'vitest';
import { storage, type WeekTimetables } from '../utils/storage';
import { validateFacultyRecord, checkTimetableOverlaps } from '../utils/validation';
import type { Faculty, Batch, Allocation } from '../types';
import { initialFaculty } from '../utils/seedData';

describe('Faculty & Batch Management (H6, H7, M8)', () => {
  beforeEach(() => {
    storage.resetAll();
  });

  describe('Cascade Deletions (H6)', () => {
    it('accurately counts affected allocations across all stored days before deletion', () => {
      const testFaculty: Faculty = {
        id: 'fac_count_test',
        name: 'Prof. Carl Sagan',
        subjects: ['Astronomy'],
        maxPeriodsPerDay: 4,
      };
      storage.saveFaculty(testFaculty);

      // Assign to Monday and Wednesday
      const allocMon: Allocation = {
        batchId: 'batch_c1',
        periodIndex: 0,
        facultyId: testFaculty.id,
        subject: 'Astronomy',
      };
      const allocWed: Allocation = {
        batchId: 'batch_c2',
        periodIndex: 2,
        facultyId: testFaculty.id,
        subject: 'Astronomy',
      };

      storage.saveTimetableForDay('Monday', [allocMon], 'Draft');
      storage.saveTimetableForDay('Wednesday', [allocWed], 'Draft');

      const count = storage.countFacultyAllocations(testFaculty.id);
      expect(count).toBe(2);
    });

    it('turns affected allocations into unfilled shortage slots across all stored days on faculty deletion', () => {
      const testFaculty: Faculty = {
        id: 'fac_del_test',
        name: 'Dr. Richard Feynman',
        subjects: ['Physics'],
        maxPeriodsPerDay: 4,
      };
      storage.saveFaculty(testFaculty);

      const allocMon: Allocation = {
        batchId: 'batch_1',
        periodIndex: 1,
        facultyId: testFaculty.id,
        subject: 'Physics',
      };
      const allocTue: Allocation = {
        batchId: 'batch_2',
        periodIndex: 3,
        facultyId: testFaculty.id,
        subject: 'Physics',
      };

      storage.saveTimetableForDay('Monday', [allocMon], 'Draft');
      storage.saveTimetableForDay('Tuesday', [allocTue], 'Draft');

      const delRes = storage.deleteFaculty(testFaculty.id);
      expect(delRes.success).toBe(true);
      expect(delRes.allocationsAffected).toBe(2);

      // Verify faculty is removed from directory
      const allFaculty = storage.getFaculty();
      expect(allFaculty.some(f => f.id === testFaculty.id)).toBe(false);

      // Monday verification: allocation removed, unfilled slot created
      const monTT = storage.getTimetableForDay('Monday');
      expect(monTT?.allocations.find(a => a.facultyId === testFaculty.id)).toBeUndefined();
      const monUnfilled = monTT?.unfilledSlots?.find(u => u.batchId === 'batch_1' && u.periodIndex === 1);
      expect(monUnfilled).toBeDefined();
      expect(monUnfilled?.reason).toBe('NO_QUALIFIED_TEACHER');
      expect(monUnfilled?.requiredSubject).toBe('Physics');

      // Tuesday verification
      const tueTT = storage.getTimetableForDay('Tuesday');
      expect(tueTT?.allocations.find(a => a.facultyId === testFaculty.id)).toBeUndefined();
      const tueUnfilled = tueTT?.unfilledSlots?.find(u => u.batchId === 'batch_2' && u.periodIndex === 3);
      expect(tueUnfilled).toBeDefined();
      expect(tueUnfilled?.reason).toBe('NO_QUALIFIED_TEACHER');
    });

    it('removes batch allocations across all days and cleans up faculty.assignedBatches on batch deletion', () => {
      const testBatchId = 'batch_del_target';
      const testBatch: Batch = {
        id: testBatchId,
        name: 'Target Batch X',
        building: 'Building 1',
        yearCategory: 'First PU',
        roomNumber: '101',
        periods: [{ startTime: '08:30', endTime: '10:00' }],
        subjects: [{ subject: 'Physics', count: 1 }],
      };
      storage.saveBatch(testBatch);

      const testFaculty: Faculty = {
        id: 'fac_pinned_1',
        name: 'Pinned Teacher',
        subjects: ['Physics'],
        assignedBatches: [testBatchId, 'batch_other'],
      };
      storage.saveFaculty(testFaculty);

      const alloc: Allocation = {
        batchId: testBatchId,
        periodIndex: 0,
        facultyId: testFaculty.id,
        subject: 'Physics',
      };
      storage.saveTimetableForDay('Monday', [alloc], 'Draft');

      const batchDelRes = storage.deleteBatch(testBatchId);
      expect(batchDelRes.success).toBe(true);
      expect(batchDelRes.facultyUnassigned).toBe(1);

      // Verify batch removed from directory
      expect(storage.getBatches().some(b => b.id === testBatchId)).toBe(false);

      // Verify faculty restrictions cleaned
      const updatedFac = storage.getFaculty().find(f => f.id === testFaculty.id);
      expect(updatedFac?.assignedBatches).not.toContain(testBatchId);
      expect(updatedFac?.assignedBatches).toContain('batch_other');

      // Verify timetable allocations purged
      const monTT = storage.getTimetableForDay('Monday');
      expect(monTT?.allocations.some(a => a.batchId === testBatchId)).toBe(false);
    });
  });

  describe('Batch Edit & Teacher Overlap Validation (H6)', () => {
    it('detects teacher schedule overlaps when batch timings are modified', () => {
      const faculties: Faculty[] = [
        { id: 'fac_shared', name: 'Dr. Shared', subjects: ['Chemistry'] },
      ];

      const batchA: Batch = {
        id: 'batch_A',
        name: 'Batch A',
        building: 'Building 1',
        roomNumber: '101',
        yearCategory: 'First PU',
        periods: [
          { startTime: '08:30', endTime: '10:00' }, // Period 0
        ],
        subjects: [{ subject: 'Chemistry', count: 1 }],
      };

      const batchB: Batch = {
        id: 'batch_B',
        name: 'Batch B',
        building: 'Building 2',
        roomNumber: '102',
        yearCategory: 'Second PU',
        periods: [
          { startTime: '10:00', endTime: '11:30' }, // Initially non-overlapping Period 0
        ],
        subjects: [{ subject: 'Chemistry', count: 1 }],
      };

      // In stored Monday timetable, Dr. Shared teaches Batch A at P0 and Batch B at P0
      const week: WeekTimetables = {
        Monday: {
          id: 'tt_mon',
          date: 'Monday',
          allocations: [
            { batchId: 'batch_A', periodIndex: 0, facultyId: 'fac_shared', subject: 'Chemistry' },
            { batchId: 'batch_B', periodIndex: 0, facultyId: 'fac_shared', subject: 'Chemistry' },
          ],
          unfilledSlots: [],
          status: 'Draft',
        },
      };

      // Initially no overlap (08:30-10:00 vs 10:00-11:30)
      const initialOverlaps = checkTimetableOverlaps(week, [batchA, batchB], faculties);
      expect(initialOverlaps.length).toBe(0);

      // Edit Batch B timings to overlap with Batch A (e.g. shift to 09:30-11:00)
      const modifiedBatchB: Batch = {
        ...batchB,
        periods: [{ startTime: '09:30', endTime: '11:00' }],
      };

      const conflicts = checkTimetableOverlaps(week, [batchA, modifiedBatchB], faculties);
      expect(conflicts.length).toBe(1);
      expect(conflicts[0].facultyId).toBe('fac_shared');
      expect(conflicts[0].day).toBe('Monday');
      expect(conflicts[0].batch1Name).toBe('Batch A');
      expect(conflicts[0].batch2Name).toBe('Batch B');
    });
  });

  describe('Faculty Import Schema Validation (H7)', () => {
    it('accepts valid faculty records and generates missing ID', () => {
      const raw = {
        name: 'Albert Einstein',
        subjects: ['Physics', 'Mathematics'],
        maxPeriodsPerDay: 5,
        assignedBatches: ['batch_1'],
        isAbsent: false,
      };

      const result = validateFacultyRecord(raw, 0);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.faculty.name).toBe('Albert Einstein');
        expect(result.faculty.subjects).toEqual(['Physics', 'Mathematics']);
        expect(result.faculty.maxPeriodsPerDay).toBe(5);
        expect(result.faculty.id).toMatch(/^fac_/);
      }
    });

    it('rejects invalid records with descriptive errors', () => {
      // 1. Missing / empty name
      expect(validateFacultyRecord({ subjects: ['Math'] }).valid).toBe(false);
      expect(validateFacultyRecord({ name: '   ', subjects: ['Math'] }).valid).toBe(false);

      // 2. Missing / empty subjects
      expect(validateFacultyRecord({ name: 'Valid Name', subjects: [] }).valid).toBe(false);
      expect(validateFacultyRecord({ name: 'Valid Name', subjects: [''] }).valid).toBe(false);
      expect(validateFacultyRecord({ name: 'Valid Name' }).valid).toBe(false);

      // 3. Invalid maxPeriodsPerDay (not a positive integer)
      expect(validateFacultyRecord({ name: 'Valid', subjects: ['Bio'], maxPeriodsPerDay: -1 }).valid).toBe(false);
      expect(validateFacultyRecord({ name: 'Valid', subjects: ['Bio'], maxPeriodsPerDay: 0 }).valid).toBe(false);
      expect(validateFacultyRecord({ name: 'Valid', subjects: ['Bio'], maxPeriodsPerDay: 3.5 }).valid).toBe(false);
      expect(validateFacultyRecord({ name: 'Valid', subjects: ['Bio'], maxPeriodsPerDay: '4' }).valid).toBe(false);

      // 4. Invalid assignedBatches
      expect(validateFacultyRecord({ name: 'Valid', subjects: ['Bio'], assignedBatches: 'batch_1' }).valid).toBe(false);

      // 5. Invalid isAbsent
      expect(validateFacultyRecord({ name: 'Valid', subjects: ['Bio'], isAbsent: 'no' }).valid).toBe(false);
    });

    it('merges imported faculty by case-insensitive name and preserves existing timetable references', () => {
      const existing: Faculty = {
        id: 'fac_curie_id',
        name: 'Marie Curie',
        subjects: ['Physics'],
        maxPeriodsPerDay: 4,
      };
      storage.saveFaculty(existing);

      // Imported record matches case-insensitively with a new subject
      const importedRecord = {
        id: 'fac_new_random_id',
        name: 'marie curie',
        subjects: ['Chemistry'],
        maxPeriodsPerDay: 5,
      };

      const validation = validateFacultyRecord(importedRecord, 0);
      expect(validation.valid).toBe(true);

      if (validation.valid) {
        // Merge logic
        const currentFaculty = storage.getFaculty();
        const updated = [...currentFaculty];
        const matchIdx = updated.findIndex(
          f => f.id === validation.faculty.id || f.name.trim().toLowerCase() === validation.faculty.name.trim().toLowerCase()
        );
        expect(matchIdx).toBeGreaterThanOrEqual(0);

        const matched = updated[matchIdx];
        updated[matchIdx] = {
          ...matched,
          subjects: Array.from(new Set([...matched.subjects, ...validation.faculty.subjects])),
          maxPeriodsPerDay: validation.faculty.maxPeriodsPerDay,
        };
        storage.setFaculty(updated);

        const stored = storage.getFaculty().find(f => f.id === 'fac_curie_id');
        expect(stored?.subjects).toContain('Physics');
        expect(stored?.subjects).toContain('Chemistry');
        expect(stored?.maxPeriodsPerDay).toBe(5);
        // ID remains unchanged, preserving existing timetable references
        expect(stored?.id).toBe('fac_curie_id');
      }
    });
  });

  describe('Duplicate Faculty Profile Detection & Merging (M8)', () => {
    it('detects duplicate names VAISHNAVI and ASHWINI in seed data', () => {
      // Seed data should have 145 faculty members with 2 duplicate groups
      expect(initialFaculty.length).toBe(145);

      const nameMap = new Map<string, Faculty[]>();
      initialFaculty.forEach(f => {
        const norm = f.name.trim().toLowerCase();
        const list = nameMap.get(norm) || [];
        list.push(f);
        nameMap.set(norm, list);
      });

      const duplicateGroups = Array.from(nameMap.entries()).filter(([, list]) => list.length > 1);
      const duplicateNames = duplicateGroups.map(([name]) => name.toUpperCase());

      expect(duplicateNames).toContain('VAISHNAVI');
      expect(duplicateNames).toContain('ASHWINI');

      const vaishnaviEntries = duplicateGroups.find(([name]) => name.toUpperCase() === 'VAISHNAVI')?.[1];
      expect(vaishnaviEntries?.length).toBe(2);
      const vaishnaviSubjects = vaishnaviEntries?.flatMap(e => e.subjects);
      expect(vaishnaviSubjects).toContain('Biology');
      expect(vaishnaviSubjects).toContain('Mathematics');

      const ashwiniEntries = duplicateGroups.find(([name]) => name.toUpperCase() === 'ASHWINI')?.[1];
      expect(ashwiniEntries?.length).toBe(2);
      const ashwiniSubjects = ashwiniEntries?.flatMap(e => e.subjects);
      expect(ashwiniSubjects).toContain('Chemistry');
      expect(ashwiniSubjects).toContain('Physics');
    });

    it('unifies subjects and re-links stored allocations on storage.mergeFaculty', () => {
      const fac1: Faculty = {
        id: 'fac_v1',
        name: 'VAISHNAVI',
        subjects: ['Biology'],
      };
      const fac2: Faculty = {
        id: 'fac_v2',
        name: 'VAISHNAVI',
        subjects: ['Mathematics'],
      };
      storage.saveFaculty(fac1);
      storage.saveFaculty(fac2);

      // fac2 is allocated on Monday
      const alloc: Allocation = {
        batchId: 'batch_m1',
        periodIndex: 1,
        facultyId: 'fac_v2',
        subject: 'Mathematics',
      };
      storage.saveTimetableForDay('Monday', [alloc], 'Draft');

      // Merge fac2 into fac1
      const mergeRes = storage.mergeFaculty('fac_v1', ['fac_v2']);
      expect(mergeRes.success).toBe(true);
      expect(mergeRes.mergedFaculty?.subjects).toContain('Biology');
      expect(mergeRes.mergedFaculty?.subjects).toContain('Mathematics');

      // fac2 is removed
      const allFaculty = storage.getFaculty();
      expect(allFaculty.some(f => f.id === 'fac_v2')).toBe(false);

      // Stored allocation on Monday is re-pointed to fac1
      const monTT = storage.getTimetableForDay('Monday');
      const updatedAlloc = monTT?.allocations.find(a => a.batchId === 'batch_m1');
      expect(updatedAlloc?.facultyId).toBe('fac_v1');
    });
  });
});
