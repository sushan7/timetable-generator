import type { Faculty, Batch } from '../types';
import { initialFaculty, initialBatches } from './seedData';

const KEYS = {
  FACULTY: 'sdtg_faculty',
  BATCHES: 'sdtg_batches',
};

export const storage = {
  // Runs once on startup to inject sample data if the app is empty
  initialize: () => {
    if (!localStorage.getItem(KEYS.FACULTY)) {
      localStorage.setItem(KEYS.FACULTY, JSON.stringify(initialFaculty));
    }
    if (!localStorage.getItem(KEYS.BATCHES)) {
      localStorage.setItem(KEYS.BATCHES, JSON.stringify(initialBatches));
    }
  },

  // Faculty CRUD operations
  getFaculty: (): Faculty[] => JSON.parse(localStorage.getItem(KEYS.FACULTY) || '[]'),
  setFaculty: (data: Faculty[]) => localStorage.setItem(KEYS.FACULTY, JSON.stringify(data)),

  // Batch CRUD operations
  getBatches: (): Batch[] => JSON.parse(localStorage.getItem(KEYS.BATCHES) || '[]'),
  setBatches: (data: Batch[]) => localStorage.setItem(KEYS.BATCHES, JSON.stringify(data)),
};