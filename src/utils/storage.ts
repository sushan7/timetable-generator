import type {
  Faculty,
  Batch,
  SchedulerSettings,
  AuditLog,
  AuditLogAction,
  Timetable,
  DayOfWeek,
  Allocation,
  TimetableStatus,
  BackupData,
  UnfilledSlot,
} from '../types';
import { WEEKDAYS } from '../types';
import { initialFaculty, initialBatches, inferSubjectCategory, DEFAULT_SUBJECT_CATEGORIES } from './seedData';
import { normalizeTimeToHHmm } from './validation';

export const SCHEMA_VERSION = 4;

export const KEYS = {
  VERSION: 'sdtg_schema_version',
  FACULTY: 'sdtg_faculty',
  BATCHES: 'sdtg_batches',
  SETTINGS: 'sdtg_settings',
  AUDIT: 'sdtg_audit_logs',
  WEEK: 'sdtg_week_timetables',
  DATE_ABSENCES: 'sdtg_date_absences',
};

export const defaultSettings: SchedulerSettings = {
  pcmbWeight: 60,
  languageWeight: 40,
  maxDailyPeriods: 4,
  weekStartDay: 'Monday',
  enableGapOptimization: true,
  enableConsecutivePeriodAvoidance: true,
  enableStrictPeriod1NoLanguage: true,
  enableKHSGrouping: true,
  respectDailyLimits: true,
  allowSameSubjectConsecutive: false,
  subjectCategories: { ...DEFAULT_SUBJECT_CATEGORIES },
  minTravelGapMinutes: 0,
};

export type WeekTimetables = Partial<Record<DayOfWeek, Timetable>>;

// Helper to normalize legacy "Second Language" to "K/H/S"
export const normalizeSubjectName = (subj: string): string =>
  subj === 'Second Language' ? 'K/H/S' : subj;

export const normalizeFaculty = (list: Faculty[]): Faculty[] =>
  (list || []).map(f => {
    // M3: Per-day absence migration: migrate legacy isAbsent: true to all days
    let absentDays = f.absentDays;
    if (!absentDays) {
      if (f.isAbsent) {
        absentDays = [...WEEKDAYS];
      } else {
        absentDays = [];
      }
    }

    return {
      ...f,
      subjects: (f.subjects || []).map(normalizeSubjectName),
      assignedBatches: f.assignedBatches || [],
      unavailableDates: f.unavailableDates || [],
      unavailablePeriods: f.unavailablePeriods || [],
      unavailable: f.unavailable || [],
      absentDays,
      isAbsent: Boolean(f.isAbsent || (absentDays && absentDays.length > 0)),
    };
  });

export const normalizeBatches = (list: Batch[]): Batch[] =>
  (list || []).map(b => ({
    ...b,
    periods: (b.periods || []).map(p => ({
      startTime: p.startTime ? (normalizeTimeToHHmm(p.startTime) || p.startTime) : '',
      endTime: p.endTime ? (normalizeTimeToHHmm(p.endTime) || p.endTime) : '',
    })),
    subjects: (b.subjects || []).map(s => ({
      ...s,
      subject: normalizeSubjectName(s.subject),
      category: s.category || inferSubjectCategory(s.subject),
    })),
  }));

export const normalizeTimetable = (tt: Timetable): Timetable => ({
  ...tt,
  allocations: (tt.allocations || []).map(a => ({
    ...a,
    subject: normalizeSubjectName(a.subject),
  })),
  unfilledSlots: tt.unfilledSlots || [],
  warnings: tt.warnings || [],
  frozenViolations: tt.frozenViolations || [],
});

// Centralized faculty daily limit helper (M5)
export { getDailyLimit } from './constraints';

// -------------------------------------------------------------
// RELIABLE STORAGE ABSTRACTION (C1)
// -------------------------------------------------------------
// In-memory fallback Map guaranteed to work in all environments:
// - SSR / Node tests
// - localStorage disabled / private browsing quota exceeded
// - corrupted / throwing localStorage implementations
const memoryStore = new Map<string, string>();

let isLocalStorageAvailable: boolean | null = null;
let hasWarnedStorageUnavailable = false;
let storageWarningCallback: ((message: string) => void) | null = null;
let pendingStorageWarning: string | null = null;

export const setStorageWarningCallback = (cb: ((message: string) => void) | null) => {
  storageWarningCallback = cb;
  if (cb && pendingStorageWarning) {
    cb(pendingStorageWarning);
    pendingStorageWarning = null;
  }
};

