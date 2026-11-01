import type { Batch, Faculty, Allocation, SchedulerSettings } from '../types';
import { storage } from './storage';
import { isOverlapping } from './validation';
import { groupBatchesBySection } from './sections';

export const PCMB_SUBJECTS = ['Physics', 'Chemistry', 'Mathematics', 'Biology'];
export const LANGUAGE_SUBJECTS = ['English', 'K/H/S', 'Second Language'];

export const isPCMBSubject = (subject: string): boolean => PCMB_SUBJECTS.includes(subject);
export const isLanguageSubject = (subject: string): boolean => LANGUAGE_SUBJECTS.includes(subject);
export const isKHS = (subject: string): boolean => subject === 'K/H/S' || subject === 'Second Language';

// Helper to normalize subject query string
const normalizeSubj = (s: string) => (s === 'Second Language' ? 'K/H/S' : s);

const getEligibleFaculty = (faculties: Faculty[], batch: Batch, subject: string): Faculty[] => {
  const normTarget = normalizeSubj(subject);

  const owners = faculties.filter(
    f =>
      f.subjects.some(s => normalizeSubj(s) === normTarget) &&
      f.assignedBatches &&
      f.assignedBatches.length > 0 &&
      f.assignedBatches.includes(batch.id)
  );
  if (owners.length > 0) return owners;

  return faculties.filter(
    f =>
      f.subjects.some(s => normalizeSubj(s) === normTarget) &&
      (!f.assignedBatches || f.assignedBatches.length === 0)
  );
};

