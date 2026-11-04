import { generateTimetableV2, generateWeekTimetables, patchAbsences } from '../utils/scheduler';
import type { Batch, Faculty, Allocation, Timetable, SchedulerSettings, DayOfWeek } from '../types';

export interface WorkerGenerateDayPayload {
  batches: Batch[];
  faculties: Faculty[];
  currentAllocations: Allocation[];
  weekAllocations: Allocation[];
  options: {
    seed?: number;
    dayOfWeek?: DayOfWeek;
    dateKey?: string;
    settings?: SchedulerSettings;
    numCandidates?: number;
  };
}

export interface WorkerGenerateWeekPayload {
  batches: Batch[];
  faculties: Faculty[];
  existingWeek: Record<string, Timetable>;
  settings?: SchedulerSettings;
  options?: {
    seed?: number;
    teachingDays?: DayOfWeek[];
  };
}

export interface WorkerPatchAbsencesPayload {
  allocations: Allocation[];
  batches: Batch[];
  faculties: Faculty[];
  options: {
    dateKey?: string;
    dayOfWeek?: DayOfWeek;
    settings?: SchedulerSettings;
  };
}

export type WorkerMessage =
  | { id: string; type: 'GENERATE_DAY'; payload: WorkerGenerateDayPayload }
  | { id: string; type: 'GENERATE_WEEK'; payload: WorkerGenerateWeekPayload }
  | { id: string; type: 'PATCH_ABSENCES'; payload: WorkerPatchAbsencesPayload };

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { id, type, payload } = e.data;

  try {
    if (type === 'GENERATE_DAY') {
      self.postMessage({ id, type: 'PROGRESS', progress: 20, stage: 'Calculating weekly subject quotas...' });

      const result = generateTimetableV2(
        payload.batches,
        payload.faculties,
        payload.currentAllocations,
        payload.weekAllocations,
        payload.options
      );

      self.postMessage({ id, type: 'PROGRESS', progress: 100, stage: 'Schedule generated successfully.' });
      self.postMessage({ id, type: 'SUCCESS', result });
    } else if (type === 'GENERATE_WEEK') {
      self.postMessage({ id, type: 'PROGRESS', progress: 15, stage: 'Balancing weekly quotas across 6 days...' });

      const result = generateWeekTimetables(
        payload.batches,
        payload.faculties,
        payload.existingWeek,
        payload.settings,
        payload.options
      );

      self.postMessage({ id, type: 'PROGRESS', progress: 100, stage: 'Week schedule complete.' });
      self.postMessage({ id, type: 'SUCCESS', result });
    } else if (type === 'PATCH_ABSENCES') {
      self.postMessage({ id, type: 'PROGRESS', progress: 30, stage: 'Identifying absent slots and qualified substitutes...' });

      const result = patchAbsences(
        payload.allocations,
        payload.batches,
        payload.faculties,
        payload.options
      );

      self.postMessage({ id, type: 'PROGRESS', progress: 100, stage: 'Absence patching complete.' });
      self.postMessage({ id, type: 'SUCCESS', result });
    }
  } catch (err) {
    self.postMessage({
      id,
      type: 'ERROR',
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

