import type { Faculty, Batch, SchedulerSettings, AuditLog, Timetable, DayOfWeek, Allocation, TimetableStatus } from '../types';
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
    try {
      if (!localStorage.getItem(KEYS.FACULTY)) {
        localStorage.setItem(KEYS.FACULTY, JSON.stringify(initialFaculty));
      }
      if (!localStorage.getItem(KEYS.BATCHES)) {
        localStorage.setItem(KEYS.BATCHES, JSON.stringify(initialBatches));
      }
    } catch (e) {
      console.error('Failed to initialize storage', e);
    }
  },

  getFaculty: (): Faculty[] => {
    try {
      const raw = localStorage.getItem(KEYS.FACULTY);
      return raw ? JSON.parse(raw) : initialFaculty;
    } catch {
      return initialFaculty;
    }
  },
  setFaculty: (data: Faculty[]) => {
    try {
      localStorage.setItem(KEYS.FACULTY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save faculty', e);
    }
  },

  getBatches: (): Batch[] => {
    try {
      const raw = localStorage.getItem(KEYS.BATCHES);
      return raw ? JSON.parse(raw) : initialBatches;
    } catch {
      return initialBatches;
    }
  },
  setBatches: (data: Batch[]) => {
    try {
      localStorage.setItem(KEYS.BATCHES, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save batches', e);
    }
  },

  getSettings: (): SchedulerSettings => {
    try {
      const stored = localStorage.getItem(KEYS.SETTINGS);
      return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings;
    } catch {
      return defaultSettings;
    }
  },
  setSettings: (settings: SchedulerSettings) => {
    try {
      localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save settings', e);
    }
  },

  getAuditLogs: (): AuditLog[] => {
    try {
      const stored = localStorage.getItem(KEYS.AUDIT);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },
  logAuditAction: (action: AuditLog['action'], details: Omit<AuditLog, 'id' | 'timestamp'>) => {
    try {
      const logs = storage.getAuditLogs();
      const newLog: AuditLog = {
        id: `audit_${crypto.randomUUID()}`,
        timestamp: Date.now(),
        action,
        ...details,
      };
      // Keep up to 200 most recent logs
      const updated = [newLog, ...logs].slice(0, 200);
      localStorage.setItem(KEYS.AUDIT, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to log audit action', e);
    }
  },
  clearAuditLogs: () => {
    try {
      localStorage.removeItem(KEYS.AUDIT);
    } catch (e) {
      console.error('Failed to clear audit logs', e);
    }
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
  setWeekTimetables: (data: WeekTimetables) => {
    try {
      localStorage.setItem(KEYS.WEEK, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save week timetables', e);
    }
  },

  getDayTimetable: (day: DayOfWeek): Timetable | null => {
    const week = storage.getWeekTimetables();
    return week[day] || null;
  },

  setDayTimetable: (day: DayOfWeek, timetable: Timetable) => {
    const week = storage.getWeekTimetables();
    week[day] = timetable;
    storage.setWeekTimetables(week);
  },

  setTimetableStatus: (day: DayOfWeek, status: TimetableStatus) => {
    const current = storage.getDayTimetable(day);
    if (!current) return;
    const updated: Timetable = { ...current, status };
    storage.setDayTimetable(day, updated);
    storage.logAuditAction('STATUS_CHANGE', {
      day,
      reason: `Changed timetable status to ${status} for ${day}`,
    });
  },

  deleteDayTimetable: (day: DayOfWeek) => {
    const week = storage.getWeekTimetables();
    delete week[day];
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

  // Complete reset to demo/seed data
  resetToSeedData: () => {
    try {
      localStorage.setItem(KEYS.FACULTY, JSON.stringify(initialFaculty));
      localStorage.setItem(KEYS.BATCHES, JSON.stringify(initialBatches));
      localStorage.setItem(KEYS.SETTINGS, JSON.stringify(defaultSettings));
      localStorage.removeItem(KEYS.WEEK);
      storage.clearAuditLogs();
      storage.logAuditAction('STATUS_CHANGE', {
        reason: 'Restored system to initial demo/seed data defaults.',
      });
    } catch (e) {
      console.error('Failed to reset to seed data', e);
    }
  },
};