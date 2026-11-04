import { generateTimetableV2, generateWeekTimetables, patchAbsences } from './scheduler';
import type {
  Batch,
  Faculty,
  Allocation,
  Timetable,
  SchedulerSettings,
  DayOfWeek,
  GenerationResult,
  WeekTimetables,
  WeekQuotaFitReport,
} from '../types';

export interface SchedulerProgress {
  progress: number;
  stage: string;
}

export type ProgressCallback = (p: SchedulerProgress) => void;

export interface WeekTimetablesResult {
  weekTimetables: WeekTimetables;
  quotaReport: WeekQuotaFitReport;
  seed: number;
}

export interface AbsencePatchResult {
  updatedAllocations: Allocation[];
  patchedCount: number;
  remainingGapsCount: number;
  subjectChangedCount: number;
}

function createWorker(): Worker | null {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    return null;
  }
  try {
    return new Worker(new URL('../workers/scheduler.worker.ts', import.meta.url), {
      type: 'module',
    });
  } catch (e) {
    console.warn('Web Worker initialization failed, falling back to main thread execution:', e);
    return null;
  }
}

/**
 * Executes generateTimetableV2 in a Web Worker if available, falling back to main thread.
 * Removes artificial setTimeout delays.
 */
export async function runGenerateDay(
  batches: Batch[],
  faculties: Faculty[],
  currentAllocations: Allocation[],
  weekAllocations: Allocation[],
  options: {
    seed?: number;
    dayOfWeek?: DayOfWeek;
    dateKey?: string;
    settings?: SchedulerSettings;
    numCandidates?: number;
  },
  onProgress?: ProgressCallback
): Promise<GenerationResult> {
  const worker = createWorker();

  if (!worker) {
    onProgress?.({ progress: 50, stage: 'Generating timetable on main thread...' });
    const result = generateTimetableV2(batches, faculties, currentAllocations, weekAllocations, options);
    onProgress?.({ progress: 100, stage: 'Complete' });
    return result;
  }

  return new Promise((resolve, reject) => {
    const id = `req_${Date.now()}_${Math.random()}`;

    const cleanup = () => {
      worker.terminate();
    };

    worker.onmessage = (e: MessageEvent) => {
      const data = e.data;
      if (data.id !== id) return;

      if (data.type === 'PROGRESS') {
        onProgress?.({ progress: data.progress, stage: data.stage });
      } else if (data.type === 'SUCCESS') {
        cleanup();
        resolve(data.result as GenerationResult);
      } else if (data.type === 'ERROR') {
        cleanup();
        reject(new Error(data.error));
      }
    };

    worker.onerror = err => {
      cleanup();
      console.warn('Worker runtime error, falling back to main thread:', err);
      try {
        const fallback = generateTimetableV2(batches, faculties, currentAllocations, weekAllocations, options);
        resolve(fallback);
      } catch (fallbackErr) {
        reject(fallbackErr);
      }
    };

    worker.postMessage({
      id,
      type: 'GENERATE_DAY',
      payload: { batches, faculties, currentAllocations, weekAllocations, options },
    });
  });
}

/**
 * Executes generateWeekTimetables in a Web Worker if available, falling back to main thread.
 * Removes artificial setTimeout delays.
 */
export async function runGenerateWeek(
  batches: Batch[],
  faculties: Faculty[],
  existingWeek: Record<string, Timetable>,
  settings?: SchedulerSettings,
  options?: {
    seed?: number;
    teachingDays?: DayOfWeek[];
  },
  onProgress?: ProgressCallback
): Promise<WeekTimetablesResult> {
  const worker = createWorker();

  if (!worker) {
    onProgress?.({ progress: 50, stage: 'Generating full week on main thread...' });
    const result = generateWeekTimetables(batches, faculties, existingWeek, settings, options);
    onProgress?.({ progress: 100, stage: 'Complete' });
    return result;
  }

  return new Promise((resolve, reject) => {
    const id = `req_week_${Date.now()}_${Math.random()}`;

    const cleanup = () => {
      worker.terminate();
    };

    worker.onmessage = (e: MessageEvent) => {
      const data = e.data;
      if (data.id !== id) return;

      if (data.type === 'PROGRESS') {
        onProgress?.({ progress: data.progress, stage: data.stage });
      } else if (data.type === 'SUCCESS') {
        cleanup();
        resolve(data.result as WeekTimetablesResult);
      } else if (data.type === 'ERROR') {
        cleanup();
        reject(new Error(data.error));
      }
    };

    worker.onerror = err => {
      cleanup();
      console.warn('Worker runtime error during week generation, falling back to main thread:', err);
      try {
        const fallback = generateWeekTimetables(batches, faculties, existingWeek, settings, options);
        resolve(fallback);
      } catch (fallbackErr) {
        reject(fallbackErr);
      }
    };

    worker.postMessage({
      id,
      type: 'GENERATE_WEEK',
      payload: { batches, faculties, existingWeek, settings, options },
    });
  });
}

/**
 * Executes patchAbsences in a Web Worker if available, falling back to main thread.
 * Removes artificial setTimeout delays.
 */
export async function runPatchAbsences(
  allocations: Allocation[],
  batches: Batch[],
  faculties: Faculty[],
  options: {
    dateKey?: string;
    dayOfWeek?: DayOfWeek;
    settings?: SchedulerSettings;
  },
  onProgress?: ProgressCallback
): Promise<AbsencePatchResult> {
  const worker = createWorker();

  if (!worker) {
    onProgress?.({ progress: 50, stage: 'Patching absences on main thread...' });
    const result = patchAbsences(allocations, batches, faculties, options);
    onProgress?.({ progress: 100, stage: 'Complete' });
    return result;
  }

  return new Promise((resolve, reject) => {
    const id = `req_patch_${Date.now()}_${Math.random()}`;

    const cleanup = () => {
      worker.terminate();
    };

    worker.onmessage = (e: MessageEvent) => {
      const data = e.data;
      if (data.id !== id) return;

      if (data.type === 'PROGRESS') {
        onProgress?.({ progress: data.progress, stage: data.stage });
      } else if (data.type === 'SUCCESS') {
        cleanup();
        resolve(data.result as AbsencePatchResult);
      } else if (data.type === 'ERROR') {
        cleanup();
        reject(new Error(data.error));
      }
    };

    worker.onerror = err => {
      cleanup();
      console.warn('Worker runtime error during absence patching, falling back to main thread:', err);
      try {
        const fallback = patchAbsences(allocations, batches, faculties, options);
        resolve(fallback);
      } catch (fallbackErr) {
        reject(fallbackErr);
      }
    };

    worker.postMessage({
      id,
      type: 'PATCH_ABSENCES',
      payload: { allocations, batches, faculties, options },
    });
  });
}
