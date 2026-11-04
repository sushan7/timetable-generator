import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import {
  Calendar,
  Image as ImageIcon,
  Play,
  RefreshCw,
  FileSpreadsheet,
  FileText,
  Lock,
  Unlock,
  AlertTriangle,
  Download,
  Undo2,
  Redo2,
  User,
  Building,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Printer,
  FileCheck,
  BarChart2,
  Layers,
} from 'lucide-react';
import type {
  Faculty,
  Batch,
  Allocation,
  DayOfWeek,
  TimetableStatus,
  UnfilledSlot,
  ScheduleWarning,
  FrozenViolation,
} from '../types';
import {
  calculateDetailedCapacityAnalysis,
  regenerateBatchDay,
  calculateWeekQuotaFit,
} from '../utils/scheduler';
import type { WeekQuotaFitReport } from '../types';
import { storage } from '../utils/storage';
import { SECTIONS, groupBatchesBySection } from '../utils/sections';
import { isFacultyAbsent } from '../utils/validation';
import { generateDayValidationReport } from '../utils/validationReport';
import {
  exportTimetableToExcel,
  exportTimetableToPng,
  exportTimetableToPdf,
} from '../utils/export';
import {
  runGenerateDay,
  runGenerateWeek,
  runPatchAbsences,
  type SchedulerProgress,
} from '../utils/schedulerClient';
import { useTimetableQuota } from '../hooks/useTimetableQuota';
import SlotEditModal, {
  type SlotEditState,
  type SlotEditSavePayload,
} from '../components/timetable/SlotEditModal';
import { ValidationReportModal } from '../components/timetable/ValidationReportModal';
import { CapacityPreCheckModal } from '../components/timetable/CapacityPreCheckModal';
import { WeekQuotaFitModal } from '../components/timetable/WeekQuotaFitModal';
import { TeacherScheduleView } from '../components/timetable/TeacherScheduleView';
import { RoomScheduleView } from '../components/timetable/RoomScheduleView';
import FirstRunChecklist from '../components/timetable/FirstRunChecklist';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import SearchInput from '../components/ui/SearchInput';
import DropdownMenu, { type DropdownItem } from '../components/ui/DropdownMenu';
import DayTabs from '../components/timetable/DayTabs';
import BalanceBar from '../components/timetable/BalanceBar';
import SectionTable from '../components/timetable/SectionTable';
import { useToast } from '../context/ToastContext';

type ViewMode = 'batches' | 'faculty' | 'rooms';

