import type { Batch } from '../types';

export type SectionId = 'b1-first' | 'b1-second' | 'b2-first' | 'b2-second';

export const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'b1-first', label: 'Building 1 — First PUC' },
  { id: 'b2-first', label: 'Building 2 — First PUC' },
  { id: 'b1-second', label: 'Building 1 — Second PUC' },
  { id: 'b2-second', label: 'Building 2 — Second PUC' },
];

// Any yearCategory that doesn't explicitly say "First" is treated as Second PUC
// for its building (covers "Second PU", "Second PU (AIIMS)", "NLT", etc.)
export const getBatchSection = (batch: Batch): SectionId => {
  const isBuilding2 = batch.building === 'Building 2';
  const isFirstPUC = batch.yearCategory.toLowerCase().includes('first');

  if (isBuilding2) return isFirstPUC ? 'b2-first' : 'b2-second';
  return isFirstPUC ? 'b1-first' : 'b1-second';
};

export const groupBatchesBySection = (batches: Batch[]): Record<SectionId, Batch[]> => {
  const grouped: Record<SectionId, Batch[]> = {
    'b1-first': [], 'b1-second': [], 'b2-first': [], 'b2-second': [],
  };
  batches.forEach(b => grouped[getBatchSection(b)].push(b));
  return grouped;
};