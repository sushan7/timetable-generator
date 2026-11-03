import { useState, useRef, useMemo, useCallback } from 'react';
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
  Save,
  Trash2,
  Download,
  Undo2,
  Redo2,
  ShieldCheck,
  User,
  Building,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type {
  Faculty,
  Batch,
  Allocation,
  DayOfWeek,
  TimetableStatus,
  UnfilledSlot,
  ScheduleWarning,
  SubstituteCandidate,
  FrozenViolation,
} from '../types';
import {
  generateTimetableV2,
  patchAbsences,
  regenerateSingleSlot,
  getRankedSubstitutes,
  getSubjectCategory,
} from '../utils/scheduler';
import { storage } from '../utils/storage';
import { SECTIONS, groupBatchesBySection } from '../utils/sections';
import { checkFacultyConflict, canAssign } from '../utils/validation';
import {
  exportTimetableToExcel,
  exportTimetableToPng,
  exportTimetableToPdf,
} from '../utils/exportUtils';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import SearchInput from '../components/ui/SearchInput';
import DropdownMenu, { type DropdownItem } from '../components/ui/DropdownMenu';
import DayTabs from '../components/timetable/DayTabs';
import BalanceBar from '../components/timetable/BalanceBar';
import SectionTable from '../components/timetable/SectionTable';

interface SlotEditState {
  batch: Batch;
  periodIndex: number;
  currentAllocation?: Allocation;
  subject: string;
  facultyId: string;
  isFrozen: boolean;
  allowConflictOverride: boolean;
}

type ViewMode = 'batches' | 'faculty' | 'rooms';

