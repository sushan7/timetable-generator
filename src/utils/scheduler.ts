import type {
  Batch,
  Faculty,
  Allocation,
  SchedulerSettings,
  UnfilledSlot,
  UnfilledReason,
  ScheduleWarning,
  GenerationResult,
  GenerationStats,
  SubstituteCandidate,
  SubjectCapacityReport,
  TeacherLoadReport,
  DetailedCapacityAnalysis,
  SubjectCategory,
  DayOfWeek,
} from '../types';
import { WEEKDAYS } from '../types';
import { storage } from './storage';
import { isOverlapping } from './validation';
import { canAssign, getDailyLimit, validateFrozenAllocations, isFacultyAbsent } from './constraints';
import { groupBatchesBySection } from './sections';
import { inferSubjectCategory } from './seedData';

export const PCMB_SUBJECTS = ['Physics', 'Chemistry', 'Mathematics', 'Biology'];
export const LANGUAGE_SUBJECTS = ['English', 'K/H/S', 'Second Language', 'Kannada', 'Hindi', 'Sanskrit'];

// Helper to normalize subject string (legacy Second Language -> K/H/S normalisation)
export const normalizeSubj = (s: string) => (s === 'Second Language' ? 'K/H/S' : s);

export const getSubjectCategory = (
  subject: string,
  settings?: SchedulerSettings
): SubjectCategory => {
  const norm = normalizeSubj(subject);
  if (settings?.subjectCategories) {
    if (settings.subjectCategories[norm]) return settings.subjectCategories[norm];
    if (settings.subjectCategories[subject]) return settings.subjectCategories[subject];
  }
  return inferSubjectCategory(norm);
};

export const isPCMBSubject = (subject: string, settings?: SchedulerSettings): boolean =>
  getSubjectCategory(subject, settings) === 'Core';

export const isLanguageSubject = (subject: string, settings?: SchedulerSettings): boolean =>
  getSubjectCategory(subject, settings) === 'Language';

export const isKHS = (subject: string): boolean =>
  subject === 'K/H/S' || subject === 'Second Language' || subject.toLowerCase().includes('k/h');

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
// TEACHING CAPACITY PRE-CHECK (N2 / Phase 5B)
// Evaluates per-subject demand vs supply and flags overloaded teachers
// -------------------------------------------------------------
export const calculateDetailedCapacityAnalysis = (
  batches: Batch[],
  faculties: Faculty[],
  settings: SchedulerSettings,
  weekAllocations: Allocation[] = [],
  teachingDays = 6
): DetailedCapacityAnalysis => {
  const demandBySubject: Record<string, number> = {};
  const allSubjectsSet = new Set<string>();

  batches.forEach(b => {
    const quotas = calculateWeeklyQuotas(b, teachingDays);
    Object.entries(quotas).forEach(([subj, count]) => {
      demandBySubject[subj] = (demandBySubject[subj] || 0) + count;
      allSubjectsSet.add(subj);
    });
  });

  const subjects: SubjectCapacityReport[] = [];

  allSubjectsSet.forEach(subj => {
    const qualified = faculties.filter(f => f.subjects.some(s => normalizeSubj(s) === subj));
    const qualifiedNonAbsent = qualified.filter(f => {
      const absentDaysCount = f.absentDays?.length || 0;
      return !f.isAbsent && absentDaysCount < teachingDays;
    });

    let availableCapacity = 0;
    qualifiedNonAbsent.forEach(f => {
      const dailyLimit = getDailyLimit(f, settings);
      const absentDaysCount = f.absentDays?.length || (f.isAbsent ? teachingDays : 0);
      const availableDays = Math.max(0, teachingDays - absentDaysCount);
      availableCapacity += dailyLimit * availableDays;
    });

    const required = demandBySubject[subj] || 0;
    const deficit = required - availableCapacity;

    subjects.push({
      subject: subj,
      category: getSubjectCategory(subj, settings),
      requiredWeeklyPeriods: required,
      availableWeeklyPeriods: availableCapacity,
      deficit: Math.max(0, deficit),
      facultyCount: qualified.length,
      qualifiedFacultyNames: qualified.map(f => f.name),
      status: deficit > 0 ? 'deficit' : availableCapacity === required ? 'balanced' : 'surplus',
    });
  });

  subjects.sort((a, b) => b.deficit - a.deficit);

  // 2. Calculate Teacher Loads and Overloaded Teachers
  const teacherLoadMap: Record<string, number> = {};
  weekAllocations.forEach((a: Allocation) => {
    if (a.facultyId) {
      teacherLoadMap[a.facultyId] = (teacherLoadMap[a.facultyId] || 0) + 1;
    }
  });

  const allTeacherLoads: TeacherLoadReport[] = faculties.map(f => {
    const dailyLimit = getDailyLimit(f, settings);
    const absentDaysCount = f.absentDays?.length || (f.isAbsent ? teachingDays : 0);
    const availableDays = Math.max(0, teachingDays - absentDaysCount);
    const weeklyLimit = dailyLimit * availableDays;
    const assignedPeriods = teacherLoadMap[f.id] || 0;
    const isOverloaded = weeklyLimit > 0 && assignedPeriods > weeklyLimit;
    const isNearLimit = weeklyLimit > 0 && !isOverloaded && assignedPeriods >= Math.max(1, weeklyLimit - 2);

    return {
      facultyId: f.id,
      facultyName: f.name,
      subjects: f.subjects,
      dailyLimit,
      weeklyLimit,
      assignedPeriods,
      isOverloaded,
      isNearLimit,
      status: isOverloaded ? 'overloaded' : isNearLimit ? 'near_limit' : 'normal',
    };
  });

  allTeacherLoads.sort((a, b) => {
    if (a.isOverloaded !== b.isOverloaded) return a.isOverloaded ? -1 : 1;
    if (a.isNearLimit !== b.isNearLimit) return a.isNearLimit ? -1 : 1;
    return b.assignedPeriods - a.assignedPeriods;
  });

  const overloadedTeachers = allTeacherLoads.filter(t => t.isOverloaded || t.isNearLimit);
  const shortageCount = subjects.filter(s => s.status === 'deficit').length;
  const overloadedCount = allTeacherLoads.filter(t => t.isOverloaded).length;

  return {
    subjects,
    overloadedTeachers,
    allTeacherLoads,
    shortageCount,
    overloadedCount,
    hasCapacityIssues: shortageCount > 0 || overloadedCount > 0,
  };
};

