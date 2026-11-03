import type {
  Batch,
  Faculty,
  Allocation,
  SchedulerSettings,
  UnfilledSlot,
  ScheduleWarning,
  GenerationResult,
  SubstituteCandidate,
  SubjectCapacityReport,
} from '../types';
import { storage } from './storage';
import { isOverlapping } from './validation';
import { canAssign, getDailyLimit, validateFrozenAllocations } from './constraints';
import { groupBatchesBySection } from './sections';

export const PCMB_SUBJECTS = ['Physics', 'Chemistry', 'Mathematics', 'Biology'];
export const LANGUAGE_SUBJECTS = ['English', 'K/H/S', 'Second Language', 'Kannada', 'Hindi', 'Sanskrit'];

export const isPCMBSubject = (subject: string): boolean => PCMB_SUBJECTS.includes(subject);
export const isLanguageSubject = (subject: string): boolean =>
  LANGUAGE_SUBJECTS.includes(subject) || subject.toLowerCase().includes('lang');
export const isKHS = (subject: string): boolean =>
  subject === 'K/H/S' || subject === 'Second Language' || subject.toLowerCase().includes('k/h');

// Helper to normalize subject string
export const normalizeSubj = (s: string) => (s === 'Second Language' ? 'K/H/S' : s);

// -------------------------------------------------------------
// SEEDABLE PSEUDO-RANDOM NUMBER GENERATOR (M1)
// Mulberry32: fast, 32-bit state, high quality distribution
// -------------------------------------------------------------
export const createPRNG = (seed: number) => {
  let s = (seed || 123456789) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const shuffleWithPRNG = <T>(array: T[], rng: () => number): T[] => {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

// -------------------------------------------------------------
// WEEKLY QUOTA CALCULATION (H1: Largest-Remainder Method)
// -------------------------------------------------------------
export const calculateWeeklyQuotas = (
  batch: Batch,
  teachingDaysCount = 6
): Record<string, number> => {
  const subjects = batch.subjects.map(s => ({
    subject: normalizeSubj(s.subject),
    weight: Math.max(1, s.count || 1),
  }));

  const activePeriodsPerDay = batch.periods.filter(p => p && p.startTime && p.endTime).length || 6;
  const totalWeeklySlots = activePeriodsPerDay * teachingDaysCount;

  const totalWeight = subjects.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight === 0) return {};

  const quotas: Record<string, number> = {};
  const remainders: { subject: string; remainder: number }[] = [];
  let allocatedSum = 0;

  subjects.forEach(s => {
    const exact = (s.weight / totalWeight) * totalWeeklySlots;
    const integerPart = Math.floor(exact);
    quotas[s.subject] = integerPart;
    allocatedSum += integerPart;
    remainders.push({ subject: s.subject, remainder: exact - integerPart });
  });

  // Largest-remainder distribution for fractional quotas
  remainders.sort((a, b) => b.remainder - a.remainder);
  let shortfall = totalWeeklySlots - allocatedSum;
  let idx = 0;
  while (shortfall > 0 && remainders.length > 0) {
    const targetSub = remainders[idx % remainders.length].subject;
    quotas[targetSub] = (quotas[targetSub] || 0) + 1;
    shortfall--;
    idx++;
  }

  return quotas;
};

// Returns teachers qualified for subject, respecting batch lock restrictions
export const getEligibleFaculty = (
  faculties: Faculty[],
  batch: Batch,
  subject: string
): Faculty[] => {
  const normTarget = normalizeSubj(subject);

  // 1. Exclusive batch locks take absolute precedence
  const lockedOwners = faculties.filter(
    f =>
      f.subjects.some(s => normalizeSubj(s) === normTarget) &&
      f.assignedBatches &&
      f.assignedBatches.length > 0 &&
      f.assignedBatches.includes(batch.id)
  );
  if (lockedOwners.length > 0) return lockedOwners;

  // 2. Unrestricted teachers (not locked to other batches)
  return faculties.filter(
    f =>
      f.subjects.some(s => normalizeSubj(s) === normTarget) &&
      (!f.assignedBatches || f.assignedBatches.length === 0)
  );
};

// -------------------------------------------------------------
// TEACHING CAPACITY PRE-CHECK (Phase 5B)
// -------------------------------------------------------------
export const calculateCapacityReport = (
  batches: Batch[],
  faculties: Faculty[],
  settings: SchedulerSettings,
  teachingDays = 6
): SubjectCapacityReport[] => {
  const demandBySubject: Record<string, number> = {};
  const allSubjectsSet = new Set<string>();

  batches.forEach(b => {
    const quotas = calculateWeeklyQuotas(b, teachingDays);
    Object.entries(quotas).forEach(([subj, count]) => {
      demandBySubject[subj] = (demandBySubject[subj] || 0) + count;
      allSubjectsSet.add(subj);
    });
  });

  const reports: SubjectCapacityReport[] = [];

  allSubjectsSet.forEach(subj => {
    const qualified = faculties.filter(f => f.subjects.some(s => normalizeSubj(s) === subj));
    const qualifiedNonAbsent = qualified.filter(f => !f.isAbsent);

    let availableCapacity = 0;
    qualifiedNonAbsent.forEach(f => {
      const dailyLimit = getDailyLimit(f, settings);
      availableCapacity += dailyLimit * teachingDays;
    });

    const required = demandBySubject[subj] || 0;
    const deficit = required - availableCapacity;

    reports.push({
      subject: subj,
      category: isPCMBSubject(subj) ? 'Core' : isLanguageSubject(subj) ? 'Language' : 'Other',
      requiredWeeklyPeriods: required,
      availableWeeklyPeriods: availableCapacity,
      deficit: Math.max(0, deficit),
      facultyCount: qualified.length,
      qualifiedFacultyNames: qualified.map(f => f.name),
      status: deficit > 0 ? 'deficit' : availableCapacity === required ? 'balanced' : 'surplus',
    });
  });

  return reports.sort((a, b) => b.deficit - a.deficit);
};

// -------------------------------------------------------------
// K/H/S SIMULTANEOUS GROUPING MAP (Requirement 3)
// Groups 3 to 4 sections together in Periods 2, 3, or 4
// -------------------------------------------------------------
export const buildKHSClusterScheduleMap = (
  batches: Batch[],
  existingDraft: Allocation[],
  rng: () => number
): Map<string, number> => {
  const batchToKHSPeriodMap = new Map<string, number>();
  const sections = groupBatchesBySection(batches);
  const eligiblePeriods = [1, 2, 3]; // Periods 2, 3, 4 (0-indexed)

  Object.values(sections).forEach((sectionBatches, secIdx) => {
    const khsBatches = sectionBatches.filter(b => b.subjects.some(s => isKHS(s.subject)));
    if (khsBatches.length === 0) return;

    // Clusters of 3 to 4 sections
    const clusterSize = 3 + Math.floor(rng() * 2);
    for (let i = 0; i < khsBatches.length; i += clusterSize) {
      const cluster = khsBatches.slice(i, i + clusterSize);
      const chosenPeriod = eligiblePeriods[(secIdx + Math.floor(i / clusterSize)) % eligiblePeriods.length];

      cluster.forEach(b => {
        const isFrozen = existingDraft.some(
          a => a.batchId === b.id && a.periodIndex === chosenPeriod && a.frozen
        );
        if (!isFrozen) {
          batchToKHSPeriodMap.set(b.id, chosenPeriod);
        }
      });
    }
  });

  return batchToKHSPeriodMap;
};

// -------------------------------------------------------------
// SHARED SCORING FUNCTION (H5: scoreAssignment)
// Evaluates both subject preference and teacher quality
// -------------------------------------------------------------
export interface AssignmentScoreContext {
  batch: Batch;
  periodIndex: number;
  subject: string;
  faculty: Faculty;
  todayAllocations: Allocation[];
  weekAllocations: Allocation[];
  targetWeeklyQuotas: Record<string, number>;
  dailyWorkload: Record<string, number>;
  settings: SchedulerSettings;
  isKHSGroupSlot: boolean;
  dateKey?: string;
}

export const scoreAssignment = (ctx: AssignmentScoreContext): { score: number; reasons: string[] } => {
  const {
    batch,
    periodIndex,
    subject,
    faculty,
    todayAllocations,
    weekAllocations,
    targetWeeklyQuotas,
    dailyWorkload,
    settings,
    isKHSGroupSlot,
  } = ctx;

  let score = 100;
  const reasons: string[] = [];

  // --- HARD CONSTRAINT PENALTIES (Instant Disqualification) ---
  if (faculty.isAbsent) return { score: -Infinity, reasons: ['Teacher is absent'] };

  // --- SOFT RULE 1: Period 1 No Languages (H3) ---
  if (periodIndex === 0 && isLanguageSubject(subject)) {
    score -= 300;
    reasons.push('Period 1 language penalty: -300');
  } else if (periodIndex === 0 && isPCMBSubject(subject)) {
    score += 50;
    reasons.push('Period 1 core subject preference: +50');
  }

  // --- SOFT RULE 2: Anti-Repetition (H2) ---
  // Back-to-back same subject in this batch
  const prevPeriodAlloc = todayAllocations.find(a => a.periodIndex === periodIndex - 1);
  if (prevPeriodAlloc && normalizeSubj(prevPeriodAlloc.subject) === normalizeSubj(subject)) {
    score -= 120;
    reasons.push('Consecutive same-subject penalty: -120');
  }

  // Third or subsequent occurrence today
  const subjectTodayCount = todayAllocations.filter(
    a => normalizeSubj(a.subject) === normalizeSubj(subject)
  ).length;
  if (subjectTodayCount >= 2) {
    score -= 80;
    reasons.push('Subject already scheduled twice today: -80');
  }

  // Same subject in the same period index across the week
  const samePeriodOtherDays = weekAllocations.filter(
    a => a.periodIndex === periodIndex && normalizeSubj(a.subject) === normalizeSubj(subject)
  ).length;
  if (samePeriodOtherDays > 0) {
    score -= 40 * samePeriodOtherDays;
    reasons.push(`Repeats same period on other days: -${40 * samePeriodOtherDays}`);
  }

  // --- SOFT RULE 3: Weekly Subject Quota Deficit (H1) ---
  const targetQuota = targetWeeklyQuotas[normalizeSubj(subject)] || 4;
  const allocatedWeekCount = weekAllocations.filter(
    a => normalizeSubj(a.subject) === normalizeSubj(subject)
  ).length;
  const remainingDeficit = targetQuota - allocatedWeekCount;

  if (remainingDeficit > 0) {
    score += remainingDeficit * 25;
    reasons.push(`Weekly quota deficit priority: +${remainingDeficit * 25}`);
  } else if (remainingDeficit <= 0) {
    score -= 50;
    reasons.push('Weekly quota already achieved: -50');
  }

  // --- SOFT RULE 4: K/H/S Simultaneous Grouping (Requirement 3) ---
  if (isKHSGroupSlot && isKHS(subject)) {
    score += 90;
    reasons.push('Synchronized K/H/S cross-section cluster bonus: +90');
  }

  // --- SOFT RULE 5: Teacher Workload Balance & Gaps ---
  const currentLoad = dailyWorkload[faculty.id] || 0;
  if (currentLoad === 0) {
    score += 30; // Encourage fair daily utilization
    reasons.push('Zero-load teacher fairness bonus: +30');
  }

  if (settings.enableGapOptimization) {
    const taughtBefore = todayAllocations.some(
      a => a.facultyId === faculty.id && a.periodIndex === periodIndex - 1
    );
    const teachesAfter = todayAllocations.some(
      a => a.facultyId === faculty.id && a.periodIndex === periodIndex + 1
    );
    if (taughtBefore || teachesAfter) {
      score += 20;
      reasons.push('Gap reduction bonus: +20');
    }
  }

  // Exclusive batch lock preference
  if (faculty.assignedBatches && faculty.assignedBatches.includes(batch.id)) {
    score += 40;
    reasons.push('Assigned batch lock preference: +40');
  }

  return { score, reasons };
};

// -------------------------------------------------------------
// CANDIDATE EVALUATION METRIC (H5: Lexicographical Quality)
// -------------------------------------------------------------
export const evaluateTimetableCandidate = (
  allocations: Allocation[],
  batches: Batch[],
  _weekAllocations: Allocation[],
  unfilledCount: number
): number => {
  let score = 10000 - unfilledCount * 1000;

  // Track teacher overlaps (hard constraint: -50000 each) using fast grouped index
  const batchMap = new Map<string, Batch>();
  for (const b of batches) {
    batchMap.set(b.id, b);
  }

  const facultyAllocations = new Map<string, Allocation[]>();
  for (const a of allocations) {
    if (a.facultyId) {
      let list = facultyAllocations.get(a.facultyId);
      if (!list) {
        list = [];
        facultyAllocations.set(a.facultyId, list);
      }
      list.push(a);
    }
  }

  for (const list of facultyAllocations.values()) {
    if (list.length <= 1) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a1 = list[i];
        const a2 = list[j];
        const b1 = batchMap.get(a1.batchId);
        const b2 = batchMap.get(a2.batchId);
        const t1 = b1?.periods[a1.periodIndex];
        const t2 = b2?.periods[a2.periodIndex];
        if (t1 && t2 && isOverlapping(t1.startTime, t1.endTime, t2.startTime, t2.endTime)) {
          score -= 50000;
        }
      }
    }
  }

  // Soft penalties: Period 1 language, consecutive repetitions
  const batchAllocations = new Map<string, Allocation[]>();
  for (const a of allocations) {
    let list = batchAllocations.get(a.batchId);
    if (!list) {
      list = [];
      batchAllocations.set(a.batchId, list);
    }
    list.push(a);
  }

  for (const b of batches) {
    const bAllocs = batchAllocations.get(b.id) || [];
    bAllocs.sort((a, b) => a.periodIndex - b.periodIndex);

    // Period 1 language penalty
    const p1 = bAllocs.find(a => a.periodIndex === 0);
    if (p1 && isLanguageSubject(p1.subject)) {
      score -= 500;
    }

    // Consecutive repetitions
    for (let i = 1; i < bAllocs.length; i++) {
      if (
        bAllocs[i].periodIndex === bAllocs[i - 1].periodIndex + 1 &&
        normalizeSubj(bAllocs[i].subject) === normalizeSubj(bAllocs[i - 1].subject)
      ) {
        score -= 200;
      }
    }
  }

  return score;
};