export default function Timetable() {
  const [currentDay, setCurrentDay] = useState<DayOfWeek>('Monday');
  const [viewMode, setViewMode] = useState<ViewMode>('batches');

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
  const [isSyncing, setIsSyncing] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [activeSectionFilter, setActiveSectionFilter] = useState<string>('ALL');

  // Modals
  const [editingSlot, setEditingSlot] = useState<SlotEditState | null>(null);
  const [substituteCandidates, setSubstituteCandidates] = useState<SubstituteCandidate[]>([]);
  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);
  const [isUnfilledModalOpen, setIsUnfilledModalOpen] = useState(false);
  const [isUnfilledPanelExpanded, setIsUnfilledPanelExpanded] = useState(true);
  const [isReopenConfirmOpen, setIsReopenConfirmOpen] = useState(false);

  // Selected faculty or room for dedicated view modes
  const [selectedFacultyId, setSelectedFacultyId] = useState<string>('');
  const [selectedRoomNumber, setSelectedRoomNumber] = useState<string>('');

  const pageRef = useRef<HTMLDivElement>(null);

  // Helper to push history
  const pushState = useCallback(
    (newAllocations: Allocation[]) => {
      setHistory(prev => [...prev.slice(-20), allocations]);
      setFuture([]);
      setAllocations(newAllocations);
    },
    [allocations]
  );

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setFuture(prev => [allocations, ...prev]);
    setHistory(prev => prev.slice(0, prev.length - 1));
    setAllocations(previous);
    persistDay(currentDay, previous);
  };

  const handleRedo = () => {
    if (future.length === 0) return;
    const next = future[0];
    setHistory(prev => [...prev, allocations]);
    setFuture(prev => prev.slice(1));
    setAllocations(next);
    persistDay(currentDay, next);
  };

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

  const persistDay = (
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

  // Generate timetable with multi-pass evaluation (Phase 2 & M1)
  const handleGenerate = () => {
    if (currentStatus === 'Finalized') {
      setIsReopenConfirmOpen(true);
      return;
    }

    setIsGenerating(true);
    setTimeout(() => {
      const freshFaculties = storage.getFaculty();
      const freshBatches = storage.getBatches();
      setFaculties(freshFaculties);
      setBatches(freshBatches);

      const parsedSeed = manualSeedInput.trim() ? parseInt(manualSeedInput.trim(), 10) : undefined;
      const seedToUse = !isNaN(parsedSeed as number) ? parsedSeed : undefined;

      const weekContext = storage.getWeekAllocationsExcluding(currentDay);
      const result = generateTimetableV2(freshBatches, freshFaculties, allocations, weekContext, {
        seed: seedToUse,
        dayOfWeek: currentDay,
        dateKey: currentDay,
      });

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
      setIsGenerating(false);
    }, 250);
  };

  // Sync Absences (Phase 3 & H4/M3)
  const handleSyncAbsences = () => {
    if (currentStatus === 'Finalized') return;
    setIsSyncing(true);
    setTimeout(() => {
      const freshFaculties = storage.getFaculty();
      setFaculties(freshFaculties);

      const result = patchAbsences(allocations, batches, freshFaculties, {
        dateKey: currentDay,
        dayOfWeek: currentDay,
      });
      pushState(result.updatedAllocations);
      persistDay(currentDay, result.updatedAllocations);
      setIsSyncing(false);
    }, 200);
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
    setSubstituteCandidates([]);
  };

  // Check conflicts in manual editing dialog (M5 & C2)
  const conflictEvaluation = useMemo(() => {
    if (!editingSlot || !editingSlot.facultyId) return null;
    const selectedFac = faculties.find(f => f.id === editingSlot.facultyId);
    if (!selectedFac) return null;

    const settings = storage.getSettings();
    return canAssign(
      selectedFac,
      editingSlot.batch,
      editingSlot.periodIndex,
      allocations,
      batches,
      settings,
      { dayOfWeek: currentDay, dateKey: currentDay }
    );
  }, [editingSlot, faculties, batches, allocations, currentDay]);

  const isHardConflict = Boolean(
    conflictEvaluation &&
      !conflictEvaluation.ok &&
      ['TIME_OVERLAP', 'ABSENT', 'MAX_LOAD', 'BATCH_RESTRICTION'].includes(
        conflictEvaluation.type || ''
      )
  );

  // Load substitute suggestions
  const handleLoadSubstitutes = () => {
    if (!editingSlot) return;
    const settings = storage.getSettings();
    const ranked = getRankedSubstitutes(
      editingSlot.batch.id,
      editingSlot.periodIndex,
      editingSlot.subject,
      allocations,
      batches,
      faculties,
      settings,
      currentDay,
      currentDay
    );
    setSubstituteCandidates(ranked);
  };

  // Regenerate single slot
  const handleRegenerateSlot = () => {
    if (!editingSlot || currentStatus === 'Finalized') return;
    const settings = storage.getSettings();
    const result = regenerateSingleSlot(
      editingSlot.batch.id,
      editingSlot.periodIndex,
      allocations,
      batches,
      faculties,
      settings,
      editingSlot.subject,
      currentDay,
      currentDay
    );

    if (result.success && result.newAllocation) {
      const updated = allocations.filter(
        a => !(a.batchId === editingSlot.batch.id && a.periodIndex === editingSlot.periodIndex)
      );
      updated.push(result.newAllocation);
      pushState(updated);
      persistDay(currentDay, updated);
      setEditingSlot(null);
    } else {
      alert(result.reason || 'Could not find an available eligible teacher for this slot without causing conflicts.');
    }
  };

  // Save manual slot override (Phase 1 C2)
  const handleSaveSlotOverride = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSlot || currentStatus === 'Finalized') return;

    // Check if hard conflict exists and override is unchecked
    if (isHardConflict && !editingSlot.allowConflictOverride) {
      alert('A scheduling conflict was detected (TIME_OVERLAP, ABSENT, MAX_LOAD, or BATCH_RESTRICTION). Please check "Override anyway" to confirm this assignment.');
      return;
    }

    const { batch, periodIndex, subject, facultyId, isFrozen } = editingSlot;
    const oldFacultyId = editingSlot.currentAllocation?.facultyId;
    const updatedAllocations = [...allocations];
    const existingIdx = updatedAllocations.findIndex(
      a => a.batchId === batch.id && a.periodIndex === periodIndex
    );

    if (!facultyId) {
      // Clear slot
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
    } else {
      const isConflict = Boolean(conflictEvaluation && !conflictEvaluation.ok);
      const isOverridden = Boolean(isHardConflict && editingSlot.allowConflictOverride);
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
    }

    pushState(updatedAllocations);
    persistDay(currentDay, updatedAllocations);
    setEditingSlot(null);
  };

  // Full day validation audit (Phase 5C)
  const validationReport = useMemo(() => {
    const issues: {
      type: 'CONFLICT' | 'WARNING';
      batchName: string;
      period: number;
      message: string;
      batchId: string;
    }[] = [];

    const settings = storage.getSettings();

    // 1. Time overlaps & daily load
    allocations.forEach(a => {
      if (!a.facultyId) return;
      const fac = faculties.find(f => f.id === a.facultyId);
      const batch = batches.find(b => b.id === a.batchId);
      if (!fac || !batch) return;

      const conflict = checkFacultyConflict(
        fac,
        a.batchId,
        a.periodIndex,
        batches,
        allocations.filter(x => x !== a),
        settings,
        { dateKey: currentDay, dayOfWeek: currentDay }
      );

      if (conflict.hasConflict) {
        issues.push({
          type: 'CONFLICT',
          batchName: batch.name,
          period: a.periodIndex + 1,
          message: `${fac.name}: ${conflict.message}`,
          batchId: batch.id,
        });
      }
    });

    // 2. Period 1 languages
    warnings.forEach(w => {
      const b = batches.find(batch => batch.id === w.batchId);
      issues.push({
        type: 'WARNING',
        batchName: b?.name || 'Unknown',
        period: (w.periodIndex || 0) + 1,
        message: w.message,
        batchId: w.batchId || '',
      });
    });

    // 3. Unfilled slots
    unfilledSlots.forEach(u => {
      issues.push({
        type: 'WARNING',
        batchName: u.batchName,
        period: u.periodIndex + 1,
        message: `Unfilled slot for "${u.requiredSubject}": ${u.reason}`,
        batchId: u.batchId,
      });
    });

    return issues;
  }, [allocations, faculties, batches, warnings, unfilledSlots, currentDay]);

  const getFacultyName = useCallback(
    (id: string): string => {
      const f = faculties.find(fac => fac.id === id);
      return f ? f.name : id;
    },
    [faculties]
  );

  // Exports
  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      await exportTimetableToExcel(currentDay, batches, allocations, faculties);
    } catch (e) {
      console.error(e);
      alert('Failed to generate Excel export.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPng = async () => {
    if (!pageRef.current) return;
    setIsExporting(true);
    try {
      await exportTimetableToPng(pageRef.current, currentDay);
    } catch (e) {
      console.error(e);
      alert('Failed to generate PNG export.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = async () => {
    if (!pageRef.current) return;
    setIsExporting(true);
    try {
      await exportTimetableToPdf(pageRef.current, currentDay);
    } catch (e) {
      console.error(e);
      alert('Failed to generate PDF export.');
    } finally {
      setIsExporting(false);
    }
  };

  const exportItems: DropdownItem[] = [
    {
      id: 'excel',
      label: 'Export to Excel (.xlsx)',
      description: 'Styled multi-period workbook with room and faculty data',
      icon: <FileSpreadsheet className="w-4 h-4 text-[#6B2638]" />,
      onClick: handleExportExcel,
      disabled: isExporting || !hasGenerated,
    },
    {
      id: 'png',
      label: 'Download Image (PNG)',
      description: 'High-resolution snapshot for notices & digital displays',
      icon: <ImageIcon className="w-4 h-4 text-[#B08D57]" />,
      onClick: handleExportPng,
      disabled: isExporting || !hasGenerated,
    },
    {
      id: 'pdf',
      label: 'Export Document (PDF)',
      description: 'Printable A4 landscape document with full headers',
      icon: <FileText className="w-4 h-4 text-[#6B2638]" />,
      onClick: handleExportPdf,
      disabled: isExporting || !hasGenerated,
    },
  ];

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

  const quota = useMemo(() => {
    const otherDays = storage.getWeekAllocationsExcluding(currentDay);
    const allWeekly = [...otherDays, ...allocations];

    let pcmb = 0;
    let lang = 0;
    let other = 0;
    const settings = storage.getSettings();

    allWeekly.forEach(a => {
      if (!a.facultyId) return;
      const cat = getSubjectCategory(a.subject, settings);
      if (cat === 'Core') pcmb++;
      else if (cat === 'Language') lang++;
      else other++;
    });
    const total = pcmb + lang + other;
    const actualPCMBPct = total === 0 ? 0 : Math.round((pcmb / total) * 100);
    const actualLangPct = total === 0 ? 0 : Math.round((lang / total) * 100);
    const actualOtherPct = total === 0 ? 0 : Math.max(0, 100 - actualPCMBPct - actualLangPct);
    return {
      pcmb,
      lang,
      other,
      targetPCMB: settings.pcmbWeight,
      targetLang: settings.languageWeight,
      actualPCMBPct,
      actualLangPct,
      actualOtherPct,
    };
  }, [allocations, currentDay]);

  const gapCount = allocations.filter(a => a.vacatedFacultyId && !a.facultyId).length;
  const absentFacultyCount = faculties.filter(f => f.isAbsent).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6" ref={pageRef}>
      {/* Top Header */}
      <PageHeader
        icon={<Calendar className="w-5 h-5 text-[#6B2638]" />}
        title="Timetable Studio"
        subtitle={`Generate, validate, and manage academic period assignments for ${currentDay}`}
        actions={
          <div className="flex items-center gap-2 flex-wrap no-export">
            {/* Status Selector */}
            <div className="inline-flex items-center rounded-md border border-[#A89B8A]/30 bg-white p-0.5 text-xs font-semibold shadow-2xs">
              <button
                type="button"
                onClick={() => handleStatusChange('Draft')}
                className={`px-3 py-1.5 rounded transition-colors ${
                  currentStatus === 'Draft'
                    ? 'bg-[#F3EEE6] text-[#6B2638] font-bold shadow-2xs'
                    : 'text-[#252326]/60 hover:text-[#252326]'
                }`}
              >
                Draft
              </button>
              <button
                type="button"
                onClick={() => handleStatusChange('Finalized')}
                className={`px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors ${
                  currentStatus === 'Finalized'
                    ? 'bg-[#6B2638] text-white font-bold shadow-2xs'
                    : 'text-[#252326]/60 hover:text-[#252326]'
                }`}
              >
                <Lock className="w-3 h-3" />
                <span>Finalized</span>
              </button>
            </div>

            {/* Undo / Redo */}
            <div className="flex items-center rounded border border-[#A89B8A]/30 bg-white">
              <button
                type="button"
                onClick={handleUndo}
                disabled={history.length === 0 || currentStatus === 'Finalized'}
                className="p-1.5 text-[#252326]/70 hover:text-[#6B2638] disabled:opacity-30 disabled:pointer-events-none"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <div className="h-4 w-px bg-[#A89B8A]/30" />
              <button
                type="button"
                onClick={handleRedo}
                disabled={future.length === 0 || currentStatus === 'Finalized'}
                className="p-1.5 text-[#252326]/70 hover:text-[#6B2638] disabled:opacity-30 disabled:pointer-events-none"
                title="Redo (Ctrl+Y)"
              >
                <Redo2 className="w-4 h-4" />
              </button>
            </div>

            {/* Audit / Validate Button */}
            <Button
              variant="secondary"
              icon={<ShieldCheck className="w-4 h-4 text-[#6B2638]" />}
              onClick={() => setIsValidationModalOpen(true)}
              title="Audit active timetable for teacher clashes and quota rules"
            >
              Audit Day ({validationReport.length})
            </Button>

            {/* Sync Absences Button */}
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

            {/* Advanced Seed Input (M1) */}
            <div className="flex items-center gap-1.5 no-export" title="Optional seed for deterministic, reproducible generation">
              <input
                type="number"
                placeholder="Seed (opt)"
                value={manualSeedInput}
                onChange={e => setManualSeedInput(e.target.value)}
                className="w-24 px-2 py-1.5 text-xs bg-white border border-[#DDD5CE] rounded-md text-[#252326] focus:outline-none focus:border-[#252326]"
                title="Enter custom PRNG seed for reproducible results"
              />
              {currentSeed !== undefined && (
                <span className="text-[10px] text-[#6E6864] font-mono px-1.5 py-0.5 bg-[#F2EDE7] rounded border border-[#E8E2DC]" title="Last seed used for this timetable">
                  #{currentSeed}
                </span>
              )}
            </div>

            {/* Generate Button */}
            <Button
              variant="primary"
              icon={<Play className="w-4 h-4" />}
              loading={isGenerating}
              onClick={handleGenerate}
              disabled={currentStatus === 'Finalized'}
            >
              Generate {currentDay}
            </Button>

            {/* Export Menu */}
            <DropdownMenu
              label="Export"
              icon={<Download className="w-4 h-4" />}
              items={exportItems}
              align="right"
              disabled={isExporting}
            />
          </div>
        }
      />

      {/* Finalized Warning Banner */}
      {currentStatus === 'Finalized' && (
        <div className="p-3 bg-[#FAF0F2] border border-[#ECD9DE] rounded-md flex items-center justify-between gap-3 text-xs text-[#252326] no-export">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#6B2638]" />
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
        <div className="bg-[#FAF7F2] border border-[#E5E0D8] rounded-lg p-4 space-y-3 no-export shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E5E0D8] pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-[#FEF7EC] text-[#C2410C] rounded border border-[#E9BF85]/60">
                <AlertTriangle className="w-4 h-4 shrink-0" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#252326] leading-tight">
                  Unfilled Slots & Schedule Warnings
                </h3>
                <p className="text-[11px] text-[#5E5B61]">
                  Click any slot or warning below to immediately jump to and edit that cell.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {unfilledSlots.length > 0 && (
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#FEF7EC] text-[#92400E] border border-[#E9BF85]">
                  {unfilledSlots.length} Unfilled
                </span>
              )}
              {warnings.length > 0 && (
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#FAF0F2] text-[#6B2638] border border-[#E8D0D6]">
                  {warnings.length} Warning{warnings.length !== 1 ? 's' : ''}
                </span>
              )}
              <button
                type="button"
                onClick={() => setIsUnfilledPanelExpanded(!isUnfilledPanelExpanded)}
                className="p-1 text-[#5E5B61] hover:text-[#252326] hover:bg-white rounded border border-transparent hover:border-[#E5E0D8] transition-colors"
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
                <div className="flex items-center justify-between text-xs font-bold text-[#92400E]">
                  <span>Unfilled Slots ({unfilledSlots.length})</span>
                  {unfilledSlots.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setIsUnfilledModalOpen(true)}
                      className="text-[11px] font-semibold text-[#6B2638] hover:underline"
                    >
                      View Full Modal
                    </button>
                  )}
                </div>

                {unfilledSlots.length === 0 ? (
                  <p className="text-xs text-[#5E5B61] italic py-2">
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
                          className="p-2.5 bg-[#FEF7EC] hover:bg-[#FDF2E2] border border-[#E9BF85] hover:border-[#B45309] rounded text-xs cursor-pointer transition-colors shadow-2xs group flex flex-col gap-1 outline-none focus-visible:ring-2 focus-visible:ring-[#B45309]"
                          title="Click to open and manually assign this cell"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-[#252326] truncate">
                              {u.batchName} · Period {u.periodIndex + 1}
                              {period?.startTime ? ` (${period.startTime} - ${period.endTime})` : ''}
                            </span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white text-[#92400E] border border-[#E9BF85] shrink-0">
                              Unfilled: {u.reason}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-[#78350F]">
                            <span className="truncate">
                              Required: <strong>{u.requiredSubject || 'Any'}</strong>
                              {u.candidateIssue ? ` — ${u.candidateIssue}` : ''}
                            </span>
                            <span className="shrink-0 text-[10px] font-medium text-[#C2410C] opacity-0 group-hover:opacity-100 transition-opacity">
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
                <div className="text-xs font-bold text-[#6B2638]">
                  Schedule Warnings ({warnings.length})
                </div>

                {warnings.length === 0 ? (
                  <p className="text-xs text-[#5E5B61] italic py-2">
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
                          className={`p-2.5 bg-white border border-[#E5E0D8] rounded text-xs transition-colors shadow-2xs group flex flex-col gap-1 ${
                            hasCell
                              ? 'cursor-pointer hover:border-[#6B2638] hover:bg-[#FAF7F2] outline-none focus-visible:ring-2 focus-visible:ring-[#6B2638]'
                              : ''
                          }`}
                          title={hasCell ? 'Click to inspect slot' : undefined}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-[#252326] truncate">
                              {batch ? `${batch.name} · P${(w.periodIndex || 0) + 1}` : w.type}
                            </span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#FAF0F2] text-[#6B2638] border border-[#E8D0D6] shrink-0">
                              {w.type.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-[#5E5B61]">
                            <span className="truncate">{w.message}</span>
                            {hasCell && (
                              <span className="shrink-0 text-[10px] font-medium text-[#6B2638] opacity-0 group-hover:opacity-100 transition-opacity">
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
        <div className="inline-flex rounded-md bg-[#F3EEE6] p-0.5 text-xs font-semibold select-none border border-[#A89B8A]/30">
          <button
            type="button"
            onClick={() => setViewMode('batches')}
            className={`px-3 py-1.5 rounded transition-colors ${
              viewMode === 'batches'
                ? 'bg-white text-[#6B2638] shadow-2xs font-bold'
                : 'text-[#252326]/70 hover:text-[#252326]'
            }`}
          >
            Batch Matrix View
          </button>
          <button
            type="button"
            onClick={() => setViewMode('faculty')}
            className={`px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors ${
              viewMode === 'faculty'
                ? 'bg-white text-[#6B2638] shadow-2xs font-bold'
                : 'text-[#252326]/70 hover:text-[#252326]'
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
                ? 'bg-white text-[#6B2638] shadow-2xs font-bold'
                : 'text-[#252326]/70 hover:text-[#252326]'
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
            <span className="text-xs text-[#252326]/60 font-medium">Campus:</span>
            <div className="inline-flex rounded-md bg-[#F3EEE6] p-0.5 text-xs font-medium select-none border border-[#A89B8A]/30">
              <button
                type="button"
                onClick={() => setActiveSectionFilter('ALL')}
                className={`px-3 py-1 rounded transition-colors ${
                  activeSectionFilter === 'ALL'
                    ? 'bg-white text-[#6B2638] font-bold shadow-2xs'
                    : 'text-[#252326]/70 hover:text-[#252326]'
                }`}
              >
                All Sections
              </button>
              <button
                type="button"
                onClick={() => setActiveSectionFilter('Building 1')}
                className={`px-3 py-1 rounded transition-colors ${
                  activeSectionFilter === 'Building 1'
                    ? 'bg-white text-[#6B2638] font-bold shadow-2xs'
                    : 'text-[#252326]/70 hover:text-[#252326]'
                }`}
              >
                Building 1
              </button>
              <button
                type="button"
                onClick={() => setActiveSectionFilter('Building 2')}
                className={`px-3 py-1 rounded transition-colors ${
                  activeSectionFilter === 'Building 2'
                    ? 'bg-white text-[#6B2638] font-bold shadow-2xs'
                    : 'text-[#252326]/70 hover:text-[#252326]'
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
        <div>
          {!hasGenerated ? (
            <div className="p-8 bg-[#F3EEE6]/50 rounded-xl border border-[#A89B8A]/30 space-y-6 text-center">
              <div className="w-12 h-12 bg-[#6B2638]/10 text-[#6B2638] rounded-full flex items-center justify-center mx-auto">
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h3 className="text-lg font-bold text-[#252326]">Welcome to Timetable Pro</h3>
                <p className="text-xs text-[#252326]/70 leading-relaxed">
                  No timetable is currently active for {currentDay}. Follow the three quick steps below to generate an optimized, clash-free schedule.
                </p>
              </div>

              {/* 3-Step Onboarding Cards (Phase 5J) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto text-left">
                <div className="p-4 bg-white rounded-lg border border-[#A89B8A]/30 space-y-2">
                  <div className="w-6 h-6 rounded-full bg-[#6B2638] text-white text-xs font-bold flex items-center justify-center">
                    1
                  </div>
                  <h4 className="text-xs font-bold text-[#252326]">Check Faculty Pool</h4>
                  <p className="text-[11px] text-[#252326]/60 leading-normal">
                    Confirm {faculties.length} instructors, qualifications, and mark any known absentees.
                  </p>
                  <Link to="/faculty" className="text-xs font-bold text-[#6B2638] flex items-center gap-1 hover:underline">
                    Manage Faculty <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>

                <div className="p-4 bg-white rounded-lg border border-[#A89B8A]/30 space-y-2">
                  <div className="w-6 h-6 rounded-full bg-[#6B2638] text-white text-xs font-bold flex items-center justify-center">
                    2
                  </div>
                  <h4 className="text-xs font-bold text-[#252326]">Review Batches & Timings</h4>
                  <p className="text-[11px] text-[#252326]/60 leading-normal">
                    Inspect active period timings across {batches.length} classroom sections.
                  </p>
                  <Link to="/batches" className="text-xs font-bold text-[#6B2638] flex items-center gap-1 hover:underline">
                    Inspect Batches <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>

                <div className="p-4 bg-white rounded-lg border border-[#A89B8A]/30 space-y-2">
                  <div className="w-6 h-6 rounded-full bg-[#6B2638] text-white text-xs font-bold flex items-center justify-center">
                    3
                  </div>
                  <h4 className="text-xs font-bold text-[#252326]">Run Scheduler</h4>
                  <p className="text-[11px] text-[#252326]/60 leading-normal">
                    Execute the constraint solver to allocate subjects and resolve all time overlaps.
                  </p>
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<Play className="w-3.5 h-3.5" />}
                    onClick={handleGenerate}
                    loading={isGenerating}
                  >
                    Generate Schedule
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Summary panel for frozen violations (C2) */}
              {frozenViolations.length > 0 && (
                <div className="p-4 bg-[#FEF2F2] border border-red-300 rounded-lg space-y-2.5 text-xs text-red-950 no-export">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-red-800 text-sm">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>Locked / Frozen Slot Violations ({frozenViolations.length})</span>
                    </div>
                    <span className="text-[11px] font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded border border-red-200">
                      Preserved with Red Cell Edges
                    </span>
                  </div>
                  <p className="text-red-900/80 leading-relaxed">
                    The following locked slots violate hard constraints (such as an absent instructor, simultaneous time overlap, or daily period cap). They have been preserved in the timetable and marked with a red cell edge:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
                    {frozenViolations.map((v, idx) => {
                      const b = batches.find(batch => batch.id === v.batchId);
                      const f = faculties.find(fac => fac.id === v.facultyId);
                      return (
                        <div key={idx} className="p-2.5 bg-white border border-red-200 rounded shadow-xs space-y-1">
                          <div className="flex items-center justify-between font-semibold text-red-900">
                            <span className="truncate">{b?.name || v.batchId} · Period {v.periodIndex + 1}</span>
                            <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-bold shrink-0">
                              {v.type}
                            </span>
                          </div>
                          <div className="text-[11px] text-[#252326]">
                            <span className="text-[#5E5B61]">Teacher:</span> <strong>{f?.name || v.facultyId || 'Unassigned'}</strong>
                          </div>
                          <div className="text-[11px] text-red-700 font-medium leading-tight">
                            {v.reason}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {SECTIONS.map(section => {
                const sectionBatches = sectionedBatches[section.id];
                if (!sectionBatches || sectionBatches.length === 0) return null;
                return (
                  <SectionTable
                    key={section.id}
                    label={section.label}
                    batches={sectionBatches}
                    allocations={allocations}
                    unfilledSlots={unfilledSlots}
                    frozenViolations={frozenViolations}
                    getFacultyName={getFacultyName}
                    onToggleFreeze={toggleFreeze}
                    onCellClick={handleCellClick}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* View Mode: FACULTY SCHEDULE (Phase 5D) */}
      {viewMode === 'faculty' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-[#F3EEE6]/50 rounded-lg border border-[#A89B8A]/30">
            <User className="w-5 h-5 text-[#6B2638]" />
            <div className="flex-1">
              <label className="text-xs font-bold text-[#252326] uppercase tracking-wider block">
                Select Instructor to Inspect Weekly Matrix
              </label>
              <select
                value={selectedFacultyId || faculties[0]?.id || ''}
                onChange={e => setSelectedFacultyId(e.target.value)}
                className="mt-1 w-full max-w-md px-3 py-2 text-xs border border-[#A89B8A]/40 rounded bg-white text-[#252326] outline-none focus:border-[#6B2638]"
              >
                {faculties.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.subjects.join(', ')}) {f.isAbsent ? '- ABSENT' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Teacher Weekly Matrix */}
          {(() => {
            const currentFacId = selectedFacultyId || faculties[0]?.id;
            const targetFaculty = faculties.find(f => f.id === currentFacId);
            if (!targetFaculty) return null;

            const week = storage.getWeekTimetables();
            const days: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

            return (
              <div className="bg-white rounded-lg border border-[#A89B8A]/30 overflow-hidden shadow-xs">
                <div className="p-4 bg-[#F3EEE6] border-b border-[#A89B8A]/30 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-[#252326]">{targetFaculty.name}</h3>
                    <p className="text-xs text-[#252326]/60">
                      Subjects: {targetFaculty.subjects.join(', ')} · Daily Limit: {targetFaculty.maxPeriodsPerDay || 3} periods
                    </p>
                  </div>
                  {targetFaculty.isAbsent && <Badge tone="danger">Currently Absent</Badge>}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#F8F7F3] border-b border-[#A89B8A]/30 text-[#252326]/70 uppercase font-semibold">
                        <th className="p-3 w-28">Day</th>
                        {[1, 2, 3, 4, 5, 6].map(p => (
                          <th key={p} className="p-3 text-center">
                            Period {p}
                          </th>
                        ))}
                        <th className="p-3 text-right">Day Load</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#A89B8A]/20">
                      {days.map(day => {
                        const dayTimetable = day === currentDay ? { allocations } : week[day];
                        const dayAllocs = dayTimetable?.allocations || [];
                        const teacherAllocs = dayAllocs.filter(a => a.facultyId === targetFaculty.id);

                        return (
                          <tr key={day} className={day === currentDay ? 'bg-[#F3EEE6]/30' : ''}>
                            <td className="p-3 font-bold text-[#252326]">
                              {day} {day === currentDay && <span className="text-[10px] text-[#6B2638] font-semibold">(Active)</span>}
                            </td>
                            {[0, 1, 2, 3, 4, 5].map(pIdx => {
                              const alloc = teacherAllocs.find(a => a.periodIndex === pIdx);
                              const batch = alloc ? batches.find(b => b.id === alloc.batchId) : null;

                              return (
                                <td key={pIdx} className="p-2.5 text-center">
                                  {alloc && batch ? (
                                    <div className="p-2 rounded bg-white border border-[#6B2638]/30 shadow-2xs">
                                      <div className="font-bold text-[#6B2638]">{alloc.subject}</div>
                                      <div className="text-[11px] text-[#252326]/80">{batch.name}</div>
                                      <div className="text-[10px] text-[#252326]/60">Rm {batch.roomNumber}</div>
                                    </div>
                                  ) : (
                                    <span className="text-[#252326]/30 italic text-[11px]">Free</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="p-3 text-right font-bold text-[#252326]">
                              {teacherAllocs.length} periods
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* View Mode: ROOM OCCUPANCY (Phase 5E) */}
      {viewMode === 'rooms' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-[#F3EEE6]/50 rounded-lg border border-[#A89B8A]/30">
            <Building className="w-5 h-5 text-[#6B2638]" />
            <div className="flex-1">
              <label className="text-xs font-bold text-[#252326] uppercase tracking-wider block">
                Filter by Room Number
              </label>
              <input
                type="text"
                placeholder="Search room (e.g. 204(A), 101, or leave empty for all rooms)"
                value={selectedRoomNumber}
                onChange={e => setSelectedRoomNumber(e.target.value)}
                className="mt-1 w-full max-w-md px-3 py-2 text-xs border border-[#A89B8A]/40 rounded bg-white text-[#252326] outline-none focus:border-[#6B2638]"
              />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-[#A89B8A]/30 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#F3EEE6] border-b border-[#A89B8A]/30 uppercase text-[#252326]/80 font-semibold">
                    <th className="p-3 w-32">Room No.</th>
                    <th className="p-3">Assigned Batch</th>
                    <th className="p-3">Building</th>
                    {[1, 2, 3, 4, 5, 6].map(p => (
                      <th key={p} className="p-3 text-center">
                        Period {p}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#A89B8A]/20">
                  {batches
                    .filter(b => !selectedRoomNumber || b.roomNumber.toLowerCase().includes(selectedRoomNumber.toLowerCase()))
                    .map(batch => {
                      return (
                        <tr key={batch.id} className="hover:bg-[#F3EEE6]/40 transition-colors">
                          <td className="p-3 font-bold text-[#252326]">
                            <span className="px-2 py-0.5 bg-[#F3EEE6] rounded border border-[#A89B8A]/30">
                              Room {batch.roomNumber || '-'}
                            </span>
                          </td>
                          <td className="p-3 font-semibold text-[#252326]">{batch.name}</td>
                          <td className="p-3 text-[#252326]/70">{batch.building}</td>
                          {[0, 1, 2, 3, 4, 5].map(pIdx => {
                            const alloc = allocations.find(
                              a => a.batchId === batch.id && a.periodIndex === pIdx
                            );
                            const facName = alloc?.facultyId ? getFacultyName(alloc.facultyId) : null;

                            return (
                              <td key={pIdx} className="p-2 text-center">
                                {alloc && alloc.facultyId ? (
                                  <div className="p-1.5 rounded bg-white border border-[#A89B8A]/30 text-[11px]">
                                    <div className="font-semibold text-[#6B2638]">{alloc.subject}</div>
                                    <div className="text-[10px] text-[#252326]/70 truncate max-w-[100px] mx-auto">
                                      {facName}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-[#252326]/30 text-[11px]">Vacant</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Manual Slot Override Dialog (Phase 1 C2 & Phase 5H/5I) */}
      {editingSlot && (
        <Modal
          isOpen={true}
          onClose={() => setEditingSlot(null)}
          title={`Edit Period ${editingSlot.periodIndex + 1} · ${editingSlot.batch.name}`}
          subtitle={`${editingSlot.batch.building} · Room ${editingSlot.batch.roomNumber}`}
          footer={
            <div className="flex items-center justify-between w-full">
              <div>
                {editingSlot.currentAllocation?.facultyId && (
                  <Button
                    type="button"
                    variant="danger"
                    icon={<Trash2 className="w-4 h-4" />}
                    onClick={() => setEditingSlot({ ...editingSlot, facultyId: '' })}
                  >
                    Clear Slot
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" onClick={() => setEditingSlot(null)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  icon={<Save className="w-4 h-4" />}
                  form="slot-override-form"
                  disabled={isHardConflict && !editingSlot.allowConflictOverride}
                >
                  Save Assignment
                </Button>
              </div>
            </div>
          }
        >
          <form id="slot-override-form" onSubmit={handleSaveSlotOverride} className="space-y-4">
            <div className="bg-[#F3EEE6] p-3 rounded-md border border-[#A89B8A]/30 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-[#252326]/70 font-medium">Campus & Room:</span>
                <span className="font-semibold text-[#252326]">
                  Room {editingSlot.batch.roomNumber} · {editingSlot.batch.building}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#252326]/70 font-medium">Slot Timing:</span>
                <span className="font-semibold text-[#252326]">
                  {editingSlot.batch.periods[editingSlot.periodIndex]?.startTime} -{' '}
                  {editingSlot.batch.periods[editingSlot.periodIndex]?.endTime}
                </span>
              </div>
            </div>

            {/* Quick Actions inside Dialog */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                icon={<RefreshCw className="w-3.5 h-3.5" />}
                onClick={handleRegenerateSlot}
              >
                Regenerate Slot Only
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                icon={<User className="w-3.5 h-3.5" />}
                onClick={handleLoadSubstitutes}
              >
                Suggest Substitutes
              </Button>
            </div>

            {/* Substitute candidates list */}
            {substituteCandidates.length > 0 && (
              <div className="p-3 bg-white rounded border border-[#A89B8A]/30 space-y-2">
                <span className="text-[11px] font-bold text-[#6B2638] uppercase block">
                  Top Recommended Substitute Candidates
                </span>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {substituteCandidates.map(c => (
                    <div
                      key={c.faculty.id}
                      className="flex items-center justify-between p-2 rounded bg-[#F8F7F3] border border-[#A89B8A]/20 text-xs"
                    >
                      <div>
                        <span className="font-bold text-[#252326]">{c.faculty.name}</span>
                        <div className="text-[10px] text-[#252326]/60">
                          {c.faculty.subjects.join(', ')} · Daily load: {c.currentDayLoad}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setEditingSlot({
                            ...editingSlot,
                            facultyId: c.faculty.id,
                            allowConflictOverride: false,
                          })
                        }
                      >
                        Select
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#252326]">Subject</label>
              <select
                value={editingSlot.subject}
                onChange={e => setEditingSlot({ ...editingSlot, subject: e.target.value })}
                className="w-full px-3 py-2 border border-[#A89B8A]/40 rounded-md text-sm bg-white focus:border-[#6B2638] outline-none text-[#252326]"
              >
                {editingSlot.batch.subjects.map(s => (
                  <option key={s.subject} value={s.subject}>
                    {s.subject}
                  </option>
                ))}
                {!editingSlot.batch.subjects.some(s => s.subject === editingSlot.subject) && (
                  <option value={editingSlot.subject}>{editingSlot.subject}</option>
                )}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#252326]">Assigned Instructor</label>
              <select
                value={editingSlot.facultyId}
                onChange={e =>
                  setEditingSlot({
                    ...editingSlot,
                    facultyId: e.target.value,
                    allowConflictOverride: false,
                  })
                }
                className="w-full px-3 py-2 border border-[#A89B8A]/40 rounded-md text-sm bg-white focus:border-[#6B2638] outline-none text-[#252326]"
              >
                <option value="">-- Vacant (Free Period) --</option>
                {faculties
                  .filter(f => f.subjects.includes(editingSlot.subject))
                  .map(f => (
                    <option key={f.id} value={f.id}>
                      {f.name} {f.isAbsent ? '(ABSENT)' : ''}
                    </option>
                  ))}
              </select>
            </div>

            {/* Conflict Warning & Confirmation Checkbox (C2) */}
            {conflictEvaluation && !conflictEvaluation.ok && (
              <div className="p-3 bg-[#FAF0F2] text-[#6B2638] border border-[#ECD9DE] rounded-md text-xs space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-bold">Scheduling Conflict Detected:</strong>
                    <p className="mt-0.5 leading-relaxed">{conflictEvaluation.reason}</p>
                  </div>
                </div>
                {isHardConflict && (
                  <label className="flex items-center gap-2 pt-2 border-t border-[#ECD9DE] cursor-pointer font-bold select-none text-[#6B2638]">
                    <input
                      type="checkbox"
                      checked={editingSlot.allowConflictOverride}
                      onChange={e =>
                        setEditingSlot({ ...editingSlot, allowConflictOverride: e.target.checked })
                      }
                      className="w-4 h-4 text-[#6B2638] focus:ring-[#6B2638] rounded"
                    />
                    <span>Override anyway</span>
                  </label>
                )}
              </div>
            )}

            <div className="pt-2 border-t border-[#A89B8A]/20">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#252326] select-none">
                <input
                  type="checkbox"
                  checked={editingSlot.isFrozen}
                  onChange={e => setEditingSlot({ ...editingSlot, isFrozen: e.target.checked })}
                  className="w-4 h-4 text-[#6B2638] focus:ring-[#6B2638] rounded"
                />
                <span className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[#6B2638]" />
                  Freeze this slot (protect from future automatic regeneration)
                </span>
              </label>
            </div>
          </form>
        </Modal>
      )}

      {/* Full Day Validation Audit Report Modal (Phase 5C) */}
      <Modal
        isOpen={isValidationModalOpen}
        onClose={() => setIsValidationModalOpen(false)}
        title={`Timetable Audit Report · ${currentDay}`}
        subtitle="Comprehensive verification of room conflicts, teacher workloads, and curriculum quotas"
        footer={
          <Button variant="secondary" onClick={() => setIsValidationModalOpen(false)}>
            Close Report
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-[#F3EEE6] rounded border border-[#A89B8A]/30 text-center">
              <span className="text-[10px] uppercase font-bold text-[#252326]/60">Total Slots</span>
              <div className="text-lg font-bold text-[#252326]">
                {batches.reduce((acc, b) => acc + b.periods.filter(p => p.startTime).length, 0)}
              </div>
            </div>
            <div className="p-3 bg-[#FAF0F2] rounded border border-[#ECD9DE] text-center">
              <span className="text-[10px] uppercase font-bold text-[#6B2638]">Violations</span>
              <div className="text-lg font-bold text-[#6B2638]">
                {validationReport.filter(r => r.type === 'CONFLICT').length}
              </div>
            </div>
            <div className="p-3 bg-[#FAF6EE] rounded border border-[#B08D57]/40 text-center">
              <span className="text-[10px] uppercase font-bold text-[#B08D57]">Soft Warnings</span>
              <div className="text-lg font-bold text-[#B08D57]">
                {validationReport.filter(r => r.type === 'WARNING').length}
              </div>
            </div>
          </div>

          {validationReport.length === 0 ? (
            <div className="p-6 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-[#476B52] mx-auto" />
              <h4 className="text-sm font-bold text-[#252326]">Zero Conflicts Detected</h4>
              <p className="text-xs text-[#252326]/60">
                All teacher schedules, room allocations, and daily teaching limits are 100% compliant.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {validationReport.map((issue, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded border text-xs flex items-start justify-between gap-3 ${
                    issue.type === 'CONFLICT'
                      ? 'bg-[#FAF0F2] border-[#ECD9DE] text-[#6B2638]'
                      : 'bg-[#FAF6EE] border-[#B08D57]/30 text-[#252326]'
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="font-bold flex items-center gap-1.5">
                      <Badge tone={issue.type === 'CONFLICT' ? 'danger' : 'gold'}>
                        {issue.type}
                      </Badge>
                      <span>
                        {issue.batchName} · Period {issue.period}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed opacity-90">{issue.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

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
          <p className="text-xs text-[#252326]/70 leading-relaxed">
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
                  className="p-3 bg-[#FEF7EC] hover:bg-[#FDF2E2] rounded border border-[#E9BF85] hover:border-[#B45309] text-xs text-[#252326] space-y-1.5 cursor-pointer transition-colors shadow-2xs group outline-none focus-visible:ring-2 focus-visible:ring-[#B45309]"
                  title="Click to open and manually assign this cell"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#252326]">
                      {u.batchName} · Period {u.periodIndex + 1}
                    </span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white text-[#92400E] border border-[#E9BF85]">
                      Unfilled: {u.reason}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#78350F]">
                    <span>
                      Required: <strong>{u.requiredSubject || 'Any'}</strong>
                    </span>
                    <span className="text-[10px] text-[#C2410C] font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                      Click to assign →
                    </span>
                  </div>
                  {u.candidateIssue && (
                    <p className="text-[10px] text-[#5E5B61] italic">{u.candidateIssue}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Modal>

      {/* Reopen Finalized Day Confirmation Modal */}
      <Modal
        isOpen={isReopenConfirmOpen}
        onClose={() => setIsReopenConfirmOpen(false)}
        title="Reopen Finalized Timetable?"
        subtitle="This timetable is locked as the official published schedule"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsReopenConfirmOpen(false)}>
              Keep Finalized
            </Button>
            <Button variant="primary" icon={<Unlock className="w-4 h-4" />} onClick={confirmReopenDay}>
              Reopen for Editing
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-xs text-[#252326]">
          <p>
            Reopening the <strong>{currentDay}</strong> timetable will change its status to <strong>Draft</strong> and allow manual edits or regeneration of unfrozen slots.
          </p>
          <p className="text-[#252326]/70">
            Frozen slots will continue to be preserved. Are you sure you want to unlock this day?
          </p>
        </div>
      </Modal>
    </div>
  );
}
