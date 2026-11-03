import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  storage,
  safeStorage,
  SCHEMA_VERSION,
  setStorageWarningCallback,
  invalidateStorageCaches,
  KEYS,
} from '../utils/storage';
import type { Faculty, Batch, BackupData, Allocation, SchedulerSettings } from '../types';

describe('Storage & Data Integrity', () => {
  beforeEach(() => {
    storage.resetAll();
    safeStorage.resetAvailabilityCheck();
    setStorageWarningCallback(null);
  });

  describe('Write then Read Back (Persistence Verification)', () => {
    it('writes and reads back faculty records', () => {
      const newFaculty: Faculty = {
        id: 'fac_persist_1',
        name: 'Dr. Katherine Johnson',
        subjects: ['Mathematics', 'Physics'],
        maxPeriodsPerDay: 3,
        assignedBatches: ['batch_1'],
      };
      storage.saveFaculty(newFaculty);

      const facultyList = storage.getFaculty();
      const retrieved = facultyList.find(f => f.id === newFaculty.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Dr. Katherine Johnson');
      expect(retrieved?.subjects).toContain('Mathematics');
      expect(retrieved?.maxPeriodsPerDay).toBe(3);
    });

    it('writes and reads back batch records', () => {
      const newBatch: Batch = {
        id: 'batch_persist_1',
        building: 'Building 2',
        yearCategory: 'Second PU',
        name: 'Batch Epsilon',
        roomNumber: '404',
        periods: [
          { startTime: '08:30', endTime: '10:00' },
          { startTime: '10:15', endTime: '11:45' },
        ],
        subjects: [{ subject: 'Physics', count: 2, category: 'Core' }],
      };
      storage.saveBatch(newBatch);

      const batchList = storage.getBatches();
      const retrieved = batchList.find(b => b.id === newBatch.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Batch Epsilon');
      expect(retrieved?.roomNumber).toBe('404');
      expect(retrieved?.periods.length).toBe(2);
    });

    it('writes and reads back scheduler settings', () => {
      const customSettings: SchedulerSettings = {
        pcmbWeight: 75,
        languageWeight: 25,
        maxDailyPeriods: 5,
        weekStartDay: 'Sunday',
        enableGapOptimization: false,
        enableConsecutivePeriodAvoidance: true,
        enableStrictPeriod1NoLanguage: true,
      };
      storage.setSettings(customSettings);

      const retrieved = storage.getSettings();
      expect(retrieved.pcmbWeight).toBe(75);
      expect(retrieved.languageWeight).toBe(25);
      expect(retrieved.maxDailyPeriods).toBe(5);
      expect(retrieved.weekStartDay).toBe('Sunday');
      expect(retrieved.enableGapOptimization).toBe(false);
    });

    it('writes and reads back day timetable allocations', () => {
      const allocations: Allocation[] = [
        {
          batchId: 'batch_alpha',
          periodIndex: 0,
          facultyId: 'fac_101',
          subject: 'Physics',
          frozen: true,
        },
        {
          batchId: 'batch_alpha',
          periodIndex: 1,
          facultyId: 'fac_102',
          subject: 'Chemistry',
          manualEdited: true,
        },
      ];

      storage.saveTimetableForDay('Monday', allocations, 'Draft');

      const mondayTT = storage.getTimetableForDay('Monday');
      expect(mondayTT).not.toBeNull();
      expect(mondayTT?.status).toBe('Draft');
      expect(mondayTT?.allocations.length).toBe(2);
      expect(mondayTT?.allocations[0].facultyId).toBe('fac_101');
      expect(mondayTT?.allocations[0].frozen).toBe(true);
      expect(mondayTT?.allocations[1].facultyId).toBe('fac_102');
      expect(mondayTT?.allocations[1].manualEdited).toBe(true);
    });
  });

  describe('Fallback Path When localStorage Throws', () => {
    it('falls back to memory store when setItem throws and fires warning callback', () => {
      const warningSpy = vi.fn();
      setStorageWarningCallback(warningSpy);

      // Mock localStorage to simulate quota exceeded on data write (test succeeds, write fails)
      const mockStorage = {
        getItem: vi.fn().mockImplementation((k: string) => (k === '__storage_test__' ? '__storage_test__' : null)),
        setItem: vi.fn().mockImplementation((k: string) => {
          if (k === '__storage_test__') return;
          throw new Error('QuotaExceededError');
        }),
        removeItem: vi.fn(),
      };

      const originalWindow = globalThis.window;
      try {
        // @ts-expect-error Mocking window.localStorage for test
        globalThis.window = { localStorage: mockStorage };
        safeStorage.resetAvailabilityCheck();

        // Writing should not throw
        expect(() => {
          safeStorage.setItem('resilient_key', 'in_memory_value');
        }).not.toThrow();

        // Read back from memory fallback succeeds
        expect(safeStorage.getItem('resilient_key')).toBe('in_memory_value');

        // Warning callback was triggered
        expect(warningSpy).toHaveBeenCalledTimes(1);
        expect(warningSpy.mock.calls[0][0]).toContain('Failed to write to persistent storage');
      } finally {
        globalThis.window = originalWindow;
        safeStorage.resetAvailabilityCheck();
      }
    });

    it('falls back to memory store when initial testLocalStorage throws', () => {
      const warningSpy = vi.fn();
      setStorageWarningCallback(warningSpy);

      const mockStorage = {
        getItem: vi.fn(),
        setItem: vi.fn().mockImplementation(() => {
          throw new Error('SecurityError: Access denied');
        }),
        removeItem: vi.fn(),
      };

      const originalWindow = globalThis.window;
      try {
        // @ts-expect-error Mocking window.localStorage
        globalThis.window = { localStorage: mockStorage };
        safeStorage.resetAvailabilityCheck();

        // Attempting to get or set should safely use memory fallback
        safeStorage.setItem('sec_test', 'persists_in_memory');
        expect(safeStorage.getItem('sec_test')).toBe('persists_in_memory');
        expect(warningSpy).toHaveBeenCalled();
        expect(warningSpy.mock.calls[0][0]).toContain('Persistent storage is unavailable');
      } finally {
        globalThis.window = originalWindow;
        safeStorage.resetAvailabilityCheck();
      }
    });
  });

  describe('Write-Through In-Memory Caching', () => {
    it('does not re-parse the whole week for repeated single-day reads', () => {
      // First save Monday's timetable
      storage.saveTimetableForDay(
        'Monday',
        [{ batchId: 'b1', periodIndex: 0, facultyId: 'f1', subject: 'Physics' }],
        'Draft'
      );

      // Invalidate cache to establish baseline
      invalidateStorageCaches();

      const getItemSpy = vi.spyOn(safeStorage, 'getItem');

      // First single-day read populates weekTimetablesCache
      const monday = storage.getTimetableForDay('Monday');
      expect(monday).not.toBeNull();
      const initialCalls = getItemSpy.mock.calls.filter(c => c[0] === KEYS.WEEK).length;
      expect(initialCalls).toBe(1);

      // Reading other days re-uses the in-memory weekTimetablesCache
      storage.getTimetableForDay('Tuesday');
      storage.getTimetableForDay('Wednesday');
      storage.getTimetableForDay('Friday');

      const afterCalls = getItemSpy.mock.calls.filter(c => c[0] === KEYS.WEEK).length;
      expect(afterCalls).toBe(1); // Still exactly 1 call! No redundant re-parsing

      getItemSpy.mockRestore();
    });

    it('writes through to cache on saveTimetableForDay so immediate read hits cache', () => {
      const updated = storage.saveTimetableForDay(
        'Thursday',
        [{ batchId: 'b2', periodIndex: 1, facultyId: 'f2', subject: 'Chemistry' }],
        'Finalized'
      );
      expect(updated?.status).toBe('Finalized');

      const getItemSpy = vi.spyOn(safeStorage, 'getItem');
      const thursday = storage.getTimetableForDay('Thursday');
      expect(thursday?.status).toBe('Finalized');

      // Should not need to read from safeStorage.getItem(KEYS.WEEK) because it hit cache
      const calls = getItemSpy.mock.calls.filter(c => c[0] === KEYS.WEEK).length;
      expect(calls).toBe(0);

      getItemSpy.mockRestore();
    });
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

    it('migrates legacy isAbsent: true to all weekdays in schema version 3 (M3)', () => {
      const legacyFaculty = [
        {
          id: 'fac_legacy_absent',
          name: 'Prof. Legacy Absent',
          subjects: ['Physics'],
          maxPeriodsPerDay: 4,
          isAbsent: true,
        },
        {
          id: 'fac_legacy_present',
          name: 'Prof. Legacy Present',
          subjects: ['Chemistry'],
          maxPeriodsPerDay: 4,
          isAbsent: false,
        },
      ];

      safeStorage.setItem(KEYS.FACULTY, JSON.stringify(legacyFaculty));
      safeStorage.setItem('sdtg_schema_version', '2');

      storage.migrateSchema(2);

      expect(Number(safeStorage.getItem('sdtg_schema_version'))).toBe(SCHEMA_VERSION);

      const faculties = storage.getFaculty();
      const absentProf = faculties.find(f => f.id === 'fac_legacy_absent');
      const presentProf = faculties.find(f => f.id === 'fac_legacy_present');

      expect(absentProf).toBeDefined();
      expect(absentProf?.isAbsent).toBe(true);
      expect(absentProf?.absentDays).toEqual([
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ]);

      expect(presentProf).toBeDefined();
      expect(presentProf?.isAbsent).toBe(false);
      expect(presentProf?.absentDays).toEqual([]);
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

      // Verify timetable turned affected slot into unfilled shortage slot (H6)
      const mondayTT = storage.getTimetableForDay('Monday');
      const alloc = mondayTT?.allocations.find(a => a.batchId === 'batch_test');
      expect(alloc).toBeUndefined();
      const unfilled = mondayTT?.unfilledSlots?.find(u => u.batchId === 'batch_test');
      expect(unfilled).toBeDefined();
      expect(unfilled?.reason).toBe('NO_QUALIFIED_TEACHER');
      expect(unfilled?.requiredSubject).toBe('Physics');
      expect(unfilled?.periodIndex).toBe(0);
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