// -------------------------------------------------------------
// CORE CANDIDATE SCHEDULING RUN
// -------------------------------------------------------------
interface SlotTask {
  batch: Batch;
  periodIndex: number;
  periodTiming: { startTime: string; endTime: string };
  isKHSGroup: boolean;
  degreeOfFreedom: number;
}

const generateCandidateRun = (
  batches: Batch[],
  faculties: Faculty[],
  existingDraft: Allocation[],
  weekAllocations: Allocation[],
  settings: SchedulerSettings,
  khsClusterMap: Map<string, number>,
  weeklyQuotasMap: Map<string, Record<string, number>>,
  rng: () => number,
  dateKey?: string
): { allocations: Allocation[]; unfilled: UnfilledSlot[]; warnings: ScheduleWarning[] } => {
  const allocations: Allocation[] = [...existingDraft.filter(a => a.frozen)];
  const dailyWorkload: Record<string, number> = {};

  allocations.forEach(a => {
    if (a.facultyId) {
      dailyWorkload[a.facultyId] = (dailyWorkload[a.facultyId] || 0) + 1;
    }
  });

  const tasks: SlotTask[] = [];

  // Build slot task list for all open slots
  batches.forEach(batch => {
    batch.periods.forEach((timing, pIndex) => {
      if (!timing || !timing.startTime || !timing.endTime) return;
      const isFrozen = allocations.some(
        a => a.batchId === batch.id && a.periodIndex === pIndex && a.frozen
      );
      if (isFrozen) return;

      const isKHSGroup = khsClusterMap.get(batch.id) === pIndex;

      // Degree of freedom estimate: how many teachers qualify for subjects of this batch
      let totalEligibleCount = 0;
      batch.subjects.forEach(s => {
        totalEligibleCount += getEligibleFaculty(faculties, batch, s.subject).length;
      });

      tasks.push({
        batch,
        periodIndex: pIndex,
        periodTiming: timing,
        isKHSGroup,
        degreeOfFreedom: totalEligibleCount,
      });
    });
  });

  // H5B: Most-constrained-first ordering with controlled jitter
  tasks.sort((a, b) => {
    // If K/H/S synchronized cluster, schedule early
    if (a.isKHSGroup && !b.isKHSGroup) return -1;
    if (!a.isKHSGroup && b.isKHSGroup) return 1;

    // Period 1 slots get priority to secure core subjects
    if (a.periodIndex === 0 && b.periodIndex !== 0) return -1;
    if (a.periodIndex !== 0 && b.periodIndex === 0) return 1;

    // Constrained subjects first
    return a.degreeOfFreedom - b.degreeOfFreedom + (rng() - 0.5) * 2;
  });

  const unfilled: UnfilledSlot[] = [];
  const warnings: ScheduleWarning[] = [];

  // Fill slots
  for (const task of tasks) {
    const { batch, periodIndex, isKHSGroup } = task;
    const targetWeeklyQuotas = weeklyQuotasMap.get(batch.id) || {};
    const todayAllocations = allocations.filter(a => a.batchId === batch.id);
    const weekBatchAllocations = weekAllocations.filter(a => a.batchId === batch.id);

    // Build candidate subject list sorted by quota deficit & rules
    const candidateSubjects = batch.subjects.map(s => normalizeSubj(s.subject));

    // Evaluate all (subject, faculty) pairs
    let bestOption: {
      faculty: Faculty;
      subject: string;
      score: number;
      reasons: string[];
    } | null = null;

    const failureReasons: string[] = [];

    for (const subject of candidateSubjects) {
      const eligibleTeachers = getEligibleFaculty(faculties, batch, subject);
      if (eligibleTeachers.length === 0) {
        failureReasons.push(`No faculty registered with qualification "${subject}"`);
        continue;
      }

      for (const faculty of eligibleTeachers) {
        const assignResult = canAssign(
          faculty,
          batch,
          periodIndex,
          allocations,
          batches,
          settings,
          { dateKey }
        );

        if (!assignResult.ok) {
          if (assignResult.type === 'TIME_OVERLAP') {
            failureReasons.push(`${faculty.name} is teaching ${assignResult.conflictingBatchName} at this time`);
          } else if (assignResult.type === 'MAX_LOAD') {
            failureReasons.push(`${faculty.name} reached max daily limit`);
          } else if (assignResult.type === 'ABSENT') {
            failureReasons.push(`${faculty.name} is absent`);
          } else if (assignResult.type === 'BATCH_RESTRICTION') {
            failureReasons.push(`${faculty.name} is restricted to other batches`);
          }
          continue;
        }

        const evaluation = scoreAssignment({
          batch,
          periodIndex,
          subject,
          faculty,
          todayAllocations,
          weekAllocations: weekBatchAllocations,
          targetWeeklyQuotas,
          dailyWorkload,
          settings,
          isKHSGroupSlot: isKHSGroup,
          dateKey,
        });

        // Add small reproducible jitter
        const jitter = (rng() - 0.5) * 8;
        const totalScore = evaluation.score + jitter;

        if (!bestOption || totalScore > bestOption.score) {
          bestOption = {
            faculty,
            subject,
            score: totalScore,
            reasons: evaluation.reasons,
          };
        }
      }
    }

    if (bestOption) {
      const newAlloc: Allocation = {
        batchId: batch.id,
        periodIndex,
        facultyId: bestOption.faculty.id,
        subject: bestOption.subject,
        autoGenerated: true,
        manualEdited: false,
        frozen: false,
        explanation: bestOption.reasons,
        updatedAt: Date.now(),
      };
      allocations.push(newAlloc);
      dailyWorkload[bestOption.faculty.id] = (dailyWorkload[bestOption.faculty.id] || 0) + 1;

      if (periodIndex === 0 && isLanguageSubject(bestOption.subject)) {
        warnings.push({
          type: 'PERIOD_1_LANGUAGE',
          severity: 'warning',
          batchId: batch.id,
          periodIndex: 0,
          facultyId: bestOption.faculty.id,
          message: `Batch "${batch.name}" was scheduled with language "${bestOption.subject}" in Period 1 due to teacher availability constraints.`,
        });
      }
    } else {
      // H4: Explicit unfilled slot reporting
      const primaryReason =
        failureReasons.length > 0
          ? failureReasons[0]
          : 'All eligible teachers are busy with other batches or reached daily limit';

      unfilled.push({
        batchId: batch.id,
        batchName: batch.name,
        periodIndex,
        requiredSubject: batch.subjects[0]?.subject || 'Unassigned',
        reason: primaryReason,
        candidateIssue: failureReasons.slice(0, 3).join('; '),
      });
    }
  }

  return { allocations, unfilled, warnings };
};

