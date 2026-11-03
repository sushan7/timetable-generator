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
  rng: () => number,
  weekAllocations: Allocation[] = []
): Map<string, number> => {
  const batchToKHSPeriodMap = new Map<string, number>();
  const sections = groupBatchesBySection(batches);
  const eligiblePeriods = [1, 2, 3]; // Periods 2, 3, 4 (0-indexed)

  Object.values(sections).forEach((sectionBatches, secIdx) => {
    const khsBatches = sectionBatches.filter(b => b.subjects.some(s => isKHS(s.subject)));
    if (khsBatches.length === 0) return;

    // Clusters of 3 to 4 sections
    const clusterSize = 3 + Math.floor(rng() * 2);
    const dayIndex = Math.round(weekAllocations.length / 372);

    for (let i = 0; i < khsBatches.length; i += clusterSize) {
      const cluster = khsBatches.slice(i, i + clusterSize);
      const clusterBatchIds = new Set(cluster.map(b => b.id));

      const priorPeriodUsage: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
      for (const alloc of weekAllocations) {
        if (clusterBatchIds.has(alloc.batchId) && isKHS(alloc.subject)) {
          if (priorPeriodUsage[alloc.periodIndex] !== undefined) {
            priorPeriodUsage[alloc.periodIndex]++;
          }
        }
      }
      
      // Select the eligible period with the lowest historical usage for this cluster,
      // rotated dynamically across days and staggered across sections
      const clusterOffset = Math.floor(i / clusterSize);
      const sortedPeriods = [...eligiblePeriods].sort((pA, pB) => {
        const usageA = priorPeriodUsage[pA] || 0;
        const usageB = priorPeriodUsage[pB] || 0;
        if (usageA !== usageB) return usageA - usageB;
        const rankA = (secIdx + clusterOffset + pA + dayIndex) % eligiblePeriods.length;
        const rankB = (secIdx + clusterOffset + pB + dayIndex) % eligiblePeriods.length;
        return rankA - rankB;
      });
      const chosenPeriod = sortedPeriods[0];

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
// SHARED SUBJECT SCORING FUNCTION (H1 & H2: scoreSubjectChoice)
// Evaluates subject choice against weekly quotas, anti-repetition,
// period 1 rules, K/H/S cluster synchronization, and subject variety.
// -------------------------------------------------------------
export interface SubjectChoiceContext {
  todayAllocations: Allocation[];
  weekAllocations: Allocation[];
  targetWeeklyQuotas?: Record<string, number>;
  targetWeeklyQuota?: number;
  isKHSGroupSlot?: boolean;
  settings?: SchedulerSettings;
}

export const scoreSubjectChoice = (
  _batch: Batch,
  periodIndex: number,
  subject: string,
  context: SubjectChoiceContext
): { score: number; reasons: string[] } => {
  const normSubj = normalizeSubj(subject);
  const {
    todayAllocations = [],
    weekAllocations = [],
    isKHSGroupSlot,
  } = context;

  let score = 100;
  const reasons: string[] = [];

  const targetQuota =
    context.targetWeeklyQuota ??
    (context.targetWeeklyQuotas ? context.targetWeeklyQuotas[normSubj] : undefined) ??
    4;

  // 1. Weekly quota deficit / overshoot / undershoot (large penalty/reward)
  const weekCount = weekAllocations.filter(
    a => normalizeSubj(a.subject) === normSubj
  ).length;
  const todayCount = todayAllocations.filter(
    a => normalizeSubj(a.subject) === normSubj
  ).length;
  const totalAllocated = weekCount + todayCount;
  const deficit = targetQuota - totalAllocated;

  if (deficit > 0) {
    const bonus = deficit * 250;
    score += bonus;
    reasons.push(`Weekly deficit priority: +${bonus}`);
  } else if (deficit === 0) {
    // Quota reached: large penalty against overshoot
    score -= 1500;
    reasons.push('Weekly quota met: -1500');
  } else {
    // Overshoot: very large penalty
    const overshootPenalty = 3000 + Math.abs(deficit) * 1500;
    score -= overshootPenalty;
    reasons.push(`Weekly quota overshot: -${overshootPenalty}`);
  }

  // 2. Same subject in adjacent periods (large penalty)
  const prevAlloc = todayAllocations.find(a => a.periodIndex === periodIndex - 1);
  const nextAlloc = todayAllocations.find(a => a.periodIndex === periodIndex + 1);
  if (
    (prevAlloc && normalizeSubj(prevAlloc.subject) === normSubj) ||
    (nextAlloc && normalizeSubj(nextAlloc.subject) === normSubj)
  ) {
    score -= 3000;
    reasons.push('Adjacent period same subject penalty: -3000');
  }

  // 3. Same subject twice in one day beyond need (medium penalty)
  if (todayCount >= 1) {
    const repeatTodayPenalty = targetQuota <= 6 ? 900 : 750;
    score -= repeatTodayPenalty;
    reasons.push(`Second period today beyond target need: -${repeatTodayPenalty}`);
  }
  if (todayCount >= 2 && targetQuota <= 12) {
    score -= 3000;
    reasons.push('Third period today beyond target need: -3000');
  }
  if (todayCount >= 3) {
    score -= 3500;
    reasons.push('Extreme repeated subject today: -3500');
  }

  // 4. Same subject at the same period index on other days (anti-repeat penalty)
  const sameSlotOtherDays = weekAllocations.filter(
    a => a.periodIndex === periodIndex && normalizeSubj(a.subject) === normSubj
  ).length;
  if (sameSlotOtherDays > 0) {
    const penalty = 1200 * sameSlotOtherDays + (sameSlotOtherDays > 1 ? 1500 : 0);
    score -= penalty;
    reasons.push(`Same slot repeat across week (${sameSlotOtherDays} days): -${penalty}`);
  }

  // 5. Language in Period 1 (very large but not infinite, scales down under high weekly deficit for English)
  if (periodIndex === 0) {
    if (isLanguageSubject(subject)) {
      if (isKHS(subject)) {
        score -= 2500;
        reasons.push('Period 1 K/H/S prohibited: -2500');
      } else {
        const p1LangPenalty = Math.max(100, 750 - deficit * 200);
        score -= p1LangPenalty;
        reasons.push(`Period 1 language penalty: -${p1LangPenalty}`);
      }
    } else if (isPCMBSubject(subject)) {
      score += 200;
      reasons.push('Period 1 core subject reward: +200');
    }
  }

  // 6. K/H/S cluster mismatch (medium)
  if (isKHSGroupSlot) {
    if (isKHS(subject)) {
      score += 400;
      reasons.push('Synchronized K/H/S cluster match: +400');
    } else {
      score -= 300;
      reasons.push('Non-K/H/S scheduled in synchronized cluster slot: -300');
    }
  } else if (isKHS(subject)) {
    score -= 250;
    reasons.push('K/H/S outside synchronized cluster slot: -250');
  }

  // 7. Reward subject variety
  if (todayCount === 0) {
    score += 100;
    reasons.push('Daily subject variety reward: +100');
  }

  return { score, reasons };
};

// -------------------------------------------------------------
// SHARED ASSIGNMENT SCORING (H5: scoreAssignment)
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

  if (faculty.isAbsent) return { score: -Infinity, reasons: ['Teacher is absent'] };

  const subjectChoice = scoreSubjectChoice(batch, periodIndex, subject, {
    todayAllocations,
    weekAllocations,
    targetWeeklyQuotas,
    isKHSGroupSlot,
    settings,
  });

  let score = subjectChoice.score;
  const reasons = [...subjectChoice.reasons];

  // Teacher Workload Balance & Gaps
  const currentLoad = dailyWorkload[faculty.id] || 0;
  if (currentLoad === 0) {
    score += 30;
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
  let score = 20000 - unfilledCount * 10000;

  const batchMap = new Map<string, Batch>();
  for (const b of batches) {
    batchMap.set(b.id, b);
  }

  const facultyAllocations = new Map<string, Allocation[]>();
  const batchAllocations = new Map<string, Allocation[]>();

  for (const a of allocations) {
    if (a.facultyId) {
      let list = facultyAllocations.get(a.facultyId);
      if (!list) {
        list = [];
        facultyAllocations.set(a.facultyId, list);
      }
      list.push(a);
    }
    let bList = batchAllocations.get(a.batchId);
    if (!bList) {
      bList = [];
      batchAllocations.set(a.batchId, bList);
    }
    bList.push(a);
  }

  // 1. Hard teacher clashes (-50000 each)
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

  // 2. Teacher load balance: penalize extreme skew across active teachers
  const loads: number[] = [];
  for (const list of facultyAllocations.values()) {
    loads.push(list.length);
  }
  if (loads.length > 0) {
    const maxLoad = Math.max(...loads);
    const minLoad = Math.min(...loads);
    if (maxLoad - minLoad > 3) {
      score -= (maxLoad - minLoad) * 50;
    }
  }

  // 3. K/H/S grouping per section / cluster, not globally
  const sections = groupBatchesBySection(batches);
  for (const sectionBatches of Object.values(sections)) {
    const khsPeriodsByBatch = new Map<number, number>();
    let sectionKHSCount = 0;
    for (const b of sectionBatches) {
      const bAllocs = batchAllocations.get(b.id) || [];
      for (const a of bAllocs) {
        if (isKHS(a.subject)) {
          sectionKHSCount++;
          khsPeriodsByBatch.set(a.periodIndex, (khsPeriodsByBatch.get(a.periodIndex) || 0) + 1);
        }
      }
    }
    if (sectionKHSCount > 0) {
      if (khsPeriodsByBatch.size === 1) {
        score += 300; // Synchronized section cluster
      } else {
        score -= (khsPeriodsByBatch.size - 1) * 100;
      }
    }
  }

  // 4. Batch-level soft penalties: back-to-back same-subject, Period 1 language, repeats
  for (const b of batches) {
    const bAllocs = batchAllocations.get(b.id) || [];
    bAllocs.sort((a, b) => a.periodIndex - b.periodIndex);

    // Period 1 language penalty
    const p1 = bAllocs.find(a => a.periodIndex === 0);
    if (p1 && isLanguageSubject(p1.subject)) {
      score -= 1000;
    }

    // Back-to-back same-subject pairs (large penalty)
    for (let i = 1; i < bAllocs.length; i++) {
      if (
        bAllocs[i].periodIndex === bAllocs[i - 1].periodIndex + 1 &&
        normalizeSubj(bAllocs[i].subject) === normalizeSubj(bAllocs[i - 1].subject)
      ) {
        score -= 500;
      }
    }

    // Same subject > 2 times on one day
    const subjCounts: Record<string, number> = {};
    for (const a of bAllocs) {
      const s = normalizeSubj(a.subject);
      subjCounts[s] = (subjCounts[s] || 0) + 1;
      if (subjCounts[s] > 2) {
        score -= 400 * (subjCounts[s] - 2);
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

  // Pre-index weekAllocations and existingDraft by batch for fast O(1) lookups
  const weekAllocationsByBatch = new Map<string, Allocation[]>();
  for (const a of weekAllocations) {
    let list = weekAllocationsByBatch.get(a.batchId);
    if (!list) {
      list = [];
      weekAllocationsByBatch.set(a.batchId, list);
    }
    list.push(a);
  }

  const todayAllocationsByBatch = new Map<string, Allocation[]>();
  for (const a of allocations) {
    let list = todayAllocationsByBatch.get(a.batchId);
    if (!list) {
      list = [];
      todayAllocationsByBatch.set(a.batchId, list);
    }
    list.push(a);
  }

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

  // H5B & M1: Deterministic task ordering with deficit prioritization and fair jitter
  const scoredTasks = tasks.map((task, origIdx) => {
    let priority = 0;
    if (task.isKHSGroup) priority -= 2000;
    if (task.periodIndex === 0) priority -= 1000;
    priority += task.degreeOfFreedom * 10;

    // Prioritize batches with higher remaining quota deficits so scarce subjects are balanced fairly
    const targetWeeklyQuotas = weeklyQuotasMap.get(task.batch.id) || {};
    const weekAllocationsForBatch = weekAllocationsByBatch.get(task.batch.id) || [];
    let batchDeficitSum = 0;
    for (const [subj, target] of Object.entries(targetWeeklyQuotas)) {
      const allocated = weekAllocationsForBatch.filter(a => normalizeSubj(a.subject) === subj).length;
      if (target > allocated) {
        batchDeficitSum += (target - allocated);
      }
    }
    priority -= batchDeficitSum * 25;

    const jitter = (rng() - 0.5) * 40;
    return { task, priority: priority + jitter, origIdx };
  });

  scoredTasks.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.origIdx - b.origIdx;
  });

  const orderedTasks = scoredTasks.map(st => st.task);

  const unfilled: UnfilledSlot[] = [];
  const warnings: ScheduleWarning[] = [];

  // Fill slots
  for (const task of orderedTasks) {
    const { batch, periodIndex, isKHSGroup } = task;
    const targetWeeklyQuotas = weeklyQuotasMap.get(batch.id) || {};
    const todayBatchAllocations = todayAllocationsByBatch.get(batch.id) || [];
    const weekBatchAllocations = weekAllocationsByBatch.get(batch.id) || [];

    // Unique subjects for this batch
    const uniqueSubjects = Array.from(new Set(batch.subjects.map(s => normalizeSubj(s.subject))));

    // Rank candidate subjects using scoreSubjectChoice (H1 & H2)
    const scoredSubjects = uniqueSubjects.map((subject, origIdx) => {
      const quota = targetWeeklyQuotas[subject] || 4;
      const result = scoreSubjectChoice(batch, periodIndex, subject, {
        todayAllocations: todayBatchAllocations,
        weekAllocations: weekBatchAllocations,
        targetWeeklyQuota: quota,
        isKHSGroupSlot: isKHSGroup,
        settings,
      });
      const jitter = (rng() - 0.5) * 6;
      return { subject, score: result.score + jitter, reasons: result.reasons, origIdx };
    });

    scoredSubjects.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.origIdx - b.origIdx;
    });

    let bestOption: {
      faculty: Faculty;
      subject: string;
      score: number;
      reasons: string[];
    } | null = null;

    const failureReasons: string[] = [];

    // Evaluate candidate subjects starting from highest-ranked
    for (const scoredSubj of scoredSubjects) {
      const subject = scoredSubj.subject;
      const eligibleTeachers = getEligibleFaculty(faculties, batch, subject);
      if (eligibleTeachers.length === 0) {
        failureReasons.push(`No faculty registered with qualification "${subject}"`);
        continue;
      }

      let bestTeacherForSubject: {
        faculty: Faculty;
        teacherScore: number;
        reasons: string[];
      } | null = null;

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

        const currentLoad = dailyWorkload[faculty.id] || 0;
        const dailyLimit = getDailyLimit(faculty, settings);
        let teacherScore = (dailyLimit - currentLoad) * 20;
        if (currentLoad === 0) teacherScore += 30;

        const teacherReasons: string[] = [];
        if (settings.enableGapOptimization) {
          const taughtBefore = todayBatchAllocations.some(
            a => a.facultyId === faculty.id && a.periodIndex === periodIndex - 1
          );
          const teachesAfter = todayBatchAllocations.some(
            a => a.facultyId === faculty.id && a.periodIndex === periodIndex + 1
          );
          if (taughtBefore || teachesAfter) {
            teacherScore += 20;
            teacherReasons.push('Gap reduction bonus: +20');
          }
        }

        if (faculty.assignedBatches && faculty.assignedBatches.includes(batch.id)) {
          teacherScore += 40;
          teacherReasons.push('Assigned batch lock preference: +40');
        }

        const teacherJitter = (rng() - 0.5) * 4;
        const finalTeacherScore = teacherScore + teacherJitter;

        if (!bestTeacherForSubject || finalTeacherScore > bestTeacherForSubject.teacherScore) {
          bestTeacherForSubject = {
            faculty,
            teacherScore: finalTeacherScore,
            reasons: teacherReasons,
          };
        }
      }

      if (bestTeacherForSubject) {
        bestOption = {
          faculty: bestTeacherForSubject.faculty,
          subject,
          score: scoredSubj.score + bestTeacherForSubject.teacherScore,
          reasons: [...scoredSubj.reasons, ...bestTeacherForSubject.reasons],
        };
        // Found optimal teacher for the highest-priority subject
        break;
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

      let bList = todayAllocationsByBatch.get(batch.id);
      if (!bList) {
        bList = [];
        todayAllocationsByBatch.set(batch.id, bList);
      }
      bList.push(newAlloc);

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
    settings?: SchedulerSettings;
  }
): GenerationResult => {
  const settings = options?.settings ?? storage.getSettings();
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

  // Build simultaneous K/H/S cluster map rotated across days (Requirement 3)
  const khsClusterMap = buildKHSClusterScheduleMap(batches, existingDraft, rng, weekAllocations);

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