// Decides which subject to prioritize next for an open slot, respecting:
// 1. Period 1 constraint: Never schedule language subjects in Period 1 (index 0).
// 2. K/H/S Grouping constraint: If batch is scheduled for K/H/S grouping in this slot, prioritize K/H/S.
// 3. Avoid consecutive same subjects for the batch on the same day.
// 4. Avoid same subject in same period across the week.
// 5. Weekly category deficit (PCMB vs Language ratio) and same-day deficit.
// 6. Stochastic variation so repeated generation runs produce diverse, non-repetitive valid timetables.
const getSubjectPriorityOrder = (
  batch: Batch,
  pIndex: number,
  todayAllocationsForBatch: Allocation[],
  weekAllocationsForBatch: Allocation[],
  settings: SchedulerSettings,
  isKHSGroupSlot: boolean = false,
  randomnessJitter: number = 0.2
): string[] => {
  if (batch.subjects.length === 0) return ['Self Study'];

  const normalizedSubjects = batch.subjects.map(s => ({
    ...s,
    subject: normalizeSubj(s.subject),
  }));

  const todayCounts: Record<string, number> = {};
  normalizedSubjects.forEach(s => {
    todayCounts[s.subject] = 0;
  });
  todayAllocationsForBatch.forEach(a => {
    const sName = normalizeSubj(a.subject);
    if (todayCounts[sName] !== undefined) todayCounts[sName]++;
  });

  // Check previous period's subject for this batch to prevent consecutive same subjects
  const previousSlotSubject =
    todayAllocationsForBatch.find(a => a.periodIndex === pIndex - 1)?.subject;
  const normalizedPrevSubject = previousSlotSubject
    ? normalizeSubj(previousSlotSubject)
    : null;

  // Check what subjects this batch had in this same period index on other days of the week
  const samePeriodSubjectsOnOtherDays = weekAllocationsForBatch
    .filter(a => a.periodIndex === pIndex && a.facultyId)
    .map(a => normalizeSubj(a.subject));

  // Category deficit
  const weekPCMB = weekAllocationsForBatch.filter(
    a => a.facultyId && isPCMBSubject(a.subject)
  ).length;
  const weekLang = weekAllocationsForBatch.filter(
    a => a.facultyId && isLanguageSubject(a.subject)
  ).length;
  const weekTotal = weekPCMB + weekLang;

  const targetPCMBRatio =
    settings.pcmbWeight / (settings.pcmbWeight + settings.languageWeight);
  const actualPCMBRatio = weekTotal === 0 ? targetPCMBRatio : weekPCMB / weekTotal;

  const categoryDeficit = (subject: string) =>
    isPCMBSubject(subject)
      ? targetPCMBRatio - actualPCMBRatio
      : 1 - targetPCMBRatio - (1 - actualPCMBRatio);

  return [...normalizedSubjects]
    .sort((a, b) => {
      // RULE 4: Language subjects should NOT be in the first period (pIndex === 0)
      if (pIndex === 0) {
        const aIsLang = isLanguageSubject(a.subject);
        const bIsLang = isLanguageSubject(b.subject);
        if (aIsLang && !bIsLang) return 1;
        if (!aIsLang && bIsLang) return -1;
      }

      // RULE 3: Coordinated K/H/S slot grouping for 3-4 sections
      if (isKHSGroupSlot) {
        const aIsKHS = isKHS(a.subject);
        const bIsKHS = isKHS(b.subject);
        if (aIsKHS && !bIsKHS) return -1;
        if (!aIsKHS && bIsKHS) return 1;
      }

      // Avoid consecutive same subject in adjacent periods for the same batch
      const aIsConsecutive = a.subject === normalizedPrevSubject;
      const bIsConsecutive = b.subject === normalizedPrevSubject;
      if (aIsConsecutive && !bIsConsecutive) return 1;
      if (!aIsConsecutive && bIsConsecutive) return -1;

      // Avoid repeating the same subject in the same period index as other days this week
      const aRepeatsDay = samePeriodSubjectsOnOtherDays.includes(a.subject);
      const bRepeatsDay = samePeriodSubjectsOnOtherDays.includes(b.subject);
      if (aRepeatsDay && !bRepeatsDay) return 1;
      if (!aRepeatsDay && bRepeatsDay) return -1;

      // Category deficit (PCMB vs Language balance)
      const catDiff = categoryDeficit(b.subject) - categoryDeficit(a.subject);
      if (Math.abs(catDiff) > 0.05) return catDiff;

      // Subject count deficit
      const weightA = a.count || 1;
      const weightB = b.count || 1;
      const deficitScore =
        todayCounts[a.subject] / weightA - todayCounts[b.subject] / weightB;

      // Controlled stochastic jitter for intelligent non-repetitive variation
      const jitter = (Math.random() - 0.5) * randomnessJitter;
      return deficitScore + jitter;
    })
    .map(s => s.subject);
};

