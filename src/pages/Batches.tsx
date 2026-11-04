import { useState, useRef, Fragment, useMemo } from 'react';
import {
  Plus,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronRight,
  Upload,
  AlertCircle,
  Building2,
  CheckCircle2,
  Layers,
  Clock,
  BookOpen,
  Save,
  AlertTriangle,
} from 'lucide-react';
import type { Batch, PeriodTiming, BatchSubject } from '../types';
import { storage } from '../utils/storage';
import {
  parseTimeMinutesStrict,
  normalizeTimeToHHmm,
  checkTimetableOverlaps,
  checkBatchRoomClashes,
  type TimetableOverlapConflict,
} from '../utils/validation';
import { inferSubjectCategory } from '../utils/seedData';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import SearchInput from '../components/ui/SearchInput';
import { useToast } from '../context/ToastContext';

const BUILDINGS = ['Building 1', 'Building 2'];

const DEFAULT_PERIODS: PeriodTiming[] = [
  { startTime: '08:30', endTime: '10:00' },
  { startTime: '10:15', endTime: '11:45' },
  { startTime: '12:00', endTime: '13:30' },
  { startTime: '14:15', endTime: '15:45' },
  { startTime: '', endTime: '' },
  { startTime: '', endTime: '' },
];

const DEFAULT_BATCH_SUBJECTS: BatchSubject[] = [
  { subject: 'Physics', count: 2, category: 'Core' },
  { subject: 'Chemistry', count: 2, category: 'Core' },
  { subject: 'Mathematics', count: 1, category: 'Core' },
  { subject: 'Biology', count: 1, category: 'Core' },
  { subject: 'English', count: 2, category: 'Language' },
  { subject: 'K/H/S', count: 2, category: 'Language' },
];

