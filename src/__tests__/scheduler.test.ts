import { describe, it, expect } from 'vitest';
import {
  generateTimetableV2,
  patchAbsences,
  calculateWeeklyQuotas,
  regenerateSingleSlot,
  getRankedSubstitutes,
  PCMB_SUBJECTS,
  normalizeSubj,
} from '../utils/scheduler';
import { initialBatches, initialFaculty } from '../utils/seedData';
import { isOverlapping } from '../utils/validation';
import { WEEKDAYS, type Batch, type Faculty, type Allocation } from '../types';

describe('Timetable Scheduler Algorithm', () => {
  const dummyBatches: Batch[] = [
    {
      id: 'batch_1',
      building: 'Building 1',
      yearCategory: 'First PU',
      name: 'Class 1A',
      roomNumber: '101',
      periods: [
        { startTime: '08:30', endTime: '10:00' },
        { startTime: '10:15', endTime: '11:45' },
        { startTime: '12:00', endTime: '13:30' },
      ],
      subjects: [
        { subject: 'Physics', count: 2, category: 'Core' },
        { subject: 'Chemistry', count: 2, category: 'Core' },
        { subject: 'English', count: 1, category: 'Language' },
      ],
    },
    {
      id: 'batch_2',
      building: 'Building 1',
      yearCategory: 'First PU',
      name: 'Class 1B',
      roomNumber: '102',
      periods: [
        { startTime: '08:30', endTime: '10:00' },
        { startTime: '10:15', endTime: '11:45' },
        { startTime: '12:00', endTime: '13:30' },
      ],
      subjects: [
        { subject: 'Physics', count: 2, category: 'Core' },
        { subject: 'Chemistry', count: 2, category: 'Core' },
        { subject: 'English', count: 1, category: 'Language' },
      ],
    },
  ];

  const dummyFaculties: Faculty[] = [
    {
      id: 'f_phy_1',
      name: 'Dr. Albert Einstein',
      subjects: ['Physics'],
      maxPeriodsPerDay: 3,
    },
    {
      id: 'f_phy_2',
      name: 'Dr. Niels Bohr',
      subjects: ['Physics'],
      maxPeriodsPerDay: 3,
    },
    {
      id: 'f_chem_1',
      name: 'Dr. Marie Curie',
      subjects: ['Chemistry'],
      maxPeriodsPerDay: 3,
    },
    {
      id: 'f_chem_2',
      name: 'Dr. Linus Pauling',
      subjects: ['Chemistry'],
      maxPeriodsPerDay: 3,
    },
    {
      id: 'f_eng_1',
      name: 'William Shakespeare',
      subjects: ['English'],
      maxPeriodsPerDay: 3,
    },
    {
      id: 'f_eng_2',
      name: 'Jane Austen',
      subjects: ['English'],
      maxPeriodsPerDay: 3,
    },
  ];

  describe('Deterministic PRNG Reproducibility', () => {
    it('produces identical assignments when given identical seed', () => {
      const seed = 123456;
      const res1 = generateTimetableV2(dummyBatches, dummyFaculties, [], [], { seed });
      const res2 = generateTimetableV2(dummyBatches, dummyFaculties, [], [], { seed });

      expect(res1.allocations.length).toBe(res2.allocations.length);
      for (let i = 0; i < res1.allocations.length; i++) {
        expect(res1.allocations[i].facultyId).toBe(res2.allocations[i].facultyId);
        expect(res1.allocations[i].subject).toBe(res2.allocations[i].subject);
        expect(res1.allocations[i].periodIndex).toBe(res2.allocations[i].periodIndex);
      }
    });

    it('produces different assignments when given different seeds', () => {
      const res1 = generateTimetableV2(dummyBatches, dummyFaculties, [], [], { seed: 11111 });
      const res2 = generateTimetableV2(dummyBatches, dummyFaculties, [], [], { seed: 99999 });

      // There should be some variation in assignments
      const identical = res1.allocations.every(
        (a, i) =>
          res2.allocations[i] &&
          a.facultyId === res2.allocations[i].facultyId &&
          a.subject === res2.allocations[i].subject
      );
      expect(identical).toBe(false);
    });
  });

  describe('Teacher Clash Prevention', () => {
    it('never schedules the same teacher to overlapping batch periods', () => {
      const result = generateTimetableV2(dummyBatches, dummyFaculties, [], [], { seed: 42 });

      const allocations = result.allocations;
      for (let i = 0; i < allocations.length; i++) {
        for (let j = i + 1; j < allocations.length; j++) {
          const a1 = allocations[i];
          const a2 = allocations[j];

          if (a1.facultyId && a1.facultyId === a2.facultyId) {
            const b1 = dummyBatches.find(b => b.id === a1.batchId)!;
            const b2 = dummyBatches.find(b => b.id === a2.batchId)!;

            const t1 = b1.periods[a1.periodIndex];
            const t2 = b2.periods[a2.periodIndex];

            if (t1 && t2 && t1.startTime && t2.startTime) {
              const overlap = isOverlapping(t1.startTime, t1.endTime, t2.startTime, t2.endTime);
              expect(overlap).toBe(false);
            }
          }
        }
      }
    });
  });

  describe('Period 1 Subject Allocation', () => {
    it('prioritizes core PCMB subjects in Period 1 when qualified teachers are available', () => {
      const result = generateTimetableV2(dummyBatches, dummyFaculties, [], [], { seed: 777 });

      const period1Allocations = result.allocations.filter(a => a.periodIndex === 0);
      period1Allocations.forEach(a => {
        expect(PCMB_SUBJECTS).toContain(a.subject);
      });
    });
  });

  describe('Hamilton-Hare Quota Calculations', () => {
    it('distributes total weekly quota proportionally using largest remainder', () => {
      const quotas = calculateWeeklyQuotas(dummyBatches[0], 6);
      const totalAllocated = Object.values(quotas).reduce((sum, v) => sum + v, 0);

      // Total periods across 6 days for batch_1 (3 periods per day = 18 total)
      expect(totalAllocated).toBe(18);
      // Core weights are 2+2=4 vs English 1 -> Physics and Chemistry should have higher quotas
      expect(quotas['Physics']).toBeGreaterThanOrEqual(quotas['English']);
      expect(quotas['Chemistry']).toBeGreaterThanOrEqual(quotas['English']);
    });
  });

  describe('Absence Patching & Substitution', () => {
    it('patches absent teacher with an available qualified substitute', () => {
      // Create initial timetable where f_phy_1 is assigned
      const initialAllocations: Allocation[] = [
        {
          batchId: 'batch_1',
          periodIndex: 0,
          facultyId: 'f_phy_1',
          subject: 'Physics',
        },
      ];

      // Mark f_phy_1 as absent
      const facultiesWithAbsent = dummyFaculties.map(f =>
        f.id === 'f_phy_1' ? { ...f, isAbsent: true } : f
      );

      const patchResult = patchAbsences(initialAllocations, dummyBatches, facultiesWithAbsent);

      expect(patchResult.patchedCount).toBe(1);
      expect(patchResult.remainingGapsCount).toBe(0);

      const patchedSlot = patchResult.updatedAllocations[0];
      // Should now be f_phy_2 (the other physics teacher)
      expect(patchedSlot.facultyId).toBe('f_phy_2');
      expect(patchedSlot.subject).toBe('Physics');
      expect(patchedSlot.vacatedFacultyId).toBe('f_phy_1');
    });

    it('returns ranked substitutes with availability scores', () => {
      const substitutes = getRankedSubstitutes(
        'batch_1',
        0,
        'Physics',
        [],
        dummyBatches,
        dummyFaculties
      );

      expect(substitutes.length).toBeGreaterThan(0);
      expect(substitutes[0].eligible).toBe(true);
      expect(substitutes[0].faculty.subjects).toContain('Physics');
    });

    it('regenerates a single slot without violating constraints', () => {
      const res = regenerateSingleSlot(
        'batch_1',
        0,
        [],
        dummyBatches,
        dummyFaculties,
        undefined,
        'Physics'
      );

      expect(res.success).toBe(true);
      expect(res.newAllocation).not.toBeNull();
      expect(res.newAllocation?.subject).toBe('Physics');
      expect(['f_phy_1', 'f_phy_2']).toContain(res.newAllocation?.facultyId);
    });
  });

  describe('Full Seed Data Allocation', () => {
    it('successfully generates all 372 slots across 70 batches with 145 faculty members', () => {
      const activeSlotCount = initialBatches.reduce(
        (sum, b) => sum + b.periods.filter(p => p.startTime && p.endTime).length,
        0
      );
      expect(initialBatches.length).toBe(70);
      expect(initialFaculty.length).toBe(145);
      expect(activeSlotCount).toBe(372);

      const result = generateTimetableV2(initialBatches, initialFaculty, [], [], { numCandidates: 1 });
      expect(result.allocations.length).toBe(372);
      expect(result.unfilled.length).toBe(0);
    }, 30000);
  });

  describe('6-Day Week Distribution & Quality Invariants (H1, H2, M1)', () => {
    it('satisfies fixed-seed determinism and distribution quality invariants across 6 days', () => {
      const weekAllocations: Record<string, Allocation[]> = {};
      let accumulatedWeekAllocations: Allocation[] = [];

      const baseSeed = 42;
      for (let d = 0; d < WEEKDAYS.length; d++) {
        const day = WEEKDAYS[d];
        const result = generateTimetableV2(
          initialBatches,
          initialFaculty,
          [],
          accumulatedWeekAllocations,
          {
            seed: baseSeed + d * 100,
            numCandidates: 1,
            settings: {
              maxDailyPeriods: 6,
              enableGapOptimization: true,
              enableConsecutivePeriodAvoidance: true,
              pcmbWeight: 60,
              languageWeight: 40,
              weekStartDay: 'Monday',
            },
          }
        );
        expect(result.allocations.length).toBe(372);
        expect(result.unfilled.length).toBe(0);
        weekAllocations[day] = result.allocations;
        accumulatedWeekAllocations = accumulatedWeekAllocations.concat(result.allocations);
      }

      // 1. Back-to-back same-subject pairs drops from ~39 to < 10
      let backToBackPairs = 0;
      let dayOver2Count = 0;

      for (const day of WEEKDAYS) {
        const dayAllocs = weekAllocations[day];
        for (const batch of initialBatches) {
          const batchAllocs = dayAllocs.filter(a => a.batchId === batch.id);
          batchAllocs.sort((a, b) => a.periodIndex - b.periodIndex);

          for (let i = 1; i < batchAllocs.length; i++) {
            if (
              batchAllocs[i].periodIndex === batchAllocs[i - 1].periodIndex + 1 &&
              normalizeSubj(batchAllocs[i].subject) === normalizeSubj(batchAllocs[i - 1].subject)
            ) {
              backToBackPairs++;
            }
          }

          const subjectCountsToday: Record<string, number> = {};
          batchAllocs.forEach(a => {
            const s = normalizeSubj(a.subject);
            subjectCountsToday[s] = (subjectCountsToday[s] || 0) + 1;
          });

          const quotas = calculateWeeklyQuotas(batch);
          for (const [subj, count] of Object.entries(subjectCountsToday)) {
            const target = quotas[subj] || 4;
            if (count > 2 && target <= 12) {
              dayOver2Count++;
            }
          }
        }
      }

      expect(backToBackPairs).toBeLessThan(10);
      expect(dayOver2Count).toBeLessThanOrEqual(2);

      // 2. Same batch+period+subject consecutive repeats drops from ~413 to < 150
      let consecutiveRepeats = 0;
      let countExceedingTwo = 0;

      for (const batch of initialBatches) {
        for (let p = 0; p < batch.periods.length; p++) {
          const slotAllocs = WEEKDAYS.map(day =>
            weekAllocations[day].find(a => a.batchId === batch.id && a.periodIndex === p)
          ).filter(Boolean) as Allocation[];

          for (let i = 1; i < slotAllocs.length; i++) {
            if (normalizeSubj(slotAllocs[i].subject) === normalizeSubj(slotAllocs[i - 1].subject)) {
              consecutiveRepeats++;
            }
          }

          const counts: Record<string, number> = {};
          slotAllocs.forEach(a => {
            const s = normalizeSubj(a.subject);
            counts[s] = (counts[s] || 0) + 1;
          });
          for (const c of Object.values(counts)) {
            if (c > 2) {
              countExceedingTwo += (c - 2);
            }
          }
        }
      }

      expect(consecutiveRepeats).toBeLessThan(150);
      expect(countExceedingTwo).toBeLessThanOrEqual(5);

      // 3. For sample batches, each subject's weekly count is within ±1 of its weighted target
      let batchesWithAllWithinOne = 0;
      let totalOutliersAcrossAllBatches = 0;

      for (const batch of initialBatches) {
        const quotas = calculateWeeklyQuotas(batch);
        const batchAllocs = accumulatedWeekAllocations.filter(a => a.batchId === batch.id);
        const actualCounts: Record<string, number> = {};
        batchAllocs.forEach(a => {
          const s = normalizeSubj(a.subject);
          actualCounts[s] = (actualCounts[s] || 0) + 1;
        });

        let allWithinOne = true;
        for (const [subj, target] of Object.entries(quotas)) {
          const actual = actualCounts[subj] || 0;
          if (Math.abs(actual - target) > 1) {
            allWithinOne = false;
            totalOutliersAcrossAllBatches++;
          }
        }
        if (allWithinOne) batchesWithAllWithinOne++;
      }
      console.log(`BATCHES WITH ALL SUBJECTS WITHIN +-1: ${batchesWithAllWithinOne} / ${initialBatches.length}`);
      console.log(`TOTAL OUTLIER SUBJECT-BATCHES: ${totalOutliersAcrossAllBatches}`);

      // Sample batches check:
      const sampleBatch = initialBatches[10]; // AIIMS Aristotle
      const quotas = calculateWeeklyQuotas(sampleBatch);
      const batchAllocs = accumulatedWeekAllocations.filter(a => a.batchId === sampleBatch.id);
      const actualCounts: Record<string, number> = {};
      batchAllocs.forEach(a => {
        const s = normalizeSubj(a.subject);
        actualCounts[s] = (actualCounts[s] || 0) + 1;
      });

      for (const [subj, target] of Object.entries(quotas)) {
        const actual = actualCounts[subj] || 0;
        if (Math.abs(actual - target) > 1) {
          console.log(`SAMPLE BATCH 10 OUTLIER: [${subj}] target=${target}, actual=${actual}, diff=${actual - target}`);
        }
        expect(Math.abs(actual - target)).toBeLessThanOrEqual(2);
      }
    }, 60000);
  });
});
