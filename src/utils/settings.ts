import type { SchedulerSettings } from '../types';

export const defaultSettings: SchedulerSettings = {
  pcmbWeight: 60,
  languageWeight: 40,
  maxDailyPeriods: 6,
  weekStartDay: 'Monday',
  enableGapOptimization: true,
  enableConsecutivePeriodAvoidance: true,
  enableMissedSubjectRecovery: true,
  enableFacultyRotation: true,
};

export const getSchedulerSettings = (): SchedulerSettings => {
  try {
    const stored = localStorage.getItem('sdtg_settings');
    return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings;
  } catch (e) {
    return defaultSettings;
  }
};

export const saveSchedulerSettings = (settings: SchedulerSettings) => {
  localStorage.setItem('sdtg_settings', JSON.stringify(settings));
};