export const triggerStorageWarning = (message: string) => {
  if (hasWarnedStorageUnavailable) return;
  hasWarnedStorageUnavailable = true;
  if (storageWarningCallback) {
    storageWarningCallback(message);
  } else {
    pendingStorageWarning = message;
  }
};

const testLocalStorage = (): boolean => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return false;
  }
  try {
    const testKey = '__storage_test__';
    window.localStorage.setItem(testKey, testKey);
    const result = window.localStorage.getItem(testKey) === testKey;
    window.localStorage.removeItem(testKey);
    if (!result) {
      triggerStorageWarning('Persistent storage is not functioning properly. Operating in session memory mode.');
    }
    return result;
  } catch (e) {
    console.warn('localStorage is unavailable or blocked, falling back to memory store:', e);
    triggerStorageWarning('Persistent storage is unavailable (e.g. private mode or restricted permissions). Operating in session memory mode.');
    return false;
  }
};

export const safeStorage = {
  getItem: (key: string): string | null => {
    if (isLocalStorageAvailable === null) {
      isLocalStorageAvailable = testLocalStorage();
    }
    if (isLocalStorageAvailable) {
      try {
        const item = window.localStorage.getItem(key);
        if (item !== null) return item;
      } catch (e) {
        console.warn(`safeStorage: read failed for key "${key}", falling back to memory store:`, e);
        triggerStorageWarning('Persistent storage read failed. Using session memory store.');
      }
    }
    return memoryStore.get(key) ?? null;
  },

  setItem: (key: string, value: string): void => {
    // Always update memory store to guarantee subsequent reads succeed
    memoryStore.set(key, value);

    if (isLocalStorageAvailable === null) {
      isLocalStorageAvailable = testLocalStorage();
    }
    if (isLocalStorageAvailable) {
      try {
        window.localStorage.setItem(key, value);
      } catch (e) {
        console.warn(`safeStorage: write failed for key "${key}", retained in memory store:`, e);
        triggerStorageWarning('Failed to write to persistent storage (storage may be full or restricted). Running in session memory mode.');
      }
    }
  },

  removeItem: (key: string): void => {
    memoryStore.delete(key);

    if (isLocalStorageAvailable === null) {
      isLocalStorageAvailable = testLocalStorage();
    }
    if (isLocalStorageAvailable) {
      try {
        window.localStorage.removeItem(key);
      } catch (e) {
        console.warn(`safeStorage: remove failed for key "${key}":`, e);
      }
    }
  },

  clearMemoryFallback: (): void => {
    memoryStore.clear();
  },

  resetAvailabilityCheck: (): void => {
    isLocalStorageAvailable = null;
    hasWarnedStorageUnavailable = false;
    pendingStorageWarning = null;
  },

  isPersistent: (): boolean => {
    if (isLocalStorageAvailable === null) {
      isLocalStorageAvailable = testLocalStorage();
    }
    return isLocalStorageAvailable;
  },
};

// In-memory caches to prevent redundant JSON parsing on rapid repeated reads
let facultyCache: Faculty[] | null = null;
let batchesCache: Batch[] | null = null;
let settingsCache: SchedulerSettings | null = null;
let weekTimetablesCache: WeekTimetables | null = null;

export const invalidateStorageCaches = () => {
  facultyCache = null;
  batchesCache = null;
  settingsCache = null;
  weekTimetablesCache = null;
};

