# Timetable Pro — Agent Progress Tracker

## Baseline Verification
- **Baseline Typecheck (`npx tsc -b`)**: 0 errors (baseline 26 known type errors in initial state now verified clean)
- **Baseline Lint (`npx eslint .`)**: 0 errors, 0 warnings
- **Baseline Test Suite (`npm test`)**: 4 test files, 31 tests passing (including trivial test `src/utils/setup.test.ts`)
- **Baseline Build (`npm run build`)**: Passing with zero errors

---

## Progress Table

| ID | Status | Files | Notes |
|---|---|---|---|
| C1 | Todo | `src/utils/storage.ts`, `src/pages/Faculty.tsx` | Cascade deletion of faculty to timetable allocations and batch assignments |
| C2 | Todo | `src/pages/Timetable.tsx`, `src/utils/validation.ts` | Manual slot override dialog with explicit conflict detection & override confirmation |
| H1 | Todo | `src/utils/scheduler.ts` | Dynamic period count handling instead of hardcoded 6 periods |
| H2 | Todo | `src/utils/scheduler.ts` | Randomization & distribution across days, avoiding mechanical patterns |
| H3 | Todo | `src/utils/scheduler.ts` | Priority-based slot assignment & most-constrained-first ordering |
| H4 | Todo | `src/utils/scheduler.ts`, `src/pages/Timetable.tsx` | Explicit unfilled slot reporting with root cause diagnostics |
| H5 | Todo | `src/utils/scheduler.ts` | Lexicographical candidate evaluation metric and scoring function |
| H6 | Todo | `src/utils/scheduler.ts` | Original-subject-first absence patching |
| H7 | Todo | `src/utils/scheduler.ts` | Balanced daily workload distribution across teachers |
| U1 | Todo | `src/pages/Timetable.tsx` | Timetable grid responsiveness, mobile card layout, sticky columns |
| U2 | Todo | `src/components/timetable/AllocationCell.tsx` | Clear visual badges, conflict highlights, gap indicators |
| M1 | Todo | `src/utils/storage.ts` | Resilient safeStorage with memoryStore fallback |
| M2 | Todo | `src/pages/Timetable.tsx`, `src/utils/storage.ts` | Finalized day locking and protection against accidental regeneration |
| M3 | Todo | `src/utils/seedData.ts` | Accurate seed data with 70 batches, 145 faculty, 372 slots/day |
| M4 | Todo | `src/utils/validation.ts` | Strict 24h canonical time parser rejecting invalid/ambiguous formats |
| M5 | Todo | `src/utils/storage.ts` | Schema version 2 auto-migration |
| M6 | Todo | `src/pages/Faculty.tsx` | Validated faculty JSON import preview modal |
| M7 | Todo | `src/pages/Settings.tsx` | Scheduler parameter validation (PCMB/Language weights, limits) |
| M8 | Todo | `src/pages/Faculty.tsx` | Duplicate faculty profile detection and merging |
| M9 | Todo | `src/utils/storage.ts` | Date-specific absence tracking |
| M10 | Todo | `src/utils/exportUtils.ts` | Replace vulnerable xlsx with exceljs for styled workbook exports |
| M11 | Todo | `src/utils/exportUtils.ts` | High-res PNG and A4 landscape PDF export with color sanitization |
| N1 | Todo | `src/pages/Batches.tsx` | Safe batch deletion with confirmation modal showing affected links |
| N2 | Todo | `src/pages/Batches.tsx` | Full batch editing modal (timings, subjects, categories, weights) |
| N3 | Todo | `src/pages/Settings.tsx` | System backup export to JSON with metadata and schema version |
| N4 | Todo | `src/pages/Settings.tsx` | Backup restoration preview modal with Replace All vs Merge modes |
| N5 | Todo | `src/pages/Settings.tsx` | Curriculum capacity pre-check analysis (demand vs supply) |
| N6 | Todo | `src/pages/Timetable.tsx` | Full-day validation report modal with conflict inspector |
| N7 | Todo | `src/pages/Timetable.tsx` | Teacher-wise schedule matrix view across the 6-day academic cycle |
| N8 | Todo | `src/pages/Timetable.tsx` | Room-wise occupancy view and clash prevention |
| N9 | Todo | `src/pages/Timetable.tsx` | Undo/Redo history stack for manual timetable adjustments |
| N10 | Todo | `src/utils/scheduler.ts`, `src/pages/Timetable.tsx` | Single-slot regeneration without full timetable recomputation |
| N11 | Todo | `src/utils/scheduler.ts`, `src/pages/Timetable.tsx` | Ranked substitute candidate recommendation panel |
| L1 | Todo | `src/components/timetable/DayTabs.tsx` | Keyboard arrow navigation across weekday tabs |
| L2 | Todo | `src/components/timetable/SectionTable.tsx` | Accessible table semantics, scope headers, aria labels |
| L3 | Todo | `src/components/ui/Button.tsx`, `src/components/ui/` | Focus ring visibility and contrast standards (WCAG AA) |
| L4 | Todo | `src/components/AuditLogView.tsx` | Accessible modal confirmation for audit trail clearing |
| L5 | Todo | `src/pages/Timetable.tsx` | First-run onboarding 3-step guide when no timetable exists |
| T1 | Todo | `src/__tests__/` | Automated Vitest test suite for storage, validation, and scheduler |
| accessibility | Todo | All UI components | Keyboard navigation, aria attributes, color contrast, tap targets |
| theme | Todo | `src/index.css`, UI | Deep Burgundy (`#6B2638`), Deep Charcoal (`#252326`), Warm Beige (`#F3EEE6`) |