export default function Batches() {
  const { toast } = useToast();
  const [batches, setBatches] = useState<Batch[]>(() => {
    storage.initialize();
    return storage.getBatches();
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBuilding, setSelectedBuilding] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit / Add modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [modalBuilding, setModalBuilding] = useState('Building 1');
  const [modalYearCategory, setModalYearCategory] = useState('First PU');
  const [modalName, setModalName] = useState('');
  const [modalRoomNumber, setModalRoomNumber] = useState('');
  const [modalPeriods, setModalPeriods] = useState<PeriodTiming[]>(DEFAULT_PERIODS);
  const [modalSubjects, setModalSubjects] = useState<BatchSubject[]>(DEFAULT_BATCH_SUBJECTS);
  const [newSubjName, setNewSubjName] = useState('');
  const [newSubjCount, setNewSubjCount] = useState(1);

  // Delete confirmation modal state
  const [batchToDelete, setBatchToDelete] = useState<Batch | null>(null);

  // Timing Overlap Report State (H6)
  const [timingOverlapReport, setTimingOverlapReport] = useState<TimetableOverlapConflict[] | null>(null);

  // Room Clash Warnings State (N5)
  const roomClashWarnings = useMemo(() => {
    if (!modalRoomNumber.trim() || !modalBuilding) return [];
    const tempBatch: Batch = {
      id: editingBatchId || 'temp_batch_id',
      building: modalBuilding,
      yearCategory: modalYearCategory,
      name: modalName,
      roomNumber: modalRoomNumber.trim(),
      periods: modalPeriods,
      subjects: modalSubjects,
    };
    return checkBatchRoomClashes(tempBatch, batches);
  }, [modalRoomNumber, modalBuilding, modalPeriods, modalSubjects, modalYearCategory, modalName, editingBatchId, batches]);

  const saveToStorage = (updatedBatches: Batch[]) => {
    storage.setBatches(updatedBatches);
    setBatches(updatedBatches);
  };

  const getPeriodInlineError = (
    p: PeriodTiming,
    index: number,
    allPeriods: PeriodTiming[]
  ): string | null => {
    if (!p.startTime && !p.endTime) return null;
    if (p.startTime && !p.endTime) return 'Missing end time';
    if (!p.startTime && p.endTime) return 'Missing start time';

    const start = parseTimeMinutesStrict(p.startTime);
    const end = parseTimeMinutesStrict(p.endTime);

    if (start === null) return `Invalid start: "${p.startTime}"`;
    if (end === null) return `Invalid end: "${p.endTime}"`;
    if (start >= end) return 'Start must be before end';

    for (let prevIdx = index - 1; prevIdx >= 0; prevIdx--) {
      const prev = allPeriods[prevIdx];
      if (prev && prev.startTime && prev.endTime) {
        const prevEnd = parseTimeMinutesStrict(prev.endTime);
        if (prevEnd !== null && start < prevEnd) {
          return `Starts before P${prevIdx + 1} ends (${prev.endTime})`;
        }
        break;
      }
    }
    return null;
  };

  const validatePeriods = (timings: PeriodTiming[]): string | null => {
    const active = timings.filter(p => p.startTime && p.endTime);
    if (active.length === 0) {
      return 'At least one period timing with both start and end time must be configured.';
    }

    for (let i = 0; i < timings.length; i++) {
      const p = timings[i];
      if ((p.startTime && !p.endTime) || (!p.startTime && p.endTime)) {
        return `Period ${i + 1} must specify both start and end times, or leave both empty.`;
      }
      if (p.startTime && p.endTime) {
        const start = parseTimeMinutesStrict(p.startTime);
        const end = parseTimeMinutesStrict(p.endTime);
        if (start === null || end === null) {
          return `Period ${i + 1} has an invalid time format. Use HH:MM in 24-hour clock.`;
        }
        if (start >= end) {
          return `Period ${i + 1} start time (${p.startTime}) must be strictly before end time (${p.endTime}).`;
        }
      }
    }

    // Check chronological order between non-empty periods
    let lastEnd = -1;
    for (let i = 0; i < timings.length; i++) {
      const p = timings[i];
      if (p.startTime && p.endTime) {
        const start = parseTimeMinutesStrict(p.startTime)!;
        const end = parseTimeMinutesStrict(p.endTime)!;
        if (start < lastEnd) {
          return `Period ${i + 1} starts before the previous period finishes. Timings must be sequential.`;
        }
        lastEnd = end;
      }
    }
    return null;
  };

  const handleOpenAddModal = () => {
    setEditingBatchId(null);
    setModalBuilding(selectedBuilding !== 'ALL' ? selectedBuilding : 'Building 1');
    setModalYearCategory('First PU');
    setModalName('');
    setModalRoomNumber('');
    setModalPeriods(DEFAULT_PERIODS.map(p => ({ ...p })));
    setModalSubjects(DEFAULT_BATCH_SUBJECTS.map(s => ({ ...s })));
    setError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (batch: Batch) => {
    setEditingBatchId(batch.id);
    setModalBuilding(batch.building);
    setModalYearCategory(batch.yearCategory);
    setModalName(batch.name);
    setModalRoomNumber(batch.roomNumber);

    // Clone periods, padding to 6
    const padded = batch.periods.map(p => ({ ...p }));
    while (padded.length < 6) {
      padded.push({ startTime: '', endTime: '' });
    }
    setModalPeriods(padded);

    // Clone subjects
    const subjects = (batch.subjects && batch.subjects.length > 0 ? batch.subjects : DEFAULT_BATCH_SUBJECTS).map(s => ({
      ...s,
      category: s.category || inferSubjectCategory(s.subject),
    }));
    setModalSubjects(subjects);

    setError(null);
    setIsModalOpen(true);
  };

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = modalName.trim();
    if (!trimmedName) {
      setError('Please provide a descriptive batch name.');
      return;
    }

    const periodError = validatePeriods(modalPeriods);
    if (periodError) {
      setError(periodError);
      return;
    }

    if (modalSubjects.length === 0) {
      setError('At least one subject must be assigned to this batch.');
      return;
    }

    const normalizedPeriods = modalPeriods.map(p => ({
      startTime: p.startTime ? (normalizeTimeToHHmm(p.startTime) || p.startTime) : '',
      endTime: p.endTime ? (normalizeTimeToHHmm(p.endTime) || p.endTime) : '',
    }));
    const paddedPeriods = [...normalizedPeriods];
    while (paddedPeriods.length < 6) {
      paddedPeriods.push({ startTime: '', endTime: '' });
    }

    if (editingBatchId) {
      // Check if period timings changed (H6)
      const oldBatch = batches.find(b => b.id === editingBatchId);
      const timingsChanged =
        oldBatch &&
        (oldBatch.periods.length !== paddedPeriods.length ||
          oldBatch.periods.some(
            (p, idx) =>
              p.startTime !== paddedPeriods[idx]?.startTime || p.endTime !== paddedPeriods[idx]?.endTime
          ));

      // Update existing
      const updated = batches.map(b => {
        if (b.id !== editingBatchId) return b;
        return {
          ...b,
          building: modalBuilding,
          yearCategory: modalYearCategory,
          name: trimmedName,
          roomNumber: modalRoomNumber.trim(),
          periods: paddedPeriods,
          subjects: modalSubjects,
        };
      });
      saveToStorage(updated);

      if (timingsChanged) {
        // Re-validate stored allocations across all stored days for teacher overlaps (H6)
        const overlaps = checkTimetableOverlaps(
          storage.getWeekTimetables(),
          updated,
          storage.getFaculty()
        );
        if (overlaps.length > 0) {
          setTimingOverlapReport(overlaps);
          setSuccessMsg(
            `Batch "${trimmedName}" updated. WARNING: Timing modification caused ${overlaps.length} teacher schedule clash(es).`
          );
        } else {
          setSuccessMsg(
            `Batch "${trimmedName}" updated. Timetable allocations re-validated: 0 teacher overlaps.`
          );
        }
      } else {
        setSuccessMsg(
          roomClashWarnings.length > 0
            ? `Batch "${trimmedName}" updated. (Warning: Room ${modalRoomNumber.trim()} in ${modalBuilding} has overlapping period timings with ${Array.from(new Set(roomClashWarnings.map(w => w.otherBatchName))).join(', ')}).`
            : `Batch "${trimmedName}" updated successfully.`
        );
      }
    } else {
      // Create new
      const newBatch: Batch = {
        id: `batch_${crypto.randomUUID()}`,
        building: modalBuilding,
        yearCategory: modalYearCategory,
        name: trimmedName,
        roomNumber: modalRoomNumber.trim(),
        periods: paddedPeriods,
        subjects: modalSubjects,
      };
      saveToStorage([...batches, newBatch]);
      const msg = roomClashWarnings.length > 0
        ? `Batch "${trimmedName}" created. (Warning: Room ${modalRoomNumber.trim()} in ${modalBuilding} has overlapping period timings with ${Array.from(new Set(roomClashWarnings.map(w => w.otherBatchName))).join(', ')}).`
        : `Batch "${trimmedName}" created successfully.`;
      setSuccessMsg(msg);
      toast.success(`Batch "${trimmedName}" saved successfully.`);
    }

    setIsModalOpen(false);
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  const handleConfirmDelete = () => {
    if (!batchToDelete) return;
    const deletedId = batchToDelete.id;
    const deletedName = batchToDelete.name;

    // Use cascading deleteBatch from storage to clean faculty locks and allocations
    storage.deleteBatch(deletedId);
    setBatches(storage.getBatches());
    setBatchToDelete(null);
    setSuccessMsg(`Batch "${deletedName}" and related references safely removed.`);
    toast.success(`Batch "${deletedName}" safely removed.`);
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  // Subject helper inside modal
  const handleAddSubjectToModal = () => {
    const trimmed = newSubjName.trim();
    if (!trimmed) return;
    if (modalSubjects.some(s => s.subject.toLowerCase() === trimmed.toLowerCase())) {
      setError(`Subject "${trimmed}" is already present.`);
      return;
    }
    const category = inferSubjectCategory(trimmed);
    setModalSubjects([...modalSubjects, { subject: trimmed, count: Math.max(1, newSubjCount), category }]);
    setNewSubjName('');
    setNewSubjCount(1);
    setError(null);
  };

  const handleRemoveSubjectFromModal = (subjIndex: number) => {
    setModalSubjects(modalSubjects.filter((_, idx) => idx !== subjIndex));
  };

  const handleSubjectWeightChange = (subjIndex: number, newCount: number) => {
    setModalSubjects(
      modalSubjects.map((s, idx) => (idx === subjIndex ? { ...s, count: Math.max(1, newCount) } : s))
    );
  };

  // Import handler using ExcelJS or JSON
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const fileName = file.name.toLowerCase();
      const importedBatches: Batch[] = [];

      if (fileName.endsWith('.json')) {
        const text = await file.text();
        const json = JSON.parse(text);
        const list = Array.isArray(json) ? json : json.batches;
        if (!Array.isArray(list)) {
          throw new Error('JSON file must contain an array of batches or a "batches" array.');
        }

        for (const item of list) {
          if (!item.name) continue;
          const periods: PeriodTiming[] = Array.isArray(item.periods) ? item.periods : DEFAULT_PERIODS;
          while (periods.length < 6) periods.push({ startTime: '', endTime: '' });

          importedBatches.push({
            id: item.id || `batch_${crypto.randomUUID()}`,
            building: item.building || 'Building 1',
            yearCategory: item.yearCategory || 'First PU',
            name: String(item.name).trim(),
            roomNumber: String(item.roomNumber || '-').trim(),
            periods,
            subjects: Array.isArray(item.subjects) && item.subjects.length > 0
              ? item.subjects.map((s: BatchSubject) => ({
                  subject: s.subject,
                  count: s.count || 1,
                  category: s.category || inferSubjectCategory(s.subject),
                }))
              : DEFAULT_BATCH_SUBJECTS,
          });
        }
      } else {
        // ExcelJS import
        const ExcelJS = await import('exceljs');
        const buffer = await file.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const worksheet = workbook.worksheets[0];

        if (!worksheet) {
          throw new Error('Workbook contains no sheets.');
        }

        const headerRow = worksheet.getRow(1);
        const headers: string[] = [];
        headerRow.eachCell((cell, colNumber) => {
          headers[colNumber] = String(cell.value || '').trim();
        });

        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return; // skip header

          const rowData: Record<string, string> = {};
          row.eachCell((cell, colNumber) => {
            const h = headers[colNumber];
            if (h) rowData[h] = String(cell.text || cell.value || '').trim();
          });

          const name = rowData['Batch Name'] || rowData['Name'] || rowData['Batch'];
          if (!name) return;

          const periods: PeriodTiming[] = [];
          for (let pIdx = 1; pIdx <= 6; pIdx++) {
            const raw = rowData[`Period ${pIdx}`] || rowData[`P${pIdx}`] || '';
            if (!raw) {
              periods.push({ startTime: '', endTime: '' });
              continue;
            }
            const parts = raw.split(/[-–—]/);
            if (parts.length === 2) {
              periods.push({
                startTime: parts[0].trim(),
                endTime: parts[1].trim(),
              });
            } else {
              periods.push({ startTime: '', endTime: '' });
            }
          }

          importedBatches.push({
            id: `batch_${crypto.randomUUID()}`,
            building: rowData['Building'] || 'Building 1',
            yearCategory: rowData['Year / Category'] || rowData['Category'] || 'First PU',
            name,
            roomNumber: rowData['Room No.'] || rowData['Room'] || '-',
            periods,
            subjects: DEFAULT_BATCH_SUBJECTS,
          });
        });
      }

      if (importedBatches.length === 0) {
        throw new Error('No valid batch rows found in file.');
      }

      // Merge avoiding duplicate names
      const existingNames = new Set(batches.map(b => b.name.toLowerCase()));
      const toAdd = importedBatches.filter(b => !existingNames.has(b.name.toLowerCase()));

      saveToStorage([...batches, ...toAdd]);
      const msg = `Imported ${toAdd.length} new batch(es)${importedBatches.length > toAdd.length ? ` (${importedBatches.length - toAdd.length} duplicate names skipped)` : ''}.`;
      setSuccessMsg(msg);
      toast.success(msg);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Error importing batches file.';
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    batches.forEach(b => {
      if (b.yearCategory) set.add(b.yearCategory);
    });
    return Array.from(set).sort();
  }, [batches]);

  const filteredBatches = useMemo(() => {
    return batches.filter(b => {
      if (selectedBuilding !== 'ALL' && b.building !== selectedBuilding) return false;
      if (selectedCategory !== 'ALL' && b.yearCategory !== selectedCategory) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          b.name.toLowerCase().includes(q) ||
          b.roomNumber.toLowerCase().includes(q) ||
          b.yearCategory.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [batches, selectedBuilding, selectedCategory, searchQuery]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        icon={<Building2 className="w-5 h-5 text-[#6B2638]" />}
        title="Batches & Classrooms"
        subtitle={`${batches.length} academic sections, classroom allocations, and period schedules`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="file"
              accept=".xlsx,.xls,.json,.csv"
              className="hidden"
              ref={fileInputRef}
              onChange={handleImport}
            />
            <Button
              variant="secondary"
              icon={<Upload className="w-4 h-4" />}
              loading={isImporting}
              onClick={() => fileInputRef.current?.click()}
            >
              Import Data
            </Button>
            <Button
              variant="primary"
              icon={<Plus className="w-4 h-4" />}
              onClick={handleOpenAddModal}
            >
              Add New Batch
            </Button>
          </div>
        }
      />

      {error && (
        <div className="p-3.5 bg-[#FAF0F2] text-[#6B2638] border border-[#ECD9DE] rounded-md flex items-start gap-2.5 text-sm font-medium">
          <AlertCircle className="w-4 h-4 shrink-0 text-[#6B2638] mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 bg-[#F6F4F0] text-[#252326] border border-[#B08D57]/40 rounded-md flex items-center gap-2 text-sm font-medium">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-[#B08D57]" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Building & Category Filter Tabs + Search */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Building Pills */}
          <div className="inline-flex rounded-md bg-[#F3EEE6] p-0.5 text-xs font-medium select-none border border-[#A89B8A]/30">
            <button
              type="button"
              onClick={() => setSelectedBuilding('ALL')}
              className={`px-3 py-1.5 rounded transition-colors ${
                selectedBuilding === 'ALL'
                  ? 'bg-white text-[#6B2638] shadow-xs font-semibold'
                  : 'text-[#252326]/70 hover:text-[#252326]'
              }`}
            >
              All Buildings ({batches.length})
            </button>
            {BUILDINGS.map(b => (
              <button
                key={b}
                type="button"
                onClick={() => setSelectedBuilding(b)}
                className={`px-3 py-1.5 rounded transition-colors ${
                  selectedBuilding === b
                    ? 'bg-white text-[#6B2638] shadow-xs font-semibold'
                    : 'text-[#252326]/70 hover:text-[#252326]'
                }`}
              >
                {b} ({batches.filter(item => item.building === b).length})
              </button>
            ))}
          </div>

          {/* Category Dropdown Filter */}
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded border border-[#A89B8A]/30 bg-white text-[#252326] font-medium outline-none focus:border-[#6B2638]"
          >
            <option value="ALL">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search batches by name, room, or category..."
          className="w-full md:w-80"
        />
      </div>

      <Card padding={false} className="overflow-hidden border border-[#A89B8A]/30 shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F3EEE6] border-b border-[#A89B8A]/30 text-xs text-[#252326]/80 font-semibold uppercase tracking-wider">
                <th className="p-3.5 w-12 text-center"></th>
                <th className="p-3.5">Batch Name</th>
                <th className="p-3.5">Building</th>
                <th className="p-3.5">Academic Track</th>
                <th className="p-3.5">Room</th>
                <th className="p-3.5">Schedule</th>
                <th className="p-3.5">Curriculum</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#A89B8A]/20 text-sm">
              {filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center">
                    <Layers className="w-8 h-8 text-[#A89B8A] mx-auto mb-2" />
                    <p className="font-semibold text-[#252326] text-sm">No batches found</p>
                    <p className="text-xs text-[#252326]/60 mt-0.5">
                      Try adjusting the building or category filters or clearing the search.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredBatches.map(batch => {
                  const activePeriodCount = batch.periods.filter(p => p.startTime && p.endTime).length;
                  const isExpanded = expandedId === batch.id;
                  const subjectCount = (batch.subjects || []).length;

                  return (
                    <Fragment key={batch.id}>
                      <tr
                        className={`hover:bg-[#F3EEE6]/50 transition-colors ${
                          isExpanded ? 'bg-[#F3EEE6]/70' : ''
                        }`}
                      >
                        <td className="p-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : batch.id)}
                            className="p-1.5 rounded text-[#252326]/70 hover:text-[#6B2638] hover:bg-[#F3EEE6] transition-colors"
                            aria-label={isExpanded ? 'Collapse timings' : 'Expand timings'}
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-[#6B2638]" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                        <td className="p-3.5 font-bold text-[#252326]">{batch.name}</td>
                        <td className="p-3.5 text-[#252326]/80 text-xs font-medium">{batch.building}</td>
                        <td className="p-3.5">
                          <Badge tone="neutral">{batch.yearCategory}</Badge>
                        </td>
                        <td className="p-3.5 font-semibold text-[#252326]">
                          <span className="px-2 py-0.5 bg-[#F3EEE6] rounded text-xs border border-[#A89B8A]/30">
                            Room {batch.roomNumber || '-'}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <span className="text-xs font-medium text-[#252326]">
                            {activePeriodCount} period{activePeriodCount !== 1 ? 's' : ''}/day
                          </span>
                        </td>
                        <td className="p-3.5">
                          <span className="text-xs text-[#252326]/70">
                            {subjectCount} subjects
                          </span>
                        </td>
                        <td className="p-3.5 text-right space-x-1 whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenEditModal(batch)}
                            title="Edit Batch"
                          >
                            <Edit2 className="w-4 h-4 text-[#252326]/70 hover:text-[#6B2638]" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setBatchToDelete(batch)}
                            className="hover:text-[#6B2638] hover:bg-[#FAF0F2]"
                            title="Delete Batch"
                          >
                            <Trash2 className="w-4 h-4 text-[#6B2638]/80 hover:text-[#6B2638]" />
                          </Button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-[#F8F7F3]">
                          <td
                            colSpan={8}
                            className="p-4 sm:p-5 border-l-4 border-l-[#6B2638] border-t border-b border-[#A89B8A]/30 bg-[#F8F7F3]"
                          >
                            <div className="space-y-4">
                              {/* Timings */}
                              <div>
                                <div className="flex items-center gap-1.5 mb-2.5 text-xs font-bold text-[#252326] uppercase tracking-wide">
                                  <Clock className="w-3.5 h-3.5 text-[#B08D57]" />
                                  <span>Period Timings for {batch.name}</span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                                  {batch.periods.map((p, i) => (
                                    <div
                                      key={i}
                                      className={`p-2.5 rounded border text-center transition-all ${
                                        p.startTime && p.endTime
                                          ? 'bg-white border-[#A89B8A]/30 shadow-2xs'
                                          : 'bg-[#F3EEE6]/50 border-dashed border-[#A89B8A]/30 text-[#252326]/50'
                                      }`}
                                    >
                                      <div className="text-[11px] font-semibold text-[#6B2638] mb-0.5">
                                        Period {i + 1}
                                      </div>
                                      <div className="text-xs font-medium text-[#252326]">
                                        {p.startTime && p.endTime ? `${p.startTime} - ${p.endTime}` : 'No slot'}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Subjects Curriculum */}
                              <div>
                                <div className="flex items-center gap-1.5 mb-2.5 text-xs font-bold text-[#252326] uppercase tracking-wide">
                                  <BookOpen className="w-3.5 h-3.5 text-[#6B2638]" />
                                  <span>Curriculum & Weights</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {(batch.subjects || DEFAULT_BATCH_SUBJECTS).map((s, idx) => (
                                    <span
                                      key={idx}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-white border border-[#A89B8A]/30 text-xs text-[#252326]"
                                    >
                                      <span className="font-semibold">{s.subject}</span>
                                      <Badge tone={s.category === 'Core' ? 'burgundy' : 'gold'}>
                                        {s.category || 'Core'}
                                      </Badge>
                                      <span className="text-[11px] text-[#252326]/60">wt: {s.count}</span>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add / Edit Batch Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingBatchId ? 'Edit Batch Configuration' : 'Create New Academic Batch'}
        subtitle="Manage batch profile, classroom assignment, period timings, and subject weights"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon={<Save className="w-4 h-4" />} onClick={handleSaveModal}>
              {editingBatchId ? 'Save Changes' : 'Create Batch'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSaveModal} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="batch-building" className="text-xs font-semibold text-[#252326]">Campus Building</label>
              <select
                id="batch-building"
                value={modalBuilding}
                onChange={e => setModalBuilding(e.target.value)}
                className="w-full px-3 py-2 border border-[#A89B8A]/40 rounded-md text-sm bg-white focus:border-[#6B2638] outline-none text-[#252326]"
              >
                {BUILDINGS.map(b => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="batch-track" className="text-xs font-semibold text-[#252326]">Academic Track / Category</label>
              <input
                id="batch-track"
                list="years-list"
                value={modalYearCategory}
                onChange={e => setModalYearCategory(e.target.value)}
                className="w-full px-3 py-2 border border-[#A89B8A]/40 rounded-md text-sm bg-white focus:border-[#6B2638] outline-none text-[#252326]"
                required
                placeholder="e.g. First PU"
              />
              <datalist id="years-list">
                <option value="First PU" />
                <option value="Second PU" />
                <option value="Second PU (AIIMS)" />
                <option value="NLT" />
              </datalist>
            </div>

            <div className="space-y-1">
              <label htmlFor="batch-name" className="text-xs font-semibold text-[#252326]">Batch Name</label>
              <input
                id="batch-name"
                value={modalName}
                onChange={e => setModalName(e.target.value)}
                className="w-full px-3 py-2 border border-[#A89B8A]/40 rounded-md text-sm bg-white focus:border-[#6B2638] outline-none text-[#252326]"
                required
                placeholder="e.g. Lakshya 10"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="batch-room" className="text-xs font-semibold text-[#252326]">Room Number</label>
              <input
                id="batch-room"
                value={modalRoomNumber}
                onChange={e => setModalRoomNumber(e.target.value)}
                className="w-full px-3 py-2 border border-[#A89B8A]/40 rounded-md text-sm bg-white focus:border-[#6B2638] outline-none text-[#252326]"
                required
                placeholder="e.g. 204(A)"
              />
            </div>
          </div>

          {/* Room Schedule Clash Warning (N5) */}
          {roomClashWarnings.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-md text-xs text-amber-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-amber-950">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>Room Schedule Overlap Warning</span>
              </div>
              <p>
                Room {modalRoomNumber} in {modalBuilding} has overlapping period timings with{' '}
                <strong>{Array.from(new Set(roomClashWarnings.map(w => w.otherBatchName))).join(', ')}</strong>.
              </p>
            </div>
          )}

          {/* Period Timings */}
          <div className="border-t border-[#A89B8A]/30 pt-4 space-y-2.5">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-[#252326] uppercase tracking-wide">
                Daily Period Timings (24-Hour Clock HH:MM)
              </label>
              <span className="text-[11px] text-[#252326]/60">Leave empty for unused periods</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {modalPeriods.map((period, i) => {
                const inlineError = getPeriodInlineError(period, i, modalPeriods);
                return (
                  <div
                    key={i}
                    className={`p-2.5 rounded border space-y-1 text-center transition-colors ${
                      inlineError
                        ? 'bg-[#FAF0F2] border-[#ECD9DE]'
                        : 'bg-[#F3EEE6]/70 border-[#A89B8A]/30'
                    }`}
                  >
                    <div className="text-[11px] font-semibold text-[#6B2638]">Period {i + 1}</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="text"
                        placeholder="HH:mm"
                        value={period.startTime}
                        aria-label={`Period ${i + 1} start time`}
                        onChange={e => {
                          const newP = [...modalPeriods];
                          newP[i] = { ...newP[i], startTime: e.target.value };
                          setModalPeriods(newP);
                        }}
                        className={`w-full text-xs p-1.5 border rounded bg-white text-center outline-none text-[#252326] ${
                          inlineError ? 'border-[#A63232] focus:border-[#A63232]' : 'border-[#A89B8A]/30 focus:border-[#6B2638]'
                        }`}
                        title="Start Time"
                      />
                      <input
                        type="text"
                        placeholder="HH:mm"
                        value={period.endTime}
                        aria-label={`Period ${i + 1} end time`}
                        onChange={e => {
                          const newP = [...modalPeriods];
                          newP[i] = { ...newP[i], endTime: e.target.value };
                          setModalPeriods(newP);
                        }}
                        className={`w-full text-xs p-1.5 border rounded bg-white text-center outline-none text-[#252326] ${
                          inlineError ? 'border-[#A63232] focus:border-[#A63232]' : 'border-[#A89B8A]/30 focus:border-[#6B2638]'
                        }`}
                        title="End Time"
                      />
                    </div>
                    {inlineError && (
                      <p className="text-[10px] text-[#A63232] font-semibold leading-tight mt-0.5">
                        {inlineError}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Curriculum Subjects */}
          <div className="border-t border-[#A89B8A]/30 pt-4 space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-[#252326] uppercase tracking-wide">
                Assigned Subjects & Relative Weights
              </label>
              <span className="text-[11px] text-[#252326]/60">Weights determine weekly distribution ratio</span>
            </div>

            <div className="space-y-2">
              {modalSubjects.map((s, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-3 p-2 rounded bg-white border border-[#A89B8A]/30"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-[#252326]">{s.subject}</span>
                    <Badge tone={s.category === 'Core' ? 'burgundy' : 'gold'}>
                      {s.category || 'Core'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <label htmlFor={`subject-weight-${idx}`} className="text-xs text-[#252326]/70 flex items-center gap-1.5 cursor-pointer">
                      <span>Weight:</span>
                      <input
                        id={`subject-weight-${idx}`}
                        type="number"
                        min={1}
                        max={10}
                        value={s.count}
                        onChange={e => handleSubjectWeightChange(idx, parseInt(e.target.value) || 1)}
                        className="w-14 px-2 py-1 text-xs border border-[#A89B8A]/30 rounded bg-[#F8F7F3] text-center font-bold text-[#252326] focus:border-[#6B2638] outline-none"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => handleRemoveSubjectFromModal(idx)}
                      className="text-[#6B2638]/70 hover:text-[#6B2638] p-1 rounded"
                      title="Remove Subject"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add Subject Row */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                placeholder="Subject name (e.g. Statistics)"
                value={newSubjName}
                onChange={e => setNewSubjName(e.target.value)}
                className="flex-1 px-3 py-1.5 border border-[#A89B8A]/40 rounded text-xs bg-white text-[#252326] outline-none focus:border-[#6B2638]"
              />
              <input
                type="number"
                min={1}
                max={10}
                placeholder="Wt"
                value={newSubjCount}
                onChange={e => setNewSubjCount(parseInt(e.target.value) || 1)}
                className="w-16 px-2 py-1.5 border border-[#A89B8A]/40 rounded text-xs bg-white text-[#252326] text-center outline-none focus:border-[#6B2638]"
              />
              <Button size="sm" variant="secondary" icon={<Plus className="w-3.5 h-3.5" />} onClick={handleAddSubjectToModal}>
                Add Subject
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Safe Batch Deletion Confirmation Modal */}
      <ConfirmDialog
        isOpen={!!batchToDelete}
        onClose={() => setBatchToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Confirm Safe Batch Deletion"
        variant="danger"
        confirmText="Permanently Delete Batch"
        message={
          batchToDelete ? (
            <div className="space-y-3">
              <div className="p-3 bg-[#FAF0F2] border border-[#ECD9DE] rounded-md flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-[#6B2638] shrink-0 mt-0.5" />
                <div className="text-xs text-[#252326] space-y-1">
                  <p className="font-semibold text-[#6B2638]">
                    You are about to delete batch "{batchToDelete.name}" ({batchToDelete.building}, Room {batchToDelete.roomNumber}).
                  </p>
                  <p>
                    This action will remove all scheduled allocations for this batch across all weekly timetables and cleanly unlock any faculty members currently pinned to it.
                  </p>
                </div>
              </div>
              <p className="text-xs text-[#252326]/70">
                This operation cannot be reversed unless you have a full system backup export.
              </p>
            </div>
          ) : null
        }
      />

      {/* Timing Overlap Report Modal (H6) */}
      <Modal
        isOpen={Boolean(timingOverlapReport)}
        onClose={() => setTimingOverlapReport(null)}
        title="Teacher Schedule Overlaps Detected"
        subtitle="Batch timing modifications conflict with existing timetable allocations"
        maxWidth="lg"
        footer={
          <Button variant="secondary" onClick={() => setTimingOverlapReport(null)}>
            Dismiss Report
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="p-3 bg-[#FAF0F2] border border-[#ECD9DE] rounded text-xs text-[#6B2638] flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong>Timing Modification Conflict Alert:</strong>
              <p className="mt-0.5 text-[#252326]">
                The updated period timings conflict with scheduled teacher assignments on the following days. Please regenerate or manually adjust these slots on the Timetable page.
              </p>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto border border-[#E5E0D8] rounded divide-y divide-[#E5E0D8]">
            {timingOverlapReport?.map((conflict, idx) => (
              <div key={idx} className="p-3 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#252326]">{conflict.facultyName}</span>
                  <Badge tone="danger">{conflict.day}</Badge>
                </div>
                <div className="text-[#5E5B61]">
                  <strong>{conflict.batch1Name}</strong> (P{conflict.period1 + 1}: {conflict.timing1}) overlaps with{' '}
                  <strong>{conflict.batch2Name}</strong> (P{conflict.period2 + 1}: {conflict.timing2})
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