export default function Timetable() {
  const { toast } = useToast();
  const [currentDay, setCurrentDay] = useState<DayOfWeek>('Monday');
  const [viewMode, setViewMode] = useState<ViewMode>('batches');
  const [generationProgress, setGenerationProgress] = useState<SchedulerProgress | null>(null);

  const [faculties, setFaculties] = useState<Faculty[]>(() => {
    storage.initialize();
    return storage.getFaculty();
  });
  const [batches, setBatches] = useState<Batch[]>(() => storage.getBatches());

  const [allocations, setAllocations] = useState<Allocation[]>(() => {
    const existing = storage.getTimetableForDay('Monday');
    return existing?.allocations || [];
  });

  const [currentStatus, setCurrentStatus] = useState<TimetableStatus>(() => {
    const existing = storage.getTimetableForDay('Monday');
    return existing?.status || 'Draft';
  });

  const [unfilledSlots, setUnfilledSlots] = useState<UnfilledSlot[]>(() => {
    const existing = storage.getTimetableForDay('Monday');
    return existing?.unfilledSlots || [];
  });

  const [warnings, setWarnings] = useState<ScheduleWarning[]>(() => {
    const existing = storage.getTimetableForDay('Monday');
    return existing?.warnings || [];
  });

  const [frozenViolations, setFrozenViolations] = useState<FrozenViolation[]>(() => {
    const existing = storage.getTimetableForDay('Monday');
    return existing?.frozenViolations || [];
  });

  const [hasGenerated, setHasGenerated] = useState<boolean>(() => {
    return !!storage.getTimetableForDay('Monday');
  });

  // M1: Seed state for deterministic and reproducible generation
  const [currentSeed, setCurrentSeed] = useState<number | undefined>(() => {
    const existing = storage.getTimetableForDay('Monday');
    return existing?.seed;
  });
  const [manualSeedInput, setManualSeedInput] = useState<string>('');

  // Undo / Redo History Stack (Phase 5G)
  const [history, setHistory] = useState<Allocation[][]>([]);
  const [future, setFuture] = useState<Allocation[][]>([]);

  // Export & generation states
  const [isExporting, setIsExporting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingWeek, setIsGeneratingWeek] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [activeSectionFilter, setActiveSectionFilter] = useState<string>('ALL');

  // Modals
  const [editingSlot, setEditingSlot] = useState<SlotEditState | null>(null);
  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);
  const [isCapacityModalOpen, setIsCapacityModalOpen] = useState(false);
  const [isUnfilledModalOpen, setIsUnfilledModalOpen] = useState(false);
  const [isUnfilledPanelExpanded, setIsUnfilledPanelExpanded] = useState(true);
  const [isReopenConfirmOpen, setIsReopenConfirmOpen] = useState(false);
  const [isQuotaReportModalOpen, setIsQuotaReportModalOpen] = useState(false);
  const [weekQuotaReport, setWeekQuotaReport] = useState<WeekQuotaFitReport | null>(null);

  // Settings & Week timetables cache
  const settings = useMemo(() => storage.getSettings(), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const weekTimetables = useMemo(() => storage.getWeekTimetables(), [allocations, currentDay]);

  const pageRef = useRef<HTMLDivElement>(null);
  const exportViewRef = useRef<HTMLDivElement>(null);

  const persistDay = useCallback(
    (
      day: DayOfWeek,
      newAllocations: Allocation[],
      status: TimetableStatus = currentStatus,
      unfilled: UnfilledSlot[] = unfilledSlots,
      warns: ScheduleWarning[] = warnings,
      violations: FrozenViolation[] = frozenViolations,
      seedToSave: number | undefined = currentSeed,
      markGenerated: boolean = false
    ) => {
      storage.saveTimetableForDay(day, newAllocations, status, {
        unfilledSlots: unfilled,
        warnings: warns,
        frozenViolations: violations,
        markGenerated,
        seed: seedToSave,
      });
    },
    [currentStatus, unfilledSlots, warnings, frozenViolations, currentSeed]
  );

  // Helper to push history: capped at the last 20 states per day (N7)
  const pushState = useCallback(
    (newAllocations: Allocation[]) => {
      setHistory(prev => [...prev.slice(-19), allocations]);
      setFuture([]);
      setAllocations(newAllocations);
    },
    [allocations]
  );

  const handleUndo = useCallback(() => {
    if (history.length === 0 || currentStatus === 'Finalized') return;
    const previous = history[history.length - 1];
    setFuture(prev => [allocations, ...prev]);
    setHistory(prev => prev.slice(0, prev.length - 1));
    setAllocations(previous);
    persistDay(currentDay, previous);
  }, [history, currentStatus, allocations, currentDay, persistDay]);

  const handleRedo = useCallback(() => {
    if (future.length === 0 || currentStatus === 'Finalized') return;
    const next = future[0];
    setHistory(prev => [...prev.slice(-19), allocations]);
    setFuture(prev => prev.slice(1));
    setAllocations(next);
    persistDay(currentDay, next);
  }, [future, currentStatus, allocations, currentDay, persistDay]);

  // Keyboard shortcuts for Undo (Ctrl/Cmd+Z) and Redo (Ctrl+Y / Ctrl/Cmd+Shift+Z) (N7)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
        } else if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          handleRedo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Switch Day Tab
  const handleSelectDay = (day: DayOfWeek) => {
    setCurrentDay(day);
    setBatches(storage.getBatches());
    setFaculties(storage.getFaculty());
    const existing = storage.getTimetableForDay(day);
    const dayAllocations = existing?.allocations || [];
    setAllocations(dayAllocations);
    setCurrentStatus(existing?.status || 'Draft');
    setUnfilledSlots(existing?.unfilledSlots || []);
    setWarnings(existing?.warnings || []);
    setFrozenViolations(existing?.frozenViolations || []);
    setCurrentSeed(existing?.seed);
    setHasGenerated(!!existing);
    setHistory([]);
    setFuture([]);
  };

  const handleStatusChange = (newStatus: TimetableStatus) => {
    if (newStatus === 'Finalized') {
      setCurrentStatus('Finalized');
      persistDay(currentDay, allocations, 'Finalized');
      storage.setTimetableStatus(currentDay, 'Finalized');
    } else {
      setIsReopenConfirmOpen(true);
    }
  };

  const confirmReopenDay = () => {
    setCurrentStatus('Draft');
    persistDay(currentDay, allocations, 'Draft');
    storage.setTimetableStatus(currentDay, 'Draft', 'Reopened finalized timetable for editing');
    setIsReopenConfirmOpen(false);
  };

  // Generate timetable with Web Worker & fallback (Phase 2, M1 & L1)
  const handleGenerate = async () => {
    if (currentStatus === 'Finalized') {
      setIsReopenConfirmOpen(true);
      return;
    }

    setIsGenerating(true);
    setGenerationProgress({ progress: 10, stage: 'Preparing scheduler parameters...' });

    try {
      const freshFaculties = storage.getFaculty();
      const freshBatches = storage.getBatches();
      setFaculties(freshFaculties);
      setBatches(freshBatches);

      const parsedSeed = manualSeedInput.trim() ? parseInt(manualSeedInput.trim(), 10) : undefined;
      const seedToUse = !isNaN(parsedSeed as number) ? parsedSeed : undefined;

      const weekContext = storage.getWeekAllocationsExcluding(currentDay);
      const result = await runGenerateDay(
        freshBatches,
        freshFaculties,
        allocations,
        weekContext,
        {
          seed: seedToUse,
          dayOfWeek: currentDay,
          dateKey: currentDay,
          settings,
        },
        prog => setGenerationProgress(prog)
      );

      pushState(result.allocations);
      setUnfilledSlots(result.unfilled);
      setWarnings(result.warnings);
      setFrozenViolations(result.frozenViolations || []);
      setCurrentSeed(result.seed);
      setHasGenerated(true);
      setCurrentStatus('Draft');
      persistDay(
        currentDay,
        result.allocations,
        'Draft',
        result.unfilled,
        result.warnings,
        result.frozenViolations || [],
        result.seed,
        true
      );

      if (result.unfilled.length > 0) {
        toast.warning(`Generated ${result.allocations.length} allocations with ${result.unfilled.length} unfilled slot(s).`);
      } else {
        toast.success(`Generated ${result.allocations.length} allocations clash-free.`);
      }
    } catch (err) {
      console.error('Generation failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to generate timetable.');
    } finally {
      setIsGenerating(false);
      setGenerationProgress(null);
    }
  };

  // Generate entire week order-independently via Web Worker (N9 & L1)
  const handleGenerateWeek = async () => {
    setIsGeneratingWeek(true);
    setGenerationProgress({ progress: 10, stage: 'Initializing 6-day week generation...' });

    try {
      const freshFaculties = storage.getFaculty();
      const freshBatches = storage.getBatches();
      setFaculties(freshFaculties);
      setBatches(freshBatches);

      const parsedSeed = manualSeedInput.trim() ? parseInt(manualSeedInput.trim(), 10) : undefined;
      const seedToUse = !isNaN(parsedSeed as number) ? parsedSeed : undefined;

      const existingWeek = storage.getWeekTimetables();
      const result = await runGenerateWeek(
        freshBatches,
        freshFaculties,
        existingWeek,
        settings,
        { seed: seedToUse },
        prog => setGenerationProgress(prog)
      );

      storage.setWeekTimetables(result.weekTimetables);

      // Update current day display
      const currentDayTT = result.weekTimetables[currentDay];
      if (currentDayTT) {
        pushState(currentDayTT.allocations);
        setAllocations(currentDayTT.allocations);
        setUnfilledSlots(currentDayTT.unfilledSlots || []);
        setWarnings(currentDayTT.warnings || []);
        setFrozenViolations(currentDayTT.frozenViolations || []);
        setCurrentSeed(currentDayTT.seed);
        setHasGenerated(true);
        setCurrentStatus('Draft');
      }

      setWeekQuotaReport(result.quotaReport);
      setIsQuotaReportModalOpen(true);
      toast.success(`Generated full 6-day timetable across ${freshBatches.length} batches.`);
    } catch (err) {
      console.error('Week generation failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to generate weekly timetable.');
    } finally {
      setIsGeneratingWeek(false);
      setGenerationProgress(null);
    }
  };

  // Regenerate one batch's day (N8)
  const handleRegenerateBatch = (batchId: string) => {
    if (currentStatus === 'Finalized') return;
    const result = regenerateBatchDay(batchId, allocations, batches, faculties, settings, {
      dayOfWeek: currentDay,
      dateKey: currentDay,
    });
    if (result.success) {
      pushState(result.allocations);
      persistDay(currentDay, result.allocations);
      const batchName = batches.find(b => b.id === batchId)?.name || batchId;
      toast.success(`Regenerated schedule for batch ${batchName}.`);
    } else {
      toast.error(result.reason || 'Could not regenerate batch.');
    }
  };

  // Sync Absences via Web Worker (Phase 3, H4/M3 & L1)
  const handleSyncAbsences = async () => {
    if (currentStatus === 'Finalized') return;
    setIsSyncing(true);
    try {
      const freshFaculties = storage.getFaculty();
      setFaculties(freshFaculties);

      const result = await runPatchAbsences(
        allocations,
        batches,
        freshFaculties,
        {
          dateKey: currentDay,
          dayOfWeek: currentDay,
          settings,
        }
      );
      pushState(result.updatedAllocations);
      persistDay(currentDay, result.updatedAllocations);
      toast.success(`Absence sync complete: ${result.patchedCount} slot(s) covered.`);
    } catch (err) {
      console.error('Absence patch failed:', err);
      toast.error('Failed to sync absences.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Slot freeze
  const toggleFreeze = (batchId: string, periodIndex: number) => {
    if (currentStatus === 'Finalized') return;
    const existing = allocations.find(a => a.batchId === batchId && a.periodIndex === periodIndex);
    if (!existing) return;

    const newFrozen = !existing.frozen;
    const updated = allocations.map(a =>
      a.batchId === batchId && a.periodIndex === periodIndex ? { ...a, frozen: newFrozen } : a
    );
    pushState(updated);
    persistDay(currentDay, updated);

    storage.logAuditAction('FREEZE_TOGGLE', {
      batchId,
      periodIndex,
      day: currentDay,
      reason: `${newFrozen ? 'Locked' : 'Unlocked'} slot (batch: ${batchId}, period: ${periodIndex + 1})`,
    });
  };

  // Open manual slot editor
  const handleCellClick = (batch: Batch, periodIndex: number) => {
    if (currentStatus === 'Finalized') return;

    const existingAlloc = allocations.find(
      a => a.batchId === batch.id && a.periodIndex === periodIndex
    );
    const defaultSubject = existingAlloc?.subject || batch.subjects[0]?.subject || 'Physics';
    const defaultFaculty = existingAlloc?.facultyId || '';

    setEditingSlot({
      batch,
      periodIndex,
      currentAllocation: existingAlloc,
      subject: defaultSubject,
      facultyId: defaultFaculty,
      isFrozen: existingAlloc?.frozen ?? false,
      allowConflictOverride: false,
    });
  };

  const handleRegenerateSlotSuccess = (newAlloc: Allocation) => {
    if (!editingSlot) return;
    const updated = allocations.filter(
      a => !(a.batchId === editingSlot.batch.id && a.periodIndex === editingSlot.periodIndex)
    );
    updated.push(newAlloc);
    pushState(updated);
    persistDay(currentDay, updated);
    toast.success('Slot regenerated successfully.');
  };

  const handleSaveSlotOverride = (payload: SlotEditSavePayload) => {
    if (currentStatus === 'Finalized') return;

    const {
      batch,
      periodIndex,
      subject,
      facultyId,
      isFrozen,
      allowConflictOverride,
      conflictEvaluation,
      isHardConflict,
    } = payload;
    const oldFacultyId = editingSlot?.currentAllocation?.facultyId;
    const updatedAllocations = [...allocations];
    const existingIdx = updatedAllocations.findIndex(
      a => a.batchId === batch.id && a.periodIndex === periodIndex
    );

    if (!facultyId) {
      if (existingIdx >= 0) {
        updatedAllocations.splice(existingIdx, 1);
      }
      storage.logAuditAction('MANUAL_OVERRIDE', {
        batchId: batch.id,
        periodIndex,
        previousFacultyId: oldFacultyId,
        day: currentDay,
        reason: `Manually unassigned faculty from period ${periodIndex + 1} (${batch.name})`,
      });
      toast.success(`Cleared assignment for period ${periodIndex + 1} (${batch.name}).`);
    } else {
      const isConflict = Boolean(conflictEvaluation && !conflictEvaluation.ok);
      const isOverridden = Boolean(isHardConflict && allowConflictOverride);
      const newAlloc: Allocation = {
        batchId: batch.id,
        periodIndex,
        facultyId,
        subject,
        autoGenerated: false,
        manualEdited: true,
        frozen: isFrozen,
        hasConflictOverride: isConflict,
        overridden: isOverridden,
        conflictNote: isConflict ? (conflictEvaluation?.reason || undefined) : undefined,
        explanation: [
          `Manual assignment set by administrator on ${new Date().toLocaleDateString()}${
            isConflict ? ` (Conflict override: ${conflictEvaluation?.reason})` : ''
          }`,
        ],
        updatedAt: Date.now(),
      };

      if (existingIdx >= 0) {
        updatedAllocations[existingIdx] = newAlloc;
      } else {
        updatedAllocations.push(newAlloc);
      }

      const facName = faculties.find(f => f.id === facultyId)?.name || facultyId;
      storage.logAuditAction('MANUAL_OVERRIDE', {
        batchId: batch.id,
        periodIndex,
        previousFacultyId: oldFacultyId,
        newFacultyId: facultyId,
        day: currentDay,
        reason: `Manually assigned ${facName} (${subject}) for batch ${batch.name}${
          isOverridden ? ' [FORCED OVERRIDE]' : ''
        }`,
      });
      toast.success(`Assigned ${facName} to period ${periodIndex + 1} (${batch.name}).`);
    }

    pushState(updatedAllocations);
    persistDay(currentDay, updatedAllocations);
    setEditingSlot(null);
  };

  // Full day validation audit report (N3)
  const dayValidationReport = useMemo(() => {
    return generateDayValidationReport(currentDay, allocations, batches, faculties, settings, currentDay);
  }, [currentDay, allocations, batches, faculties, settings]);

  // Curriculum capacity pre-check analysis (N2)
  const capacityAnalysis = useMemo(() => {
    const weekContext = storage.getWeekAllocationsExcluding(currentDay);
    return calculateDetailedCapacityAnalysis(batches, faculties, settings, weekContext);
  }, [batches, faculties, settings, currentDay]);

  // Jump to cell handler (N3)
  const handleJumpToCell = useCallback((batchId: string, periodIndex: number) => {
    if (viewMode !== 'batches') {
      setViewMode('batches');
    }
    setTimeout(() => {
      const desktopCell = document.getElementById(`cell-${batchId}-${periodIndex}`);
      const mobileCell = document.getElementById(`cell-mobile-${batchId}-${periodIndex}`);
      const target = desktopCell || mobileCell;
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('ring-4', 'ring-accent', 'scale-105', 'transition-all');
        setTimeout(() => {
          target.classList.remove('ring-4', 'ring-accent', 'scale-105', 'transition-all');
        }, 2200);
      }
    }, 150);
  }, [viewMode]);

  const getFacultyName = useCallback(
    (id: string): string => {
      const f = faculties.find(fac => fac.id === id);
      return f ? f.name : id;
    },
    [faculties]
  );

  // Exports (N10 Feedback)
  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      await exportTimetableToExcel(currentDay, batches, allocations, faculties, currentStatus);
      toast.success('Timetable exported to Excel (.xlsx) successfully.');
    } catch (e) {
      console.error(e);
      toast.error('Failed to generate Excel export.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPng = async () => {
    const target = exportViewRef.current || pageRef.current;
    if (!target) return;
    setIsExporting(true);
    try {
      await exportTimetableToPng(target, currentDay);
      toast.success('Timetable exported to PNG image successfully.');
    } catch (e) {
      console.error(e);
      toast.error('Failed to generate PNG export.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = async () => {
    setIsExporting(true);
    try {
      await exportTimetableToPdf(currentDay, batches, allocations, faculties, currentStatus);
      toast.success('Timetable exported to PDF document successfully.');
    } catch (e) {
      console.error(e);
      toast.error('Failed to generate PDF export.');
    } finally {
      setIsExporting(false);
    }
  };

  const checkIsFacultyAbsent = useCallback(
    (facultyId: string) => {
      const f = faculties.find(fac => fac.id === facultyId);
      if (!f) return false;
      return isFacultyAbsent(f, currentDay);
    },
    [faculties, currentDay]
  );

  const exportItems: DropdownItem[] = useMemo(
    () => [
      {
        id: 'excel',
        label: 'Export to Excel (.xlsx)',
        description: 'Multi-sheet workbook (Summary + individual section sheets)',
        icon: <FileSpreadsheet className="w-4 h-4 text-primary" />,
        onClick: handleExportExcel,
        disabled: isExporting || !hasGenerated,
      },
      {
        id: 'png',
        label: 'Download Image (PNG)',
        description: 'High-resolution snapshot of clean schedule grid',
        icon: <ImageIcon className="w-4 h-4 text-accent" />,
        onClick: handleExportPng,
        disabled: isExporting || !hasGenerated,
      },
      {
        id: 'pdf',
        label: 'Export Document (PDF)',
        description: 'Real vector text with proper section pagination',
        icon: <FileText className="w-4 h-4 text-primary" />,
        onClick: handleExportPdf,
        disabled: isExporting || !hasGenerated,
      },
      {
        id: 'print',
        label: 'Print Timetable (A4 Landscape)',
        description: 'Printable formatted pages with section headers',
        icon: <Printer className="w-4 h-4 text-ink" />,
        onClick: () => window.print(),
        disabled: !hasGenerated,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isExporting, hasGenerated, currentDay, batches, allocations, faculties, currentStatus]
  );

  const menuItems: DropdownItem[] = useMemo(
    () => [
      {
        id: 'generate-week',
        label: 'Generate Full Week (N9)',
        description: 'Plan quotas across all days together, preserving frozen slots',
        icon: <Sparkles className="w-4 h-4 text-accent" />,
        onClick: handleGenerateWeek,
        disabled: currentStatus === 'Finalized' || isGeneratingWeek,
      },
      {
        id: 'quota-report',
        label: 'Weekly Quota Report (N9)',
        description: 'View batch curriculum quota fit and deviations across the week',
        icon: <Layers className="w-4 h-4 text-primary" />,
        onClick: () => {
          const report = calculateWeekQuotaFit(batches, storage.getWeekTimetables());
          setWeekQuotaReport(report);
          setIsQuotaReportModalOpen(true);
        },
      },
      {
        id: 'validation-report',
        label: `Check timetable (${dayValidationReport.summary.totalIssues} issues)`,
        description: 'Verify teacher overlaps, daily limits, absences, and room clashes',
        icon: <FileCheck className="w-4 h-4 text-primary" />,
        onClick: () => setIsValidationModalOpen(true),
      },
      {
        id: 'capacity-precheck',
        label: `Capacity Pre-Check (${capacityAnalysis.shortageCount} shortages)`,
        description: 'Evaluate curriculum demand vs faculty limits and overloaded teachers',
        icon: <BarChart2 className="w-4 h-4 text-accent" />,
        onClick: () => setIsCapacityModalOpen(true),
      },
      {
        id: 'status',
        label: currentStatus === 'Finalized' ? 'Reopen as Draft' : 'Mark as Finalized',
        description:
          currentStatus === 'Finalized'
            ? 'Unlock schedule for editing and regeneration'
            : 'Lock timetable to safeguard official schedule',
        icon:
          currentStatus === 'Finalized' ? (
            <Unlock className="w-4 h-4 text-accent" />
          ) : (
            <Lock className="w-4 h-4 text-primary" />
          ),
        onClick: () => handleStatusChange(currentStatus === 'Finalized' ? 'Draft' : 'Finalized'),
      },
      ...exportItems,
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentDay, dayValidationReport.summary.totalIssues, capacityAnalysis.shortageCount, currentStatus, exportItems]
  );

  const filteredBatches = useMemo(() => {
    return batches.filter(b => {
      if (activeSectionFilter !== 'ALL' && !b.building.includes(activeSectionFilter)) return false;
      if (filterQuery) {
        const q = filterQuery.toLowerCase();
        return (
          b.name.toLowerCase().includes(q) ||
          b.roomNumber.toLowerCase().includes(q) ||
          b.yearCategory.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [batches, activeSectionFilter, filterQuery]);

  const sectionedBatches = useMemo(() => groupBatchesBySection(filteredBatches), [filteredBatches]);

  // Quota & Balance logic extracted into custom hook (L5)
  const { quota, gapCount, absentFacultyCount } = useTimetableQuota(
    currentDay,
    allocations,
    faculties
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6" ref={pageRef}>
      {/* Top Header */}
      <PageHeader
        icon={<Calendar className="w-5 h-5 text-primary" />}
        title="Timetable Studio"
        subtitle={`Generate, validate, and manage academic period assignments for ${currentDay}`}
        actions={
          <div className="flex items-center gap-2 flex-wrap no-export">
            {/* Status indicator badge */}
            <Badge
              tone={currentStatus === 'Finalized' ? 'burgundy' : 'neutral'}
              className="px-2.5 py-1 text-xs font-bold flex items-center gap-1.5 shadow-2xs"
            >
              {currentStatus === 'Finalized' ? <Lock className="w-3 h-3" /> : null}
              <span>{currentStatus}</span>
            </Badge>

            {/* Undo / Redo */}
            <div className="flex items-center rounded border border-border bg-surface">
              <button
                type="button"
                onClick={handleUndo}
                disabled={history.length === 0 || currentStatus === 'Finalized'}
                className="p-1.5 text-ink-muted hover:text-primary disabled:opacity-30 disabled:pointer-events-none"
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <div className="h-4 w-px bg-border" />
              <button
                type="button"
                onClick={handleRedo}
                disabled={future.length === 0 || currentStatus === 'Finalized'}
                className="p-1.5 text-ink-muted hover:text-primary disabled:opacity-30 disabled:pointer-events-none"
                title="Redo (Ctrl+Y)"
                aria-label="Redo"
              >
                <Redo2 className="w-4 h-4" />
              </button>
            </div>

            {/* Advanced Seed Input (M1) */}
            <div className="flex items-center gap-1.5 no-export" title="Optional seed for deterministic, reproducible generation">
              <label htmlFor="timetable-seed-input" className="sr-only">
                Random Seed
              </label>
              <input
                id="timetable-seed-input"
                type="number"
                placeholder="Seed (opt)"
                value={manualSeedInput}
                onChange={e => setManualSeedInput(e.target.value)}
                className="w-24 px-2 py-1.5 text-xs bg-surface border border-border rounded-md text-ink focus:outline-none focus:border-accent"
                title="Enter custom PRNG seed for reproducible results"
              />
              {currentSeed !== undefined && (
                <span className="text-[10px] text-ink-muted font-mono px-1.5 py-0.5 bg-surface-muted rounded border border-border" title="Last seed used for this timetable">
                  #{currentSeed}
                </span>
              )}
            </div>

            {/* Secondary Action: Patch Absences */}
            {absentFacultyCount > 0 && (
              <Button
                variant="secondary"
                icon={<RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />}
                loading={isSyncing}
                onClick={handleSyncAbsences}
                disabled={currentStatus === 'Finalized'}
              >
                Patch Absences ({gapCount > 0 ? `${gapCount} Gaps` : `${absentFacultyCount} Absent`})
              </Button>
            )}

            {/* Secondary Action: Check timetable (N3) */}
            <Button
              variant="secondary"
              icon={<FileCheck className="w-4 h-4" />}
              onClick={() => setIsValidationModalOpen(true)}
              title="Inspect conflicts, overlaps, daily limit violations, absent teachers, room clashes, and unfilled slots"
            >
              Check timetable
              {dayValidationReport.summary.totalIssues > 0 && (
                <span className="ml-1 px-1.5 py-0.2 bg-burgundy-soft text-burgundy rounded-full text-[10px] font-bold border border-burgundy/20">
                  {dayValidationReport.summary.totalIssues}
                </span>
              )}
            </Button>

            {/* Primary Action: Generate Day */}
            <Button
              variant="primary"
              icon={<Play className="w-4 h-4" />}
              loading={isGenerating}
              onClick={handleGenerate}
              disabled={currentStatus === 'Finalized'}
            >
              Generate {currentDay}
            </Button>

            {/* Global Action: Generate Week (N9) */}
            <Button
              variant="secondary"
              icon={<Sparkles className="w-4 h-4 text-accent" />}
              loading={isGeneratingWeek}
              onClick={handleGenerateWeek}
              disabled={currentStatus === 'Finalized'}
              title="Plan and generate 6-day week schedules together, preserving locked slots and reporting quota fit (N9)"
            >
              Generate Week
            </Button>

            {/* Menu Action: Grouped Export, Status, Audit (Requirement U2) */}
            <DropdownMenu
              label="Actions"
              icon={<Download className="w-4 h-4" />}
              items={menuItems}
              align="right"
              disabled={isExporting}
            />
          </div>
        }
      />

      {/* Finalized Warning Banner */}
      {currentStatus === 'Finalized' && (
        <div className="p-3 bg-burgundy-soft border border-burgundy/20 rounded-md flex items-center justify-between gap-3 text-xs text-ink no-export">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-burgundy" />
            <span>
              <strong>Timetable is Finalized:</strong> Editing and automatic regeneration are locked to safeguard this official schedule.
            </span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            icon={<Unlock className="w-3.5 h-3.5" />}
            onClick={() => setIsReopenConfirmOpen(true)}
          >
            Reopen Day
          </Button>
        </div>
      )}

      {/* Dedicated "Unfilled & Warnings" Panel (H3) */}
      {(unfilledSlots.length > 0 || warnings.length > 0) && (
        <div className="bg-surface-muted border border-border rounded-lg p-4 space-y-3 no-export shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-cognac-soft text-cognac rounded border border-cognac/40">
                <AlertTriangle className="w-4 h-4 shrink-0" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-ink leading-tight">
                  Unfilled Slots & Schedule Warnings
                </h3>
                <p className="text-[11px] text-ink-muted">
                  Click any slot or warning below to immediately jump to and edit that cell.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {unfilledSlots.length > 0 && (
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-cognac-soft text-cognac border border-cognac/30">
                  {unfilledSlots.length} Unfilled
                </span>
              )}
              {warnings.length > 0 && (
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-burgundy-soft text-burgundy border border-burgundy/20">
                  {warnings.length} Warning{warnings.length !== 1 ? 's' : ''}
                </span>
              )}
              <button
                type="button"
                onClick={() => setIsUnfilledPanelExpanded(!isUnfilledPanelExpanded)}
                className="p-1 text-ink-muted hover:text-ink hover:bg-surface rounded border border-transparent hover:border-border transition-colors"
                title={isUnfilledPanelExpanded ? 'Collapse panel' : 'Expand panel'}
                aria-label={isUnfilledPanelExpanded ? 'Collapse panel' : 'Expand panel'}
              >
                {isUnfilledPanelExpanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {isUnfilledPanelExpanded && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-1">
              {/* Left Column: Unfilled Slots */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-cognac">
                  <span>Unfilled Slots ({unfilledSlots.length})</span>
                  {unfilledSlots.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setIsUnfilledModalOpen(true)}
                      className="text-[11px] font-semibold text-primary hover:underline"
                    >
                      View Full Modal
                    </button>
                  )}
                </div>

                {unfilledSlots.length === 0 ? (
                  <p className="text-xs text-ink-muted italic py-2">
                    No unfilled slots. All scheduled periods are assigned!
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {unfilledSlots.map((u, i) => {
                      const batch = batches.find(b => b.id === u.batchId);
                      const period = batch?.periods?.[u.periodIndex];
                      return (
                        <div
                          key={`unfilled-${u.batchId}-${u.periodIndex}-${i}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            if (batch) handleCellClick(batch, u.periodIndex);
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              if (batch) handleCellClick(batch, u.periodIndex);
                            }
                          }}
                          className="p-2.5 bg-cognac-soft hover:bg-cognac-soft/80 border border-cognac/40 hover:border-cognac rounded text-xs cursor-pointer transition-colors shadow-2xs group flex flex-col gap-1 outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          title="Click to open and manually assign this cell"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-ink truncate">
                              {u.batchName} · Period {u.periodIndex + 1}
                              {period?.startTime ? ` (${period.startTime} - ${period.endTime})` : ''}
                            </span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-surface text-cognac border border-cognac/30 shrink-0">
                              Unfilled: {u.reason}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-cognac">
                            <span className="truncate">
                              Required: <strong>{u.requiredSubject || 'Any'}</strong>
                              {u.candidateIssue ? ` — ${u.candidateIssue}` : ''}
                            </span>
                            <span className="shrink-0 text-[10px] font-medium text-cognac opacity-0 group-hover:opacity-100 transition-opacity">
                              Edit slot →
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right Column: Schedule Warnings */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-burgundy">
                  Schedule Warnings ({warnings.length})
                </div>

                {warnings.length === 0 ? (
                  <p className="text-xs text-ink-muted italic py-2">
                    No soft-rule warnings. All distribution preferences satisfied!
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {warnings.map((w, i) => {
                      const batch = w.batchId ? batches.find(b => b.id === w.batchId) : undefined;
                      const hasCell = Boolean(batch && typeof w.periodIndex === 'number');
                      return (
                        <div
                          key={`warning-${w.batchId || ''}-${w.periodIndex || 0}-${i}`}
                          role={hasCell ? 'button' : undefined}
                          tabIndex={hasCell ? 0 : undefined}
                          onClick={() => {
                            if (batch && typeof w.periodIndex === 'number') {
                              handleCellClick(batch, w.periodIndex);
                            }
                          }}
                          onKeyDown={e => {
                            if (hasCell && (e.key === 'Enter' || e.key === ' ')) {
                              e.preventDefault();
                              if (batch && typeof w.periodIndex === 'number') {
                                handleCellClick(batch, w.periodIndex);
                              }
                            }
                          }}
                          className={`p-2.5 bg-surface border border-border rounded text-xs transition-colors shadow-2xs group flex flex-col gap-1 ${
                            hasCell
                              ? 'cursor-pointer hover:border-primary hover:bg-surface-muted/50 outline-none focus-visible:ring-2 focus-visible:ring-accent'
                              : ''
                          }`}
                          title={hasCell ? 'Click to inspect slot' : undefined}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-ink truncate">
                              {batch ? `${batch.name} · P${(w.periodIndex || 0) + 1}` : w.type}
                            </span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-burgundy-soft text-burgundy border border-burgundy/20 shrink-0">
                              {w.type.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-ink-muted">
                            <span className="truncate">{w.message}</span>
                            {hasCell && (
                              <span className="shrink-0 text-[10px] font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                                Inspect →
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Day Tabs */}
      <div className="no-export">
        <DayTabs
          currentDay={currentDay}
          onSelect={handleSelectDay}
          hasData={d => !!storage.getTimetableForDay(d)}
          weekStartDay={storage.getSettings().weekStartDay}
        />
      </div>

      {/* View Mode Switcher + Balance Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 no-export">
        {/* View Mode Pills */}
        <div className="inline-flex rounded-md bg-surface-muted p-0.5 text-xs font-semibold select-none border border-border">
          <button
            type="button"
            onClick={() => setViewMode('batches')}
            className={`px-3 py-1.5 rounded transition-colors ${
              viewMode === 'batches'
                ? 'bg-surface text-primary shadow-2xs font-bold'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            Batch Matrix View
          </button>
          <button
            type="button"
            onClick={() => setViewMode('faculty')}
            className={`px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors ${
              viewMode === 'faculty'
                ? 'bg-surface text-primary shadow-2xs font-bold'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Faculty Schedule</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('rooms')}
            className={`px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors ${
              viewMode === 'rooms'
                ? 'bg-surface text-primary shadow-2xs font-bold'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            <span>Room Occupancy</span>
          </button>
        </div>

        {/* Quota Balance Bar */}
        <div className="w-full md:w-auto">
          <BalanceBar quota={quota} gapCount={gapCount} day={currentDay} />
        </div>
      </div>

      {/* Filter Toolbar (For Batches View) */}
      {viewMode === 'batches' && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 no-export">
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-muted font-medium">Campus:</span>
            <div className="inline-flex rounded-md bg-surface-muted p-0.5 text-xs font-medium select-none border border-border">
              <button
                type="button"
                onClick={() => setActiveSectionFilter('ALL')}
                className={`px-3 py-1 rounded transition-colors ${
                  activeSectionFilter === 'ALL'
                    ? 'bg-surface text-primary font-bold shadow-2xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                All Sections
              </button>
              <button
                type="button"
                onClick={() => setActiveSectionFilter('Building 1')}
                className={`px-3 py-1 rounded transition-colors ${
                  activeSectionFilter === 'Building 1'
                    ? 'bg-surface text-primary font-bold shadow-2xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                Building 1
              </button>
              <button
                type="button"
                onClick={() => setActiveSectionFilter('Building 2')}
                className={`px-3 py-1 rounded transition-colors ${
                  activeSectionFilter === 'Building 2'
                    ? 'bg-surface text-primary font-bold shadow-2xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                Building 2
              </button>
            </div>
          </div>

          <SearchInput
            value={filterQuery}
            onChange={setFilterQuery}
            placeholder="Search batches by name or room..."
            className="w-full sm:w-72"
          />
        </div>
      )}

      {/* View Mode: BATCH MATRIX */}
      {viewMode === 'batches' && (
        <div
          id={`timetable-panel-${currentDay.toLowerCase()}`}
          role="tabpanel"
          aria-labelledby={`timetable-tab-${currentDay.toLowerCase()}`}
        >
          {!hasGenerated && allocations.length === 0 ? (
            <FirstRunChecklist
              faculties={faculties}
              batches={batches}
              currentDay={currentDay}
              hasGenerated={hasGenerated}
              allocationsCount={allocations.length}
              isGenerating={isGenerating}
              generationProgress={generationProgress}
              onGenerate={handleGenerate}
            />
          ) : (
            <div className="space-y-6">
              {/* Summary panel for frozen violations (C2) */}
              {frozenViolations.length > 0 && (
                <div className="p-4 bg-burgundy-soft border border-burgundy/30 rounded-lg space-y-2.5 text-xs text-ink no-export">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-burgundy text-sm">
                      <AlertTriangle className="w-4 h-4 text-burgundy shrink-0" />
                      <span>Locked / Frozen Slot Violations ({frozenViolations.length})</span>
                    </div>
                    <span className="text-[11px] font-semibold text-burgundy bg-burgundy-soft px-2 py-0.5 rounded border border-burgundy/30">
                      Preserved with Red Cell Edges
                    </span>
                  </div>
                  <p className="text-ink-muted leading-relaxed">
                    The following locked slots violate hard constraints (such as an absent instructor, simultaneous time overlap, or daily period cap). They have been preserved in the timetable and marked with a red cell edge:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
                    {frozenViolations.map((v, idx) => {
                      const b = batches.find(batch => batch.id === v.batchId);
                      const f = faculties.find(fac => fac.id === v.facultyId);
                      return (
                        <div key={idx} className="p-2.5 bg-surface border border-burgundy/20 rounded shadow-xs space-y-1">
                          <div className="flex items-center justify-between font-semibold text-burgundy">
                            <span className="truncate">{b?.name || v.batchId} · Period {v.periodIndex + 1}</span>
                            <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-burgundy-soft text-burgundy font-bold shrink-0">
                              {v.type}
                            </span>
                          </div>
                          <div className="text-[11px] text-ink">
                            <span className="text-ink-muted">Teacher:</span> <strong>{f?.name || v.facultyId || 'Unassigned'}</strong>
                          </div>
                          <div className="text-[11px] text-burgundy font-medium leading-tight">
                            {v.reason}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div ref={exportViewRef} className="space-y-6">
                {SECTIONS.map(section => {
                  const sectionBatches = sectionedBatches[section.id];
                  if (!sectionBatches || sectionBatches.length === 0) return null;
                  return (
                    <div key={section.id} className="print-section-page space-y-2">
                      {/* Dedicated Print & Export Header per section (M9) */}
                      <div className="hidden print:flex items-center justify-between border-b-2 border-primary pb-2 text-xs">
                        <div>
                          <h2 className="text-base font-bold text-primary">
                            Timetable Pro · {section.label}
                          </h2>
                          <p className="text-[11px] text-ink-muted">
                            Academic Day: <strong>{currentDay}</strong> · Status: <strong>{currentStatus}</strong> · {sectionBatches.length} Batches
                          </p>
                        </div>
                        <div className="text-right text-[11px] text-ink-muted">
                          <div>Printed: {new Date().toLocaleDateString()}</div>
                          <div className="font-semibold text-ink">A4 Landscape</div>
                        </div>
                      </div>

                      <SectionTable
                        label={section.label}
                        batches={sectionBatches}
                        allocations={allocations}
                        unfilledSlots={unfilledSlots}
                        frozenViolations={frozenViolations}
                        getFacultyName={getFacultyName}
                        isFacultyAbsent={checkIsFacultyAbsent}
                        onToggleFreeze={toggleFreeze}
                        onCellClick={handleCellClick}
                        onRegenerateBatch={handleRegenerateBatch}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* View Mode: FACULTY SCHEDULE (N4) */}
      {viewMode === 'faculty' && (
        <TeacherScheduleView
          faculties={faculties}
          batches={batches}
          weekTimetables={weekTimetables}
          settings={settings}
        />
      )}

      {/* View Mode: ROOM OCCUPANCY (N4) */}
      {viewMode === 'rooms' && (
        <RoomScheduleView
          batches={batches}
          faculties={faculties}
          weekTimetables={weekTimetables}
          settings={settings}
        />
      )}

      {/* Manual Slot Override Dialog (Extracted into SlotEditModal - L5) */}
      {editingSlot && (
        <SlotEditModal
          editingSlot={editingSlot}
          faculties={faculties}
          batches={batches}
          allocations={allocations}
          currentDay={currentDay}
          currentStatus={currentStatus}
          onClose={() => setEditingSlot(null)}
          onSave={handleSaveSlotOverride}
          onRegenerateSlotSuccess={handleRegenerateSlotSuccess}
        />
      )}

      {/* Validation Report Modal (N3) */}
      <ValidationReportModal
        isOpen={isValidationModalOpen}
        onClose={() => setIsValidationModalOpen(false)}
        report={dayValidationReport}
        onJumpToCell={handleJumpToCell}
      />

      {/* Capacity Pre-Check Modal (N2) */}
      <CapacityPreCheckModal
        isOpen={isCapacityModalOpen}
        onClose={() => setIsCapacityModalOpen(false)}
        report={capacityAnalysis}
        onProceedGenerate={handleGenerate}
        dayName={currentDay}
      />

      {/* Unfilled Slots Drawer / Modal (Phase 2 H4) */}
      <Modal
        isOpen={isUnfilledModalOpen}
        onClose={() => setIsUnfilledModalOpen(false)}
        title="Unfilled Period Slots"
        subtitle="Slots that could not be scheduled due to qualified instructor unavailability"
        footer={
          <Button variant="secondary" onClick={() => setIsUnfilledModalOpen(false)}>
            Close
          </Button>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-ink-muted leading-relaxed">
            The scheduler respects strict daily workload caps and avoids teacher double-booking. The following slots remain unassigned:
          </p>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {unfilledSlots.map((u, i) => {
              const batch = batches.find(b => b.id === u.batchId);
              return (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setIsUnfilledModalOpen(false);
                    if (batch) handleCellClick(batch, u.periodIndex);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setIsUnfilledModalOpen(false);
                      if (batch) handleCellClick(batch, u.periodIndex);
                    }
                  }}
                  className="p-3 bg-cognac-soft hover:bg-cognac-soft/80 rounded border border-cognac/40 hover:border-cognac text-xs text-ink space-y-1.5 cursor-pointer transition-colors shadow-2xs group outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  title="Click to open and manually assign this cell"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-ink">
                      {u.batchName} · Period {u.periodIndex + 1}
                    </span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-surface text-cognac border border-cognac/30">
                      Unfilled: {u.reason}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-cognac">
                    <span>
                      Required: <strong>{u.requiredSubject || 'Any'}</strong>
                    </span>
                    <span className="text-[10px] text-cognac font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                      Click to assign →
                    </span>
                  </div>
                  {u.candidateIssue && (
                    <p className="text-[10px] text-ink-muted italic">{u.candidateIssue}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Modal>

      {/* Reopen Finalized Day Confirmation Modal */}
      <ConfirmDialog
        isOpen={isReopenConfirmOpen}
        onClose={() => setIsReopenConfirmOpen(false)}
        onConfirm={confirmReopenDay}
        title="Reopen Finalized Timetable?"
        variant="warning"
        confirmText="Reopen for Editing"
        cancelText="Keep Finalized"
        message={
          <div className="space-y-3 text-xs text-ink">
            <p>
              Reopening the <strong>{currentDay}</strong> timetable will change its status to <strong>Draft</strong> and allow manual edits or regeneration of unfrozen slots.
            </p>
            <p className="text-ink-muted">
              Frozen slots will continue to be preserved. Are you sure you want to unlock this day?
            </p>
          </div>
        }
      />

      {/* Week Quota Fit Report Modal (N9) */}
      <WeekQuotaFitModal
        isOpen={isQuotaReportModalOpen}
        onClose={() => setIsQuotaReportModalOpen(false)}
        report={weekQuotaReport}
      />
    </div>
  );
}