// -------------------------------------------------------------
// MAIN SCHEDULER ENTRY POINT (generateTimetableV2)
// -------------------------------------------------------------
export const generateTimetableV2 = (
  batches: Batch[],
  faculties: Faculty[],
  existingDraft: Allocation[],
  weekAllocations: Allocation[] = [],
  options?: {
    seed?: number;
    dateKey?: string;
    numCandidates?: number;
  }
): GenerationResult => {
  const settings = storage.getSettings();
  const seed = options?.seed ?? Math.floor(Math.random() * 1000000);
  const rng = createPRNG(seed);
  const dateKey = options?.dateKey;

  // C2: Validate existing frozen allocations
  const frozenList = existingDraft.filter(a => a.frozen);
  const frozenValidation = validateFrozenAllocations(
    frozenList,
    batches,
    faculties,
    settings,
    dateKey
  );

  const initialWarnings: ScheduleWarning[] = [];
  if (!frozenValidation.valid) {
    frozenValidation.invalidEntries.forEach(item => {
      initialWarnings.push({
        type: 'ABSENCE_GAP',
        severity: 'warning',
        batchId: item.allocation.batchId,
        periodIndex: item.allocation.periodIndex,
        facultyId: item.allocation.facultyId,
        message: `Locked slot conflict: ${item.reason}`,
      });
    });
  }

  // Precompute weekly quotas for all batches (H1)
  const weeklyQuotasMap = new Map<string, Record<string, number>>();
  batches.forEach(b => weeklyQuotasMap.set(b.id, calculateWeeklyQuotas(b)));

  // Build simultaneous K/H/S cluster map (Requirement 3)
  const khsClusterMap = buildKHSClusterScheduleMap(batches, existingDraft, rng);

  // Multi-candidate search: Generate N candidates and evaluate lexicographically (H5)
  const NUM_CANDIDATES = options?.numCandidates ?? 3;
  let bestCandidateResult: {
    allocations: Allocation[];
    unfilled: UnfilledSlot[];
    warnings: ScheduleWarning[];
  } | null = null;
  let bestScore = -Infinity;

  for (let c = 0; c < NUM_CANDIDATES; c++) {
    // Each candidate gets an independent sub-stream from the PRNG
    const candidateRng = createPRNG((seed + c * 31) >>> 0);
    const candidateResult = generateCandidateRun(
      batches,
      faculties,
      existingDraft,
      weekAllocations,
      settings,
      khsClusterMap,
      weeklyQuotasMap,
      candidateRng,
      dateKey
    );

    const score = evaluateTimetableCandidate(
      candidateResult.allocations,
      batches,
      weekAllocations,
      candidateResult.unfilled.length
    );

    if (score > bestScore || !bestCandidateResult) {
      bestScore = score;
      bestCandidateResult = candidateResult;
    }
  }

  const finalAllocations = bestCandidateResult?.allocations || existingDraft;
  const finalUnfilled = bestCandidateResult?.unfilled || [];
  const finalWarnings = [...initialWarnings, ...(bestCandidateResult?.warnings || [])];

  storage.logAuditAction('TIMETABLE_GENERATE', {
    reason: `Generated timetable: ${finalAllocations.length} slots assigned, ${finalUnfilled.length} unfilled. Multi-candidate score: ${Math.round(bestScore)}. (Seed: ${seed})`,
  });

  return {
    allocations: finalAllocations,
    unfilled: finalUnfilled,
    warnings: finalWarnings,
    frozenViolations: frozenValidation.invalidEntries,
    score: bestScore,
    seed,
  };
};

