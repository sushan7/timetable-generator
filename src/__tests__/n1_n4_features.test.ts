import { describe, it, expect, beforeEach } from 'vitest';
import type { Faculty, Batch, Allocation, BackupData } from '../types';
import { storage, defaultSettings } from '../utils/storage';
import { calculateDetailedCapacityAnalysis, scoreAssignment } from '../utils/scheduler';
import { generateDayValidationReport } from '../utils/validationReport';

describe('Features N1 to N4: Backup/Restore, Capacity Pre-Check & Validation Report', () => {
  beforeEach(() => {
    storage.initialize();
  });

  // -------------------------------------------------------------
  // N1: BACKUP AND RESTORE
  // -------------------------------------------------------------
  describe('N1: System Backup and Restoration', () => {
    it('creates a complete versioned backup snapshot and validates its schema', () => {
      const backup = storage.createFullBackup();

      expect(backup).toBeDefined();
      expect(backup.version).toBeGreaterThanOrEqual(1);
      expect(backup.exportedAt).toBeGreaterThan(0);
      expect(Array.isArray(backup.faculty)).toBe(true);
      expect(backup.faculty.length).toBeGreaterThan(0);
      expect(Array.isArray(backup.batches)).toBe(true);
      expect(backup.batches.length).toBeGreaterThan(0);
      expect(backup.settings).toBeDefined();
      expect(backup.weekTimetables).toBeDefined();

      // Schema validation passes
      const validation = storage.validateBackup(backup);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.data).toBeDefined();
    });

    it('performs full round-trip export, serialization, and restoration in replace mode', () => {
      // 1. Export backup
      const exported = storage.exportAllData();
      const jsonString = JSON.stringify(exported);

      // 2. Modify active working state
      const modifiedFaculty = [{ id: 'fac-temp-1', name: 'Temporary Instructor', subjects: ['Physics'] }];
      storage.setFaculty(modifiedFaculty);
      expect(storage.getFaculty()).toHaveLength(1);

      // 3. Parse JSON and validate
      const parsed = JSON.parse(jsonString);
      const validation = storage.validateBackup(parsed);
      expect(validation.valid).toBe(true);

      // 4. Restore in replace mode
      const restoreResult = storage.restoreFromBackup(validation.data!, 'replace');
      expect(restoreResult.success).toBe(true);
      expect(restoreResult.stats.faculty).toBe(exported.faculty.length);
      expect(restoreResult.stats.batches).toBe(exported.batches.length);

      // 5. Verify restored state matches original exported state
      const restoredFaculty = storage.getFaculty();
      expect(restoredFaculty.length).toBe(exported.faculty.length);
      expect(restoredFaculty[0].id).toBe(exported.faculty[0].id);
    });

    it('merges unique incoming records without destroying existing state in merge mode', () => {
      const existingFacCount = storage.getFaculty().length;
      const customBackup: BackupData = {
        version: 4,
        exportedAt: Date.now(),
        faculty: [
          {
            id: 'fac-unique-merge-99',
            name: 'Dr. Unique Merge',
            subjects: ['Mathematics'],
            maxPeriodsPerDay: 4,
          },
        ],
        batches: [
          {
            id: 'batch-unique-merge-99',
            name: 'Unique Batch 99',
            building: 'Building 1',
            roomNumber: '999',
            yearCategory: 'First PU',
            subjects: [{ subject: 'Mathematics', count: 4, category: 'Core' }],
            periods: [{ startTime: '08:30', endTime: '09:30' }],
          },
        ],
        settings: defaultSettings,
        weekTimetables: {},
        auditLogs: [],
      };

      const result = storage.restoreFromBackup(customBackup, 'merge');
      expect(result.success).toBe(true);

      const allFaculty = storage.getFaculty();
      expect(allFaculty.length).toBe(existingFacCount + 1);
      expect(allFaculty.some(f => f.id === 'fac-unique-merge-99')).toBe(true);

      const allBatches = storage.getBatches();
      expect(allBatches.some(b => b.id === 'batch-unique-merge-99')).toBe(true);
    });

    it('rejects invalid or corrupted backups with descriptive error messages', () => {
      // Missing version
      expect(storage.validateBackup({ faculty: [], batches: [] }).valid).toBe(false);

      // Non-array faculty
      const invalidFaculty = storage.validateBackup({
        version: 4,
        faculty: 'not-an-array',
        batches: [],
        settings: {},
        weekTimetables: {},
      });
      expect(invalidFaculty.valid).toBe(false);
      expect(invalidFaculty.errors.some(e => e.includes('faculty list'))).toBe(true);

      // Faculty item missing name
      const invalidFacultyItem = storage.validateBackup({
        version: 4,
        faculty: [{ id: 'fac-1', subjects: ['Physics'] }],
        batches: [],
        settings: {},
        weekTimetables: {},
      });
      expect(invalidFacultyItem.valid).toBe(false);
      expect(invalidFacultyItem.errors.some(e => e.includes('missing or empty name'))).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // N2: CAPACITY PRE-CHECK & TEACHER LOAD FAIRNESS
  // -------------------------------------------------------------
  describe('N2: Capacity Pre-Check and Weekly Load Fairness', () => {
    const testBatches: Batch[] = [
      {
        id: 'b-1',
        name: 'Batch 1',
        building: 'Building 1',
        roomNumber: '101',
        yearCategory: 'First PU',
        subjects: [
          { subject: 'English', count: 6, category: 'Language' },
          { subject: 'Physics', count: 4, category: 'Core' },
        ],
        periods: [
          { startTime: '08:30', endTime: '09:30' },
          { startTime: '09:30', endTime: '10:30' },
        ],
      },
      {
        id: 'b-2',
        name: 'Batch 2',
        building: 'Building 1',
        roomNumber: '102',
        yearCategory: 'First PU',
        subjects: [
          { subject: 'English', count: 6, category: 'Language' },
          { subject: 'Physics', count: 4, category: 'Core' },
        ],
        periods: [
          { startTime: '08:30', endTime: '09:30' },
          { startTime: '09:30', endTime: '10:30' },
        ],
      },
    ];

    const testFaculties: Faculty[] = [
      {
        id: 'f-eng-1',
        name: 'English Teacher 1',
        subjects: ['English'],
        maxPeriodsPerDay: 2, // Weekly max: 2 * 6 = 12
        isAbsent: false,
      },
      {
        id: 'f-eng-2',
        name: 'English Teacher 2 (Alternate)',
        subjects: ['English'],
        maxPeriodsPerDay: 2, // Weekly max: 2 * 6 = 12
        isAbsent: false,
      },
      {
        id: 'f-phy-1',
        name: 'Physics Teacher',
        subjects: ['Physics'],
        maxPeriodsPerDay: 1, // Weekly max: 1 * 6 = 6. But required is 8 periods! Deficit = 2
        isAbsent: false,
      },
    ];

    it('calculates subject demand vs supply and flags subject shortages (deficits)', () => {
      const report = calculateDetailedCapacityAnalysis(testBatches, testFaculties, defaultSettings, []);

      // Physics needs 5 periods per batch across 6 days = 10 periods.
      // Physics teacher provides 1 period/day * 6 days = 6 periods.
      // Expected deficit: 10 - 6 = 4 periods
      const phyReport = report.subjects.find(s => s.subject === 'Physics');
      expect(phyReport).toBeDefined();
      expect(phyReport?.deficit).toBe(4);
      expect(phyReport?.status).toBe('deficit');
      expect(report.hasCapacityIssues).toBe(true);

      // English needs 6 periods * 2 batches = 12 periods.
      // 2 English teachers provide 2 * 2 * 6 = 24 periods capacity. Surplus!
      const engReport = report.subjects.find(s => s.subject === 'English');
      expect(engReport).toBeDefined();
      expect(engReport?.status).toBe('surplus');
    });

    it('identifies overloaded and near-capacity teachers based on weekly assignments', () => {
      // Simulate that English Teacher 1 was already assigned 13 periods (exceeding weekly limit of 12)
      const weekAllocations: Allocation[] = Array.from({ length: 13 }).map((_, idx) => ({
        batchId: 'b-1',
        periodIndex: idx % 2,
        facultyId: 'f-eng-1',
        subject: 'English',
      }));

      const report = calculateDetailedCapacityAnalysis(testBatches, testFaculties, defaultSettings, weekAllocations);

      const overloadedEng1 = report.overloadedTeachers.find(t => t.facultyId === 'f-eng-1');
      expect(overloadedEng1).toBeDefined();
      expect(overloadedEng1?.isOverloaded).toBe(true);
      expect(overloadedEng1?.assignedPeriods).toBe(13);
      expect(overloadedEng1?.weeklyLimit).toBe(12);
      expect(overloadedEng1?.status).toBe('overloaded');

      // English Teacher 2 has 0 periods -> not overloaded
      const eng2 = report.allTeacherLoads.find(t => t.facultyId === 'f-eng-2');
      expect(eng2?.isOverloaded).toBe(false);
      expect(eng2?.status).toBe('normal');
    });

    it('applies weekly load fairness penalty so alternate teachers with lower load are preferred', () => {
      // English Teacher 1 already has 12 periods this week
      // English Teacher 2 has 2 periods this week
      const priorWeekAllocations: Allocation[] = [
        ...Array.from({ length: 12 }).map(() => ({
          batchId: 'b-1',
          periodIndex: 0,
          facultyId: 'f-eng-1',
          subject: 'English',
        })),
        ...Array.from({ length: 2 }).map(() => ({
          batchId: 'b-1',
          periodIndex: 0,
          facultyId: 'f-eng-2',
          subject: 'English',
        })),
      ];

      // Score assignment for Teacher 1 (high weekly load)
      const score1 = scoreAssignment({
        batch: testBatches[0],
        periodIndex: 0,
        subject: 'English',
        faculty: testFaculties[0], // f-eng-1
        todayAllocations: [],
        weekAllocations: priorWeekAllocations,
        targetWeeklyQuotas: { English: 6 },
        dailyWorkload: {},
        settings: defaultSettings,
        isKHSGroupSlot: false,
      });

      // Score assignment for Teacher 2 (alternate with low weekly load)
      const score2 = scoreAssignment({
        batch: testBatches[0],
        periodIndex: 0,
        subject: 'English',
        faculty: testFaculties[1], // f-eng-2
        todayAllocations: [],
        weekAllocations: priorWeekAllocations,
        targetWeeklyQuotas: { English: 6 },
        dailyWorkload: {},
        settings: defaultSettings,
        isKHSGroupSlot: false,
      });

      // Teacher 2 must score significantly higher due to weekly load fairness penalty on Teacher 1
      expect(score2.score).toBeGreaterThan(score1.score);
      expect(score1.reasons.some(r => r.includes('Weekly load fairness penalty'))).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // N3: VALIDATION REPORT
  // -------------------------------------------------------------
  describe('N3: Timetable Validation Report', () => {
    const sampleBatchA: Batch = {
      id: 'batch-va-1',
      name: 'Batch A',
      building: 'Building 1',
      roomNumber: '101',
      yearCategory: 'First PU',
      subjects: [{ subject: 'Physics', count: 4, category: 'Core' }],
      periods: [
        { startTime: '08:30', endTime: '09:30' },
        { startTime: '09:30', endTime: '10:30' },
      ],
    };

    const sampleBatchB: Batch = {
      id: 'batch-va-2',
      name: 'Batch B',
      building: 'Building 1',
      roomNumber: '101', // Same room 101 as Batch A!
      yearCategory: 'First PU',
      subjects: [{ subject: 'Chemistry', count: 4, category: 'Core' }],
      periods: [
        { startTime: '08:30', endTime: '09:30' }, // Overlaps with Batch A period 0!
        { startTime: '09:30', endTime: '10:30' },
      ],
    };

    const sampleFaculties: Faculty[] = [
      {
        id: 'fac-overlap-1',
        name: 'Dr. Busy Teacher',
        subjects: ['Physics', 'Chemistry'],
        maxPeriodsPerDay: 1, // Daily cap is 1
        isAbsent: false,
      },
      {
        id: 'fac-absent-1',
        name: 'Prof. On Leave',
        subjects: ['Physics'],
        maxPeriodsPerDay: 4,
        isAbsent: true,
        absentDays: ['Monday'],
      },
    ];

    it('returns clean report with 0 issues on an ideal compliant schedule', () => {
      const compliantBatches: Batch[] = [
        {
          id: 'batch-ok',
          name: 'Batch Compliant',
          building: 'Building 1',
          roomNumber: '202',
          yearCategory: 'First PU',
          subjects: [{ subject: 'Physics', count: 1, category: 'Core' }],
          periods: [{ startTime: '08:30', endTime: '09:30' }],
        },
      ];
      const compliantAllocs: Allocation[] = [
        {
          batchId: 'batch-ok',
          periodIndex: 0,
          facultyId: 'fac-overlap-1',
          subject: 'Physics',
        },
      ];

      const report = generateDayValidationReport(
        'Monday',
        compliantAllocs,
        compliantBatches,
        sampleFaculties,
        defaultSettings
      );

      expect(report.isValid).toBe(true);
      expect(report.summary.totalIssues).toBe(0);
      expect(report.summary.overlaps).toBe(0);
      expect(report.summary.overLimit).toBe(0);
      expect(report.summary.absent).toBe(0);
      expect(report.summary.roomClashes).toBe(0);
      expect(report.summary.unfilled).toBe(0);
    });

    it('detects teacher time overlap when instructor is scheduled in 2 batches simultaneously', () => {
      const overlappingAllocs: Allocation[] = [
        {
          batchId: 'batch-va-1',
          periodIndex: 0, // 08:30 - 09:30
          facultyId: 'fac-overlap-1',
          subject: 'Physics',
        },
        {
          batchId: 'batch-va-2',
          periodIndex: 0, // 08:30 - 09:30 overlapping!
          facultyId: 'fac-overlap-1',
          subject: 'Chemistry',
        },
      ];

      const report = generateDayValidationReport(
        'Monday',
        overlappingAllocs,
        [sampleBatchA, sampleBatchB],
        sampleFaculties,
        defaultSettings
      );

      expect(report.isValid).toBe(false);
      expect(report.summary.overlaps).toBeGreaterThanOrEqual(1);

      const overlapViolation = report.violations.find(v => v.type === 'overlap');
      expect(overlapViolation).toBeDefined();
      expect(overlapViolation?.facultyId).toBe('fac-overlap-1');
      expect(overlapViolation?.severity).toBe('error');
    });

    it('detects daily load limit exceedance when assigned periods exceed teacher daily limit', () => {
      // fac-overlap-1 has maxPeriodsPerDay = 1. Assigning 2 periods in same batch:
      const overLimitAllocs: Allocation[] = [
        {
          batchId: 'batch-va-1',
          periodIndex: 0, // 08:30 - 09:30
          facultyId: 'fac-overlap-1',
          subject: 'Physics',
        },
        {
          batchId: 'batch-va-1',
          periodIndex: 1, // 09:30 - 10:30 (sequential, no time overlap)
          facultyId: 'fac-overlap-1',
          subject: 'Physics',
        },
      ];

      const report = generateDayValidationReport(
        'Monday',
        overLimitAllocs,
        [sampleBatchA],
        sampleFaculties,
        defaultSettings
      );

      expect(report.isValid).toBe(false);
      expect(report.summary.overLimit).toBe(1);

      const overLimitViolation = report.violations.find(v => v.type === 'over_limit');
      expect(overLimitViolation).toBeDefined();
      expect(overLimitViolation?.description).toContain('Daily limit exceeded');
    });

    it('detects assignment of absent instructors on their leave days', () => {
      // fac-absent-1 is marked absent on Monday
      const absentAllocs: Allocation[] = [
        {
          batchId: 'batch-va-1',
          periodIndex: 0,
          facultyId: 'fac-absent-1',
          subject: 'Physics',
        },
      ];

      const report = generateDayValidationReport(
        'Monday',
        absentAllocs,
        [sampleBatchA],
        sampleFaculties,
        defaultSettings
      );

      expect(report.isValid).toBe(false);
      expect(report.summary.absent).toBe(1);

      const absentViolation = report.violations.find(v => v.type === 'absent');
      expect(absentViolation).toBeDefined();
      expect(absentViolation?.facultyId).toBe('fac-absent-1');
      expect(absentViolation?.description).toContain('marked absent on Monday');
    });

    it('detects room clashes when multiple batches occupy the same room at the same time', () => {
      // sampleBatchA and sampleBatchB both occupy Room 101 at 08:30 - 09:30
      const roomClashAllocs: Allocation[] = [
        {
          batchId: 'batch-va-1',
          periodIndex: 0,
          facultyId: 'fac-overlap-1',
          subject: 'Physics',
        },
        {
          batchId: 'batch-va-2',
          periodIndex: 0,
          facultyId: 'fac-absent-1',
          subject: 'Chemistry',
        },
      ];

      const report = generateDayValidationReport(
        'Monday',
        roomClashAllocs,
        [sampleBatchA, sampleBatchB],
        sampleFaculties,
        defaultSettings
      );

      expect(report.summary.roomClashes).toBeGreaterThanOrEqual(1);
      const roomViolation = report.violations.find(v => v.type === 'room_clash');
      expect(roomViolation).toBeDefined();
      expect(roomViolation?.roomNumber).toBe('101');
      expect(roomViolation?.description).toContain('Room 101 is simultaneously booked');
    });

    it('flags unfilled slots as warnings with exact batch and period coordinates', () => {
      // sampleBatchA has 2 periods, but 0 allocations provided
      const report = generateDayValidationReport(
        'Monday',
        [],
        [sampleBatchA],
        sampleFaculties,
        defaultSettings
      );

      expect(report.summary.unfilled).toBe(2);
      expect(report.violations.filter(v => v.type === 'unfilled')).toHaveLength(2);

      const unfilledViolation = report.violations.find(v => v.type === 'unfilled');
      expect(unfilledViolation?.batchId).toBe('batch-va-1');
      expect(unfilledViolation?.periodIndex).toBe(0);
      expect(unfilledViolation?.severity).toBe('warning');
    });
  });
});