export const calculateCapacityReport = (
  batches: Batch[],
  faculties: Faculty[],
  settings: SchedulerSettings,
  teachingDays = 6
): SubjectCapacityReport[] => {
  return calculateDetailedCapacityAnalysis(batches, faculties, settings, [], teachingDays).subjects;
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
    settings,
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
    const penalty = 1200 * sameSlotOtherDays + (sameSlotOtherDays > 1 ? 3000 * (sameSlotOtherDays - 1) : 0);
    score -= penalty;
    reasons.push(`Same slot repeat across week (${sameSlotOtherDays} days): -${penalty}`);
  }

  // 5. Language in Period 1 (very large but not infinite, scales down under high weekly deficit for English)
  if (periodIndex === 0) {
    if (isLanguageSubject(subject, settings)) {
      if (isKHS(subject)) {
        score -= 2500;
        reasons.push('Period 1 K/H/S prohibited: -2500');
      } else {
        const p1LangPenalty = Math.max(100, 750 - deficit * 200);
        score -= p1LangPenalty;
        reasons.push(`Period 1 language penalty: -${p1LangPenalty}`);
      }
    } else if (isPCMBSubject(subject, settings)) {
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
  dayOfWeek?: DayOfWeek;
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
    dateKey,
    dayOfWeek,
  } = ctx;

  if (isFacultyAbsent(faculty, dayOfWeek, dateKey)) return { score: -Infinity, reasons: ['Teacher is absent'] };

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

  // N2: Weekly-load fairness term
  const priorWeeklyLoad = (weekAllocations || []).filter(a => a.facultyId === faculty.id).length;
  if (priorWeeklyLoad > 0) {
    const weeklyPenalty = priorWeeklyLoad * 8;
    score -= weeklyPenalty;
    reasons.push(`Weekly load fairness penalty: -${weeklyPenalty} (${priorWeeklyLoad} prior periods)`);
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
// UNFILLED REASON DIAGNOSTICS (H3 & H4)
// Precise root cause identification for unfilled slots
// -------------------------------------------------------------
export const diagnoseUnfilledReason = (
  batch: Batch,
  periodIndex: number,
  faculties: Faculty[],
  allocations: Allocation[],
  batches: Batch[],
  settings: SchedulerSettings,
  dateKey?: string,
  dayOfWeek?: DayOfWeek
): { reason: UnfilledReason; detail: string } => {
  // 1. NO_SUBJECTS: Batch has no subjects configured
  if (!batch.subjects || batch.subjects.length === 0) {
    return {
      reason: 'NO_SUBJECTS',
      detail: `Batch "${batch.name}" has no subjects configured.`,
    };
  }

  // Find all qualified teachers across all subjects of this batch
  const allBatchSubjects = batch.subjects.map(s => normalizeSubj(s.subject));
  const qualifiedFaculty = faculties.filter(
    f =>
      f.subjects.some(s => allBatchSubjects.includes(normalizeSubj(s))) &&
      (!f.assignedBatches || f.assignedBatches.length === 0 || f.assignedBatches.includes(batch.id))
  );

  // 2. NO_QUALIFIED_TEACHER: No faculty in directory is qualified (or permitted for this batch)
  if (qualifiedFaculty.length === 0) {
    return {
      reason: 'NO_QUALIFIED_TEACHER',
      detail: `No registered faculty member is qualified for [${allBatchSubjects.join(', ')}] or permitted for batch "${batch.name}".`,
    };
  }

  // 3. ALL_ABSENT: All qualified teachers are absent today
  const effectiveDay =
    dayOfWeek ||
    (dateKey && (WEEKDAYS as readonly string[]).includes(dateKey) ? (dateKey as DayOfWeek) : undefined);
  const nonAbsentFaculty = qualifiedFaculty.filter(
    f => !isFacultyAbsent(f, effectiveDay, dateKey)
  );

  if (nonAbsentFaculty.length === 0) {
    return {
      reason: 'ALL_ABSENT',
      detail: `All ${qualifiedFaculty.length} qualified faculty members for batch "${batch.name}" are marked absent today.`,
    };
  }

  // 4. DAILY_LIMIT vs ALL_BUSY:
  // For each non-absent qualified teacher, check workload and time availability
  let availableWithCapacityCount = 0;
  let busyWithTimeOverlapCount = 0;
  let reachedDailyLimitCount = 0;

  for (const f of nonAbsentFaculty) {
    const dailyLimit = getDailyLimit(f, settings);
    const currentLoad = allocations.filter(
      a => a.facultyId === f.id && !(a.batchId === batch.id && a.periodIndex === periodIndex)
    ).length;

    if (currentLoad >= dailyLimit) {
      reachedDailyLimitCount++;
    } else {
      availableWithCapacityCount++;
      const canResult = canAssign(f, batch, periodIndex, allocations, batches, settings, { dateKey, dayOfWeek: effectiveDay });
      if (!canResult.ok && canResult.type === 'TIME_OVERLAP') {
        busyWithTimeOverlapCount++;
      }
    }
  }

  if (availableWithCapacityCount === 0) {
    return {
      reason: 'DAILY_LIMIT',
      detail: `All qualified faculty have reached their maximum daily teaching limit (${reachedDailyLimitCount} faculty capped).`,
    };
  }

  if (busyWithTimeOverlapCount > 0) {
    return {
      reason: 'ALL_BUSY',
      detail: `All available qualified faculty are currently teaching other batches during this time interval.`,
    };
  }

  return {
    reason: 'ALL_BUSY',
    detail: `Eligible faculty could not be assigned due to schedule conflicts or capacity limits.`,
  };
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
  dateKey?: string,
  dayOfWeek?: DayOfWeek
): { allocations: Allocation[]; unfilled: UnfilledSlot[]; warnings: ScheduleWarning[]; repairedCount: number } => {
  const allocations: Allocation[] = [...existingDraft.filter(a => a.frozen)];
  const dailyWorkload: Record<string, number> = {};

  allocations.forEach(a => {
    if (a.facultyId) {
      dailyWorkload[a.facultyId] = (dailyWorkload[a.facultyId] || 0) + 1;
    }
  });

  // Pre-index weekly allocations by faculty for N2 weekly-load fairness
  const facultyWeeklyLoad: Record<string, number> = {};
  for (const a of weekAllocations) {
    if (a.facultyId) {
      facultyWeeklyLoad[a.facultyId] = (facultyWeeklyLoad[a.facultyId] || 0) + 1;
    }
  }

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
    const minEligibleTeachers =
      batch.subjects.length > 0
        ? Math.min(
            ...batch.subjects.map(
              s =>
                getEligibleFaculty(faculties, batch, s.subject).filter(
                  f => !isFacultyAbsent(f, dayOfWeek, dateKey)
                ).length
            )
          )
        : 0;

    batch.periods.forEach((timing, pIndex) => {
      if (!timing || !timing.startTime || !timing.endTime) return;
      const isFrozen = allocations.some(
        a => a.batchId === batch.id && a.periodIndex === pIndex && a.frozen
      );
      if (isFrozen) return;

      const isKHSGroup = khsClusterMap.get(batch.id) === pIndex;

      // Degree of freedom: bottleneck subject teacher count adjusted by time concurrency
      const concurrentBatches = batches.filter(
        ob =>
          ob.id !== batch.id &&
          ob.periods.some(
            op => op.startTime && isOverlapping(timing.startTime, timing.endTime, op.startTime, op.endTime)
          )
      ).length;

      const degreeOfFreedom = minEligibleTeachers * 10 - concurrentBatches;

      tasks.push({
        batch,
        periodIndex: pIndex,
        periodTiming: timing,
        isKHSGroup,
        degreeOfFreedom,
      });
    });
  });

  // H3 & M1: Most-constrained first task ordering, preserving K/H/S and Period-1 preferences
  const scoredTasks = tasks.map((task, origIdx) => {
    // 1. Most-constrained first: lower degree of freedom = scheduled first
    let priority = task.degreeOfFreedom * 8;

    // Prioritize specialized batches with narrow subject options (e.g. NLT PCMB-only)
    if (task.batch.subjects.length <= 4) priority -= 800;

    // 2. K/H/S group synchronization preference across clusters
    if (task.isKHSGroup) priority -= 600;

    // 3. Period 1 preference (prioritize scheduling core subjects early before faculty capacity is exhausted)
    if (task.periodIndex === 0) priority -= 500;

    // 4. Prevent starvation of late periods (Periods 5 & 6)
    if (task.periodIndex >= 4) priority -= 400;

    // 5. Prioritize batches with higher remaining quota deficits so scarce subjects are balanced fairly
    const targetWeeklyQuotas = weeklyQuotasMap.get(task.batch.id) || {};
    const weekAllocationsForBatch = weekAllocationsByBatch.get(task.batch.id) || [];
    let batchDeficitSum = 0;
    for (const [subj, target] of Object.entries(targetWeeklyQuotas)) {
      const allocated = weekAllocationsForBatch.filter(a => normalizeSubj(a.subject) === subj).length;
      if (target > allocated) {
        batchDeficitSum += (target - allocated);
      }
    }
    priority -= batchDeficitSum * 20;

    const jitter = (rng() - 0.5) * 15;
    return { task, priority: priority + jitter, origIdx };
  });

  scoredTasks.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.origIdx - b.origIdx;
  });

  const orderedTasks = scoredTasks.map(st => st.task);

  const unfilled: UnfilledSlot[] = [];
  const warnings: ScheduleWarning[] = [];
  const unfilledTasks: SlotTask[] = [];

  // Primary assignment pass
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

    // Evaluate candidate subjects starting from highest-ranked
    for (const scoredSubj of scoredSubjects) {
      const subject = scoredSubj.subject;
      if (periodIndex === 0 && isLanguageSubject(subject)) {
        const currentP1Lang = allocations.filter(a => a.periodIndex === 0 && isLanguageSubject(a.subject)).length;
        if (currentP1Lang >= 4) continue;
      }
      const eligibleTeachers = getEligibleFaculty(faculties, batch, subject);
      if (eligibleTeachers.length === 0) continue;

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
          { dateKey, dayOfWeek }
        );

        if (!assignResult.ok) continue;

        const currentLoad = dailyWorkload[faculty.id] || 0;
        const dailyLimit = getDailyLimit(faculty, settings);
        let teacherScore = (dailyLimit - currentLoad) * 20;
        if (currentLoad === 0) teacherScore += 30;

        // N2: Weekly-load fairness term
        // Penalize teachers who already carry high accumulated weekly load,
        // so eligible alternates are chosen to distribute teaching periods evenly.
        const priorWeeklyPeriods = facultyWeeklyLoad[faculty.id] || 0;
        const weeklyFairnessPenalty = priorWeeklyPeriods * 8;
        teacherScore -= weeklyFairnessPenalty;

        const teacherReasons: string[] = [];
        if (priorWeeklyPeriods > 0) {
          teacherReasons.push(`Weekly load fairness: -${weeklyFairnessPenalty} (${priorWeeklyPeriods} prior periods)`);
        }
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
        // Found optimal teacher for highest-priority subject
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
      unfilledTasks.push(task);
    }
  }

  // -------------------------------------------------------------
  // H3: BOUNDED REPAIR PASS
  // For each unfilled cell try:
  // (a) another eligible subject for this batch
  // (b) swapping a teacher already placed elsewhere in the day to free a qualified teacher, within hard constraints
  // -------------------------------------------------------------
  const MAX_REPAIR_ITERATIONS = 40;
  let repairedSlotsCount = 0;

  for (let iter = 0; iter < MAX_REPAIR_ITERATIONS && unfilledTasks.length > 0; iter++) {
    let anyRepaired = false;

    for (let uIdx = 0; uIdx < unfilledTasks.length; uIdx++) {
      const task = unfilledTasks[uIdx];
      const { batch, periodIndex } = task;

      // Verify slot is not already filled
      const isAlreadyFilled = allocations.some(
        a => a.batchId === batch.id && a.periodIndex === periodIndex
      );
      if (isAlreadyFilled) {
        unfilledTasks.splice(uIdx, 1);
        uIdx--;
        continue;
      }

      let slotRepaired = false;
      const todayBatchAllocs = todayAllocationsByBatch.get(batch.id) || [];
      const uniqueSubjects = Array.from(new Set(batch.subjects.map(s => normalizeSubj(s.subject))));

      // (a) Try another eligible subject for this batch
      for (const subject of uniqueSubjects) {
        if (periodIndex === 0 && isLanguageSubject(subject)) {
          const currentP1 = allocations.filter(a => a.periodIndex === 0 && isLanguageSubject(a.subject)).length;
          if (currentP1 >= 4) continue;
        }
        const eligibleTeachers = getEligibleFaculty(faculties, batch, subject);
        if (eligibleTeachers.length === 0) continue;

        for (const faculty of eligibleTeachers) {
          const assignResult = canAssign(
            faculty,
            batch,
            periodIndex,
            allocations,
            batches,
            settings,
            { dateKey, dayOfWeek }
          );

          if (assignResult.ok) {
            const newAlloc: Allocation = {
              batchId: batch.id,
              periodIndex,
              facultyId: faculty.id,
              subject,
              autoGenerated: true,
              manualEdited: false,
              frozen: false,
              explanation: ['Assigned via scheduler repair pass: alternative eligible subject'],
              updatedAt: Date.now(),
            };
            allocations.push(newAlloc);
            dailyWorkload[faculty.id] = (dailyWorkload[faculty.id] || 0) + 1;
            todayBatchAllocs.push(newAlloc);

            if (periodIndex === 0 && isLanguageSubject(subject)) {
              warnings.push({
                type: 'PERIOD_1_LANGUAGE',
                severity: 'warning',
                batchId: batch.id,
                periodIndex: 0,
                facultyId: faculty.id,
                message: `Batch "${batch.name}" was scheduled with language "${subject}" in Period 1 due to teacher availability constraints.`,
              });
            }

            slotRepaired = true;
            repairedSlotsCount++;
            anyRepaired = true;
            unfilledTasks.splice(uIdx, 1);
            uIdx--;
            break;
          }
        }
        if (slotRepaired) break;
      }

      if (slotRepaired) continue;

      // (b) Swapping a teacher already placed elsewhere in the day to free a qualified teacher
      for (const subject of uniqueSubjects) {
        if (periodIndex === 0 && isLanguageSubject(subject)) {
          const currentP1 = allocations.filter(a => a.periodIndex === 0 && isLanguageSubject(a.subject)).length;
          if (currentP1 >= 4) continue;
        }
        const qualifiedTeachers = getEligibleFaculty(faculties, batch, subject);
        if (qualifiedTeachers.length === 0) continue;

        for (const teacherT of qualifiedTeachers) {
          if (isFacultyAbsent(teacherT, dayOfWeek, dateKey)) {
            continue;
          }

          // Case b1: Teacher T is busy teaching another batch B during an overlapping time interval
          const targetTiming = batch.periods[periodIndex];
          const conflictingAllocIdx = allocations.findIndex(a => {
            if (a.facultyId !== teacherT.id) return false;
            if (a.batchId === batch.id && a.periodIndex === periodIndex) return false;
            const otherBatch = batches.find(b => b.id === a.batchId);
            if (!otherBatch) return false;
            const otherTiming = otherBatch.periods[a.periodIndex];
            if (!otherTiming || !otherTiming.startTime || !targetTiming || !targetTiming.startTime) {
              return a.periodIndex === periodIndex;
            }
            return isOverlapping(
              targetTiming.startTime,
              targetTiming.endTime,
              otherTiming.startTime,
              otherTiming.endTime
            );
          });

          if (conflictingAllocIdx !== -1) {
            const conflictingAlloc = allocations[conflictingAllocIdx];
            const batchB = batches.find(b => b.id === conflictingAlloc.batchId);

            if (batchB && !conflictingAlloc.frozen) {
              const bSubjects = [
                conflictingAlloc.subject,
                ...batchB.subjects.map(s => normalizeSubj(s.subject)).filter(s => s !== conflictingAlloc.subject),
              ];
              for (const subjB of bSubjects) {
                if (conflictingAlloc.periodIndex === 0 && isLanguageSubject(subjB)) {
                  const currentP1 = allocations.filter(a => a.periodIndex === 0 && isLanguageSubject(a.subject)).length;
                  if (currentP1 >= 4) continue;
                }
                const altTeachers = getEligibleFaculty(faculties, batchB, subjB);
                for (const tAlt of altTeachers) {
                  if (tAlt.id === teacherT.id) continue;
                  if (isFacultyAbsent(tAlt, dayOfWeek, dateKey)) continue;

                  const allocsWithoutConflicting = allocations.filter((_, idx) => idx !== conflictingAllocIdx);
                  const canAltAssign = canAssign(
                    tAlt,
                    batchB,
                    conflictingAlloc.periodIndex,
                    allocsWithoutConflicting,
                    batches,
                    settings,
                    { dateKey, dayOfWeek }
                  );

                  if (canAltAssign.ok) {
                    const tempConflictingAlloc: Allocation = {
                      ...conflictingAlloc,
                      facultyId: tAlt.id,
                      subject: subjB,
                      explanation: [...(conflictingAlloc.explanation || []), `Reassigned to ${tAlt.name} (${subjB}) via repair pass`],
                      updatedAt: Date.now(),
                    };
                    const tempAllocs = [...allocsWithoutConflicting, tempConflictingAlloc];

                    const canTAssign = canAssign(
                      teacherT,
                      batch,
                      periodIndex,
                      tempAllocs,
                      batches,
                      settings,
                      { dateKey, dayOfWeek }
                    );

                    if (canTAssign.ok) {
                      allocations[conflictingAllocIdx] = tempConflictingAlloc;
                      dailyWorkload[teacherT.id] = Math.max(0, (dailyWorkload[teacherT.id] || 0) - 1);
                      dailyWorkload[tAlt.id] = (dailyWorkload[tAlt.id] || 0) + 1;

                      const newAllocA: Allocation = {
                        batchId: batch.id,
                        periodIndex,
                        facultyId: teacherT.id,
                        subject,
                        autoGenerated: true,
                        manualEdited: false,
                        frozen: false,
                        explanation: [`Assigned via scheduler repair pass: teacher swap with ${batchB.name}`],
                        updatedAt: Date.now(),
                      };
                      allocations.push(newAllocA);
                      dailyWorkload[teacherT.id] = (dailyWorkload[teacherT.id] || 0) + 1;
                      todayBatchAllocs.push(newAllocA);

                      if (periodIndex === 0 && isLanguageSubject(subject)) {
                        warnings.push({
                          type: 'PERIOD_1_LANGUAGE',
                          severity: 'warning',
                          batchId: batch.id,
                          periodIndex: 0,
                          facultyId: teacherT.id,
                          message: `Batch "${batch.name}" was scheduled with language "${subject}" in Period 1 due to teacher availability constraints.`,
                        });
                      }

                      slotRepaired = true;
                      repairedSlotsCount++;
                      anyRepaired = true;
                      unfilledTasks.splice(uIdx, 1);
                      uIdx--;
                      break;
                    }
                  }
                }
                if (slotRepaired) break;
              }
            }
          }

          if (slotRepaired) break;

          // Case b2: Teacher T reached daily limit because of teaching batch B at some other period Q
          const dailyLimit = getDailyLimit(teacherT, settings);
          const currentLoadT = dailyWorkload[teacherT.id] || 0;
          if (currentLoadT >= dailyLimit) {
            const tAllocs = allocations.filter(
              a => a.facultyId === teacherT.id && !(a.batchId === batch.id && a.periodIndex === periodIndex) && !a.frozen
            );

            for (const allocQ of tAllocs) {
              const batchQ = batches.find(b => b.id === allocQ.batchId);
              if (!batchQ) continue;

              const qSubjects = [
                allocQ.subject,
                ...batchQ.subjects.map(s => normalizeSubj(s.subject)).filter(s => s !== allocQ.subject),
              ];
              for (const subjQ of qSubjects) {
                if (allocQ.periodIndex === 0 && isLanguageSubject(subjQ)) {
                  const currentP1 = allocations.filter(a => a.periodIndex === 0 && isLanguageSubject(a.subject)).length;
                  if (currentP1 >= 4) continue;
                }
                const altTeachersQ = getEligibleFaculty(faculties, batchQ, subjQ);
                for (const tAlt of altTeachersQ) {
                  if (tAlt.id === teacherT.id) continue;
                  if (isFacultyAbsent(tAlt, dayOfWeek, dateKey)) continue;

                  const allocsWithoutQ = allocations.filter(a => a !== allocQ);
                  const canAltQ = canAssign(
                    tAlt,
                    batchQ,
                    allocQ.periodIndex,
                    allocsWithoutQ,
                    batches,
                    settings,
                    { dateKey, dayOfWeek }
                  );

                  if (canAltQ.ok) {
                    const tempAllocQ: Allocation = {
                      ...allocQ,
                      facultyId: tAlt.id,
                      subject: subjQ,
                      explanation: [...(allocQ.explanation || []), `Reassigned to ${tAlt.name} (${subjQ}) to free daily load`],
                      updatedAt: Date.now(),
                    };
                    const tempAllocs = [...allocsWithoutQ, tempAllocQ];

                    const canTAssignP = canAssign(
                      teacherT,
                      batch,
                      periodIndex,
                      tempAllocs,
                      batches,
                      settings,
                      { dateKey, dayOfWeek }
                    );

                    if (canTAssignP.ok) {
                      const qIdx = allocations.indexOf(allocQ);
                      if (qIdx !== -1) allocations[qIdx] = tempAllocQ;
                      dailyWorkload[teacherT.id] = Math.max(0, (dailyWorkload[teacherT.id] || 0) - 1);
                      dailyWorkload[tAlt.id] = (dailyWorkload[tAlt.id] || 0) + 1;

                      const newAllocA: Allocation = {
                        batchId: batch.id,
                        periodIndex,
                        facultyId: teacherT.id,
                        subject,
                        autoGenerated: true,
                        manualEdited: false,
                        frozen: false,
                        explanation: [`Assigned via scheduler repair pass: load swap with ${batchQ.name}`],
                        updatedAt: Date.now(),
                      };
                      allocations.push(newAllocA);
                      dailyWorkload[teacherT.id] = (dailyWorkload[teacherT.id] || 0) + 1;
                      todayBatchAllocs.push(newAllocA);

                      slotRepaired = true;
                      repairedSlotsCount++;
                      anyRepaired = true;
                      unfilledTasks.splice(uIdx, 1);
                      uIdx--;
                      break;
                    }
                  }
                }
                if (slotRepaired) break;
              }
              if (slotRepaired) break;
            }
          }

          if (slotRepaired) break;
        }
        if (slotRepaired) break;
      }

      // (c) Intra-batch slot shift: move an already scheduled period of this batch to this slot, then fill the freed slot
      if (!slotRepaired) {
        const batchExistingAllocs = allocations.filter(
          a => a.batchId === batch.id && a.periodIndex !== periodIndex && !a.frozen
        );

        for (const allocOther of batchExistingAllocs) {
          const teacherOther = faculties.find(f => f.id === allocOther.facultyId);
          if (!teacherOther) continue;

          const allocsWithoutOther = allocations.filter(a => a !== allocOther);
          const canShift = canAssign(
            teacherOther,
            batch,
            periodIndex,
            allocsWithoutOther,
            batches,
            settings,
            { dateKey, dayOfWeek }
          );

          if (canShift.ok) {
            const freedPeriodIndex = allocOther.periodIndex;
            for (const subjFreed of uniqueSubjects) {
              if (freedPeriodIndex === 0 && isLanguageSubject(subjFreed)) {
                const currentP1 = allocsWithoutOther.filter(a => a.periodIndex === 0 && isLanguageSubject(a.subject)).length;
                if (currentP1 >= 4) continue;
              }
              const eligibleForFreed = getEligibleFaculty(faculties, batch, subjFreed);
              for (const tFreed of eligibleForFreed) {
                if (tFreed.id === teacherOther.id) continue;
                if (isFacultyAbsent(tFreed, dayOfWeek, dateKey)) continue;

                const canFillFreed = canAssign(
                  tFreed,
                  batch,
                  freedPeriodIndex,
                  allocsWithoutOther,
                  batches,
                  settings,
                  { dateKey, dayOfWeek }
                );

                if (canFillFreed.ok) {
                  const otherIdx = allocations.indexOf(allocOther);
                  if (otherIdx !== -1) {
                    allocations[otherIdx] = {
                      ...allocOther,
                      periodIndex,
                      explanation: [...(allocOther.explanation || []), `Shifted to period ${periodIndex + 1} via repair pass`],
                      updatedAt: Date.now(),
                    };
                  }
                  const newAllocFreed: Allocation = {
                    batchId: batch.id,
                    periodIndex: freedPeriodIndex,
                    facultyId: tFreed.id,
                    subject: subjFreed,
                    autoGenerated: true,
                    manualEdited: false,
                    frozen: false,
                    explanation: [`Assigned to freed period ${freedPeriodIndex + 1} via intra-batch repair pass`],
                    updatedAt: Date.now(),
                  };
                  allocations.push(newAllocFreed);
                  dailyWorkload[tFreed.id] = (dailyWorkload[tFreed.id] || 0) + 1;
                  todayBatchAllocs.push(newAllocFreed);

                  slotRepaired = true;
                  repairedSlotsCount++;
                  anyRepaired = true;
                  unfilledTasks.splice(uIdx, 1);
                  uIdx--;
                  break;
                }
              }
              if (slotRepaired) break;
            }
          }
          if (slotRepaired) break;
        }
      }
    }

    if (!anyRepaired) break;
  }

  // Diagnose reasons for any slots that remain unfilled after repair
  for (const task of unfilledTasks) {
    const diagnosis = diagnoseUnfilledReason(
      task.batch,
      task.periodIndex,
      faculties,
      allocations,
      batches,
      settings,
      dateKey,
      dayOfWeek
    );

    unfilled.push({
      batchId: task.batch.id,
      batchName: task.batch.name,
      periodIndex: task.periodIndex,
      requiredSubject: task.batch.subjects[0]?.subject || 'Unassigned',
      reason: diagnosis.reason,
      candidateIssue: diagnosis.detail,
    });
  }

  return { allocations, unfilled, warnings, repairedCount: repairedSlotsCount };
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
    dayOfWeek?: DayOfWeek;
    numCandidates?: number;
    settings?: SchedulerSettings;
  }
): GenerationResult => {
  const settings = options?.settings ?? storage.getSettings();
  const seed = options?.seed ?? Math.floor(Math.random() * 1000000);
  const rng = createPRNG(seed);
  const dateKey = options?.dateKey;
  const dayOfWeek =
    options?.dayOfWeek ||
    (dateKey && (WEEKDAYS as readonly string[]).includes(dateKey) ? (dateKey as DayOfWeek) : undefined);

  // C2: Validate existing frozen allocations
  const frozenList = existingDraft.filter(a => a.frozen);
  const frozenValidation = validateFrozenAllocations(
    frozenList,
    batches,
    faculties,
    settings,
    { dateKey, dayOfWeek }
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
    repairedCount: number;
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
      dateKey,
      dayOfWeek
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

  const totalSlots = batches.reduce(
    (sum, b) => sum + b.periods.filter(p => p && p.startTime).length,
    0
  );
  const byPeriodFilled: Record<number, number> = {};
  finalAllocations.forEach(a => {
    byPeriodFilled[a.periodIndex] = (byPeriodFilled[a.periodIndex] || 0) + 1;
  });

  const period1LanguageCount = finalAllocations.filter(
    a => a.periodIndex === 0 && isLanguageSubject(a.subject)
  ).length;

  const stats: GenerationStats = {
    totalSlots,
    filledSlots: finalAllocations.length,
    unfilledSlots: finalUnfilled.length,
    fillPercentage: totalSlots > 0 ? Math.round((finalAllocations.length / totalSlots) * 100) : 0,
    period1LanguageCount,
    byPeriodFilled,
    repairedSlotsCount: bestCandidateResult?.repairedCount || 0,
  };

  storage.logAuditAction('TIMETABLE_GENERATE', {
    reason: `Generated timetable: ${finalAllocations.length} slots assigned, ${finalUnfilled.length} unfilled. Multi-candidate score: ${Math.round(bestScore)}. (Seed: ${seed})`,
  });

  return {
    allocations: finalAllocations,
    unfilled: finalUnfilled,
    warnings: finalWarnings,
    stats,
    frozenViolations: frozenValidation.invalidEntries,
    score: bestScore,
    seed,
  };
};

// -------------------------------------------------------------
// ABSENCE PATCHING (H4 & H6: Original-Subject-First)
// -------------------------------------------------------------
export const patchAbsences = (
  currentAllocations: Allocation[],
  batches: Batch[],
  faculties: Faculty[],
  settingsOrOptions?: SchedulerSettings | { settings?: SchedulerSettings; dateKey?: string; dayOfWeek?: DayOfWeek },
  dateKey?: string,
  dayOfWeek?: DayOfWeek
): {
  updatedAllocations: Allocation[];
  patchedCount: number;
  remainingGapsCount: number;
  subjectChangedCount: number;
} => {
  const options = (settingsOrOptions && ('dayOfWeek' in settingsOrOptions || 'dateKey' in settingsOrOptions || 'settings' in settingsOrOptions))
    ? (settingsOrOptions as { settings?: SchedulerSettings; dateKey?: string; dayOfWeek?: DayOfWeek })
    : undefined;
  const activeSettings = (options?.settings || (!options ? (settingsOrOptions as SchedulerSettings) : undefined)) || storage.getSettings();
  const effectiveDateKey = options?.dateKey || dateKey;
  const effectiveDay =
    options?.dayOfWeek ||
    dayOfWeek ||
    (effectiveDateKey && (WEEKDAYS as readonly string[]).includes(effectiveDateKey) ? (effectiveDateKey as DayOfWeek) : undefined);

  let patchedCount = 0;
  let remainingGapsCount = 0;
  let subjectChangedCount = 0;

  // Clone currentAllocations to maintain working state across sequential slot patching
  const updatedAllocations: Allocation[] = currentAllocations.map(a => ({ ...a }));

  const dailyWorkload: Record<string, number> = {};
  updatedAllocations.forEach(a => {
    if (a.facultyId) {
      dailyWorkload[a.facultyId] = (dailyWorkload[a.facultyId] || 0) + 1;
    }
  });

  const affectedIndices: number[] = [];
  for (let idx = 0; idx < updatedAllocations.length; idx++) {
    const alloc = updatedAllocations[idx];
    if (!alloc.facultyId) {
      if (alloc.vacatedFacultyId) remainingGapsCount++;
      continue;
    }

    const assignedFaculty = faculties.find(f => f.id === alloc.facultyId);
    if (!assignedFaculty) continue;

    const isAbsent = isFacultyAbsent(assignedFaculty, effectiveDay, effectiveDateKey);
    if (!isAbsent) continue;

    const targetBatch = batches.find(b => b.id === alloc.batchId);
    if (!targetBatch) {
      remainingGapsCount++;
      continue;
    }

    affectedIndices.push(idx);
  }

  // Most-constrained-first: slots with fewest eligible same-subject teachers patched first (H3 & H4 heuristic)
  affectedIndices.sort((idxA, idxB) => {
    const allocA = updatedAllocations[idxA];
    const allocB = updatedAllocations[idxB];
    const batchA = batches.find(b => b.id === allocA.batchId)!;
    const batchB = batches.find(b => b.id === allocB.batchId)!;

    const countA = getEligibleFaculty(faculties, batchA, allocA.subject).filter(
      c => !isFacultyAbsent(c, effectiveDay, effectiveDateKey) && c.id !== allocA.facultyId
    ).length;
    const countB = getEligibleFaculty(faculties, batchB, allocB.subject).filter(
      c => !isFacultyAbsent(c, effectiveDay, effectiveDateKey) && c.id !== allocB.facultyId
    ).length;

    return countA - countB;
  });

  for (const idx of affectedIndices) {
    const alloc = updatedAllocations[idx];
    const assignedFaculty = faculties.find(f => f.id === alloc.facultyId);
    if (!assignedFaculty) continue;

    const targetBatch = batches.find(b => b.id === alloc.batchId);
    if (!targetBatch) continue;

    const origSubject = alloc.subject;
    let substituteAssigned = false;

    // -----------------------------------------------------------------
    // Step 1: Try the ORIGINAL SUBJECT first with eligible, non-absent, conflict-free teachers (H4)
    // -----------------------------------------------------------------
    const qualifiedSameSubjTeachers = getEligibleFaculty(faculties, targetBatch, origSubject);
    const availableSameSubjTeachers = qualifiedSameSubjTeachers.filter(candidate => {
      if (candidate.id === assignedFaculty.id) return false;
      if (isFacultyAbsent(candidate, effectiveDay, dateKey)) return false;
      const assignCheck = canAssign(
        candidate,
        targetBatch,
        alloc.periodIndex,
        updatedAllocations,
        batches,
        activeSettings,
        { dateKey, dayOfWeek: effectiveDay }
      );
      return assignCheck.ok;
    });

    if (availableSameSubjTeachers.length > 0) {
      availableSameSubjTeachers.sort(
        (a, b) => (dailyWorkload[a.id] || 0) - (dailyWorkload[b.id] || 0)
      );
      const chosenSub = availableSameSubjTeachers[0];

      patchedCount++;
      dailyWorkload[chosenSub.id] = (dailyWorkload[chosenSub.id] || 0) + 1;
      dailyWorkload[assignedFaculty.id] = Math.max(0, (dailyWorkload[assignedFaculty.id] || 0) - 1);

      storage.logAuditAction('ABSENCE_SYNC', {
        batchId: alloc.batchId,
        periodIndex: alloc.periodIndex,
        previousFacultyId: assignedFaculty.id,
        newFacultyId: chosenSub.id,
        reason: `Substituted ${chosenSub.name} for absent teacher ${assignedFaculty.name} (${origSubject}) in ${targetBatch.name}.`,
      });

      updatedAllocations[idx] = {
        ...alloc,
        facultyId: chosenSub.id,
        subjectChanged: false,
        vacatedFacultyId: assignedFaculty.id,
        vacatedFacultyName: assignedFaculty.name,
        explanation: [
          ...(alloc.explanation || []),
          `Substituted for absent teacher ${assignedFaculty.name} (${origSubject})`,
        ],
        updatedAt: Date.now(),
      };
      substituteAssigned = true;
    }

    // -----------------------------------------------------------------
    // Step 2: Only if none is available, try other subjects (H4)
    // -----------------------------------------------------------------
    if (!substituteAssigned) {
      const otherBatchSubjects = targetBatch.subjects
        .map(s => normalizeSubj(s.subject))
        .filter(s => s !== normalizeSubj(origSubject));

      for (const altSubject of otherBatchSubjects) {
        if (alloc.periodIndex === 0 && isLanguageSubject(altSubject)) {
          const currentP1Lang = updatedAllocations.filter(
            a => a.periodIndex === 0 && isLanguageSubject(a.subject)
          ).length;
          if (currentP1Lang >= 4) continue;
        }

        const qualifiedAltTeachers = getEligibleFaculty(faculties, targetBatch, altSubject);
        const availableAltTeachers = qualifiedAltTeachers.filter(candidate => {
          if (candidate.id === assignedFaculty.id) return false;
          if (isFacultyAbsent(candidate, effectiveDay, dateKey)) return false;
          const assignCheck = canAssign(
            candidate,
            targetBatch,
            alloc.periodIndex,
            updatedAllocations,
            batches,
            activeSettings,
            { dateKey, dayOfWeek: effectiveDay }
          );
          return assignCheck.ok;
        });

        if (availableAltTeachers.length > 0) {
          availableAltTeachers.sort(
            (a, b) => (dailyWorkload[a.id] || 0) - (dailyWorkload[b.id] || 0)
          );
          const chosenAltSub = availableAltTeachers[0];

          patchedCount++;
          subjectChangedCount++;
          dailyWorkload[chosenAltSub.id] = (dailyWorkload[chosenAltSub.id] || 0) + 1;
          dailyWorkload[assignedFaculty.id] = Math.max(0, (dailyWorkload[assignedFaculty.id] || 0) - 1);

          const changeExplanation = `Subject changed from ${origSubject} to ${altSubject} because no qualified substitute was available for ${origSubject}`;

          storage.logAuditAction('ABSENCE_SYNC', {
            batchId: alloc.batchId,
            periodIndex: alloc.periodIndex,
            previousFacultyId: assignedFaculty.id,
            newFacultyId: chosenAltSub.id,
            reason: `Substituted ${chosenAltSub.name} (${altSubject}) for absent teacher ${assignedFaculty.name}. ${changeExplanation}.`,
          });

          updatedAllocations[idx] = {
            ...alloc,
            facultyId: chosenAltSub.id,
            subject: altSubject,
            subjectChanged: true,
            conflictNote: changeExplanation,
            vacatedFacultyId: assignedFaculty.id,
            vacatedFacultyName: assignedFaculty.name,
            explanation: [
              ...(alloc.explanation || []),
              changeExplanation,
            ],
            updatedAt: Date.now(),
          };
          substituteAssigned = true;
          break;
        }
      }
    }

    // -----------------------------------------------------------------
    // Step 3: No substitute found for any subject: mark as explicit gap
    // -----------------------------------------------------------------
    if (!substituteAssigned) {
      remainingGapsCount++;
      dailyWorkload[assignedFaculty.id] = Math.max(0, (dailyWorkload[assignedFaculty.id] || 0) - 1);

      updatedAllocations[idx] = {
        ...alloc,
        facultyId: '',
        vacatedFacultyId: assignedFaculty.id,
        vacatedFacultyName: assignedFaculty.name,
        explanation: [
          ...(alloc.explanation || []),
          `Assigned teacher ${assignedFaculty.name} is absent${effectiveDay ? ` on ${effectiveDay}` : ''}. No replacement available without schedule conflicts.`,
        ],
        updatedAt: Date.now(),
      };
    }
  }

  storage.logAuditAction('ABSENCE_SYNC', {
    reason: `Absence synchronization complete: ${patchedCount} slots covered by substitutes (${subjectChangedCount} subject changes), ${remainingGapsCount} unresolved gaps.`,
  });

  return { updatedAllocations, patchedCount, remainingGapsCount, subjectChangedCount };
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
  dateKey?: string,
  dayOfWeek?: DayOfWeek
): SubstituteCandidate[] => {
  const activeSettings = settings || storage.getSettings();
  const effectiveDay =
    dayOfWeek ||
    (dateKey && (WEEKDAYS as readonly string[]).includes(dateKey) ? (dateKey as DayOfWeek) : undefined);
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
      { dateKey, dayOfWeek: effectiveDay }
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

      // N2: Weekly load fairness in substitutes
      try {
        const weekAllocs = storage.getWeekAllocationsExcluding(effectiveDay);
        const priorWeeklyPeriods = weekAllocs.filter(a => a.facultyId === faculty.id).length;
        if (priorWeeklyPeriods > 0) {
          const fairnessPenalty = priorWeeklyPeriods * 8;
          score -= fairnessPenalty;
          reasons.push(`Weekly load fairness penalty: -${fairnessPenalty} (${priorWeeklyPeriods} prior periods)`);
        }
      } catch {
        // ignore if storage not available in isolated test
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
  dateKey?: string,
  dayOfWeek?: DayOfWeek
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
    dateKey,
    dayOfWeek
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