// -------------------------------------------------------------
// ABSENCE PATCHING (H6: Original-Subject-First)
// -------------------------------------------------------------
export const patchAbsences = (
  currentAllocations: Allocation[],
  batches: Batch[],
  faculties: Faculty[],
  settings?: SchedulerSettings,
  dateKey?: string
): { updatedAllocations: Allocation[]; patchedCount: number; remainingGapsCount: number } => {
  const activeSettings = settings || storage.getSettings();
  let patchedCount = 0;
  let remainingGapsCount = 0;

  const dailyWorkload: Record<string, number> = {};
  currentAllocations.forEach(a => {
    if (a.facultyId) {
      dailyWorkload[a.facultyId] = (dailyWorkload[a.facultyId] || 0) + 1;
    }
  });

  const updatedAllocations = currentAllocations.map(alloc => {
    if (!alloc.facultyId) {
      if (alloc.vacatedFacultyId) remainingGapsCount++;
      return alloc;
    }

    const assignedFaculty = faculties.find(f => f.id === alloc.facultyId);
    if (!assignedFaculty) return alloc;

    const isAbsent = Boolean(
      assignedFaculty.isAbsent ||
      (dateKey && assignedFaculty.unavailableDates && assignedFaculty.unavailableDates.includes(dateKey))
    );

    if (!isAbsent) return alloc;

    // Faculty is absent. Search for a replacement teacher of the SAME subject first (H6)
    const targetBatch = batches.find(b => b.id === alloc.batchId);
    if (!targetBatch) return alloc;

    const qualifiedTeachers = getEligibleFaculty(faculties, targetBatch, alloc.subject);

    // Rank candidate substitutes
    const availableSubs = qualifiedTeachers.filter(candidate => {
      if (candidate.id === assignedFaculty.id) return false;
      const assignCheck = canAssign(
        candidate,
        targetBatch,
        alloc.periodIndex,
        currentAllocations,
        batches,
        activeSettings,
        { dateKey }
      );
      return assignCheck.ok;
    });

    if (availableSubs.length > 0) {
      // Pick substitute with lowest daily load for fairness
      availableSubs.sort(
        (a, b) => (dailyWorkload[a.id] || 0) - (dailyWorkload[b.id] || 0)
      );
      const chosenSub = availableSubs[0];

      patchedCount++;
      dailyWorkload[chosenSub.id] = (dailyWorkload[chosenSub.id] || 0) + 1;

      storage.logAuditAction('ABSENCE_SYNC', {
        batchId: alloc.batchId,
        periodIndex: alloc.periodIndex,
        previousFacultyId: assignedFaculty.id,
        newFacultyId: chosenSub.id,
        reason: `Substituted ${chosenSub.name} for absent teacher ${assignedFaculty.name} (${alloc.subject}) in ${targetBatch.name}.`,
      });

      return {
        ...alloc,
        facultyId: chosenSub.id,
        vacatedFacultyId: assignedFaculty.id,
        vacatedFacultyName: assignedFaculty.name,
        explanation: [
          ...(alloc.explanation || []),
          `Substituted for absent teacher ${assignedFaculty.name} on ${new Date().toLocaleDateString()}`,
        ],
        updatedAt: Date.now(),
      };
    }

    // No substitute found: mark as an explicit gap
    remainingGapsCount++;
    return {
      ...alloc,
      facultyId: '',
      vacatedFacultyId: assignedFaculty.id,
      vacatedFacultyName: assignedFaculty.name,
      explanation: [
        ...(alloc.explanation || []),
        `Assigned teacher ${assignedFaculty.name} is absent. No replacement available without schedule conflicts.`,
      ],
      updatedAt: Date.now(),
    };
  });

  storage.logAuditAction('ABSENCE_SYNC', {
    reason: `Absence synchronization complete: ${patchedCount} slots covered by substitutes, ${remainingGapsCount} unresolved gaps.`,
  });

  return { updatedAllocations, patchedCount, remainingGapsCount };
};

