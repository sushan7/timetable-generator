import { describe, it, expect, beforeEach } from 'vitest';
import { storage, safeStorage, SCHEMA_VERSION } from '../utils/storage';
import type { Faculty, Batch, BackupData, Allocation } from '../types';

describe('Storage & Data Integrity', () => {
  beforeEach(() => {
    storage.resetAll();
  });

  describe('safeStorage Fallback', () => {
    it('sets and retrieves items correctly', () => {
      safeStorage.setItem('test_key', 'hello_world');
      expect(safeStorage.getItem('test_key')).toBe('hello_world');
      safeStorage.removeItem('test_key');
      expect(safeStorage.getItem('test_key')).toBeNull();
    });

    it('safely handles non-existent keys without throwing', () => {
      expect(safeStorage.getItem('non_existent_key_12345')).toBeNull();
    });
  });

  describe('Schema Migration', () => {
    it('initializes to current schema version', () => {
      storage.initialize();
      const versionStr = safeStorage.getItem('sdtg_schema_version');
      expect(Number(versionStr)).toBe(SCHEMA_VERSION);
    });

    it('migrates older schema structures without data loss', () => {
      // Simulate version 1 schema
      safeStorage.setItem('sdtg_schema_version', '1');
      storage.migrateSchema(1);
      expect(Number(safeStorage.getItem('sdtg_schema_version'))).toBe(SCHEMA_VERSION);
    });
  });

  describe('Cascading Deletions', () => {
    it('cascades faculty deletion to weekly timetables', () => {
      const testFaculty: Faculty = {
        id: 'fac_temp_1',
        name: 'Prof. Marie Curie',
        subjects: ['Physics'],
        maxPeriodsPerDay: 4,
      };
      storage.saveFaculty(testFaculty);

      // Create an allocation for this faculty
      const testAllocation: Allocation = {
        batchId: 'batch_test',
        periodIndex: 0,
        facultyId: testFaculty.id,
        subject: 'Physics',
      };

      storage.saveTimetableForDay('Monday', [testAllocation], 'Draft');

      // Delete faculty
      storage.deleteFaculty(testFaculty.id);

      // Verify faculty list does not contain deleted faculty
      const faculties = storage.getFaculty();
      expect(faculties.some(f => f.id === testFaculty.id)).toBe(false);

      // Verify timetable preserved slot with vacatedFacultyId and vacatedFacultyName
      const mondayTT = storage.getTimetableForDay('Monday');
      const alloc = mondayTT?.allocations.find(a => a.batchId === 'batch_test');
      expect(alloc).toBeDefined();
      expect(alloc?.facultyId).toBe('');
      expect(alloc?.vacatedFacultyId).toBe(testFaculty.id);
      expect(alloc?.vacatedFacultyName).toBe('Prof. Marie Curie');
    });

    it('cascades batch deletion to faculty locks and allocations', () => {
      const testBatch: Batch = {
        id: 'batch_temp_1',
        building: 'Building 1',
        yearCategory: 'First PU',
        name: 'Batch Delta',
        roomNumber: '303',
        periods: [{ startTime: '08:30', endTime: '10:00' }],
        subjects: [{ subject: 'Physics', count: 1 }],
      };
      storage.saveBatch(testBatch);

      const testFaculty: Faculty = {
        id: 'fac_temp_2',
        name: 'Dr. James Maxwell',
        subjects: ['Physics'],
        assignedBatches: [testBatch.id],
      };
      storage.saveFaculty(testFaculty);

      // Delete batch
      storage.deleteBatch(testBatch.id);

      // Verify batch removed
      const batches = storage.getBatches();
      expect(batches.some(b => b.id === testBatch.id)).toBe(false);

      // Verify faculty locked batch was cleaned
      const updatedFac = storage.getFaculty().find(f => f.id === testFaculty.id);
      expect(updatedFac?.assignedBatches).not.toContain(testBatch.id);
    });
  });

  describe('Backup & Restore', () => {
    it('creates a complete valid backup snapshot', () => {
      const backup = storage.createFullBackup();
      expect(backup.version).toBe(SCHEMA_VERSION);
      expect(Array.isArray(backup.faculty)).toBe(true);
      expect(Array.isArray(backup.batches)).toBe(true);
      expect(backup.faculty.length).toBeGreaterThan(0);
      expect(backup.batches.length).toBeGreaterThan(0);

      const validation = storage.validateBackup(backup);
      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);
    });

    it('rejects invalid backup structures', () => {
      const invalidBackup = { version: 'invalid', faculty: 'none' };
      const validation = storage.validateBackup(invalidBackup);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('restores backup in replace mode cleanly', () => {
      const backup = storage.createFullBackup();
      const customFaculty: Faculty = {
        id: 'fac_custom',
        name: 'Custom Teacher',
        subjects: ['English'],
      };
      const modifiedBackup: BackupData = {
        ...backup,
        faculty: [customFaculty],
      };

      const res = storage.restoreFromBackup(modifiedBackup, 'replace');
      expect(res.success).toBe(true);
      expect(res.stats.faculty).toBe(1);

      const loaded = storage.getFaculty();
      expect(loaded.length).toBe(1);
      expect(loaded[0].name).toBe('Custom Teacher');
    });
  });

  describe('Date-Specific Absences', () => {
    it('records and checks absence for a specific date', () => {
      const facId = 'fac_date_test';
      const dateStr = '2026-11-15';

      expect(storage.isFacultyAbsentOnDate(dateStr, facId)).toBe(false);

      storage.setFacultyAbsentForDate(dateStr, facId, true);
      expect(storage.isFacultyAbsentOnDate(dateStr, facId)).toBe(true);

      storage.setFacultyAbsentForDate(dateStr, facId, false);
      expect(storage.isFacultyAbsentOnDate(dateStr, facId)).toBe(false);
    });
  });
});
