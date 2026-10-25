import { useState, useRef, useMemo } from 'react';
import {
  Calendar,
  Image as ImageIcon,
  Play,
  RefreshCw,
  FileText,
  FileSpreadsheet,
  CheckCircle,
  Lock,
  Search,
  Filter,
  AlertTriangle,
  Save,
  Trash2,
} from 'lucide-react';
import type { Faculty, Batch, Allocation, DayOfWeek, TimetableStatus } from '../types';
import { generateTimetableV2, patchAbsences } from '../utils/scheduler';
import { storage } from '../utils/storage';
import { SECTIONS, groupBatchesBySection } from '../utils/sections';
import { checkFacultyConflict } from '../utils/validation';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import Modal from '../components/ui/Modal';
import DayTabs from '../components/timetable/DayTabs';
import BalanceBar from '../components/timetable/BalanceBar';
import SectionTable from '../components/timetable/SectionTable';


const PCMB_SUBJECTS = ['Physics', 'Chemistry', 'Mathematics', 'Biology'];

interface SlotEditState {
  batch: Batch;
  periodIndex: number;
  currentAllocation?: Allocation;
  subject: string;
  facultyId: string;
  isFrozen: boolean;
}

export default function Timetable() {
  const [currentDay, setCurrentDay] = useState<DayOfWeek>('Monday');
  const [faculties, setFaculties] = useState<Faculty[]>(() => {
    storage.initialize();
    return storage.getFaculty();
  });
  const [batches, setBatches] = useState<Batch[]>(() => storage.getBatches());
  const [allocations, setAllocations] = useState<Allocation[]>(() => {
    const existing = storage.getDayTimetable('Monday');
    return existing?.allocations || [];
  });
  const [currentStatus, setCurrentStatus] = useState<TimetableStatus>(() => {
    const existing = storage.getDayTimetable('Monday');
    return existing?.status || 'Draft';
  });

  const [hasGenerated, setHasGenerated] = useState<boolean>(() => {
    return !!storage.getDayTimetable('Monday');
  });

  const [isExporting, setIsExporting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [activeSectionFilter, setActiveSectionFilter] = useState<string>('ALL');

  // Manual slot override state
  const [editingSlot, setEditingSlot] = useState<SlotEditState | null>(null);

  const pageRef = useRef<HTMLDivElement>(null);

  // Load day timetable when switching tabs
  const handleSelectDay = (day: DayOfWeek) => {
    setCurrentDay(day);
    setBatches(storage.getBatches());
    setFaculties(storage.getFaculty());
    const existing = storage.getDayTimetable(day);
    setAllocations(existing?.allocations || []);
    setCurrentStatus(existing?.status || 'Draft');
    setHasGenerated(!!existing);
  };

  const persistDay = (day: DayOfWeek, newAllocations: Allocation[], status: TimetableStatus = currentStatus) => {
    storage.setDayTimetable(day, {
      id: `tt_${day}`,
      date: day,
      status,
      allocations: newAllocations,
      lastGeneratedAt: Date.now(),
    });
  };

  const handleStatusChange = (newStatus: TimetableStatus) => {
    setCurrentStatus(newStatus);
    persistDay(currentDay, allocations, newStatus);
    storage.setTimetableStatus(currentDay, newStatus);
  };


  const handleGenerate = () => {
    if (currentStatus === 'Finalized') {
      const confirmRegen = confirm(
        `This timetable for ${currentDay} is marked as Finalized. Regenerating will replace unfrozen allocations. Do you want to proceed?`
      );
      if (!confirmRegen) return;
    }

    setIsGenerating(true);
    setTimeout(() => {
      const freshFaculties = storage.getFaculty();
      const freshBatches = storage.getBatches();
      setFaculties(freshFaculties);
      setBatches(freshBatches);

      const weekContext = storage.getWeekAllocationsExcluding(currentDay);
      const generated = generateTimetableV2(freshBatches, freshFaculties, allocations, weekContext);

      setAllocations(generated);
      setHasGenerated(true);
      setCurrentStatus('Draft');
      persistDay(currentDay, generated, 'Draft');
      setIsGenerating(false);
    }, 300);
  };

  const handleSyncAbsences = () => {
    setIsSyncing(true);
    setTimeout(() => {
      const freshFaculties = storage.getFaculty();
      setFaculties(freshFaculties);

      const patched = patchAbsences(batches, freshFaculties, allocations);
      setAllocations(patched);
      persistDay(currentDay, patched);
      setIsSyncing(false);
    }, 250);
  };

  const toggleFreeze = (batchId: string, periodIndex: number) => {
    const target = allocations.find(a => a.batchId === batchId && a.periodIndex === periodIndex);
    if (target) {
      storage.logAuditAction('FREEZE_TOGGLE', {
        batchId,
        periodIndex,
        newFacultyId: target.facultyId,
        day: currentDay,
        reason: target.frozen ? `Unfroze slot on ${currentDay}` : `Froze slot on ${currentDay}`,
      });
    }
    const updated = allocations.map(a =>
      a.batchId === batchId && a.periodIndex === periodIndex ? { ...a, frozen: !a.frozen } : a
    );
    setAllocations(updated);
    persistDay(currentDay, updated);
  };

  const getFacultyName = (id: string) => {
    if (!id) return 'Unassigned';
    return faculties.find(f => f.id === id)?.name || 'Unknown';
  };

  // Cell click handler to open the Manual Override dialog
  const handleCellClick = (batch: Batch, periodIndex: number) => {
    const existing = allocations.find(a => a.batchId === batch.id && a.periodIndex === periodIndex);
    const initialSubject = existing?.subject || (batch.subjects[0]?.subject || 'Physics');
    setEditingSlot({
      batch,
      periodIndex,
      currentAllocation: existing,
      subject: initialSubject,
      facultyId: existing?.facultyId || '',
      isFrozen: existing?.frozen || false,
    });
  };

  const handleSaveSlotOverride = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSlot) return;

    const { batch, periodIndex, subject, facultyId, isFrozen, currentAllocation } = editingSlot;
    const oldFacultyId = currentAllocation?.facultyId;

    const updatedAllocations = [...allocations];
    const existingIdx = updatedAllocations.findIndex(
      a => a.batchId === batch.id && a.periodIndex === periodIndex
    );


    if (!facultyId) {
      // Slot cleared to free period
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
      const newAlloc: Allocation = {
        batchId: batch.id,
        periodIndex,
        facultyId,
        subject,
        autoGenerated: false,
        manualEdited: true,
        frozen: isFrozen,
        explanation: [`Manual assignment: set by timetable administrator on ${new Date().toLocaleDateString()}`],
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
        reason: `Manually assigned ${facName} (${subject}) for batch ${batch.name}`,
      });
    }

    setAllocations(updatedAllocations);
    persistDay(currentDay, updatedAllocations);
    setEditingSlot(null);
  };

  // Helper to normalize any modern Tailwind v4 oklch colors for html2canvas
  const sanitizeClonedDocColors = (clonedDoc: Document) => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const normalize = (color: string): string => {
        if (!color || !color.includes('oklch')) return color;
        ctx.fillStyle = '#000000';
        ctx.fillStyle = color;
        return ctx.fillStyle;
      };

      const elements = clonedDoc.querySelectorAll('*');
      elements.forEach((node) => {
        const el = node as HTMLElement;
        if (!el.style) return;
        const comp = window.getComputedStyle(el);

        if (comp.backgroundColor && comp.backgroundColor.includes('oklch')) {
          el.style.backgroundColor = normalize(comp.backgroundColor);
        }
        if (comp.color && comp.color.includes('oklch')) {
          el.style.color = normalize(comp.color);
        }
        if (comp.borderColor && comp.borderColor.includes('oklch')) {
          el.style.borderColor = normalize(comp.borderColor);
        }
      });
    } catch (e) {
      console.warn('Color sanitization notice:', e);
    }
  };

  // Export as PNG
  const exportAsImage = async () => {
    if (!pageRef.current) return;
    setIsExporting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(pageRef.current, {
        scale: 2,
        backgroundColor: '#f8fafc',
        useCORS: true,
        logging: false,
        onclone: (clonedDoc) => sanitizeClonedDocColors(clonedDoc),
      });
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `Timetable_${currentDay}.png`;
      link.click();
    } catch (e) {
      console.error('Failed to export image', e);
      alert('Could not generate image export.');
    } finally {
      setIsExporting(false);
    }
  };

  // Export as PDF
  const exportAsPdf = async () => {
    if (!pageRef.current) return;
    setIsExporting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');

      const canvas = await html2canvas(pageRef.current, {
        scale: 1.5,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        onclone: (clonedDoc) => sanitizeClonedDocColors(clonedDoc),
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: [canvas.width, canvas.height],
      });
      pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
      pdf.save(`Timetable_${currentDay}.pdf`);
    } catch (e) {
      console.error('Failed to export PDF', e);
      alert('Could not generate PDF export.');
    } finally {
      setIsExporting(false);
    }
  };


  // Export as Excel (XLSX)
  const exportAsExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const rows: Record<string, string>[] = [];

      batches.forEach(b => {
        const row: Record<string, string> = {
          'Building': b.building,
          'Category': b.yearCategory,
          'Batch Name': b.name,
          'Room': b.roomNumber,
        };

        for (let i = 0; i < 6; i++) {
          const timing = b.periods[i];
          const timingStr = timing?.startTime ? `${timing.startTime}-${timing.endTime}` : '';
          const alloc = allocations.find(a => a.batchId === b.id && a.periodIndex === i);
          const facName = alloc?.facultyId ? getFacultyName(alloc.facultyId) : 'Free';
          row[`Period ${i + 1} (${timingStr})`] = alloc ? `${alloc.subject} (${facName})` : 'Free Period';
        }
        rows.push(row);
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, currentDay);
      XLSX.writeFile(wb, `Timetable_${currentDay}.xlsx`);
    } catch (e) {
      console.error('Failed to export Excel', e);
      alert('Could not export to Excel.');
    }
  };

  // Filter batches by search query and building section
  const filteredBatches = useMemo(() => {
    return batches.filter(b => {
      if (activeSectionFilter !== 'ALL' && !b.building.includes(activeSectionFilter)) return false;
      if (filterQuery) {
        const q = filterQuery.toLowerCase();
        return b.name.toLowerCase().includes(q) ||
               b.roomNumber.toLowerCase().includes(q) ||
               b.yearCategory.toLowerCase().includes(q);
      }
      return true;
    });
  }, [batches, activeSectionFilter, filterQuery]);

  const sectionedBatches = useMemo(() => groupBatchesBySection(filteredBatches), [filteredBatches]);

  const quota = useMemo(() => {
    // Current day's reactive allocations combined with other days in the week
    const otherDaysAllocations = storage.getWeekAllocationsExcluding(currentDay);
    const allWeeklyAllocations = [...otherDaysAllocations, ...allocations];

    let pcmb = 0;
    let lang = 0;
    allWeeklyAllocations.forEach(a => {
      if (!a.facultyId) return;
      if (PCMB_SUBJECTS.includes(a.subject)) pcmb++;
      else lang++;
    });
    const total = pcmb + lang;
    const settings = storage.getSettings();
    const actualPCMBPct = total === 0 ? 0 : Math.round((pcmb / total) * 100);
    return {
      pcmb,
      lang,
      targetPCMB: settings.pcmbWeight,
      targetLang: settings.languageWeight,
      actualPCMBPct,
      actualLangPct: total === 0 ? 0 : 100 - actualPCMBPct,
    };
  }, [allocations, currentDay]);


  const gapCount = allocations.filter(a => a.vacatedFacultyId && !a.facultyId).length;

  // Selected faculty conflict evaluation for the edit modal
  const conflictEvaluation = useMemo(() => {
    if (!editingSlot || !editingSlot.facultyId) return null;
    const selectedFac = faculties.find(f => f.id === editingSlot.facultyId);
    if (!selectedFac) return null;

    const settings = storage.getSettings();
    return checkFacultyConflict(
      selectedFac,
      editingSlot.batch.id,
      editingSlot.periodIndex,
      batches,
      allocations,
      settings.maxDailyPeriods
    );
  }, [editingSlot, faculties, batches, allocations]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[95rem] mx-auto space-y-6" ref={pageRef}>
      <PageHeader
        icon={<Calendar className="w-6 h-6" />}
        title="Weekly Academic Timetable"
        subtitle={`V2 Engine &middot; ${currentDay} &middot; Status: ${currentStatus}`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {/* Status toggle pill */}
            <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 text-xs font-semibold shadow-2xs">
              <span className="px-2 text-slate-400">Status:</span>
              <button
                type="button"
                onClick={() => handleStatusChange('Draft')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  currentStatus === 'Draft' ? 'bg-amber-100 text-amber-800' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Draft
              </button>
              <button
                type="button"
                onClick={() => handleStatusChange('Finalized')}
                className={`px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 ${
                  currentStatus === 'Finalized' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CheckCircle className="w-3 h-3" /> Finalized
              </button>
            </div>

            <Button
              variant="primary"
              icon={<Play className="w-4 h-4" />}
              loading={isGenerating}
              onClick={handleGenerate}
            >
              {hasGenerated ? 'Regenerate' : 'Generate'} {currentDay}
            </Button>

            <Button
              variant="secondary"
              icon={<RefreshCw className="w-4 h-4" />}
              loading={isSyncing}
              disabled={!hasGenerated}
              onClick={handleSyncAbsences}
              title="Re-check allocations against current teacher attendance"
            >
              Sync Absences
            </Button>

            {/* Export Dropdown Actions */}
            <Button
              variant="secondary"
              icon={<ImageIcon className="w-4 h-4" />}
              loading={isExporting}
              onClick={exportAsImage}
              title="Download high-resolution image"
            >
              PNG
            </Button>
            <Button
              variant="secondary"
              icon={<FileText className="w-4 h-4" />}
              loading={isExporting}
              onClick={exportAsPdf}
              title="Download printable PDF"
            >
              PDF
            </Button>
            <Button
              variant="secondary"
              icon={<FileSpreadsheet className="w-4 h-4" />}
              onClick={exportAsExcel}
              title="Export timetable to Excel spreadsheet"
            >
              Excel
            </Button>
          </div>
        }
      />

      <DayTabs
        currentDay={currentDay}
        onSelect={handleSelectDay}
        hasData={day => !!storage.getDayTimetable(day)}
      />

      <BalanceBar quota={quota} gapCount={gapCount} day={currentDay} />

      {/* Filter & Search Bar for Batches */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <Filter className="w-3.5 h-3.5 text-slate-400" /> Building:
          </div>
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
            <button
              onClick={() => setActiveSectionFilter('ALL')}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeSectionFilter === 'ALL' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
              }`}
            >
              All Sections
            </button>
            <button
              onClick={() => setActiveSectionFilter('Building 1')}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeSectionFilter === 'Building 1' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
              }`}
            >
              Building 1
            </button>
            <button
              onClick={() => setActiveSectionFilter('Building 2')}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeSectionFilter === 'Building 2' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
              }`}
            >
              Building 2
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Find batch name or room..."
              value={filterQuery}
              onChange={e => setFilterQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs outline-none bg-slate-50 focus:bg-white"
            />
          </div>
          {filterQuery && (
            <button
              onClick={() => setFilterQuery('')}
              className="text-xs text-indigo-600 font-semibold hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {!hasGenerated ? (
        <EmptyState
          icon={<Calendar className="w-10 h-10 text-indigo-300" />}
          title={`No timetable generated for ${currentDay} yet`}
          description={`Click "Generate ${currentDay}" above to calculate clash-free period allocations.`}
        />
      ) : (
        SECTIONS.map(section => {
          const sectionBatches = sectionedBatches[section.id];
          if (!sectionBatches || sectionBatches.length === 0) return null;
          return (
            <SectionTable
              key={section.id}
              label={section.label}
              batches={sectionBatches}
              allocations={allocations}
              getFacultyName={getFacultyName}
              onToggleFreeze={toggleFreeze}
              onCellClick={handleCellClick}
            />
          );
        })
      )}

      {/* Manual Slot Override Modal */}
      {editingSlot && (
        <Modal
          isOpen={true}
          onClose={() => setEditingSlot(null)}
          title={`Edit Period ${editingSlot.periodIndex + 1} &middot; ${editingSlot.batch.name}`}
          footer={
            <>
              {editingSlot.currentAllocation?.facultyId && (
                <Button
                  type="button"
                  variant="danger"
                  icon={<Trash2 className="w-4 h-4" />}
                  onClick={() => {
                    setEditingSlot({ ...editingSlot, facultyId: '' });
                  }}
                >
                  Clear Assignment
                </Button>
              )}
              <Button type="button" variant="secondary" onClick={() => setEditingSlot(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" icon={<Save className="w-4 h-4" />} form="slot-override-form">
                Save Allocation
              </Button>
            </>
          }
        >
          <form id="slot-override-form" onSubmit={handleSaveSlotOverride} className="space-y-4">
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Classroom &amp; Campus:</span>
                <span className="font-semibold text-slate-800">
                  Room {editingSlot.batch.roomNumber} &middot; {editingSlot.batch.building}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Period Timing:</span>
                <span className="font-semibold text-slate-800">
                  {editingSlot.batch.periods[editingSlot.periodIndex]?.startTime} –{' '}
                  {editingSlot.batch.periods[editingSlot.periodIndex]?.endTime}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase text-slate-500">Subject</label>
              <select
                value={editingSlot.subject}
                onChange={e => setEditingSlot({ ...editingSlot, subject: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white"
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
              <label className="text-xs font-semibold uppercase text-slate-500">
                Assigned Faculty Member
              </label>
              <select
                value={editingSlot.facultyId}
                onChange={e => setEditingSlot({ ...editingSlot, facultyId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white"
              >
                <option value="">-- No Faculty (Free Period) --</option>
                {faculties
                  .filter(f => f.subjects.includes(editingSlot.subject))
                  .map(f => {
                    const isAbsent = f.isAbsent;
                    return (
                      <option key={f.id} value={f.id}>
                        {f.name} {isAbsent ? '(ABSENT)' : ''}
                      </option>
                    );
                  })}
              </select>
              <p className="text-[11px] text-slate-400">
                Filtered by teachers qualified in &ldquo;{editingSlot.subject}&rdquo;.
              </p>
            </div>

            {/* Real-time Conflict Alert Box */}
            {conflictEvaluation?.hasConflict && (
              <div className="p-3 bg-amber-50 text-amber-900 border border-amber-200 rounded-xl text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Potential Schedule Conflict:</strong>
                  <p className="mt-0.5">{conflictEvaluation.message}</p>
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-slate-100">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={editingSlot.isFrozen}
                  onChange={e => setEditingSlot({ ...editingSlot, isFrozen: e.target.checked })}
                  className="w-4 h-4 text-amber-500 rounded"
                />
                <span className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-600" />
                  Freeze this slot (protect from automatic regeneration)
                </span>
              </label>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