// -------------------------------------------------------------
// RANKED SUBSTITUTE TEACHER SUGGESTIONS (Phase 5I)
// -------------------------------------------------------------
export const getRankedSubstitutes = (
  batchId: string,
  periodIndex: number,
  subject: string,
  allocations: Allocation[],
  batches: Batch[],
  faculties: Faculty[],
  settings?: SchedulerSettings,
  dateKey?: string
): SubstituteCandidate[] => {
  const activeSettings = settings || storage.getSettings();
  const targetBatch = batches.find(b => b.id === batchId);
  if (!targetBatch) return [];

  const qualifiedTeachers = getEligibleFaculty(faculties, targetBatch, subject);
  const candidates: SubstituteCandidate[] = [];

  qualifiedTeachers.forEach(faculty => {
    const assignCheck = canAssign(
      faculty,
      targetBatch,
      periodIndex,
      allocations,
      batches,
      activeSettings,
      { dateKey }
    );

    const currentLoad = allocations.filter(
      a => a.facultyId === faculty.id && !(a.batchId === batchId && a.periodIndex === periodIndex)
    ).length;
    const maxLimit = getDailyLimit(faculty, activeSettings);

    const reasons: string[] = [];
    let score = 100;

    if (!assignCheck.ok) {
      score = -500;
      reasons.push(assignCheck.reason || 'Constraint violation');
    } else {
      reasons.push('Fully qualified and available for this time slot');
      score += (maxLimit - currentLoad) * 20;

      if (faculty.assignedBatches && faculty.assignedBatches.includes(batchId)) {
        score += 50;
        reasons.push('Assigned exclusive batch teacher');
      }
      if (currentLoad === 0) {
        score += 30;
        reasons.push('Zero teaching periods today');
      }
    }

    candidates.push({
      faculty,
      score,
      eligible: assignCheck.ok,
      reasons,
      currentDayLoad: currentLoad,
      maxDayLoad: maxLimit,
    });
  });

  return candidates.sort((a, b) => b.score - a.score);
};

