import { useMemo } from 'react';
import type { Allocation, DayOfWeek, Faculty } from '../types';
import { storage } from '../utils/storage';
import { getSubjectCategory } from '../utils/scheduler';

export interface TimetableQuotaResult {
  pcmb: number;
  lang: number;
  other: number;
  targetPCMB: number;
  targetLang: number;
  actualPCMBPct: number;
  actualLangPct: number;
  actualOtherPct: number;
}

export interface QuotaHookOutput {
  quota: TimetableQuotaResult;
  gapCount: number;
  absentFacultyCount: number;
}

export function calculateTimetableQuota(
  currentDay: DayOfWeek,
  allocations: Allocation[],
  faculties: Faculty[]
): QuotaHookOutput {
  const otherDays = storage.getWeekAllocationsExcluding(currentDay);
  const allWeekly = [...otherDays, ...allocations];

  let pcmb = 0;
  let lang = 0;
  let other = 0;
  const settings = storage.getSettings();

  allWeekly.forEach(a => {
    if (!a.facultyId) return;
    const cat = getSubjectCategory(a.subject, settings);
    if (cat === 'Core') pcmb++;
    else if (cat === 'Language') lang++;
    else other++;
  });

  const total = pcmb + lang + other;
  const actualPCMBPct = total === 0 ? 0 : Math.round((pcmb / total) * 100);
  const actualLangPct = total === 0 ? 0 : Math.round((lang / total) * 100);
  const actualOtherPct = total === 0 ? 0 : Math.max(0, 100 - actualPCMBPct - actualLangPct);

  const quota: TimetableQuotaResult = {
    pcmb,
    lang,
    other,
    targetPCMB: settings.pcmbWeight,
    targetLang: settings.languageWeight,
    actualPCMBPct,
    actualLangPct,
    actualOtherPct,
  };

  const gapCount = allocations.filter(a => a.vacatedFacultyId && !a.facultyId).length;
  const absentFacultyCount = faculties.filter(f => f.isAbsent).length;

  return {
    quota,
    gapCount,
    absentFacultyCount,
  };
}

export function useTimetableQuota(
  currentDay: DayOfWeek,
  allocations: Allocation[],
  faculties: Faculty[]
): QuotaHookOutput {
  const result = useMemo(
    () => calculateTimetableQuota(currentDay, allocations, faculties),
    [currentDay, allocations, faculties]
  );

  return result;
}
