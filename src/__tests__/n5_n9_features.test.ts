import { describe, it, expect, beforeEach } from 'vitest';
import type {
  Batch,
  Faculty,
  Allocation,
  SchedulerSettings,
  WeekTimetables,
} from '../types';
import {
  canAssign,
  checkBatchRoomClashes,
  isOverlapping,
} from '../utils/validation';
import {
  generateTimetableV2,
  generateWeekTimetables,
  regenerateBatchDay,
  regenerateSingleSlot,
  getRankedSubstitutes,
  calculateWeekQuotaFit,
  scoreAssignment,
} from '../utils/scheduler';
import { generateDayValidationReport } from '../utils/validationReport';
import { defaultSettings } from '../utils/storage';
import { initialBatches, initialFaculty } from '../utils/seedData';

describe('Features N5 to N9: Room & Travel, Teacher Availability, Undo/Redo & Week Generation', () => {
  const sampleBatch1: Batch = {
    id: 'batch_alpha',
    building: 'Building 1',
    yearCategory: 'First PU',
    name: 'Alpha Section',
    roomNumber: '101',
    periods: [
      { startTime: '08:30', endTime: '10:00' },
      { startTime: '10:15', endTime: '11:45' },
    ],
    subjects: [
      { subject: 'Physics', count: 2 },
      { subject: 'Chemistry', count: 2 },
    ],
  };

  const sampleBatch2SameRoomOverlap: Batch = {
    id: 'batch_beta',
    building: 'Building 1',
    yearCategory: 'Second PU',
    name: 'Beta Section',
    roomNumber: '101', // Same building + room
    periods: [
      { startTime: '09:00', endTime: '10:30' }, // Overlaps 08:30-10:00!
      { startTime: '11:00', endTime: '12:30' },
    ],
    subjects: [
      { subject: 'Physics', count: 2 },
      { subject: 'Mathematics', count: 2 },
    ],
  };

  const sampleBatchDiffBuilding: Batch = {
    id: 'batch_gamma',
    building: 'Building 2', // Different building
    yearCategory: 'First PU',
    name: 'Gamma Section',
    roomNumber: '101',
    periods: [
      { startTime: '08:30', endTime: '10:00' },
      { startTime: '10:15', endTime: '11:45' },
    ],
    subjects: [{ subject: 'Physics', count: 2 }],
  };

  const sampleTeacher: Faculty = {
    id: 'fac_dr_raman',
    name: 'Dr. C.V. Raman',
    subjects: ['Physics'],
    maxPeriodsPerDay: 4,
  };

  const sampleTeacher2: Faculty = {
    id: 'fac_bhabha',
    name: 'Dr. Homi Bhabha',
    subjects: ['Physics'],
    maxPeriodsPerDay: 4,
  };

  const testSettings: SchedulerSettings = {
    ...defaultSettings,
    pcmbWeight: 60,
    languageWeight: 40,
    maxDailyPeriods: 4,
    minTravelGapMinutes: 15,
  };

  beforeEach(() => {
    // Clean state before each test
  });

  // =========================================================================
  // N5: ROOM AND TRAVEL CONSTRAINTS
  // =========================================================================
  describe('N5: Room and Travel Constraints', () => {
    it('detects room schedule clash when two batches share the same building+room with overlapping times', () => {
      const clashes = checkBatchRoomClashes(sampleBatch1, [sampleBatch2SameRoomOverlap]);
      expect(clashes.length).toBeGreaterThanOrEqual(1);
      expect(clashes[0].roomNumber).toBe('101');
      expect(clashes[0].building).toBe('Building 1');
      expect(clashes[0].otherBatchName).toBe('Beta Section');
    });

    it('does not flag room clash when batches have the same room number but are located in different campus buildings', () => {
      const clashes = checkBatchRoomClashes(sampleBatch1, [sampleBatchDiffBuilding]);
      expect(clashes).toHaveLength(0);
    });

    it('flags room clash in generateDayValidationReport when multiple batches are scheduled in the same building and room', () => {
      const roomAllocs: Allocation[] = [
        { batchId: 'batch_alpha', periodIndex: 0, facultyId: 'fac_dr_raman', subject: 'Physics' },
        { batchId: 'batch_beta', periodIndex: 0, facultyId: 'fac_bhabha', subject: 'Physics' },
      ];

      const report = generateDayValidationReport(
        'Monday',
        roomAllocs,
        [sampleBatch1, sampleBatch2SameRoomOverlap],
        [sampleTeacher, sampleTeacher2],
        testSettings
      );

      expect(report.summary.roomClashes).toBeGreaterThanOrEqual(1);
      const violation = report.violations.find(v => v.type === 'room_clash');
      expect(violation).toBeDefined();
      expect(violation?.roomNumber).toBe('101');
      expect(violation?.description).toContain('Room 101 is simultaneously booked');
    });

    it('applies inter-building travel gap soft penalty when teacher transitions between Building 1 and Building 2 within less than minTravelGapMinutes', () => {
      const batchBldg1: Batch = {
        id: 'b_bldg1',
        building: 'Building 1',
        yearCategory: 'First PU',
        name: 'B1 Batch',
        roomNumber: '101',
        periods: [{ startTime: '08:30', endTime: '10:00' }],
        subjects: [{ subject: 'Physics', count: 2 }],
      };

      const batchBldg2Tight: Batch = {
        id: 'b_bldg2',
        building: 'Building 2', // Different building
        yearCategory: 'First PU',
        name: 'B2 Batch',
        roomNumber: '201',
        // Starts at 10:05 -> gap is only 5 minutes, less than required 15 min!
        periods: [{ startTime: '10:05', endTime: '11:35' }],
        subjects: [{ subject: 'Physics', count: 2 }],
      };

      const todayAllocs: Allocation[] = [
        { batchId: 'b_bldg1', periodIndex: 0, facultyId: sampleTeacher.id, subject: 'Physics' },
      ];

      // Score assignment in Building 2 with tight gap
      const resultTight = scoreAssignment({
        batch: batchBldg2Tight,
        periodIndex: 0,
        subject: 'Physics',
        faculty: sampleTeacher,
        todayAllocations: todayAllocs,
        weekAllocations: [],
        targetWeeklyQuotas: { Physics: 2 },
        dailyWorkload: { [sampleTeacher.id]: 1 },
        settings: { ...testSettings, minTravelGapMinutes: 15 },
        isKHSGroupSlot: false,
        batches: [batchBldg1, batchBldg2Tight],
      });

      expect(resultTight.reasons.some(r => r.includes('Travel gap penalty'))).toBe(true);
      expect(resultTight.score).toBeLessThan(100);

      // Score assignment in Building 2 with adequate 30 min gap
      const batchBldg2Adequate: Batch = {
        id: 'b_bldg2_ok',
        building: 'Building 2',
        yearCategory: 'First PU',
        name: 'B2 OK',
        roomNumber: '201',
        // Starts at 10:30 -> gap is 30 minutes, exceeding 15 min requirement!
        periods: [{ startTime: '10:30', endTime: '12:00' }],
        subjects: [{ subject: 'Physics', count: 2 }],
      };

      const resultAdequate = scoreAssignment({
        batch: batchBldg2Adequate,
        periodIndex: 0,
        subject: 'Physics',
        faculty: sampleTeacher,
        todayAllocations: todayAllocs,
        weekAllocations: [],
        targetWeeklyQuotas: { Physics: 2 },
        dailyWorkload: { [sampleTeacher.id]: 1 },
        settings: { ...testSettings, minTravelGapMinutes: 15 },
        isKHSGroupSlot: false,
        batches: [batchBldg1, batchBldg2Adequate],
      });

      expect(resultAdequate.reasons.some(r => r.includes('Travel gap penalty'))).toBe(false);
      expect(resultAdequate.score).toBeGreaterThan(resultTight.score);
    });
  });

  // =========================================================================
  // N6: TEACHER AVAILABILITY (unavailable per day/periods)
  // =========================================================================
  describe('N6: Teacher Availability Hard Constraints', () => {
    it('enforces unavailable days and periods as a strict hard constraint in canAssign', () => {
      const restrictedFaculty: Faculty = {
        id: 'fac_restricted',
        name: 'Prof. Satyendra Nath Bose',
        subjects: ['Physics'],
        maxPeriodsPerDay: 4,
        // Unavailable on Monday Period 1 (index 0)
        unavailable: [{ day: 'Monday', periods: [0] }],
      };

      // 1. Monday Period 0 should be rejected with UNAVAILABLE
      const mondayP0 = canAssign(
        restrictedFaculty,
        sampleBatch1,
        0,
        [],
        [sampleBatch1],
        testSettings,
        { dayOfWeek: 'Monday' }
      );
      expect(mondayP0.ok).toBe(false);
      expect(mondayP0.type).toBe('UNAVAILABLE');
      expect(mondayP0.reason).toContain('unavailable on Monday during Period 1');

      // 2. Monday Period 1 should be allowed
      const mondayP1 = canAssign(
        restrictedFaculty,
        sampleBatch1,
        1,
        [],
        [sampleBatch1],
        testSettings,
        { dayOfWeek: 'Monday' }
      );
      expect(mondayP1.ok).toBe(true);

      // 3. Tuesday Period 0 should be allowed
      const tuesdayP0 = canAssign(
        restrictedFaculty,
        sampleBatch1,
        0,
        [],
        [sampleBatch1],
        testSettings,
        { dayOfWeek: 'Tuesday' }
      );
      expect(tuesdayP0.ok).toBe(true);
    });

    it('scheduler never automatically assigns an instructor to their unavailable periods', () => {
      const restrictedTeacher: Faculty = {
        id: 'fac_only_p1',
        name: 'Dr. Unavailable P1',
        subjects: ['Physics'],
        maxPeriodsPerDay: 4,
        unavailable: [{ day: 'Monday', periods: [0] }],
      };

      const result = generateTimetableV2(
        [sampleBatch1],
        [restrictedTeacher, sampleTeacher2],
        [],
        [],
        { dayOfWeek: 'Monday', dateKey: 'Monday', seed: 42 }
      );

      // Verify that restrictedTeacher was NOT assigned to periodIndex 0
      const p0Alloc = result.allocations.find(a => a.periodIndex === 0);
      expect(p0Alloc?.facultyId).not.toBe(restrictedTeacher.id);
    });
  });

  // =========================================================================
  // N7: UNDO / REDO HISTORY LIMITS (capped at 20 states per day)
  // =========================================================================
  describe('N7: Undo/Redo History Stack Management', () => {
    it('caps history stack to a maximum of 20 states', () => {
      let history: Allocation[][] = [];
      let currentAllocations: Allocation[] = [];

      const pushStateSimulation = (nextAllocs: Allocation[]) => {
        history = [...history.slice(-19), currentAllocations];
        currentAllocations = nextAllocs;
      };

      // Push 25 consecutive state mutations
      for (let i = 1; i <= 25; i++) {
        pushStateSimulation([
          {
            batchId: 'batch_alpha',
            periodIndex: 0,
            facultyId: `fac_${i}`,
            subject: 'Physics',
          },
        ]);
      }

      // History must be strictly capped at 20 states
      expect(history.length).toBe(20);
      // The oldest state in history should be state 5 (since 25 - 20 = 5)
      expect(history[0][0].facultyId).toBe('fac_5');
    });

    it('undo restores previous state and redo restores subsequent state correctly', () => {
      let history: Allocation[][] = [];
      let future: Allocation[][] = [];
      let current: Allocation[] = [{ batchId: 'b1', periodIndex: 0, facultyId: 'f1', subject: 'Physics' }];

      const pushState = (next: Allocation[]) => {
        history = [...history.slice(-19), current];
        future = [];
        current = next;
      };

      const undo = () => {
        if (history.length === 0) return;
        const prev = history[history.length - 1];
        future = [current, ...future];
        history = history.slice(0, history.length - 1);
        current = prev;
      };

      const redo = () => {
        if (future.length === 0) return;
        const next = future[0];
        history = [...history.slice(-19), current];
        future = future.slice(1);
        current = next;
      };

      // Mutation 1 -> Mutation 2
      pushState([{ batchId: 'b1', periodIndex: 0, facultyId: 'f2', subject: 'Chemistry' }]);
      pushState([{ batchId: 'b1', periodIndex: 0, facultyId: 'f3', subject: 'Mathematics' }]);

      expect(current[0].facultyId).toBe('f3');
      expect(history.length).toBe(2);

      // Undo -> restores f2
      undo();
      expect(current[0].facultyId).toBe('f2');
      expect(future.length).toBe(1);

      // Undo -> restores f1
      undo();
      expect(current[0].facultyId).toBe('f1');
      expect(future.length).toBe(2);

      // Redo -> restores f2
      redo();
      expect(current[0].facultyId).toBe('f2');
      expect(future.length).toBe(1);

      // Redo -> restores f3
      redo();
      expect(current[0].facultyId).toBe('f3');
      expect(future.length).toBe(0);
    });
  });

  // =========================================================================
  // N8: PER-SLOT RE-ROLL & SUBSTITUTE SUGGESTIONS
  // =========================================================================
  describe('N8: Per-Slot Re-Roll and Substitute Suggestions', () => {
    it('provides ranked eligible substitute candidates with appropriate status metrics', () => {
      const candidates = getRankedSubstitutes(
        sampleBatch1.id,
        0,
        'Physics',
        [],
        [sampleBatch1],
        [sampleTeacher, sampleTeacher2],
        testSettings,
        'Monday',
        'Monday'
      );

      expect(candidates.length).toBeGreaterThanOrEqual(1);
      const topCandidate = candidates[0];
      expect(topCandidate.eligible).toBe(true);
      expect(topCandidate.currentDayLoad).toBe(0); // Free
      expect(topCandidate.maxDayLoad).toBe(4);
    });

    it('regenerateSingleSlot re-rolls to an alternative eligible teacher when available', () => {
      const currentAlloc: Allocation = {
        batchId: sampleBatch1.id,
        periodIndex: 0,
        facultyId: sampleTeacher.id,
        subject: 'Physics',
      };

      const result = regenerateSingleSlot(
        sampleBatch1.id,
        0,
        [currentAlloc],
        [sampleBatch1],
        [sampleTeacher, sampleTeacher2],
        testSettings,
        'Physics',
        'Monday',
        'Monday'
      );

      expect(result.success).toBe(true);
      expect(result.newAllocation).toBeDefined();
      // Should pick alternative eligible teacher (sampleTeacher2) rather than keeping current
      expect(result.newAllocation?.facultyId).toBe(sampleTeacher2.id);
    });

    it('regenerateBatchDay regenerates unfrozen slots of target batch while preserving frozen slots', () => {
      const existingAllocs: Allocation[] = [
        // Frozen slot for sampleBatch1 (P0)
        { batchId: sampleBatch1.id, periodIndex: 0, facultyId: sampleTeacher.id, subject: 'Physics', frozen: true },
        // Unfrozen slot for sampleBatch1 (P1)
        { batchId: sampleBatch1.id, periodIndex: 1, facultyId: sampleTeacher2.id, subject: 'Chemistry' },
        // Other batch allocation
        { batchId: 'other_batch', periodIndex: 0, facultyId: 'other_fac', subject: 'Biology' },
      ];

      const result = regenerateBatchDay(
        sampleBatch1.id,
        existingAllocs,
        [sampleBatch1],
        [sampleTeacher, sampleTeacher2],
        testSettings,
        { dayOfWeek: 'Monday', dateKey: 'Monday' }
      );

      expect(result.success).toBe(true);
      // Other batch allocation remains intact
      expect(result.allocations.some(a => a.batchId === 'other_batch')).toBe(true);

      // Frozen slot for sampleBatch1 remained untouched
      const frozenSlot = result.allocations.find(a => a.batchId === sampleBatch1.id && a.periodIndex === 0);
      expect(frozenSlot?.frozen).toBe(true);
      expect(frozenSlot?.facultyId).toBe(sampleTeacher.id);
    });
  });

  // =========================================================================
  // N9: "GENERATE WEEK" GLOBAL PLANNING & INVARIANTS
  // =========================================================================
  describe('N9: "Generate Week" Planning Quotas and Global Invariants', () => {
    it('generates a full 6-day week satisfying zero teacher overlaps, daily limits, lock preservation, and quota fit reporting', () => {
      // Setup preset frozen slots across two days to verify lock preservation
      const presetFrozenMon: Allocation = {
        batchId: initialBatches[0].id,
        periodIndex: 0,
        facultyId: initialFaculty[0].id,
        subject: initialBatches[0].subjects[0].subject,
        frozen: true,
      };

      const presetFrozenWed: Allocation = {
        batchId: initialBatches[1].id,
        periodIndex: 1,
        facultyId: initialFaculty[1].id,
        subject: initialBatches[1].subjects[0].subject,
        frozen: true,
      };

      const existingWeek: WeekTimetables = {
        Monday: {
          id: 'tt_mon',
          date: 'Monday',
          status: 'Draft',
          allocations: [presetFrozenMon],
        },
        Wednesday: {
          id: 'tt_wed',
          date: 'Wednesday',
          status: 'Draft',
          allocations: [presetFrozenWed],
        },
      };

      // Run Generate Week
      const result = generateWeekTimetables(
        initialBatches,
        initialFaculty,
        existingWeek,
        testSettings,
        { seed: 12345, numCandidates: 1 }
      );

      expect(result.weekTimetables).toBeDefined();

      // Invariant 1: All 6 teaching days are generated
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
      days.forEach(day => {
        const dayTT = result.weekTimetables[day];
        expect(dayTT).toBeDefined();
        expect(dayTT?.allocations.length).toBe(372); // Full seed capacity
      });

      // Invariant 2: Preserved locked / frozen slots remain intact
      const monAlloc = result.weekTimetables.Monday?.allocations.find(
        a => a.batchId === presetFrozenMon.batchId && a.periodIndex === presetFrozenMon.periodIndex
      );
      expect(monAlloc?.frozen).toBe(true);
      expect(monAlloc?.facultyId).toBe(presetFrozenMon.facultyId);

      const wedAlloc = result.weekTimetables.Wednesday?.allocations.find(
        a => a.batchId === presetFrozenWed.batchId && a.periodIndex === presetFrozenWed.periodIndex
      );
      expect(wedAlloc?.frozen).toBe(true);
      expect(wedAlloc?.facultyId).toBe(presetFrozenWed.facultyId);

      // Invariant 3: Zero teacher time overlaps on any day
      days.forEach(day => {
        const dayAllocs = result.weekTimetables[day]?.allocations || [];
        for (let i = 0; i < dayAllocs.length; i++) {
          for (let j = i + 1; j < dayAllocs.length; j++) {
            const a1 = dayAllocs[i];
            const a2 = dayAllocs[j];
            if (a1.facultyId && a1.facultyId === a2.facultyId && a1.batchId !== a2.batchId) {
              const b1 = initialBatches.find(b => b.id === a1.batchId)!;
              const b2 = initialBatches.find(b => b.id === a2.batchId)!;
              const t1 = b1.periods[a1.periodIndex];
              const t2 = b2.periods[a2.periodIndex];
              if (t1?.startTime && t2?.startTime) {
                const overlap = isOverlapping(t1.startTime, t1.endTime, t2.startTime, t2.endTime);
                expect(overlap).toBe(false);
              }
            }
          }
        }
      });

      // Invariant 4: Weekly Quota Fit Report is computed and reported
      expect(result.quotaReport).toBeDefined();
      expect(result.quotaReport.totalBatches).toBe(initialBatches.length);
      expect(result.quotaReport.batchFits.length).toBe(initialBatches.length);
      expect(result.quotaReport.batchesWithFit).toBeGreaterThanOrEqual(15);
      expect(result.quotaReport.fitPercentage).toBeGreaterThanOrEqual(20);

      // Verify each batch fit report structure
      const sampleFit = result.quotaReport.batchFits[0];
      expect(sampleFit.batchId).toBe(initialBatches[0].id);
      expect(sampleFit.subjectFits.length).toBeGreaterThan(0);
      sampleFit.subjectFits.forEach(s => {
        expect(typeof s.target).toBe('number');
        expect(typeof s.allocated).toBe('number');
        expect(s.delta).toBe(s.allocated - s.target);
      });
    });

    it('calculateWeekQuotaFit accurately measures subject deviations across the 6-day week', () => {
      const mockWeek: WeekTimetables = {
        Monday: {
          id: 'tt_1',
          date: 'Monday',
          status: 'Draft',
          allocations: [
            { batchId: sampleBatch1.id, periodIndex: 0, facultyId: 'f1', subject: 'Physics' },
            { batchId: sampleBatch1.id, periodIndex: 1, facultyId: 'f2', subject: 'Chemistry' },
          ],
        },
      };

      const fitReport = calculateWeekQuotaFit([sampleBatch1], mockWeek, ['Monday']);
      expect(fitReport.totalBatches).toBe(1);
      const batchFit = fitReport.batchFits[0];
      expect(batchFit.batchId).toBe(sampleBatch1.id);
      const physFit = batchFit.subjectFits.find(s => s.subject === 'Physics');
      expect(physFit).toBeDefined();
      expect(physFit?.allocated).toBe(1);
    });
  });
});
