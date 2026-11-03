import { describe, it, expect } from 'vitest';
import {
  generateTimetableV2,
  patchAbsences,
  calculateWeeklyQuotas,
  regenerateSingleSlot,
  getRankedSubstitutes,
  PCMB_SUBJECTS,
} from '../utils/scheduler';
import { initialBatches, initialFaculty } from '../utils/seedData';
import { isOverlapping } from '../utils/validation';
import type { Batch, Faculty, Allocation } from '../types';

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
});
