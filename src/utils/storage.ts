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

// Helper to normalize legacy "Second Language" to "K/H/S"
const normalizeSubjectName = (subj: string): string =>
  subj === 'Second Language' ? 'K/H/S' : subj;

const normalizeFaculty = (list: Faculty[]): Faculty[] =>
  list.map(f => ({
    ...f,
    subjects: f.subjects.map(normalizeSubjectName),
  }));

const normalizeBatches = (list: Batch[]): Batch[] =>
  list.map(b => ({
    ...b,
    subjects: b.subjects.map(s => ({
      ...s,
      subject: normalizeSubjectName(s.subject),
    })),
  }));

const normalizeTimetable = (tt: Timetable): Timetable => ({
  ...tt,
  allocations: tt.allocations.map(a => ({
    ...a,
    subject: normalizeSubjectName(a.subject),
  })),
});

const memoryStore = new Map<string, string>();
const safeStorage = {
  getItem: (key: string): string | null => {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.safeStorage.getItem(key);
    }
    return memoryStore.get(key) ?? null;
  },
  setItem: (key: string, value: string): void => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.safeStorage.setItem(key, value);
    }
    memoryStore.set(key, value);
  },
  removeItem: (key: string): void => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.safeStorage.removeItem(key);
    }
    memoryStore.delete(key);
  },
};

export const storage = {
  initialize: () => {
    try {
      if (!safeStorage.getItem(KEYS.FACULTY)) {
        safeStorage.setItem(KEYS.FACULTY, JSON.stringify(initialFaculty));
      } else {
        // Auto-migrate existing faculty in storage
        const current = storage.getFaculty();
        storage.setFaculty(current);
      }
      if (!safeStorage.getItem(KEYS.BATCHES)) {
        safeStorage.setItem(KEYS.BATCHES, JSON.stringify(initialBatches));
      } else {
        // Auto-migrate existing batches in storage
        const current = storage.getBatches();
        storage.setBatches(current);
      }
    } catch (e) {
      console.error('Failed to initialize storage', e);
    }
  },

  getFaculty: (): Faculty[] => {
    try {
      const raw = safeStorage.getItem(KEYS.FACULTY);
      const parsed = raw ? JSON.parse(raw) : initialFaculty;
      return normalizeFaculty(parsed);
    } catch {
      return normalizeFaculty(initialFaculty);
    }
  },
  setFaculty: (data: Faculty[]) => {
    try {
      safeStorage.setItem(KEYS.FACULTY, JSON.stringify(normalizeFaculty(data)));
    } catch (e) {
      console.error('Failed to save faculty', e);
    }
  },

  getBatches: (): Batch[] => {
    try {
      const raw = safeStorage.getItem(KEYS.BATCHES);
      const parsed = raw ? JSON.parse(raw) : initialBatches;
      return normalizeBatches(parsed);
    } catch {
      return normalizeBatches(initialBatches);
    }
  },
  setBatches: (data: Batch[]) => {
    try {
      safeStorage.setItem(KEYS.BATCHES, JSON.stringify(normalizeBatches(data)));
    } catch (e) {
      console.error('Failed to save batches', e);
    }
  },

  getSettings: (): SchedulerSettings => {
    try {
      const stored = safeStorage.getItem(KEYS.SETTINGS);
      return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings;
    } catch {
      return defaultSettings;
    }
  },
  setSettings: (settings: SchedulerSettings) => {
    try {
      safeStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save settings', e);
    }
  },

  getAuditLogs: (): AuditLog[] => {
    try {
      const stored = safeStorage.getItem(KEYS.AUDIT);
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
      safeStorage.setItem(KEYS.AUDIT, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to log audit action', e);
    }
  },
  clearAuditLogs: () => {
    try {
      safeStorage.removeItem(KEYS.AUDIT);
    } catch (e) {
      console.error('Failed to clear audit logs', e);
    }
  },

  // --- Weekly timetables ---
  getWeekTimetables: (): WeekTimetables => {
    try {
      const stored = safeStorage.getItem(KEYS.WEEK);
      if (!stored) return {};
      const parsed: WeekTimetables = JSON.parse(stored);
      const normalized: WeekTimetables = {};
      WEEKDAYS.forEach(day => {
        if (parsed[day]) {
          normalized[day] = normalizeTimetable(parsed[day]!);
        }
      });
      return normalized;
    } catch {
      return {};
    }
  },
  setWeekTimetables: (data: WeekTimetables) => {
    try {
      const normalized: WeekTimetables = {};
      WEEKDAYS.forEach(day => {
        if (data[day]) {
          normalized[day] = normalizeTimetable(data[day]!);
        }
      });
      safeStorage.setItem(KEYS.WEEK, JSON.stringify(normalized));
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
    week[day] = normalizeTimetable(timetable);
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

  // Allocations from every OTHER day this week - feeds the weekly quota bias
  getWeekAllocationsExcluding: (day: DayOfWeek): Allocation[] => {
    const week = storage.getWeekTimetables();
    return WEEKDAYS
      .filter(d => d !== day)
      .flatMap(d => week[d]?.allocations || []);
  },

  // Every day's allocations (including current), keyed by day - feeds the quota summary UI
  getAllWeekAllocations: (): Record<DayOfWeek, Allocation[]> => {
    const week = storage.getWeekTimetables();
    const result = {} as Record<DayOfWeek, Allocation[]>;
    WEEKDAYS.forEach(d => { result[d] = week[d]?.allocations || []; });
    return result;
  },

  // Complete reset to demo/seed data
  resetToSeedData: () => {
    try {
      safeStorage.setItem(KEYS.FACULTY, JSON.stringify(initialFaculty));
      safeStorage.setItem(KEYS.BATCHES, JSON.stringify(initialBatches));
      safeStorage.setItem(KEYS.SETTINGS, JSON.stringify(defaultSettings));
      safeStorage.removeItem(KEYS.WEEK);
      storage.clearAuditLogs();
      storage.logAuditAction('STATUS_CHANGE', {
        reason: 'Restored system to initial demo/seed data defaults.',
      });
    } catch (e) {
      console.error('Failed to reset to seed data', e);
    }
  },
};