// -------------------------------------------------------------
// SINGLE-SLOT REGENERATION (Phase 5H)
// -------------------------------------------------------------
export const regenerateSingleSlot = (
  batchId: string,
  periodIndex: number,
  allocations: Allocation[],
  batches: Batch[],
  faculties: Faculty[],
  settings?: SchedulerSettings,
  preferredSubject?: string,
  dateKey?: string
): { success: boolean; newAllocation: Allocation | null; reason?: string } => {
  const activeSettings = settings || storage.getSettings();
  const targetBatch = batches.find(b => b.id === batchId);
  if (!targetBatch) return { success: false, newAllocation: null, reason: 'Batch not found' };

  const currentSlot = allocations.find(a => a.batchId === batchId && a.periodIndex === periodIndex);
  if (currentSlot?.frozen) {
    return { success: false, newAllocation: null, reason: 'Slot is locked/frozen against regeneration' };
  }

  const subject = preferredSubject || currentSlot?.subject || targetBatch.subjects[0]?.subject || 'Physics';
  const substitutes = getRankedSubstitutes(
    batchId,
    periodIndex,
    subject,
    allocations,
    batches,
    faculties,
    activeSettings,
    dateKey
  );

  const eligibleSubs = substitutes.filter(s => s.eligible);
  if (eligibleSubs.length === 0) {
    return {
      success: false,
      newAllocation: null,
      reason: `No eligible faculty available for "${subject}" at this period without time or workload conflicts.`,
    };
  }

  // Pick top ranked substitute
  const winner = eligibleSubs[0];
  const newAllocation: Allocation = {
    batchId,
    periodIndex,
    facultyId: winner.faculty.id,
    subject,
    autoGenerated: true,
    manualEdited: false,
    frozen: false,
    explanation: [`Regenerated slot: ${winner.reasons.join('; ')}`],
    updatedAt: Date.now(),
  };

  storage.logAuditAction('SLOT_REGENERATE', {
    batchId,
    periodIndex,
    newFacultyId: winner.faculty.id,
    reason: `Regenerated slot: assigned ${winner.faculty.name} for ${subject} in ${targetBatch.name}.`,
  });

  return { success: true, newAllocation };
};
