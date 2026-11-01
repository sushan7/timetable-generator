import type { Batch, Faculty, Allocation, SchedulerSettings } from '../types';
import { storage } from './storage';
import { isOverlapping } from './validation';

const PCMB_SUBJECTS = ['Physics', 'Chemistry', 'Mathematics', 'Biology'];
const isPCMBSubject = (subject: string) => PCMB_SUBJECTS.includes(subject);

const getEligibleFaculty = (faculties: Faculty[], batch: Batch, subject: string): Faculty[] => {
  const owners = faculties.filter(
    f => f.subjects.includes(subject) &&
         f.assignedBatches && f.assignedBatches.length > 0 &&
         f.assignedBatches.includes(batch.id)
  );
  if (owners.length > 0) return owners;

  return faculties.filter(
    f => f.subjects.includes(subject) &&
         (!f.assignedBatches || f.assignedBatches.length === 0)
  );
};

// Decides which subject to try next for an open slot, combining two signals:
// 1. Weekly category deficit (PCMB vs Language, vs settings.pcmbWeight/languageWeight)
// 2. Same-day per-subject deficit (vs each subject's own `count` weight)
const getSubjectPriorityOrder = (
  batch: Batch,
  todayAllocationsForBatch: Allocation[],
  weekAllocationsForBatch: Allocation[],
  settings: SchedulerSettings
): string[] => {
  if (batch.subjects.length === 0) return ['Self Study'];

  const todayCounts: Record<string, number> = {};
  batch.subjects.forEach(s => { todayCounts[s.subject] = 0; });
  todayAllocationsForBatch.forEach(a => {
    if (todayCounts[a.subject] !== undefined) todayCounts[a.subject]++;
  });

  const weekPCMB = weekAllocationsForBatch.filter(a => a.facultyId && isPCMBSubject(a.subject)).length;
  const weekLang = weekAllocationsForBatch.filter(a => a.facultyId && !isPCMBSubject(a.subject)).length;
  const weekTotal = weekPCMB + weekLang;

  const targetPCMBRatio = settings.pcmbWeight / (settings.pcmbWeight + settings.languageWeight);
  const actualPCMBRatio = weekTotal === 0 ? targetPCMBRatio : weekPCMB / weekTotal;

  const categoryDeficit = (subject: string) =>
    isPCMBSubject(subject)
      ? (targetPCMBRatio - actualPCMBRatio)
      : ((1 - targetPCMBRatio) - (1 - actualPCMBRatio));

  return [...batch.subjects]
    .sort((a, b) => {
      const catDiff = categoryDeficit(b.subject) - categoryDeficit(a.subject);
      if (Math.abs(catDiff) > 0.02) return catDiff; // weekly category balance takes priority

      const weightA = a.count || 1;
      const weightB = b.count || 1;
      return (todayCounts[a.subject] / weightA) - (todayCounts[b.subject] / weightB);
    })
    .map(s => s.subject);
};

