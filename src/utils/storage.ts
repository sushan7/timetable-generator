import type { Faculty, Batch, SchedulerSettings, AuditLog } from '../types';
import { initialFaculty, initialBatches } from './seedData';

const KEYS = {
  FACULTY: 'sdtg_faculty',
  BATCHES: 'sdtg_batches',
  SETTINGS: 'sdtg_settings',
  AUDIT: 'sdtg_audit_logs',
};

export const defaultSettings: SchedulerSettings = {
  pcmbWeight: 60,
  languageWeight: 40,
  maxDailyPeriods: 6,
  weekStartDay: 'Monday',
  enableGapOptimization: true,
  enableConsecutivePeriodAvoidance: true,
};

export const storage = {
  initialize: () => {
    if (!localStorage.getItem(KEYS.FACULTY)) {
      localStorage.setItem(KEYS.FACULTY, JSON.stringify(initialFaculty));
    }
    if (!localStorage.getItem(KEYS.BATCHES)) {
      localStorage.setItem(KEYS.BATCHES, JSON.stringify(initialBatches));
    }
  },

  // Faculty
  getFaculty: (): Faculty[] => JSON.parse(localStorage.getItem(KEYS.FACULTY) || '[]'),
  setFaculty: (data: Faculty[]) => localStorage.setItem(KEYS.FACULTY, JSON.stringify(data)),

  // Batches
  getBatches: (): Batch[] => JSON.parse(localStorage.getItem(KEYS.BATCHES) || '[]'),
  setBatches: (data: Batch[]) => localStorage.setItem(KEYS.BATCHES, JSON.stringify(data)),

  // Settings
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

  // Audit
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
};