# Timetable Pro — Comprehensive Academic Scheduling Engine

Timetable Pro is an enterprise-grade academic timetable generator and constraint optimization engine built for colleges, high schools, and coaching institutions. It resolves complex instructor availability constraints, avoids teacher double-booking, balances core and language subjects, and generates clean, published schedules across multiple campus buildings.

---

## 1. System Architecture

- **Framework**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS 4 with custom editorial design tokens
- **Persistence**: Zero-backend architecture using `safeStorage` (LocalStorage with automatic in-memory fallback, malformed JSON recovery, and Schema Version 2 auto-migration)
- **Exports**: Native multi-period `.xlsx` workbooks powered by **ExcelJS** (zero high-risk prototype pollution vulnerabilities), high-resolution PNG snapshotting, and A4 landscape PDF generation
- **Test Suite**: Vitest automated testing suite covering storage resilience, time validation, and scheduling heuristics

```
src/
├── __tests__/            # Vitest automated test suite
│   ├── scheduler.test.ts # PRNG determinism, clashes, Period 1, quota rules
│   ├── storage.test.ts   # Migrations, backups, cascading deletions, date absences
│   └── validation.test.ts# Strict time parser, range checks, conflict validator
├── components/           # Reusable UI & Timetable visual components
│   ├── timetable/        # AllocationCell, BalanceBar, DayTabs, SectionTable
│   └── ui/               # Button, Badge, Card, Modal, SearchInput, DropdownMenu
├── pages/                # Main application screens
│   ├── Batches.tsx       # Sections, classrooms, flexible period timings, subjects
│   ├── Faculty.tsx       # Instructors, qualifications, batch locks, absences, merge
│   ├── Settings.tsx      # Weights, capacity pre-check, backup/restore, audit logs
│   └── Timetable.tsx     # Timetable matrix, teacher schedule, room views, audit
├── types/                # Strict TypeScript interfaces and domain models
└── utils/                # Core engines and utilities
    ├── exportUtils.ts    # ExcelJS workbook generator and HTML2Canvas renderers
    ├── scheduler.ts      # Multi-pass constraint solver and substitute ranker
    ├── seedData.ts       # 145 faculty members, 70 batches, 2 master buildings
    ├── sections.ts       # Building and track grouping helpers
    ├── storage.ts        # Fault-tolerant storage, schema migrations, backups
    └── validation.ts     # Strict 24h time parser and centralized conflict checker
```

---

## 2. Core Scheduling Engine & Algorithmic Heuristics

The scheduler (`src/utils/scheduler.ts`) utilizes a multi-pass heuristic constraint solver:

1. **Seedable PRNG (Mulberry32)**:
   - Provides 100% reproducible schedule generation when a seed is provided.
   - Ensures distinct, varied subject distributions on subsequent runs while respecting hard constraints.

2. **Hamilton-Hare Largest Remainder Method (`calculateWeeklyQuotas`)**:
   - Computes exact integer period quotas per subject across the 6-day academic week according to configured curriculum weights.
   - Eliminates rounding biases and guarantees that each subject receives its intended weekly share.

3. **Most-Constrained-First Slot Ordering**:
   - Slots are sorted by degree of freedom (number of eligible teachers available for that batch and period).
   - Constrained slots are filled first to avoid late-stage bottlenecks.

4. **Period 1 Core Subject Prioritization**:
   - High-concentration core subjects (Physics, Chemistry, Mathematics, Biology) are prioritized in Period 1 slots.
   - Languages and electives are scheduled in subsequent periods unless teacher availability strictly mandates an exception.

5. **Lexicographical Candidate Evaluation (`evaluateTimetableCandidate`)**:
   - Evaluates multi-pass timetable candidates by measuring hard constraint compliance (zero teacher double-booking, daily teaching caps), subject spacing, and weekly quota alignment.

6. **Original-Subject-First Absence Patching (`patchAbsences`)**:
   - When an instructor is marked absent, the engine searches for available substitute teachers qualified in the *same subject* first.
   - Preserves historical records by logging `vacatedFacultyId` and `vacatedFacultyName`.

7. **Single-Slot Regeneration & Substitute Teacher Ranking**:
   - Administrators can right-click or click any slot to regenerate that single assignment or view ranked substitute teachers with live workload and conflict evaluations.

---

## 3. Data Integrity & Storage Safeguards

- **Schema Auto-Migration (v1 → v2)**: Automatically upgrades stored data models on initialization without losing user-defined instructors or timetable allocations.
- **Cascading Deletion Protection**:
  - Deleting an instructor removes their ID from weekly allocations, records their cached name as `vacatedFacultyName`, and cleans up batch references.
  - Deleting a batch removes all scheduled allocations across all weekly timetables and safely unlocks any faculty members pinned to that batch.
- **Full JSON Backup & Restoration**:
  - Snapshot export creates a timestamped JSON file containing faculty, batches, settings, weekly timetables, absences, and audit logs.
  - Restore offers **Replace All** (exact rollback snapshot) and **Merge with Existing** modes, with pre-flight schema validation and automatic rollback protection.
- **Date-Specific Absences**: Allows instructors to be flagged unavailable for specific calendar dates without corrupting other days of the week.

---

## 4. Visual Design Language

Timetable Pro follows the **Warm Minimalism + Swiss Design** philosophy, strictly removing generic blue/purple AI gradients in favor of an authoritative editorial palette:

- **Primary Brand / Key Action**: Deep Burgundy (`#6B2638`)
- **Primary Ink / Headings**: Deep Charcoal (`#252326`)
- **Secondary Canvas**: Warm Beige (`#F3EEE6`)
- **Hairlines & Subtle Borders**: Taupe (`#A89B8A` at 30% opacity)
- **Secondary Accent**: Brushed Gold (`#B08D57`)
- **Alert / Warning**: Cognac (`#A65E3B`)

---

## 5. Developer Guide & Commands

### Prerequisites
- Node.js 18+ (tested on Node 20 / 22)
- npm or pnpm

### Installation
```bash
# Navigate to project directory
cd timetable-generator-main

# Install dependencies
npm install
```

### Running Locally
```bash
# Start Vite development server
npm run dev
```

### Running Automated Test Suite
```bash
# Execute Vitest test suite
npm test
```

### Production Build & Type Checking
```bash
# Type check and build optimized bundle
npm run build
```

### Linting
```bash
# Execute ESLint verification
npm run lint
```

---

## 6. Audit Compliance Verification Checklist

- [x] **Critical Storage**: Self-contained `safeStorage` with in-memory fallback; Schema v2 auto-migration.
- [x] **Cascading Integrity**: Cascading cleanup on faculty and batch deletion.
- [x] **Scheduler Algorithm**: Seedable Mulberry32 PRNG, Hamilton-Hare weekly quotas, Period 1 core prioritization, zero teacher double-booking.
- [x] **Absence Management**: Date-specific absences and original-subject-first substitution.
- [x] **Full Backup & Restore**: JSON export/import with pre-validation and replace/merge modes.
- [x] **Capacity Pre-Check**: Subject demand vs. instructor supply analysis table.
- [x] **Vulnerability Remediation**: Replaced vulnerable `xlsx` with maintained `exceljs`.
- [x] **Multiple Matrix Views**: Batch matrix view, teacher weekly matrix view, and room occupancy view.
- [x] **Conflict Overrides & Undo/Redo**: Explicit conflict confirmation checkbox and history stack.
- [x] **Testing & Documentation**: Vitest test suite (100% passing) and comprehensive architecture documentation.