// Shared slot-filling logic used by both fresh generation and absence-patching.
const tryAssignSlot = (
  batch: Batch,
  batches: Batch[],
  pIndex: number,
  periodTiming: { startTime: string; endTime: string },
  orderedSubjects: string[],
  faculties: Faculty[],
  allocations: Allocation[],
  dailyWorkload: Record<string, number>,
  settings: SchedulerSettings,
  excludeFacultyId?: string
): Allocation | null => {
  const primarySubject = orderedSubjects[0];

  for (const targetSubject of orderedSubjects) {
    const eligibleFaculty = getEligibleFaculty(faculties, batch, targetSubject)
      .filter(f => f.id !== excludeFacultyId);

    const candidateScores: { faculty: Faculty; score: number; reasons: string[] }[] = [];

    eligibleFaculty.forEach(faculty => {
      if (faculty.isAbsent) return;

      const currentLoad = dailyWorkload[faculty.id] || 0;
      // Respect configured limit per faculty or global settings
      const maxLimit = faculty.maxPeriodsPerDay || settings.maxDailyPeriods;
      if (currentLoad >= maxLimit) return;

      const hasTimeConflict = allocations.some(a => {
        if (a.facultyId !== faculty.id) return false;
        const otherBatch = batches.find(b => b.id === a.batchId);
        if (!otherBatch) return false;
        const otherTiming = otherBatch.periods[a.periodIndex];
        return otherTiming && isOverlapping(periodTiming.startTime, periodTiming.endTime, otherTiming.startTime, otherTiming.endTime);
      });
      if (hasTimeConflict) return;

      let score = 100;
      const reasons: string[] = [
        faculty.assignedBatches && faculty.assignedBatches.includes(batch.id)
          ? `Assigned faculty for this batch.`
          : `Eligible for subject & time (unrestricted).`
      ];

      if (currentLoad === 0) {
        score += 200;
        reasons.push('Fairness bonus: first period of the day (+200)');
      } else {
        score -= (currentLoad * 10);
        reasons.push(`Daily load penalty: -${currentLoad * 10}`);
      }

      if (settings.enableConsecutivePeriodAvoidance) {
        const taughtLastPeriod = allocations.some(a => a.facultyId === faculty.id && a.batchId === batch.id && a.periodIndex === pIndex - 1);
        if (taughtLastPeriod) {
          score -= 50;
          reasons.push('Consecutive period penalty: -50');
        }
      }

      if (settings.enableGapOptimization) {
        const taughtBefore = allocations.some(a => a.facultyId === faculty.id && a.periodIndex === pIndex - 1);
        const teachesAfter = allocations.some(a => a.facultyId === faculty.id && a.periodIndex === pIndex + 1);
        if (taughtBefore || teachesAfter) {
          score += 15;
          reasons.push('Gap optimization bonus: +15');
        }
      }

      if (targetSubject !== primarySubject) {
        reasons.unshift(`Subject swapped from "${primarySubject}" : no eligible faculty available.`);
      }

      candidateScores.push({ faculty, score, reasons });
    });

    if (candidateScores.length > 0) {
      candidateScores.sort((a, b) => b.score - a.score);
      const winner = candidateScores[0];

      return {
        batchId: batch.id,
        periodIndex: pIndex,
        facultyId: winner.faculty.id,
        subject: targetSubject,
        autoGenerated: true,
        manualEdited: false,
        frozen: false,
        explanation: winner.reasons,
        updatedAt: Date.now(),
      };
    }
  }

  return null;
};

export const generateTimetableV2 = (
  batches: Batch[],
  faculties: Faculty[],
  existingDraft: Allocation[],
  weekAllocations: Allocation[] = []
): Allocation[] => {
  const settings = storage.getSettings();
  const allocations: Allocation[] = existingDraft.filter(a => a.frozen);

  const dailyWorkload: Record<string, number> = {};
  allocations.forEach(a => {
    if (a.facultyId) {
      dailyWorkload[a.facultyId] = (dailyWorkload[a.facultyId] || 0) + 1;
    }
  });

  // Slot scheduling by period index (0..5) across all batches for balanced allocation
  const maxPeriodSlots = Math.max(...batches.map(b => b.periods.length), 6);

  for (let pIndex = 0; pIndex < maxPeriodSlots; pIndex++) {
    for (const batch of batches) {
      const periodTiming = batch.periods[pIndex];
      if (!periodTiming || !periodTiming.startTime || !periodTiming.endTime) continue;

      const hasFrozenCell = allocations.some(a => a.batchId === batch.id && a.periodIndex === pIndex);
      if (hasFrozenCell) continue;

      const todayAllocationsForBatch = allocations.filter(a => a.batchId === batch.id);
      const weekAllocationsForBatch = weekAllocations.filter(a => a.batchId === batch.id);
      const orderedSubjects = getSubjectPriorityOrder(batch, todayAllocationsForBatch, weekAllocationsForBatch, settings);

      const newAllocation = tryAssignSlot(
        batch, batches, pIndex, periodTiming, orderedSubjects,
        faculties, allocations, dailyWorkload, settings
      );

      if (newAllocation) {
        allocations.push(newAllocation);
        dailyWorkload[newAllocation.facultyId] = (dailyWorkload[newAllocation.facultyId] || 0) + 1;
      }
    }
  }

  storage.logAuditAction('TIMETABLE_GENERATE', {
    reason: `Generated timetable allocations with ${allocations.length} total scheduled slots.`,
  });

  return allocations;
};

