# Timetable Pro — Academic Scheduling Engine & Constraint Optimizer

Timetable Pro is an enterprise-grade academic timetable generator and constraint optimization engine built for colleges, high schools, and educational institutions. It automates the generation of clash-free, pedagogically balanced weekly schedules across multiple sections, campus buildings, and faculty specializations without requiring an external database or server-side backend.

---

## 1. System Purpose & Architecture

- **Framework**: React 19 + TypeScript (strict mode) + Vite
- **Styling**: Tailwind CSS 4 with bespoke editorial design tokens (Deep Charcoal, Warm Beige/Taupe, Brushed Gold/Cognac; Swiss Design rigor)
- **Persistence**: Zero-backend architecture using `safeStorage` (LocalStorage with write-through memory cache, quota resilience, and Schema Version 4 auto-migration)
- **Async Engine**: Multi-threaded execution in a Web Worker (Vite worker import) with progress reporting and immediate main-thread fallback (zero artificial delays)
- **Offline Fonts**: Self-hosted `@fontsource/inter` and `@fontsource/dm-sans` (no external Google Fonts requests)
- **Exports**: Multi-sheet `.xlsx` workbooks powered by **ExcelJS**, high-resolution PNG snapshotting, and paginated vector PDF generation via **jsPDF**
- **Test Suite**: Automated Vitest suite (10 test files, 109 tests passing)

```
timetable-generator-main/
├── src/
│   ├── __tests__/            # Comprehensive Vitest test suite (109 tests)
│   ├── components/           # UI and Timetable domain components
│   │   ├── timetable/        # Matrix grid, cell renderer, quota modals, first-run checklist
│   │   └── ui/               # Button, Modal, ConfirmDialog, Badge, Card, Dropdown
│   ├── context/              # Toast notification context and hooks
│   ├── pages/                # Timetable, Faculty, Batches, Settings
│   ├── types/                # Domain models, constraint interfaces, validation types
│   ├── utils/                # Heuristic solver, conflict checkers, storage migrations, exports
│   └── workers/              # Background Web Worker for non-blocking scheduling
├── docs/
│   └── AGENT_PROGRESS.md     # Engineering progress tracker and audit log
└── README.md
```

---

## 2. Scheduling Rules: Hard vs. Soft Constraints

The scheduling engine (`src/utils/scheduler.ts`) operates a lexicographical constraint solver separating hard invariants from weighted soft penalties:

### A. Hard Constraints (Never Violated During Auto-Assignment)

1. **Teacher Time Overlaps**: An instructor can never be scheduled in two places simultaneously across overlapping period timings.
2. **Teacher Absence & Availability**: Instructors marked absent on a specific weekday (`absentDays?: DayOfWeek[]`) or flagged unavailable for specific periods (`unavailable?: { day, periods }[]`) are strictly excluded.
3. **Teacher Daily Maximum Load**: No instructor is assigned more periods in a single day than their configured limit (`maxPeriodsPerDay`, default 4, range 1–8).
4. **Batch Restrictions**: If an instructor is assigned to specific batches (`assignedBatches`), they cannot be scheduled for any unassigned batch.
5. **Room Schedule Clashes**: Two batches assigned to the same building and room cannot share overlapping period timings.
6. **Locked / Frozen Slots**: Slots manually locked by the user (`frozen: true`) are preserved verbatim during generation, single-slot re-rolls, and repair passes.

### B. Soft Constraints (Weighted Heuristics & Pedagogical Penalties)

1. **Period 1 Core Subject Priority**: High-concentration core subjects (Physics, Chemistry, Mathematics, Biology) are placed in Period 1 (+200 reward). Languages are strictly excluded from Period 1 when core instructors are available. Under severe faculty shortages, language slots are permitted in Period 1 to prevent unfilled gaps.
2. **Weekly Quota Pacing (Hamilton-Hare Largest Remainder)**: Each batch's weekly subject distribution is computed from curriculum weights. Subjects with higher remaining deficit receive allocation priority, ensuring all subjects stay within ±1 of target.
3. **Anti-Repetition & Spacing**:
   - Consecutive identical subjects within a batch (back-to-back <10) receive a -80 penalty.
   - Repeating the same subject in the same period slot across multiple days (<150) receives an escalating penalty (`sameSlot * 40`).
4. **Daily Subject Caps**: Batches are restricted to a maximum of 2 periods per day for any single subject.
5. **Synchronized Track Clustering**: Second languages (Kannada, Hindi, Sanskrit) are scheduled in synchronized cluster periods with dynamic day-to-day rotation.
6. **Teacher Weekly Load Fairness**: Instructors with higher prior teaching hours across the week receive a workload fairness penalty (`priorWeeklyPeriods * 8`), ensuring alternate qualified teachers are utilized.
7. **Inter-Building Travel Gap**: When an instructor transitions between Building 1 and Building 2 within less than `minTravelGapMinutes` (configurable 0–120 min), a soft penalty (-50) is applied.

---

## 3. Domain Data Model