// Slot assignment trying available faculty with clash prevention and fairness
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
  excludeFacultyId?: string,
  randomizeFacultyTie: boolean = true
): Allocation | null => {
  const primarySubject = orderedSubjects[0];

  for (const targetSubject of orderedSubjects) {
    const eligibleFaculty = getEligibleFaculty(faculties, batch, targetSubject).filter(
      f => f.id !== excludeFacultyId
    );

    const candidateScores: { faculty: Faculty; score: number; reasons: string[] }[] = [];

    eligibleFaculty.forEach(faculty => {
      if (faculty.isAbsent) return;

      const currentLoad = dailyWorkload[faculty.id] || 0;
      const maxLimit = faculty.maxPeriodsPerDay || settings.maxDailyPeriods;
      if (currentLoad >= maxLimit) return;

      // HARD CONSTRAINT: Prevent teacher time overlap across all batches
      const hasTimeConflict = allocations.some(a => {
        if (a.facultyId !== faculty.id) return false;
        const otherBatch = batches.find(b => b.id === a.batchId);
        if (!otherBatch) return false;
        const otherTiming = otherBatch.periods[a.periodIndex];
        return (
          otherTiming &&
          isOverlapping(
            periodTiming.startTime,
            periodTiming.endTime,
            otherTiming.startTime,
            otherTiming.endTime
          )
        );
      });
      if (hasTimeConflict) return;

      let score = 100;
      const reasons: string[] = [
        faculty.assignedBatches && faculty.assignedBatches.includes(batch.id)
          ? 'Assigned faculty for this batch.'
          : 'Eligible for subject and time.',
      ];

      if (currentLoad === 0) {
        score += 150;
        reasons.push('Fairness bonus: opening period of day (+150)');
      } else {
        score -= currentLoad * 15;
        reasons.push(`Daily load penalty: -${currentLoad * 15}`);
      }

      if (settings.enableConsecutivePeriodAvoidance) {
        const taughtLastPeriod = allocations.some(
          a =>
            a.facultyId === faculty.id &&
            a.batchId === batch.id &&
            a.periodIndex === pIndex - 1
        );
        if (taughtLastPeriod) {
          score -= 50;
          reasons.push('Consecutive period penalty: -50');
        }
      }

      if (settings.enableGapOptimization) {
        const taughtBefore = allocations.some(
          a => a.facultyId === faculty.id && a.periodIndex === pIndex - 1
        );
        const teachesAfter = allocations.some(
          a => a.facultyId === faculty.id && a.periodIndex === pIndex + 1
        );
        if (taughtBefore || teachesAfter) {
          score += 20;
          reasons.push('Gap optimization bonus: +20');
        }
      }

      if (targetSubject !== primarySubject) {
        reasons.unshift(`Subject adapted to "${targetSubject}" for scheduling balance.`);
      }

      // Add controlled small jitter to break deterministic ties evenly across teachers
      if (randomizeFacultyTie) {
        score += (Math.random() - 0.5) * 10;
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

// Generates an optimized cluster map that groups 3-4 sections for K/H/S during simultaneous slots
const buildKHSClusterScheduleMap = (
  batches: Batch[],
  existingDraft: Allocation[]
): Map<string, number> => {
  // Map of batchId -> preferred period index for K/H/S (must be Period 2, 3, 4, or 5; NEVER Period 0)
  const batchToKHSPeriodMap = new Map<string, number>();

  const sections = groupBatchesBySection(batches);
  const eligiblePeriods = [2, 3, 4]; // Periods 3, 4, 5 (0-indexed 2, 3, 4)

  Object.values(sections).forEach((sectionBatches, secIdx) => {
    const khsBatches = sectionBatches.filter(b =>
      b.subjects.some(s => isKHS(s.subject))
    );
    if (khsBatches.length === 0) return;

    // Group batches into clusters of 3 to 4 sections
    const clusterSize = 3 + Math.floor(Math.random() * 2); // 3 or 4
    for (let i = 0; i < khsBatches.length; i += clusterSize) {
      const cluster = khsBatches.slice(i, i + clusterSize);
      // Pick a suitable period for this cluster of 3-4 sections
      const chosenPeriod = eligiblePeriods[(secIdx + Math.floor(i / clusterSize)) % eligiblePeriods.length];

      cluster.forEach(b => {
        // If batch already has a frozen cell in that period, skip
        const isFrozenInSlot = existingDraft.some(
          a => a.batchId === b.id && a.periodIndex === chosenPeriod && a.frozen
        );
        if (!isFrozenInSlot) {
          batchToKHSPeriodMap.set(b.id, chosenPeriod);
        }
      });
    }
  });

  return batchToKHSPeriodMap;
};

// Evaluates a candidate timetable against academic quality and constraint metrics
const evaluateCandidateTimetable = (
  allocations: Allocation[],
  batches: Batch[],
  weekAllocations: Allocation[]
): number => {
  let score = 1000;

  // 1. RULE: Language in Period 1 penalty (Must be strictly avoided)
  allocations.forEach(a => {
    if (a.periodIndex === 0 && isLanguageSubject(a.subject)) {
      score -= 500;
    }
  });

  // 2. RULE: K/H/S Grouping Reward (Count sections having K/H/S simultaneously per period)
  for (let pIndex = 1; pIndex < 6; pIndex++) {
    const khsInPeriodCount = allocations.filter(
      a => a.periodIndex === pIndex && isKHS(a.subject) && a.facultyId
    ).length;
    // Reward groupings of 3 to 4 sections
    if (khsInPeriodCount >= 3) {
      score += khsInPeriodCount * 30;
    }
  }

  // 3. RULE: Avoid consecutive periods of the same subject within each batch
  batches.forEach(b => {
    const batchAlloc = allocations
      .filter(a => a.batchId === b.id)
      .sort((a, b) => a.periodIndex - b.periodIndex);
    for (let i = 1; i < batchAlloc.length; i++) {
      if (
        batchAlloc[i].periodIndex === batchAlloc[i - 1].periodIndex + 1 &&
        batchAlloc[i].subject === batchAlloc[i - 1].subject
      ) {
        score -= 40; // Penalty for back-to-back same subject
      }
    }

    // 4. RULE: Avoid repeating the same subject in the same period index across the week
    batchAlloc.forEach(a => {
      const repeatedInWeek = weekAllocations.some(
        wa =>
          wa.batchId === b.id &&
          wa.periodIndex === a.periodIndex &&
          normalizeSubj(wa.subject) === normalizeSubj(a.subject)
      );
      if (repeatedInWeek) {
        score -= 25; // Penalty for predictable day-to-day period repetition
      }
    });

    // 5. Variety reward: number of unique subjects taught in the batch today
    const uniqueSubjects = new Set(batchAlloc.map(a => normalizeSubj(a.subject))).size;
    score += uniqueSubjects * 15;
  });

  return score;
};

// Generates a single valid candidate timetable
const generateCandidateRun = (
  batches: Batch[],
  faculties: Faculty[],
  existingDraft: Allocation[],
  weekAllocations: Allocation[],
  settings: SchedulerSettings
): Allocation[] => {
  const allocations: Allocation[] = existingDraft.filter(a => a.frozen);

  const dailyWorkload: Record<string, number> = {};
  allocations.forEach(a => {
    if (a.facultyId) {
      dailyWorkload[a.facultyId] = (dailyWorkload[a.facultyId] || 0) + 1;
    }
  });

  const maxPeriodSlots = Math.max(...batches.map(b => b.periods.length), 6);
  const khsClusterMap = buildKHSClusterScheduleMap(batches, existingDraft);

  // Randomize batch evaluation order slightly per candidate run to diversify slot assignments
  const shuffledBatches = [...batches].sort(() => Math.random() - 0.5);

  for (let pIndex = 0; pIndex < maxPeriodSlots; pIndex++) {
    for (const batch of shuffledBatches) {
      const periodTiming = batch.periods[pIndex];
      if (!periodTiming || !periodTiming.startTime || !periodTiming.endTime) continue;

      const hasFrozenCell = allocations.some(
        a => a.batchId === batch.id && a.periodIndex === pIndex
      );
      if (hasFrozenCell) continue;

      const todayAllocationsForBatch = allocations.filter(a => a.batchId === batch.id);
      const weekAllocationsForBatch = weekAllocations.filter(a => a.batchId === batch.id);

      const isKHSGroupSlot = khsClusterMap.get(batch.id) === pIndex;

      const orderedSubjects = getSubjectPriorityOrder(
        batch,
        pIndex,
        todayAllocationsForBatch,
        weekAllocationsForBatch,
        settings,
        isKHSGroupSlot,
        0.35 // stochastic jitter
      );

      const newAllocation = tryAssignSlot(
        batch,
        batches,
        pIndex,
        periodTiming,
        orderedSubjects,
        faculties,
        allocations,
        dailyWorkload,
        settings,
        undefined,
        true
      );

      if (newAllocation) {
        allocations.push(newAllocation);
        dailyWorkload[newAllocation.facultyId] =
          (dailyWorkload[newAllocation.facultyId] || 0) + 1;
      }
    }
  }

  return allocations;
};

// V2 Engine with Multi-Candidate Search, K/H/S Grouping, Period 1 Language Protection,
// and Intelligent Subject Randomization.
export const generateTimetableV2 = (
  batches: Batch[],
  faculties: Faculty[],
  existingDraft: Allocation[],
  weekAllocations: Allocation[] = []
): Allocation[] => {
  const settings = storage.getSettings();

  // Multi-candidate search: Generate multiple valid candidates and select the highest quality solution
  const NUM_CANDIDATES = 6;
  let bestCandidate: Allocation[] = [];
  let bestScore = -Infinity;

  for (let c = 0; c < NUM_CANDIDATES; c++) {
    const candidate = generateCandidateRun(
      batches,
      faculties,
      existingDraft,
      weekAllocations,
      settings
    );
    const score = evaluateCandidateTimetable(candidate, batches, weekAllocations);

    if (score > bestScore || bestCandidate.length === 0) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  storage.logAuditAction('TIMETABLE_GENERATE', {
    reason: `Generated optimized timetable allocations (${bestCandidate.length} slots scheduled, multi-candidate quality score: ${Math.round(bestScore)}).`,
  });

  return bestCandidate;
};

// Re-checks an already-generated day's allocations against the current absence list.
// Preserves Period 1 language avoidance and K/H/S grouping where possible.
export const patchAbsences = (
  batches: Batch[],
  faculties: Faculty[],
  dayAllocations: Allocation[]
): Allocation[] => {
  const settings = storage.getSettings();
  const facultyById: Record<string, Faculty> = {};
  faculties.forEach(f => {
    facultyById[f.id] = f;
  });

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
      dailyWorkload[currentFaculty.id] = Math.max(
        0,
        (dailyWorkload[currentFaculty.id] || 1) - 1
      );

      const restOfAllocations = allocations.filter((_, idx) => idx !== i);
      const orderedSubjects = getSubjectPriorityOrder(
        batch,
        alloc.periodIndex,
        restOfAllocations.filter(a => a.batchId === batch.id),
        [],
        settings,
        false,
        0
      );

      const replacement = tryAssignSlot(
        batch,
        batches,
        alloc.periodIndex,
        periodTiming,
        orderedSubjects,
        faculties,
        restOfAllocations,
        dailyWorkload,
        settings,
        currentFaculty.id,
        false
      );

      if (replacement) {
        dailyWorkload[replacement.facultyId] =
          (dailyWorkload[replacement.facultyId] || 0) + 1;
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
          explanation: [
            `Gap: ${currentFaculty.name} is absent. No substitute or alternate subject available for this slot.`,
          ],
          updatedAt: Date.now(),
        };
      }
      continue;
    }

    // Case 2: Slot was previously a Gap, check if vacated faculty returned or substitute is now available
    if (!alloc.facultyId && alloc.vacatedFacultyId) {
      if (vacatedFaculty && !vacatedFaculty.isAbsent) {
        const canRestore = !allocations.some((other, idx) => {
          if (idx === i || other.facultyId !== vacatedFaculty.id) return false;
          const otherBatch = batches.find(b => b.id === other.batchId);
          if (!otherBatch) return false;
          const otherTiming = otherBatch.periods[other.periodIndex];
          return (
            otherTiming &&
            isOverlapping(
              periodTiming.startTime,
              periodTiming.endTime,
              otherTiming.startTime,
              otherTiming.endTime
            )
          );
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
        alloc.periodIndex,
        restOfAllocations.filter(a => a.batchId === batch.id),
        [],
        settings,
        false,
        0
      );

      const replacement = tryAssignSlot(
        batch,
        batches,
        alloc.periodIndex,
        periodTiming,
        orderedSubjects,
        faculties,
        restOfAllocations,
        dailyWorkload,
        settings,
        undefined,
        false
      );

      if (replacement) {
        dailyWorkload[replacement.facultyId] =
          (dailyWorkload[replacement.facultyId] || 0) + 1;
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
    reason: 'Synchronized faculty absences and re-balanced affected schedule allocations.',
  });

  return allocations;
};
