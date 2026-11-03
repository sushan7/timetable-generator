# Timetable Pro — Agent Progress Tracker

## Baseline Verification
- **Baseline Typecheck (`npx tsc -b`)**: 0 errors
- **Baseline Lint (`npx eslint .`)**: 0 errors, 0 warnings
- **Baseline Test Suite (`npm test`)**: 6 test files, 70 tests passing
- **Baseline Build (`npm run build`)**: Passing with zero errors

---

## Progress Table

| ID | Status | Files | Notes |
|---|---|---|---|
| C1 | Done | `src/utils/storage.ts`, `src/components/Layout.tsx`, `src/__tests__/storage.test.ts` | SafeStorage rewritten with window.localStorage, in-memory Map fallback, write-through caching, visible alert banner, full test suite |
| C2 | Done | `src/pages/Timetable.tsx`, `src/components/timetable/AllocationCell.tsx`, `src/components/timetable/SectionTable.tsx`, `src/utils/constraints.ts`, `src/__tests__/constraints.test.ts` | Pre-generation frozen validation with canAssign returning violations list, red cell edges and summary panel; "Override anyway" checkbox for hard conflicts with overridden: true and distinct cell styling |
| H1 | Done | `src/utils/scheduler.ts`, `src/__tests__/scheduler.test.ts` | Relative weekly quota calculation (Largest Remainder), deficit ranking, weekly quota pacing, sample batches on seed data within ±1 of target |
| H2 | Done | `src/utils/scheduler.ts`, `src/__tests__/scheduler.test.ts` | Shared scoreSubjectChoice, anti-repetition penalty (same slot across week <150), adjacent same-subject penalty (back-to-back <10), max 2 periods/day enforced, dynamic K/H/S day-rotation |
| H3 | Done | `src/utils/scheduler.ts`, `src/types/index.ts`, `src/pages/Timetable.tsx`, `src/components/timetable/AllocationCell.tsx`, `src/__tests__/scheduler.test.ts` | Hard vs soft rules separation; most-constrained first task ordering; bounded repair pass with alternative subjects, cross-period teacher swaps and intra-batch shift; generateTimetableV2 returning { allocations, unfilled, warnings, stats }; amber/cognac unfilled cell styling; interactive Unfilled & Warnings panel; verified 50% shortage (364/372, P1 lang=4) and 25% shortage (202/372, P5=30, P6=29) |
| H4 | Done | `src/utils/scheduler.ts`, `src/components/timetable/AllocationCell.tsx`, `src/pages/Timetable.tsx`, `src/__tests__/scheduler.test.ts` | Original-subject-first absence patching: checks all eligible non-absent teachers of original subject first; only changes subject when none available; sets subjectChanged: true, conflictNote and explanation; UI cell Changed badge with explanation tooltip; verified with 29 absent teachers on seed data (15 subject changes < 29, 0 teacher overlaps) |
| H5 | Done | `src/types/index.ts`, `src/utils/seedData.ts`, `src/components/timetable/AllocationCell.tsx`, `package.json` | 0 type errors: logAuditAction Omit type, seedData tuple typing, Lucide icon title wrapper span, tsc -b in build script |
| H6 | Done | `src/utils/storage.ts`, `src/pages/Faculty.tsx`, `src/pages/Batches.tsx`, `src/components/timetable/AllocationCell.tsx`, `src/components/timetable/SectionTable.tsx`, `src/__tests__/management.test.ts` | Cascade deletes: faculty deletion warns with exact count of allocations affected and turns them into unfilled slots in all stored days; batch deletion purges allocations in all days and cleans assignedBatches; edit batch with period timing validation re-validates stored allocations for teacher overlaps and reports conflicts |
| H7 | Done | `src/pages/Faculty.tsx`, `src/utils/validation.ts`, `src/__tests__/management.test.ts` | Hand-written schema validation (name non-empty string, subjects string[], maxPeriodsPerDay positive integer if present, assignedBatches string[] if present, isAbsent boolean if present, generated missing ID, visible error on non-arrays), import preview modal with counts and errors, user-selected Merge (by ID or case-insensitive name) vs Replace with confirmation |
| U1 | Done | `src/components/timetable/AllocationCell.tsx`, `src/index.css` | Touch device support: persistent small lock icon and text badge when frozen, actions always visible under @media (hover: none) with .touch-show-actions, preserved tap-to-open modal |
| U2 | Done | `src/components/timetable/SectionTable.tsx`, `src/pages/Timetable.tsx` | Mobile grid: below md breakpoint renders batch card/list view with period time, subject, and teacher; desktop retains matrix with reduced sticky first column width on tablets; tidied Timetable header grouping actions into Primary (Generate), Secondary (Patch Absences), and Menu (Export, Status, Audit) |
| M1 | Done | `src/utils/scheduler.ts`, `src/pages/Timetable.tsx`, `src/types/index.ts`, `src/utils/storage.ts` | Seedable PRNG (mulberry32), Fisher–Yates shuffle, removed Math.random() sort/shuffle, advanced seed input UI, seed stored in Timetable & audit log for reproducibility |
| M2 | Done | `src/pages/Timetable.tsx`, `src/utils/storage.ts`, `src/types/index.ts`, `src/__tests__/management.test.ts` | Finalized day protection: cannot regenerate, sync, or edit without explicit "Reopen as Draft"; regenerating no longer silently flips to Draft; lastGeneratedAt updated only on generation, updatedAt added and updated on other edits |
| M3 | Done | `src/types/index.ts`, `src/utils/storage.ts`, `src/utils/constraints.ts`, `src/utils/validation.ts`, `src/pages/Faculty.tsx`, `src/pages/Timetable.tsx`, `src/__tests__/storage.test.ts`, `src/__tests__/scheduler.test.ts` | Per-day absence system: absentDays?: DayOfWeek[], schema migration v2 to v3 with tests, day selector for attendance on Faculty page, day-specific badge indicators and counts, day-scoped Generate and Sync Absences |
| M4 | Done | `src/utils/validation.ts`, `src/pages/Batches.tsx`, `src/utils/storage.ts`, `src/__tests__/validation.test.ts` | Strict time parsing: accepts H:mm/HH:mm (24h) and h:mm AM/PM, returns null for invalid input (1:30 -> 90, 09:00 PM -> 1260, 25:99 -> null, empty -> null); inline error highlighting in Batches period timings; schema migration v3 to v4 normalising stored times to HH:mm |
| M5 | Done | `src/utils/constraints.ts`, `src/utils/validation.ts`, `src/utils/scheduler.ts`, `src/utils/storage.ts`, `src/utils/seedData.ts` | Single source of truth for constraints (getDailyLimit, canAssign), removed duplicated logic, consistent default of 4 from settings |
| M6 | Done | `src/types/index.ts`, `src/utils/seedData.ts`, `src/utils/storage.ts`, `src/utils/scheduler.ts`, `src/pages/Settings.tsx`, `src/components/timetable/BalanceBar.tsx`, `src/pages/Timetable.tsx`, `src/__tests__/management.test.ts` | Subject categories (Core | Language | Other) editable in Settings with defaults (Physics/Chemistry/Mathematics/Biology Core; English and K/H/S Language; rest Other); scheduler deficit logic and BalanceBar treat Other subjects (e.g. Computer Science) distinctly so they are never counted as languages; legacy Second Language -> K/H/S normalisation preserved |
| M7 | Done | `src/pages/Settings.tsx`, `src/components/timetable/DayTabs.tsx`, `src/utils/validation.ts`, `src/pages/Timetable.tsx`, `src/__tests__/management.test.ts` | Settings validation: integer weights 0-100 with normalized percentage helper text (Core % · Languages %), saving blocked when both are 0; maxDailyPeriods validated 1-8; weekStartDay implemented with DayTabs display order and keyboard arrow navigation following it |
| M8 | Done | `src/pages/Faculty.tsx`, `src/utils/storage.ts`, `src/__tests__/management.test.ts` | Case-insensitive duplicate detection on add/import offering to merge; seed data VAISHNAVI and ASHWINI listed under "Possible duplicates" with review & merge actions (individual and bulk merge) re-linking stored allocations to primary profile |
| M9 | Todo | `src/utils/storage.ts` | Date-specific absence tracking |
| M10 | Done | `src/pages/Timetable.tsx`, `src/pages/Batches.tsx`, `src/pages/Faculty.tsx`, `src/components/timetable/BalanceBar.tsx`, `src/components/AuditLogView.tsx`, `src/components/timetable/SectionTable.tsx` | Cleaned up literal &middot; (replaced with ·) and HTML entities (&amp;, &quot;, &ldquo;, &rdquo;) across JS/TSX strings |
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
| L1 | Done | `src/components/timetable/DayTabs.tsx` | Keyboard arrow navigation across weekday tabs with roving tabindex and focus transfer |
| L2 | Done | `src/components/timetable/SectionTable.tsx` | Accessible table semantics with scope="col" on period headers and scope="row" on batch headers |
| L3 | Todo | `src/components/ui/Button.tsx`, `src/components/ui/` | Focus ring visibility and contrast standards (WCAG AA) |
| L4 | Todo | `src/components/AuditLogView.tsx` | Accessible modal confirmation for audit trail clearing |
| L5 | Todo | `src/pages/Timetable.tsx` | First-run onboarding 3-step guide when no timetable exists |
| T1 | Done | `src/__tests__/` | Automated Vitest test suite for storage, validation, and scheduler (40 tests passing) |
| accessibility | Done | Across app (`Modal.tsx`, `DayTabs.tsx`, `AllocationCell.tsx`, form inputs, contrast) | Linked every label to its input via htmlFor/id, aria-labelledby, focus trap and focus restore on Modal, aria-controls on DayTabs, icons+text for every status (no color reliance), absent teachers flagged on grid immediately, WCAG AA contrast compliant |
| theme | Todo | `src/index.css`, UI | Deep Burgundy (`#6B2638`), Deep Charcoal (`#252326`), Warm Beige (`#F3EEE6`) |