```typescript
// Core Faculty Profile
interface Faculty {
  id: string;
  name: string;
  subjects: string[];
  maxPeriodsPerDay: number;
  assignedBatches?: string[];
  isAbsent?: boolean;
  absentDays?: DayOfWeek[];
  unavailable?: { day: DayOfWeek; periods: number[] }[];
}

// Classroom Section / Batch
interface Batch {
  id: string;
  name: string;
  building: string;
  roomNumber: string;
  yearCategory: string;
  periods: PeriodTiming[];
  subjects: BatchSubject[];
}

// Single Timetable Period Assignment
interface Allocation {
  batchId: string;
  periodIndex: number;
  facultyId: string;
  subject: string;
  autoGenerated?: boolean;
  manualEdited?: boolean;
  frozen?: boolean;
  hasConflictOverride?: boolean;
  overridden?: boolean;
  conflictNote?: string;
  explanation?: string[];
  vacatedFacultyId?: string;
  vacatedFacultyName?: string;
  subjectChanged?: boolean;
  updatedAt?: number;
}

// Full Day Timetable Record
interface Timetable {
  id: string;
  date: DayOfWeek;
  status: 'Draft' | 'Finalized';
  allocations: Allocation[];
  unfilledSlots?: UnfilledSlot[];
  warnings?: ScheduleWarning[];
  frozenViolations?: FrozenViolation[];
  seed?: number;
  lastGeneratedAt?: number;
  updatedAt?: number;
}
```

---

## 4. Persistence Architecture & Storage Optimization

### A. Dual-Layer Storage Resilience (`safeStorage`)
- **Primary Tier**: Browser `window.localStorage` with write-through synchronization.
- **Fallback Tier**: In-memory `Map` storage if `localStorage` throws `QuotaExceededError` or is restricted by private browsing mode.
- **Storage Warning Banner**: Visible non-intrusive alert when running on the fallback in-memory store.

### B. Automated Schema Migrations
- **v1 → v2**: Upgrades legacy flat storage to structured multi-day timetables with audit tracking.
- **v2 → v3**: Migrates single-day `isAbsent: true` flags to per-day `absentDays: DayOfWeek[]` arrays without data loss.
- **v3 → v4**: Normalizes legacy period timings (`1:30`, `09:00 PM`) into strict 24-hour `HH:mm` format.

### C. Storage Footprint Reduction (L4)
- **Allocation Compaction (`compactAllocation`)**: Standard auto-generated slots omit verbose debug traces from persistent storage.
- **Explanations Preservation**: Concise explanation notes (capped at 160 characters) are retained only for manual edits, conflict overrides, substitutions, and vacated slots.
- **Footprint**: A complete 6-day academic week (2,232 allocations across 70 batches) serializes to **~280 KB** (well below the 1 MB budget and the 5 MB browser quota).

---

## 5. Web Worker Scheduler Engine (L1)

- **Dedicated Worker Thread**: `src/workers/scheduler.worker.ts` runs complex multi-pass allocations without blocking the UI thread.
- **Progress Reporting**: Streams live progress updates (`SchedulerProgress: { progress, stage }`) to the UI during generation.
- **Graceful Fallback**: Automatically executes on the main thread if Web Workers are unavailable or blocked in the browser environment.
- **Zero Delays**: Removed artificial `setTimeout` delays from generation, week planning, and absence syncing.

---

## 6. Feedback, Dialogs & First-Run Checklist (N10, N11)

- **Toast System (`useToast`)**: Non-blocking alerts for saves, batch imports, exports, and generation outcomes (with unfilled counts).
- **Reusable `ConfirmDialog`**: Accessible modal confirmation dialog replacing all native `window.confirm()` and `window.alert()` calls across the app.
- **First-Run Checklist (`FirstRunChecklist.tsx`)**: Guides administrators through initial setup when no schedule exists:
  1. Faculty Directory (verify instructor pool)
  2. Batches & Sections (inspect rooms and period timings)
  3. Settings (curriculum weights and travel gaps)
  4. Generate (run solver with live progress)

---

## 7. Backup & Restoration (N1)

- **Export Backup**: Settings > Backup > "Export all data" generates a versioned JSON snapshot containing all faculties, batches, timetables, date absences, and audit logs.
- **Import Backup**: Validates JSON schema before applying changes, offering:
  - **Replace All**: Complete database rollback with pre-restore safety check.
  - **Merge with Existing**: Merges new records while preserving non-colliding entities.

---

## 8. Development & Verification Guide

### Prerequisites
- Node.js 18+ (tested on Node 20 / 22 / 24)
- npm or pnpm

### Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run full Vitest test suite (10 test files, 109 tests)
npm test

# Run TypeScript compiler check (strict mode)
npx tsc -b

# Run ESLint check
npx eslint .

# Build production bundle
npm run build
```

---

## 9. Known Limits & Boundaries

1. **Local Browser Isolation**: Timetable Pro stores data within the browser's origin `localStorage`. Schedules do not sync across distinct computers unless exported and imported via JSON backup.
2. **Extreme Shortage Degeneracy**: If active faculty drops below `totalSlots / maxDailyPeriods`, slots cannot be filled without violating hard limits. The engine diagnoses unfilled slots with specific reasons (`NO_QUALIFIED_TEACHER`, `ALL_BUSY`, `DAILY_LIMIT`, `ALL_ABSENT`, `NO_SUBJECTS`).
3. **Fixed Campus Topography**: Inter-building travel constraints currently model transitions between Campus Building 1 and Building 2.