// Re-checks an already-generated day's allocations against the CURRENT absence list.
// Works bidirectionally:
// 1. Patches slots where assigned faculty is now absent
// 2. Recovers slots where faculty is back to present or a substitute is available
export const patchAbsences = (
  batches: Batch[],
  faculties: Faculty[],
  dayAllocations: Allocation[]
): Allocation[] => {
  const settings = storage.getSettings();
  const facultyById: Record<string, Faculty> = {};
  faculties.forEach(f => { facultyById[f.id] = f; });

  const allocations: Allocation[] = [...dayAllocations];

  const dailyWorkload: Record<string, number> = {};
  allocations.forEach(a => {
    if (a.facultyId) dailyWorkload[a.facultyId] = (dailyWorkload[a.facultyId] || 0) + 1;
  });

  for (let i = 0; i < allocations.length; i++) {
    const alloc = allocations[i];
    if (alloc.frozen) continue;

    const currentFaculty = alloc.facultyId ? facultyById[alloc.facultyId] : null;
    const vacatedFaculty = alloc.vacatedFacultyId ? facultyById[alloc.vacatedFacultyId] : null;

    const batch = batches.find(b => b.id === alloc.batchId);
    if (!batch) continue;
    const periodTiming = batch.periods[alloc.periodIndex];
    if (!periodTiming || !periodTiming.startTime || !periodTiming.endTime) continue;

    // Case 1: Slot has a faculty who became absent
    if (currentFaculty && currentFaculty.isAbsent) {
      dailyWorkload[currentFaculty.id] = Math.max(0, (dailyWorkload[currentFaculty.id] || 1) - 1);

      const restOfAllocations = allocations.filter((_, idx) => idx !== i);
      const orderedSubjects = getSubjectPriorityOrder(
        batch,
        restOfAllocations.filter(a => a.batchId === batch.id),
        [],
        settings
      );

      const replacement = tryAssignSlot(
        batch, batches, alloc.periodIndex, periodTiming, orderedSubjects,
        faculties, restOfAllocations, dailyWorkload, settings, currentFaculty.id
      );

      if (replacement) {
        dailyWorkload[replacement.facultyId] = (dailyWorkload[replacement.facultyId] || 0) + 1;
        allocations[i] = {
          ...replacement,
          vacatedFacultyId: currentFaculty.id,
          vacatedFacultyName: currentFaculty.name,
        };
      } else {
        allocations[i] = {
          ...alloc,
          facultyId: '',
          autoGenerated: true,
          manualEdited: false,
          vacatedFacultyId: currentFaculty.id,
          vacatedFacultyName: currentFaculty.name,
          explanation: [`Gap: ${currentFaculty.name} is absent. No substitute or alternate subject available for this slot.`],
          updatedAt: Date.now(),
        };
      }
      continue;
    }

    // Case 2: Slot was previously a Gap, check if vacated faculty returned or substitute is now available
    if (!alloc.facultyId && alloc.vacatedFacultyId) {
      // Check if original faculty is back to present
      if (vacatedFaculty && !vacatedFaculty.isAbsent) {
        const canRestore = !allocations.some((other, idx) => {
          if (idx === i || other.facultyId !== vacatedFaculty.id) return false;
          const otherBatch = batches.find(b => b.id === other.batchId);
          if (!otherBatch) return false;
          const otherTiming = otherBatch.periods[other.periodIndex];
          return otherTiming && isOverlapping(periodTiming.startTime, periodTiming.endTime, otherTiming.startTime, otherTiming.endTime);
        });

        const currentLoad = dailyWorkload[vacatedFaculty.id] || 0;
        const maxLimit = vacatedFaculty.maxPeriodsPerDay || settings.maxDailyPeriods;

        if (canRestore && currentLoad < maxLimit) {
          dailyWorkload[vacatedFaculty.id] = currentLoad + 1;
          allocations[i] = {
            ...alloc,
            facultyId: vacatedFaculty.id,
            vacatedFacultyId: undefined,
            vacatedFacultyName: undefined,
            explanation: [`Restored: ${vacatedFaculty.name} is now present.`],
            updatedAt: Date.now(),
          };
          continue;
        }
      }

      // Try assigning any available substitute
      const restOfAllocations = allocations.filter((_, idx) => idx !== i);
      const orderedSubjects = getSubjectPriorityOrder(
        batch,
        restOfAllocations.filter(a => a.batchId === batch.id),
        [],
        settings
      );

      const replacement = tryAssignSlot(
        batch, batches, alloc.periodIndex, periodTiming, orderedSubjects,
        faculties, restOfAllocations, dailyWorkload, settings
      );

      if (replacement) {
        dailyWorkload[replacement.facultyId] = (dailyWorkload[replacement.facultyId] || 0) + 1;
        allocations[i] = {
          ...replacement,
          vacatedFacultyId: undefined,
          vacatedFacultyName: undefined,
          explanation: [`Substitute assigned: replaced gap with ${replacement.subject}.`],
        };
      }
    }
  }

  storage.logAuditAction('ABSENCE_SYNC', {
    reason: `Synchronized faculty absences and re-balanced affected schedule allocations.`,
  });

  return allocations;
};