// -------------------------------------------------------------
// MAIN STORAGE API
// -------------------------------------------------------------
export const storage = {
  initialize: () => {
    try {
      const storedVersion = safeStorage.getItem(KEYS.VERSION);
      const currentVersion = storedVersion ? parseInt(storedVersion, 10) : 1;

      // Seed initial data if absent
      if (!safeStorage.getItem(KEYS.FACULTY)) {
        safeStorage.setItem(KEYS.FACULTY, JSON.stringify(initialFaculty));
      }
      if (!safeStorage.getItem(KEYS.BATCHES)) {
        safeStorage.setItem(KEYS.BATCHES, JSON.stringify(initialBatches));
      }
      if (!safeStorage.getItem(KEYS.SETTINGS)) {
        safeStorage.setItem(KEYS.SETTINGS, JSON.stringify(defaultSettings));
      }

      // Auto-migration to v2 (subject categories, K/H/S naming, safe defaults)
      if (currentVersion < SCHEMA_VERSION) {
        storage.migrateSchema(currentVersion);
      } else {
        // Normal validation pass on existing storage
        const currentFaculty = storage.getFaculty();
        storage.setFaculty(currentFaculty);
        const currentBatches = storage.getBatches();
        storage.setBatches(currentBatches);
      }
    } catch (e) {
      console.error('Failed to initialize storage', e);
    }
  },

  migrateSchema: (fromVersion: number) => {
    try {
      console.info(`Migrating storage schema from v${fromVersion} to v${SCHEMA_VERSION}...`);
      const faculty = storage.getFaculty();
      storage.setFaculty(normalizeFaculty(faculty));

      const batches = storage.getBatches();
      storage.setBatches(normalizeBatches(batches));

      const week = storage.getWeekTimetables();
      const updatedWeek: WeekTimetables = {};
      (Object.keys(week) as DayOfWeek[]).forEach(day => {
        const tt = week[day];
        if (tt) {
          updatedWeek[day] = normalizeTimetable(tt);
        }
      });
      storage.setWeekTimetables(updatedWeek);

      safeStorage.setItem(KEYS.VERSION, String(SCHEMA_VERSION));
      console.info(`Storage schema successfully migrated to v${SCHEMA_VERSION}.`);
    } catch (e) {
      console.error('Error migrating storage schema:', e);
    }
  },

  // --- Faculty Management ---
  getFaculty: (): Faculty[] => {
    if (facultyCache) return facultyCache;
    try {
      const raw = safeStorage.getItem(KEYS.FACULTY);
      const parsed = raw ? JSON.parse(raw) : initialFaculty;
      facultyCache = normalizeFaculty(Array.isArray(parsed) ? parsed : initialFaculty);
      return facultyCache;
    } catch (e) {
      console.error('getFaculty: Error parsing stored faculty, falling back to seed data', e);
      facultyCache = normalizeFaculty(initialFaculty);
      return facultyCache;
    }
  },

  setFaculty: (faculty: Faculty[]) => {
    try {
      facultyCache = normalizeFaculty(faculty);
      safeStorage.setItem(KEYS.FACULTY, JSON.stringify(facultyCache));
    } catch (e) {
      console.error('Failed to save faculty', e);
    }
  },

  saveFaculty: (f: Faculty) => {
    const list = storage.getFaculty();
    const idx = list.findIndex(item => item.id === f.id);
    const updated = [...list];
    if (idx >= 0) {
      updated[idx] = f;
    } else {
      updated.push(f);
    }
    storage.setFaculty(updated);
  },

  countFacultyAllocations: (facultyId: string): number => {
    const week = storage.getWeekTimetables();
    let count = 0;
    (Object.keys(week) as DayOfWeek[]).forEach(day => {
      const tt = week[day];
      if (tt?.allocations) {
        count += tt.allocations.filter(a => a.facultyId === facultyId).length;
      }
    });
    return count;
  },

  deleteFaculty: (facultyId: string): { success: boolean; allocationsAffected: number } => {
    try {
      const facultyList = storage.getFaculty();
      const oldFac = facultyList.find(f => f.id === facultyId);
      const remaining = facultyList.filter(f => f.id !== facultyId);
      storage.setFaculty(remaining);

      const batches = storage.getBatches();
      const batchMap = new Map(batches.map(b => [b.id, b]));

      // Clean up references in week timetables: turn allocations into unfilled shortage slots (H6)
      let allocationsAffected = 0;
      const week = storage.getWeekTimetables();
      const updatedWeek: WeekTimetables = {};
      (Object.keys(week) as DayOfWeek[]).forEach(day => {
        const tt = week[day];
        if (tt) {
          const affectedAllocations = tt.allocations.filter(a => a.facultyId === facultyId);
          allocationsAffected += affectedAllocations.length;

          // Remove affected allocations from active allocations
          const remainingAllocations = tt.allocations.filter(a => a.facultyId !== facultyId);

          // Convert each affected allocation to an unfilled shortage slot
          const existingUnfilled = tt.unfilledSlots || [];
          const newUnfilled: UnfilledSlot[] = affectedAllocations.map(a => {
            const batch = batchMap.get(a.batchId);
            return {
              batchId: a.batchId,
              batchName: batch?.name || a.batchId,
              periodIndex: a.periodIndex,
              requiredSubject: a.subject,
              reason: 'NO_QUALIFIED_TEACHER',
              candidateIssue: `Assigned teacher (${oldFac?.name || facultyId}) was removed from directory`,
            };
          });

          // Deduplicate unfilled slots
          const mergedUnfilled = [
            ...existingUnfilled.filter(
              u => !newUnfilled.some(nu => nu.batchId === u.batchId && nu.periodIndex === u.periodIndex)
            ),
            ...newUnfilled,
          ];

          updatedWeek[day] = {
            ...tt,
            allocations: remainingAllocations,
            unfilledSlots: mergedUnfilled,
          };
        }
      });
      storage.setWeekTimetables(updatedWeek);

      storage.logAuditAction('FACULTY_DELETE', {
        reason: `Removed faculty member (${oldFac?.name || facultyId}). Converted ${allocationsAffected} timetable slot(s) into unfilled shortage slots.`,
      });

      return { success: true, allocationsAffected };
    } catch (e) {
      console.error('deleteFaculty failed:', e);
      return { success: false, allocationsAffected: 0 };
    }
  },

  mergeFaculty: (primaryId: string, secondaryIds: string[]): { success: boolean; mergedFaculty: Faculty | null } => {
    try {
      const facultyList = storage.getFaculty();
      const primary = facultyList.find(f => f.id === primaryId);
      if (!primary) return { success: false, mergedFaculty: null };

      const secondaries = facultyList.filter(f => secondaryIds.includes(f.id));
      const secIdSet = new Set(secondaryIds);

      // Union subjects and assignedBatches
      const combinedSubjects = Array.from(
        new Set([...primary.subjects, ...secondaries.flatMap(s => s.subjects)])
      );
      const combinedBatches = Array.from(
        new Set([...(primary.assignedBatches || []), ...secondaries.flatMap(s => s.assignedBatches || [])])
      );

      const updatedPrimary: Faculty = {
        ...primary,
        subjects: combinedSubjects,
        assignedBatches: combinedBatches,
      };

      // Keep updated primary and all faculty not in secondaryIds
      const updatedList = facultyList
        .filter(f => !secIdSet.has(f.id))
        .map(f => (f.id === primaryId ? updatedPrimary : f));

      storage.setFaculty(updatedList);

      // Re-link stored allocations in all days from secondaryIds to primaryId
      let slotsReassigned = 0;
      const week = storage.getWeekTimetables();
      const updatedWeek: WeekTimetables = {};
      (Object.keys(week) as DayOfWeek[]).forEach(day => {
        const tt = week[day];
        if (tt) {
          const updatedAllocations = tt.allocations.map(a => {
            if (secIdSet.has(a.facultyId)) {
              slotsReassigned++;
              return { ...a, facultyId: primaryId };
            }
            return a;
          });
          updatedWeek[day] = { ...tt, allocations: updatedAllocations };
        }
      });
      storage.setWeekTimetables(updatedWeek);

      storage.logAuditAction('FACULTY_MERGE', {
        reason: `Merged faculty profiles for "${primary.name}" (${secondaryIds.join(', ')} into ${primaryId}). Updated ${slotsReassigned} allocations.`,
      });

      return { success: true, mergedFaculty: updatedPrimary };
    } catch (e) {
      console.error('mergeFaculty failed:', e);
      return { success: false, mergedFaculty: null };
    }
  },

  // --- Batches Management ---
  getBatches: (): Batch[] => {
    if (batchesCache) return batchesCache;
    try {
      const raw = safeStorage.getItem(KEYS.BATCHES);
      const parsed = raw ? JSON.parse(raw) : initialBatches;
      batchesCache = normalizeBatches(Array.isArray(parsed) ? parsed : initialBatches);
      return batchesCache;
    } catch (e) {
      console.error('getBatches: Error parsing stored batches, falling back to seed data', e);
      batchesCache = normalizeBatches(initialBatches);
      return batchesCache;
    }
  },

  setBatches: (batches: Batch[]) => {
    try {
      batchesCache = normalizeBatches(batches);
      safeStorage.setItem(KEYS.BATCHES, JSON.stringify(batchesCache));
    } catch (e) {
      console.error('Failed to save batches', e);
    }
  },

  saveBatch: (b: Batch) => {
    const list = storage.getBatches();
    const idx = list.findIndex(item => item.id === b.id);
    const updated = [...list];
    if (idx >= 0) {
      updated[idx] = b;
    } else {
      updated.push(b);
    }
    storage.setBatches(updated);
  },

  deleteBatch: (batchId: string): { success: boolean; facultyUnassigned: number } => {
    try {
      const batches = storage.getBatches();
      const remainingBatches = batches.filter(b => b.id !== batchId);
      storage.setBatches(remainingBatches);

      // Clean up assignedBatches in faculty
      let facultyUnassigned = 0;
      const faculties = storage.getFaculty();
      const updatedFaculties = faculties.map(f => {
        if (f.assignedBatches && f.assignedBatches.includes(batchId)) {
          facultyUnassigned++;
          return {
            ...f,
            assignedBatches: f.assignedBatches.filter(id => id !== batchId),
          };
        }
        return f;
      });
      storage.setFaculty(updatedFaculties);

      // Clean up week timetables allocations
      const week = storage.getWeekTimetables();
      const updatedWeek: WeekTimetables = {};
      (Object.keys(week) as DayOfWeek[]).forEach(day => {
        const tt = week[day];
        if (tt) {
          updatedWeek[day] = {
            ...tt,
            allocations: tt.allocations.filter(a => a.batchId !== batchId),
            unfilledSlots: (tt.unfilledSlots || []).filter(u => u.batchId !== batchId),
          };
        }
      });
      storage.setWeekTimetables(updatedWeek);

      storage.logAuditAction('BATCH_DELETE', {
        batchId,
        reason: `Deleted batch ${batchId}. Unlocked ${facultyUnassigned} faculty restrictions.`,
      });

      return { success: true, facultyUnassigned };
    } catch (e) {
      console.error('deleteBatch failed:', e);
      return { success: false, facultyUnassigned: 0 };
    }
  },

  // --- Settings ---
  getSettings: (): SchedulerSettings => {
    if (settingsCache) return settingsCache;
    try {
      const stored = safeStorage.getItem(KEYS.SETTINGS);
      if (!stored) {
        settingsCache = { ...defaultSettings };
        return settingsCache;
      }
      const parsed = JSON.parse(stored);
      settingsCache = {
        ...defaultSettings,
        ...parsed,
        subjectCategories: {
          ...DEFAULT_SUBJECT_CATEGORIES,
          ...(parsed.subjectCategories || {}),
        },
      };
      return settingsCache!;
    } catch {
      settingsCache = { ...defaultSettings };
      return settingsCache;
    }
  },

  setSettings: (settings: SchedulerSettings) => {
    try {
      settingsCache = { ...settings };
      safeStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save settings', e);
    }
  },

  // --- Audit Logs ---
  getAuditLogs: (): AuditLog[] => {
    try {
      const stored = safeStorage.getItem(KEYS.AUDIT);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },

  logAuditAction: (action: AuditLogAction, details: Omit<AuditLog, 'id' | 'timestamp' | 'action'>) => {
    try {
      const logs = storage.getAuditLogs();
      const newLog: AuditLog = {
        id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
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

  // --- Date-Specific Absences (M3) ---
  getDateAbsences: (): Record<string, string[]> => {
    try {
      const stored = safeStorage.getItem(KEYS.DATE_ABSENCES);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  },

  getAbsencesForDate: (dateKey: string): string[] => {
    const all = storage.getDateAbsences();
    return all[dateKey] || [];
  },

  setFacultyAbsentForDate: (dateKey: string, facultyId: string, isAbsent: boolean) => {
    try {
      const all = storage.getDateAbsences();
      const current = new Set(all[dateKey] || []);
      if (isAbsent) {
        current.add(facultyId);
      } else {
        current.delete(facultyId);
      }
      all[dateKey] = Array.from(current);
      safeStorage.setItem(KEYS.DATE_ABSENCES, JSON.stringify(all));

      // Also sync the legacy isAbsent flag if viewing current day
      const facultyList = storage.getFaculty();
      const target = facultyList.find(f => f.id === facultyId);
      if (target) {
        target.isAbsent = isAbsent;
        storage.setFaculty(facultyList);
      }
    } catch (e) {
      console.error('Failed to set date absence', e);
    }
  },

  isFacultyAbsentOnDate: (dateKey: string, facultyOrId: Faculty | string): boolean => {
    const facultyId = typeof facultyOrId === 'string' ? facultyOrId : facultyOrId.id;
    const dateAbsences = storage.getAbsencesForDate(dateKey);
    if (dateAbsences.includes(facultyId)) return true;

    const faculty =
      typeof facultyOrId === 'object'
        ? facultyOrId
        : storage.getFaculty().find(f => f.id === facultyId);
    if (faculty?.unavailableDates && faculty.unavailableDates.includes(dateKey)) return true;
    return Boolean(faculty?.isAbsent);
  },

  // --- Weekly Timetables ---
  getWeekTimetables: (): WeekTimetables => {
    if (weekTimetablesCache) return weekTimetablesCache;
    try {
      const stored = safeStorage.getItem(KEYS.WEEK);
      if (!stored) {
        weekTimetablesCache = {};
        return weekTimetablesCache;
      }
      const parsed: WeekTimetables = JSON.parse(stored);
      const normalized: WeekTimetables = {};
      (Object.keys(parsed) as DayOfWeek[]).forEach(day => {
        const item = parsed[day];
        if (item) {
          normalized[day] = normalizeTimetable(item);
        }
      });
      weekTimetablesCache = normalized;
      return weekTimetablesCache;
    } catch {
      weekTimetablesCache = {};
      return weekTimetablesCache;
    }
  },

  setWeekTimetables: (week: WeekTimetables) => {
    try {
      weekTimetablesCache = { ...week };
      safeStorage.setItem(KEYS.WEEK, JSON.stringify(week));
    } catch (e) {
      console.error('Failed to save week timetables', e);
    }
  },

  getTimetableForDay: (day: DayOfWeek): Timetable | null => {
    const week = storage.getWeekTimetables();
    return week[day] || null;
  },

  getDayTimetable: (day: DayOfWeek): Timetable | null => {
    return storage.getTimetableForDay(day);
  },

  setDayTimetable: (
    day: DayOfWeek,
    data: {
      id?: string;
      date?: DayOfWeek;
      status?: TimetableStatus;
      allocations: Allocation[];
      lastGeneratedAt?: number;
      unfilledSlots?: Timetable['unfilledSlots'];
      warnings?: Timetable['warnings'];
    }
  ) => {
    return storage.saveTimetableForDay(day, data.allocations, data.status || 'Draft', {
      unfilledSlots: data.unfilledSlots,
      warnings: data.warnings,
      markGenerated: true,
    });
  },

  setTimetableStatus: (day: DayOfWeek, status: TimetableStatus, reason?: string): boolean => {
    return storage.setDayStatus(day, status, reason);
  },

  getWeekAllocationsExcluding: (excludingDay?: DayOfWeek): Allocation[] => {
    const week = storage.getWeekTimetables();
    const res: Allocation[] = [];
    for (const [d, tt] of Object.entries(week)) {
      if (excludingDay && d === (excludingDay as string)) continue;
      if (tt?.allocations) {
        res.push(...tt.allocations);
      }
    }
    return res;
  },

  saveTimetableForDay: (
    day: DayOfWeek,
    allocations: Allocation[],
    status: TimetableStatus = 'Draft',
    options?: {
      unfilledSlots?: Timetable['unfilledSlots'];
      warnings?: Timetable['warnings'];
      frozenViolations?: Timetable['frozenViolations'];
      markGenerated?: boolean;
      seed?: number;
    }
  ) => {
    try {
      const week = storage.getWeekTimetables();
      const existing = week[day];
      const now = Date.now();
      const isGenerating = Boolean(options?.markGenerated);

      // Finalized protection (M2): if already Finalized, and attempting to generate/edit without Reopen as Draft
      if (existing?.status === 'Finalized' && status !== 'Finalized') {
        return existing;
      }

      const updatedTimetable: Timetable = {
        id: existing?.id || `tt_${day.toLowerCase()}_${Date.now()}`,
        date: day,
        status: status,
        allocations: allocations.map(a => ({
          ...a,
          subject: normalizeSubjectName(a.subject),
          updatedAt: a.updatedAt || now,
        })),
        lastGeneratedAt: isGenerating ? now : existing?.lastGeneratedAt,
        updatedAt: isGenerating ? (existing?.updatedAt ?? now) : now,
        unfilledSlots: options?.unfilledSlots ?? existing?.unfilledSlots ?? [],
        warnings: options?.warnings ?? existing?.warnings ?? [],
        frozenViolations: options?.frozenViolations ?? existing?.frozenViolations ?? [],
        seed: options?.seed ?? existing?.seed,
      };

      week[day] = updatedTimetable;
      storage.setWeekTimetables(week);
      return updatedTimetable;
    } catch (e) {
      console.error('Failed to save day timetable', e);
      return null;
    }
  },

  // Finalized protection (M2)
  setDayStatus: (day: DayOfWeek, status: TimetableStatus, reason?: string): boolean => {
    try {
      const week = storage.getWeekTimetables();
      const existing = week[day];
      if (!existing) return false;

      const previousStatus = existing.status;
      existing.status = status;
      existing.updatedAt = Date.now();
      week[day] = existing;
      storage.setWeekTimetables(week);

      storage.logAuditAction('STATUS_CHANGE', {
        day,
        reason: reason || `Changed status of ${day} timetable from ${previousStatus} to ${status}.`,
      });
      return true;
    } catch (e) {
      console.error('Failed to set day status:', e);
      return false;
    }
  },

  // --- BACKUP & RESTORATION (Phase 5A / N1) ---
  createFullBackup: (): BackupData => {
    return {
      version: SCHEMA_VERSION,
      exportedAt: Date.now(),
      faculty: storage.getFaculty(),
      batches: storage.getBatches(),
      settings: storage.getSettings(),
      weekTimetables: storage.getWeekTimetables(),
      dateAbsences: storage.getDateAbsences(),
      auditLogs: storage.getAuditLogs(),
    };
  },

  // Alias for explicit N1 naming
  exportAllData: (): BackupData => {
    return storage.createFullBackup();
  },

  validateBackup: (data: unknown): { valid: boolean; errors: string[]; data?: BackupData } => {
    const errors: string[] = [];
    if (!data || typeof data !== 'object') {
      return { valid: false, errors: ['Backup content is not a valid JSON object.'] };
    }
    const b = data as Partial<BackupData>;
    if (typeof b.version !== 'number' || b.version < 1) {
      errors.push('Missing or invalid schema version (must be a positive integer).');
    }
    if (!Array.isArray(b.faculty)) {
      errors.push('Backup missing faculty list.');
    } else {
      let facultyErrors = 0;
      b.faculty.forEach((f, idx) => {
        if (!f || typeof f !== 'object') {
          if (facultyErrors < 3) errors.push(`Faculty item at index ${idx} is not an object.`);
          facultyErrors++;
          return;
        }
        if (typeof f.id !== 'string' || !f.id.trim()) {
          if (facultyErrors < 3) errors.push(`Faculty item at index ${idx} has missing or empty id.`);
          facultyErrors++;
        }
        if (typeof f.name !== 'string' || !f.name.trim()) {
          if (facultyErrors < 3) errors.push(`Faculty item at index ${idx} has missing or empty name.`);
          facultyErrors++;
        }
        if (!Array.isArray(f.subjects)) {
          if (facultyErrors < 3) errors.push(`Faculty item "${f.name || idx}" is missing subjects array.`);
          facultyErrors++;
        }
      });
      if (facultyErrors > 3) {
        errors.push(`...and ${facultyErrors - 3} more faculty validation issues.`);
      }
    }

    if (!Array.isArray(b.batches)) {
      errors.push('Backup missing batches list.');
    } else {
      let batchErrors = 0;
      b.batches.forEach((bt, idx) => {
        if (!bt || typeof bt !== 'object') {
          if (batchErrors < 3) errors.push(`Batch item at index ${idx} is not an object.`);
          batchErrors++;
          return;
        }
        if (typeof bt.id !== 'string' || !bt.id.trim()) {
          if (batchErrors < 3) errors.push(`Batch item at index ${idx} has missing or empty id.`);
          batchErrors++;
        }
        if (typeof bt.name !== 'string' || !bt.name.trim()) {
          if (batchErrors < 3) errors.push(`Batch item at index ${idx} has missing or empty name.`);
          batchErrors++;
        }
        if (!Array.isArray(bt.periods)) {
          if (batchErrors < 3) errors.push(`Batch item "${bt.name || idx}" is missing periods array.`);
          batchErrors++;
        }
      });
      if (batchErrors > 3) {
        errors.push(`...and ${batchErrors - 3} more batch validation issues.`);
      }
    }

    if (!b.settings || typeof b.settings !== 'object') {
      errors.push('Backup missing scheduler settings.');
    } else {
      const s = b.settings as Partial<SchedulerSettings>;
      if (s.maxDailyPeriods !== undefined && (typeof s.maxDailyPeriods !== 'number' || s.maxDailyPeriods < 1)) {
        errors.push('Settings maxDailyPeriods must be a positive integer.');
      }
    }

    if (!b.weekTimetables || typeof b.weekTimetables !== 'object') {
      errors.push('Backup missing week timetables.');
    } else {
      Object.entries(b.weekTimetables).forEach(([day, tt]) => {
        if (tt && typeof tt === 'object' && !Array.isArray(tt.allocations)) {
          errors.push(`Timetable for ${day} is missing allocations array.`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      data: errors.length === 0 ? (b as BackupData) : undefined,
    };
  },

  restoreFromBackup: (
    data: BackupData,
    mode: 'replace' | 'merge' = 'replace'
  ): { success: boolean; error?: string; stats: { faculty: number; batches: number; timetables: number } } => {
    const validation = storage.validateBackup(data);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join('; '),
        stats: { faculty: 0, batches: 0, timetables: 0 },
      };
    }

    let snapshot: BackupData | null = null;
    try {
      // Create rollback snapshot
      snapshot = storage.createFullBackup();

      let targetFaculty: Faculty[] = [];
      let targetBatches: Batch[] = [];

      if (mode === 'replace') {
        targetFaculty = normalizeFaculty(data.faculty);
        targetBatches = normalizeBatches(data.batches);
        storage.setFaculty(targetFaculty);
        storage.setBatches(targetBatches);
        storage.setSettings(data.settings || defaultSettings);
        storage.setWeekTimetables(data.weekTimetables || {});
        if (data.dateAbsences) {
          safeStorage.setItem(KEYS.DATE_ABSENCES, JSON.stringify(data.dateAbsences));
        }
      } else {
        // Merge mode: preserve existing and add unique incoming records
        const existingFac = storage.getFaculty();
        const facMap = new Map(existingFac.map(f => [f.id, f]));
        data.faculty.forEach(f => facMap.set(f.id, f));
        targetFaculty = Array.from(facMap.values());
        storage.setFaculty(targetFaculty);

        const existingBatches = storage.getBatches();
        const batchMap = new Map(existingBatches.map(b => [b.id, b]));
        data.batches.forEach(b => batchMap.set(b.id, b));
        targetBatches = Array.from(batchMap.values());
        storage.setBatches(targetBatches);

        // Merge week timetables
        const currentWeek = storage.getWeekTimetables();
        const mergedWeek = { ...currentWeek, ...data.weekTimetables };
        storage.setWeekTimetables(mergedWeek);
      }

      const timetableCount = Object.keys(data.weekTimetables || {}).length;

      storage.logAuditAction('BACKUP_RESTORE', {
        reason: `Restored backup (${mode} mode): ${targetFaculty.length} faculty, ${targetBatches.length} batches, ${timetableCount} timetables.`,
      });

      return {
        success: true,
        stats: {
          faculty: targetFaculty.length,
          batches: targetBatches.length,
          timetables: timetableCount,
        },
      };
    } catch (e) {
      console.error('restoreFromBackup encountered fatal error:', e);
      if (snapshot) {
        try {
          storage.restoreFromBackup(snapshot, 'replace');
        } catch {
          // ignore rollback failure
        }
      }
      return {
        success: false,
        error: String(e),
        stats: { faculty: 0, batches: 0, timetables: 0 },
      };
    }
  },

  // Alias for explicit N1 naming
  importBackup: (
    data: BackupData,
    mode: 'replace' | 'merge' = 'replace'
  ): { success: boolean; error?: string; stats: { faculty: number; batches: number; timetables: number } } => {
    return storage.restoreFromBackup(data, mode);
  },

  // Reset to factory seed state
  resetAll: () => {
    safeStorage.setItem(KEYS.FACULTY, JSON.stringify(initialFaculty));
    safeStorage.setItem(KEYS.BATCHES, JSON.stringify(initialBatches));
    safeStorage.setItem(KEYS.SETTINGS, JSON.stringify(defaultSettings));
    safeStorage.removeItem(KEYS.WEEK);
    safeStorage.removeItem(KEYS.AUDIT);
    safeStorage.removeItem(KEYS.DATE_ABSENCES);
    safeStorage.setItem(KEYS.VERSION, String(SCHEMA_VERSION));
    invalidateStorageCaches();
  },

  resetToSeedData: () => {
    storage.resetAll();
  },
};
