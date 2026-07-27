import type { Faculty, Batch, SchedulerSettings, AuditLog, Timetable, DayOfWeek, Allocation } from '../types';
import { WEEKDAYS } from '../types';
import { initialFaculty, initialBatches } from './seedData';

const KEYS = {
  FACULTY: 'sdtg_faculty',
  BATCHES: 'sdtg_batches',
  SETTINGS: 'sdtg_settings',
  AUDIT: 'sdtg_audit_logs',
  WEEK: 'sdtg_week_timetables',
};

export const defaultSettings: SchedulerSettings = {
  pcmbWeight: 60,
  languageWeight: 40,
  maxDailyPeriods: 4,
  weekStartDay: 'Monday',
  enableGapOptimization: true,
  enableConsecutivePeriodAvoidance: true,
};

type WeekTimetables = Partial<Record<DayOfWeek, Timetable>>;

export const storage = {
  initialize: () => {
    if (!localStorage.getItem(KEYS.FACULTY)) {
      localStorage.setItem(KEYS.FACULTY, JSON.stringify(initialFaculty));
    }
    if (!localStorage.getItem(KEYS.BATCHES)) {
      localStorage.setItem(KEYS.BATCHES, JSON.stringify(initialBatches));
    }
  },

  getFaculty: (): Faculty[] => JSON.parse(localStorage.getItem(KEYS.FACULTY) || '[]'),
  setFaculty: (data: Faculty[]) => localStorage.setItem(KEYS.FACULTY, JSON.stringify(data)),

  getBatches: (): Batch[] => JSON.parse(localStorage.getItem(KEYS.BATCHES) || '[]'),
  setBatches: (data: Batch[]) => localStorage.setItem(KEYS.BATCHES, JSON.stringify(data)),

  getSettings: (): SchedulerSettings => {
    try {
      const stored = localStorage.getItem(KEYS.SETTINGS);
      return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings;
    } catch {
      return defaultSettings;
    }
  },
  setSettings: (settings: SchedulerSettings) =>
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings)),

  getAuditLogs: (): AuditLog[] => {
    try {
      const stored = localStorage.getItem(KEYS.AUDIT);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },
  logAuditAction: (action: AuditLog['action'], details: Omit<AuditLog, 'id' | 'timestamp'>) => {
    const logs = storage.getAuditLogs();
    const newLog: AuditLog = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: Date.now(),
      action,
      ...details,
    };
    logs.unshift(newLog);
    localStorage.setItem(KEYS.AUDIT, JSON.stringify(logs));
  },

  // --- Weekly timetables ---
  getWeekTimetables: (): WeekTimetables => {
    try {
      const stored = localStorage.getItem(KEYS.WEEK);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  },
  setWeekTimetables: (data: WeekTimetables) =>
    localStorage.setItem(KEYS.WEEK, JSON.stringify(data)),

  getDayTimetable: (day: DayOfWeek): Timetable | null => {
    const week = storage.getWeekTimetables();
    return week[day] || null;
  },

  setDayTimetable: (day: DayOfWeek, timetable: Timetable) => {
    const week = storage.getWeekTimetables();
    week[day] = timetable;
    storage.setWeekTimetables(week);
  },

  // Allocations from every OTHER day this week — feeds the weekly quota bias
  getWeekAllocationsExcluding: (day: DayOfWeek): Allocation[] => {
    const week = storage.getWeekTimetables();
    return WEEKDAYS
      .filter(d => d !== day)
      .flatMap(d => week[d]?.allocations || []);
  },

  // Every day's allocations (including current), keyed by day — feeds the quota summary UI
  getAllWeekAllocations: (): Record<DayOfWeek, Allocation[]> => {
    const week = storage.getWeekTimetables();
    const result = {} as Record<DayOfWeek, Allocation[]>;
    WEEKDAYS.forEach(d => { result[d] = week[d]?.allocations || []; });
    return result;
  },
};