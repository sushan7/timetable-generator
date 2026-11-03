import { useState, useMemo } from 'react';
import {
  Users,
  Plus,
  Trash2,
  Edit2,
  Upload,
  UserMinus,
  UserCheck,
  Link2,
  X,
  CheckCheck,
  GitMerge,
  Save,
  Calendar,
} from 'lucide-react';
import type { Faculty, Batch, DayOfWeek } from '../types';
import { WEEKDAYS } from '../types';
import { storage } from '../utils/storage';
import { isFacultyAbsent } from '../utils/constraints';
import { validateFacultyRecord } from '../utils/validation';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import SearchInput from '../components/ui/SearchInput';

interface ImportValidationResult {
  total: number;
  valid: Faculty[];
  invalid: { record: unknown; reason: string }[];
  duplicates: { name: string; existingId: string }[];
}

export default function FacultyManager() {
  const [faculties, setFaculties] = useState<Faculty[]>(() => {
    storage.initialize();
    return storage.getFaculty();
  });
  const [allBatches] = useState<Batch[]>(() => storage.getBatches());
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>('Monday');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PRESENT' | 'ABSENT'>('ALL');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Edit / Create Faculty State
  const [isEditing, setIsEditing] = useState(false);
  const [currentFaculty, setCurrentFaculty] = useState<Partial<Faculty>>({
    name: '',
    subjects: [],
    maxPeriodsPerDay: 4,
    isAbsent: false,
    absentDays: [],
    assignedBatches: [],
  });
  const [subjectInput, setSubjectInput] = useState('');
  const [batchSearch, setBatchSearch] = useState('');

  // Delete Confirmation State (H6)
  const [deletingFaculty, setDeletingFaculty] = useState<Faculty | null>(null);

  // Import Preview State (H7)
  const [importPreview, setImportPreview] = useState<ImportValidationResult | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);

  // Add Faculty Duplicate Warning State (M8)
  const [duplicateAddWarning, setDuplicateAddWarning] = useState<{
    existing: Faculty;
    pendingName: string;
    pendingSubjects: string[];
  } | null>(null);

  // Mark All Present Modal
  const [showMarkAllPresentConfirm, setShowMarkAllPresentConfirm] = useState(false);

  // Duplicate Resolution State (M8)
  const [showDuplicateResolutionModal, setShowDuplicateResolutionModal] = useState(false);

  const saveToStorage = (updated: Faculty[]) => {
    setFaculties(updated);
    storage.setFaculty(updated);
  };

  const toggleAbsent = (id: string, day: DayOfWeek = selectedDay) => {
    const target = faculties.find(f => f.id === id);
    if (!target) return;

    const currentlyAbsent = isFacultyAbsent(target, day);
    const existingDays = target.absentDays ? [...target.absentDays] : target.isAbsent ? [...WEEKDAYS] : [];
    const nextDays = currentlyAbsent
      ? existingDays.filter(d => d !== day)
      : Array.from(new Set([...existingDays, day]));

    const updated = faculties.map(f =>
      f.id === id
        ? {
            ...f,
            absentDays: nextDays,
            isAbsent: nextDays.length > 0,
          }
        : f
    );
    saveToStorage(updated);
    storage.logAuditAction('STATUS_CHANGE', {
      reason: `Marked teacher ${target.name} as ${!currentlyAbsent ? 'Absent' : 'Present'} for ${day}.`,
    });
  };

  const handleConfirmMarkAllPresent = (allDays = false) => {
    const updated = faculties.map(f => {
      if (allDays) {
        return {
          ...f,
          absentDays: [],
          isAbsent: false,
        };
      }
      const remainingDays = (f.absentDays || (f.isAbsent ? [...WEEKDAYS] : [])).filter(d => d !== selectedDay);
      return {
        ...f,
        absentDays: remainingDays,
        isAbsent: remainingDays.length > 0,
      };
    });
    saveToStorage(updated);
    setShowMarkAllPresentConfirm(false);
    setFeedback({
      type: 'success',
      text: allDays
        ? 'All faculty members marked as Present across all days.'
        : `All faculty members marked as Present for ${selectedDay}.`,
    });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleSaveFaculty = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = currentFaculty.name?.trim();
    if (!trimmedName) return;

    // Detect case-insensitive duplicate names on Add / Edit (M8)
    const existingDupe = faculties.find(
      f => f.name.trim().toLowerCase() === trimmedName.toLowerCase() && f.id !== currentFaculty.id
    );

    if (existingDupe && !duplicateAddWarning) {
      setDuplicateAddWarning({
        existing: existingDupe,
        pendingName: trimmedName,
        pendingSubjects:
          currentFaculty.subjects && currentFaculty.subjects.length > 0
            ? currentFaculty.subjects
            : ['General Studies'],
      });
      return;
    }

    if (currentFaculty.id) {
      saveToStorage(
        faculties.map(f => (f.id === currentFaculty.id ? (currentFaculty as Faculty) : f))
      );
      storage.logAuditAction('FACULTY_UPDATE', {
        reason: `Updated faculty profile for ${currentFaculty.name}.`,
      });
      setFeedback({ type: 'success', text: `Updated ${currentFaculty.name}'s profile.` });
    } else {
      const newFaculty: Faculty = {
        id: `fac_${crypto.randomUUID()}`,
        name: trimmedName,
        subjects:
          currentFaculty.subjects && currentFaculty.subjects.length > 0
            ? currentFaculty.subjects
            : ['General Studies'],
        maxPeriodsPerDay: currentFaculty.maxPeriodsPerDay || 4,
        isAbsent: false,
        absentDays: currentFaculty.absentDays || [],
        assignedBatches: currentFaculty.assignedBatches || [],
      };
      saveToStorage([...faculties, newFaculty]);
      storage.logAuditAction('FACULTY_CREATE', {
        reason: `Created faculty profile for ${newFaculty.name}.`,
      });
      setFeedback({ type: 'success', text: `Added ${newFaculty.name} to directory.` });
    }
    setTimeout(() => setFeedback(null), 3000);
    handleCloseModal();
  };

  const handleConfirmDelete = () => {
    if (!deletingFaculty) return;
    const res = storage.deleteFaculty(deletingFaculty.id);
    setFaculties(storage.getFaculty());
    setDeletingFaculty(null);
    setFeedback({
      type: 'success',
      text: `Removed ${deletingFaculty.name}. Turned ${res.allocationsAffected} timetable slot(s) into unfilled shortage slots.`,
    });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleOpenEdit = (faculty?: Faculty) => {
    setCurrentFaculty(
      faculty
        ? { ...faculty, assignedBatches: faculty.assignedBatches || [], absentDays: faculty.absentDays || [] }
        : { name: '', subjects: [], maxPeriodsPerDay: 4, isAbsent: false, absentDays: [], assignedBatches: [] }
    );
    setBatchSearch('');
    setIsEditing(true);
  };

  const handleCloseModal = () => {
    setIsEditing(false);
    setCurrentFaculty({ name: '', subjects: [], maxPeriodsPerDay: 4, isAbsent: false, absentDays: [], assignedBatches: [] });
    setSubjectInput('');
    setBatchSearch('');
  };

  const handleAddSubject = () => {
    if (!subjectInput.trim()) return;
    const currentSubjects = currentFaculty.subjects || [];
    if (!currentSubjects.includes(subjectInput.trim())) {
      setCurrentFaculty({ ...currentFaculty, subjects: [...currentSubjects, subjectInput.trim()] });
    }
    setSubjectInput('');
  };

  const handleRemoveSubject = (subj: string) => {
    setCurrentFaculty({
      ...currentFaculty,
      subjects: (currentFaculty.subjects || []).filter(s => s !== subj),
    });
  };

  const toggleAssignedBatch = (batchId: string) => {
    const current = currentFaculty.assignedBatches || [];
    const updated = current.includes(batchId)
      ? current.filter(id => id !== batchId)
      : [...current, batchId];
    setCurrentFaculty({ ...currentFaculty, assignedBatches: updated });
  };

  // Validated File Upload with Hand-written Schema (H7)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      setFeedback({ type: 'error', text: 'Invalid file format. Please upload a .json file.' });
      setTimeout(() => setFeedback(null), 4000);
      return;
    }

    const reader = new FileReader();
    reader.onload = event => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (!Array.isArray(json)) {
          setFeedback({
            type: 'error',
            text: `JSON structure error: Expected a JSON array of faculty objects. Received: ${typeof json}.`,
          });
          setTimeout(() => setFeedback(null), 5000);
          return;
        }

        const valid: Faculty[] = [];
        const invalid: { record: unknown; reason: string }[] = [];
        const duplicates: { name: string; existingId: string }[] = [];

        const existingNames = new Map(faculties.map(f => [f.name.trim().toLowerCase(), f.id]));

        json.forEach((item, idx) => {
          const res = validateFacultyRecord(item, idx);
          if (!res.valid) {
            invalid.push({ record: item, reason: res.reason });
            return;
          }

          const faculty = res.faculty;
          const normName = faculty.name.trim().toLowerCase();
          if (existingNames.has(normName)) {
            duplicates.push({ name: faculty.name, existingId: existingNames.get(normName)! });
          }
          valid.push(faculty);
        });

        setImportPreview({
          total: json.length,
          valid,
          invalid,
          duplicates,
        });
      } catch (err) {
        setFeedback({ type: 'error', text: `Failed to parse JSON file: ${err}` });
        setTimeout(() => setFeedback(null), 4000);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleApplyImport = () => {
    if (!importPreview) return;
    if (importMode === 'replace') {
      setShowReplaceConfirm(true);
      return;
    }

    // Merge mode: match by id or case-insensitive name (H7)
    const updated = [...faculties];
    importPreview.valid.forEach(imported => {
      const matchIndex = updated.findIndex(
        f => f.id === imported.id || f.name.trim().toLowerCase() === imported.name.trim().toLowerCase()
      );
      if (matchIndex >= 0) {
        const existing = updated[matchIndex];
        const combinedSubjects = Array.from(new Set([...existing.subjects, ...imported.subjects]));
        const combinedBatches = Array.from(
          new Set([...(existing.assignedBatches || []), ...(imported.assignedBatches || [])])
        );
        updated[matchIndex] = {
          ...existing,
          subjects: combinedSubjects,
          assignedBatches: combinedBatches,
          maxPeriodsPerDay: imported.maxPeriodsPerDay ?? existing.maxPeriodsPerDay,
          isAbsent: imported.isAbsent ?? existing.isAbsent,
          absentDays:
            imported.absentDays && imported.absentDays.length > 0
              ? imported.absentDays
              : existing.absentDays,
        };
      } else {
        updated.push(imported);
      }
    });

    saveToStorage(updated);
    setFeedback({
      type: 'success',
      text: `Merged ${importPreview.valid.length} imported profiles with existing faculty directory.`,
    });
    setImportPreview(null);
    setTimeout(() => setFeedback(null), 4000);
  };

  // Duplicate Faculty Detection (M8)
  const duplicateGroups = useMemo(() => {
    const map = new Map<string, Faculty[]>();
    faculties.forEach(f => {
      const norm = f.name.trim().toLowerCase();
      const list = map.get(norm) || [];
      list.push(f);
      map.set(norm, list);
    });
    return Array.from(map.entries()).filter(([, list]) => list.length > 1);
  }, [faculties]);

  const handleMergeSingleGroup = (dupes: Faculty[]) => {
    if (dupes.length < 2) return;
    const primary = dupes[0];
    const secondaries = dupes.slice(1).map(d => d.id);
    const res = storage.mergeFaculty(primary.id, secondaries);
    if (res.success) {
      setFaculties(storage.getFaculty());
      setFeedback({
        type: 'success',
        text: `Merged duplicate profiles for "${primary.name}" into unified record.`,
      });
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const handleMergeDuplicates = () => {
    let totalMerged = 0;
    duplicateGroups.forEach(([, dupes]) => {
      if (dupes.length >= 2) {
        const primary = dupes[0];
        const secondaries = dupes.slice(1).map(d => d.id);
        const res = storage.mergeFaculty(primary.id, secondaries);
        if (res.success) totalMerged++;
      }
    });

    setFaculties(storage.getFaculty());
    setShowDuplicateResolutionModal(false);
    setFeedback({
      type: 'success',
      text: `Successfully merged ${totalMerged} duplicate faculty group(s) into unified records.`,
    });
    setTimeout(() => setFeedback(null), 4000);
  };

  const allSubjects = useMemo(() => {
    const set = new Set<string>();
    faculties.forEach(f => f.subjects.forEach(s => set.add(s)));
    return Array.from(set).sort();
  }, [faculties]);

  const presentCount = faculties.filter(f => !isFacultyAbsent(f, selectedDay)).length;
  const absentCount = faculties.filter(f => isFacultyAbsent(f, selectedDay)).length;
  const lockedCount = faculties.filter(f => f.assignedBatches && f.assignedBatches.length > 0).length;

  const filteredFaculties = useMemo(() => {
    return faculties.filter(f => {
      const isAbsent = isFacultyAbsent(f, selectedDay);
      if (statusFilter === 'PRESENT' && isAbsent) return false;
      if (statusFilter === 'ABSENT' && !isAbsent) return false;
      if (selectedSubject !== 'ALL' && !f.subjects.includes(selectedSubject)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesName = f.name.toLowerCase().includes(q);
        const matchesSubj = f.subjects.some(s => s.toLowerCase().includes(q));
        if (!matchesName && !matchesSubj) return false;
      }
      return true;
    });
  }, [faculties, statusFilter, selectedSubject, searchQuery, selectedDay]);

  const filteredBatchOptions = allBatches.filter(
    b =>
      b.name.toLowerCase().includes(batchSearch.toLowerCase()) ||
      b.roomNumber.toLowerCase().includes(batchSearch.toLowerCase())
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        icon={<Users className="w-5 h-5" />}
        title="Faculty Directory"
        subtitle={`${faculties.length} professors and lecturers registered across academic departments`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {absentCount > 0 && (
              <Button
                variant="secondary"
                icon={<CheckCheck className="w-4 h-4 text-[#6B2638]" />}
                onClick={() => setShowMarkAllPresentConfirm(true)}
                title="Clear all absence marks"
              >
                Mark All Present
              </Button>
            )}
            <label>
              <Button
                variant="secondary"
                icon={<Upload className="w-4 h-4" />}
                type="button"
                onClick={() => document.getElementById('faculty-json-input')?.click()}
              >
                Import JSON
              </Button>
              <input
                id="faculty-json-input"
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            <Button
              variant="primary"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => handleOpenEdit()}
            >
              Add Faculty
            </Button>
          </div>
        }
      />

      {/* Duplicate Faculty Alert Banner (M8) */}
      {duplicateGroups.length > 0 && (
        <div className="p-4 bg-[#F8F3EA] border border-[#E7D7BD] rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-2.5">
            <GitMerge className="w-4 h-4 text-[#B08D57] shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold text-[#7A5B28]">
                Possible duplicates ({duplicateGroups.length})
              </strong>
              <p className="text-[#7A5B28]/90 mt-0.5 leading-relaxed">
                Found identical names split across subjects (e.g.{' '}
                {duplicateGroups.slice(0, 3).map(([name]) => name.toUpperCase()).join(', ')}).
                Review and merge to combine their qualified subjects into single master profiles.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="gold"
            icon={<GitMerge className="w-3.5 h-3.5" />}
            onClick={() => setShowDuplicateResolutionModal(true)}
            className="shrink-0"
          >
            Review & Merge
          </Button>
        </div>
      )}

      {/* M3: Per-Day Attendance Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-white rounded-lg border border-[#E5E0D8] shadow-2xs">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#6B2638]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-[#5E5B61]">Attendance Day:</span>
          <span className="text-xs font-bold text-[#6B2638] bg-[#F5EBEE] px-2 py-0.5 rounded border border-[#E6D1D6]">{selectedDay}</span>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-0.5">
          {WEEKDAYS.map(day => {
            const dayAbsentCount = faculties.filter(f => isFacultyAbsent(f, day)).length;
            const isSelected = selectedDay === day;
            return (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDay(day)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 shrink-0 ${
                  isSelected
                    ? 'bg-[#6B2638] text-white shadow-xs font-semibold'
                    : 'bg-[#FAF7F2] text-[#5E5B61] hover:bg-[#F3EBEF] hover:text-[#6B2638] border border-[#E5E0D8]'
                }`}
              >
                <span>{day}</span>
                {dayAbsentCount > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-[#FDF2F2] text-[#A63232] border border-[#F6CECE]'
                    }`}
                    title={`${dayAbsentCount} absent on ${day}`}
                  >
                    {dayAbsentCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card padding={false} className="p-4 border-[#E5E0D8]">
          <div className="text-xs font-medium text-[#5E5B61]">Total Directory</div>
          <div className="text-2xl font-bold text-[#252326] mt-1">{faculties.length}</div>
        </Card>
        <Card
          padding={false}
          className={`p-4 cursor-pointer transition-colors border-[#E5E0D8] ${
            statusFilter === 'PRESENT' ? 'border-[#6B2638] bg-[#F5EBEE]/60' : ''
          }`}
          onClick={() => setStatusFilter(prev => (prev === 'PRESENT' ? 'ALL' : 'PRESENT'))}
        >
          <div className="text-xs font-medium text-[#6B2638] flex items-center justify-between">
            <span>Present ({selectedDay.slice(0, 3)})</span>
            <UserCheck className="w-3.5 h-3.5 text-[#6B2638]" />
          </div>
          <div className="text-2xl font-bold text-[#252326] mt-1">{presentCount}</div>
        </Card>
        <Card
          padding={false}
          className={`p-4 cursor-pointer transition-colors border-[#E5E0D8] ${
            statusFilter === 'ABSENT' ? 'border-[#F6CECE] bg-[#FDF2F2]' : ''
          }`}
          onClick={() => setStatusFilter(prev => (prev === 'ABSENT' ? 'ALL' : 'ABSENT'))}
        >
          <div className="text-xs font-medium text-[#A63232] flex items-center justify-between">
            <span>Absent ({selectedDay.slice(0, 3)})</span>
            <UserMinus className="w-3.5 h-3.5 text-[#A63232]" />
          </div>
          <div className="text-2xl font-bold text-[#A63232] mt-1">{absentCount}</div>
        </Card>
        <Card padding={false} className="p-4 border-[#E5E0D8]">
          <div className="text-xs font-medium text-[#B08D57] flex items-center justify-between">
            <span>Batch Restricted</span>
            <Link2 className="w-3.5 h-3.5 text-[#B08D57]" />
          </div>
          <div className="text-2xl font-bold text-[#252326] mt-1">{lockedCount}</div>
        </Card>
      </div>

      {feedback && (
        <div
          className={`text-sm font-medium px-4 py-2.5 rounded border ${
            feedback.type === 'success'
              ? 'bg-[#EEF5F0] text-[#235732] border-[#C6DEC9]'
              : 'bg-[#FDF2F2] text-[#A63232] border-[#F6CECE]'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Search & Subject Filter Bar */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search by instructor name or subject..."
            className="w-full sm:w-80"
          />

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md bg-[#FAF7F2] p-0.5 text-xs font-medium border border-[#E5E0D8]">
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className={`px-3 py-1 rounded transition-colors ${
                  statusFilter === 'ALL' ? 'bg-white shadow-2xs text-[#252326] font-semibold' : 'text-[#5E5B61] hover:text-[#252326]'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('PRESENT')}
                className={`px-3 py-1 rounded transition-colors ${
                  statusFilter === 'PRESENT'
                    ? 'bg-white shadow-2xs text-[#6B2638] font-semibold'
                    : 'text-[#5E5B61] hover:text-[#252326]'
                }`}
              >
                Present ({presentCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('ABSENT')}
                className={`px-3 py-1 rounded transition-colors ${
                  statusFilter === 'ABSENT'
                    ? 'bg-white shadow-2xs text-[#A63232] font-semibold'
                    : 'text-[#5E5B61] hover:text-[#252326]'
                }`}
              >
                Absent ({absentCount})
              </button>
            </div>
          </div>
        </div>

        {/* Subject Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs select-none">
          <button
            type="button"
            onClick={() => setSelectedSubject('ALL')}
            className={`px-3 py-1.5 rounded font-medium transition-colors shrink-0 ${
              selectedSubject === 'ALL'
                ? 'bg-[#6B2638] text-white shadow-2xs font-semibold'
                : 'bg-white border border-[#E5E0D8] text-[#5E5B61] hover:bg-[#FAF7F2] hover:text-[#252326]'
            }`}
          >
            All Subjects ({faculties.length})
          </button>
          {allSubjects.map(sub => {
            const count = faculties.filter(f => f.subjects.includes(sub)).length;
            const active = selectedSubject === sub;
            return (
              <button
                key={sub}
                type="button"
                onClick={() => setSelectedSubject(sub)}
                className={`px-3 py-1.5 rounded font-medium transition-colors shrink-0 ${
                  active
                    ? 'bg-[#6B2638] text-white shadow-2xs font-semibold'
                    : 'bg-white border border-[#E5E0D8] text-[#5E5B61] hover:bg-[#FAF7F2] hover:text-[#252326]'
                }`}
              >
                {sub} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Faculty Table */}
      <div className="bg-white rounded-lg border border-[#E5E0D8] shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#FAF7F2] border-b border-[#E5E0D8] text-xs font-semibold text-[#5E5B61]">
                <th className="p-3.5 w-36">Status ({selectedDay.slice(0, 3)})</th>
                <th className="p-3.5">Faculty Name</th>
                <th className="p-3.5">Qualified Subjects</th>
                <th className="p-3.5 w-36 text-center">Daily Max Limit</th>
                <th className="p-3.5">Assigned Batches (Lock)</th>
                <th className="p-3.5 w-32 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E0D8] text-sm">
              {filteredFaculties.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8">
                    <EmptyState
                      icon={<Users className="w-8 h-8 text-[#5E5B61]" />}
                      title="No faculty members found"
                      description="No records match your active search filter criteria. Try clearing the filter or adding a new instructor."
                    />
                  </td>
                </tr>
              ) : (
                filteredFaculties.map(faculty => {
                  const isDupe = duplicateGroups.some(([name]) => name === faculty.name.trim().toLowerCase());
                  const isAbsentToday = isFacultyAbsent(faculty, selectedDay);
                  return (
                    <tr
                      key={faculty.id}
                      className={`hover:bg-[#FAF7F2]/40 transition-colors ${
                        isAbsentToday ? 'bg-[#FDF2F2]/40' : ''
                      }`}
                    >
                      <td className="p-3.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => toggleAbsent(faculty.id, selectedDay)}
                          className="outline-none"
                          title={`Click to mark ${isAbsentToday ? 'present' : 'absent'} on ${selectedDay}`}
                        >
                          {isAbsentToday ? (
                            <Badge tone="danger" icon={<UserMinus className="w-3 h-3" />}>
                              Absent
                            </Badge>
                          ) : (
                            <Badge tone="burgundy" icon={<UserCheck className="w-3 h-3" />}>
                              Present
                            </Badge>
                          )}
                        </button>
                        {faculty.absentDays && faculty.absentDays.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5 max-w-[140px]">
                            {WEEKDAYS.map(day => {
                              const isDayAbsent = isFacultyAbsent(faculty, day);
                              if (!isDayAbsent) return null;
                              return (
                                <button
                                  key={day}
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation();
                                    toggleAbsent(faculty.id, day);
                                  }}
                                  className="text-[9px] px-1 py-0.2 rounded font-medium transition-colors bg-[#FDF2F2] text-[#A63232] border border-[#F6CECE] hover:bg-[#FCE7E7]"
                                  title={`Absent on ${day}. Click to mark present.`}
                                >
                                  {day.slice(0, 3)}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td className="p-3.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`font-semibold ${
                              isAbsentToday ? 'text-[#5E5B61] line-through' : 'text-[#252326]'
                            }`}
                          >
                            {faculty.name}
                          </span>
                          {isDupe && (
                            <span title="Duplicate identity across multiple subjects">
                              <Badge tone="gold" className="text-[10px] py-0 px-1">
                                Duplicate
                              </Badge>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3.5">
                        <div className="flex flex-wrap gap-1">
                          {faculty.subjects.map((subj, idx) => (
                            <Badge key={idx} tone="neutral" className="text-xs">
                              {subj}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="p-3.5 text-center font-medium text-[#252326]">
                        {faculty.maxPeriodsPerDay || 4} periods/day
                      </td>
                      <td className="p-3.5">
                        {faculty.assignedBatches && faculty.assignedBatches.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {faculty.assignedBatches.map(batchId => {
                              const b = allBatches.find(item => item.id === batchId);
                              return (
                                <Badge key={batchId} tone="gold" icon={<Link2 className="w-3 h-3" />}>
                                  {b ? b.name : batchId}
                                </Badge>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-xs text-[#5E5B61] italic">
                            Unrestricted (open assignment)
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Edit2 className="w-3.5 h-3.5" />}
                            onClick={() => handleOpenEdit(faculty)}
                            title="Edit faculty profile"
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Trash2 className="w-3.5 h-3.5 text-[#A63232]" />}
                            onClick={() => setDeletingFaculty(faculty)}
                            title="Delete faculty member"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit / Create Faculty Modal */}
      <Modal
        isOpen={isEditing}
        onClose={handleCloseModal}
        title={currentFaculty.id ? 'Edit Faculty Profile' : 'Add New Faculty Member'}
        subtitle="Manage qualified subjects, daily teaching capacity, and batch restrictions"
        footer={
          <>
            <Button variant="secondary" onClick={handleCloseModal}>
              Cancel
            </Button>
            <Button variant="primary" icon={<Save className="w-4 h-4" />} onClick={handleSaveFaculty}>
              Save Profile
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveFaculty} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="faculty-name" className="text-xs font-semibold text-[#252326]">Instructor Name</label>
            <input
              id="faculty-name"
              type="text"
              required
              placeholder="e.g. Dr. Jane Smith"
              value={currentFaculty.name || ''}
              onChange={e => setCurrentFaculty({ ...currentFaculty, name: e.target.value })}
              className="w-full px-3 py-2 border border-[#E5E0D8] rounded-md text-sm bg-white focus:border-[#6B2638] focus:ring-1 focus:ring-[#6B2638] outline-none text-[#252326]"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="faculty-max-periods" className="text-xs font-semibold text-[#252326]">
              Maximum Daily Teaching Limit (Periods/Day)
            </label>
            <input
              id="faculty-max-periods"
              type="number"
              min={1}
              max={8}
              placeholder="4"
              value={currentFaculty.maxPeriodsPerDay ?? 4}
              onChange={e =>
                setCurrentFaculty({ ...currentFaculty, maxPeriodsPerDay: Number(e.target.value) })
              }
              className="w-full px-3 py-2 border border-[#E5E0D8] rounded-md text-sm bg-white focus:border-[#6B2638] focus:ring-1 focus:ring-[#6B2638] outline-none text-[#252326]"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="faculty-subject-input" className="text-xs font-semibold text-[#252326]">Qualified Subjects</label>
            <div className="flex gap-2">
              <input
                id="faculty-subject-input"
                type="text"
                placeholder="e.g. Mathematics"
                value={subjectInput}
                onChange={e => setSubjectInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSubject();
                  }
                }}
                className="flex-1 px-3 py-2 border border-[#E5E0D8] rounded-md text-sm bg-white focus:border-[#6B2638] focus:ring-1 focus:ring-[#6B2638] outline-none text-[#252326]"
              />
              <Button type="button" variant="secondary" size="md" onClick={handleAddSubject}>
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {(currentFaculty.subjects || []).map((subj, idx) => (
                <Badge key={idx} tone="neutral">
                  {subj}
                  <button
                    type="button"
                    onClick={() => handleRemoveSubject(subj)}
                    className="hover:text-[#A63232] ml-1"
                    aria-label={`Remove ${subj}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-1 border-t border-[#E5E0D8] pt-4">
            <label htmlFor="faculty-batch-search" className="text-xs font-semibold text-[#252326] flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-[#5E5B61]" />
              <span>Assigned Batches (Optional Lock)</span>
            </label>
            <p className="text-xs text-[#5E5B61]">
              Leave unrestricted to let the heuristic scheduler place this teacher anywhere, or select specific batches to lock them exclusively.
            </p>
            <input
              id="faculty-batch-search"
              type="text"
              placeholder="Filter batches..."
              value={batchSearch}
              onChange={e => setBatchSearch(e.target.value)}
              className="w-full px-3 py-2 border border-[#E5E0D8] rounded-md text-sm mt-1 bg-white focus:border-[#6B2638] focus:ring-1 focus:ring-[#6B2638] outline-none text-[#252326]"
            />
            <div className="max-h-44 overflow-y-auto border border-[#E5E0D8] rounded-md divide-y divide-[#E5E0D8] mt-2">
              {filteredBatchOptions.length === 0 ? (
                <div className="p-3 text-xs text-[#5E5B61] text-center">No batches found.</div>
              ) : (
                filteredBatchOptions.map(batch => {
                  const isSelected = (currentFaculty.assignedBatches || []).includes(batch.id);
                  return (
                    <label
                      key={batch.id}
                      className="flex items-center gap-2 p-2 hover:bg-[#FAF7F2] cursor-pointer text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleAssignedBatch(batch.id)}
                        className="w-4 h-4 text-[#6B2638] rounded border-[#E5E0D8]"
                      />
                      <span className="font-medium text-[#252326]">{batch.name}</span>
                      <span className="text-[#5E5B61] text-xs">
                        Room {batch.roomNumber} · {batch.building}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </form>
      </Modal>

      {/* Safe Delete Confirmation Modal (H6) */}
      <Modal
        isOpen={Boolean(deletingFaculty)}
        onClose={() => setDeletingFaculty(null)}
        title="Confirm Faculty Removal"
        maxWidth="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeletingFaculty(null)}>
              Cancel
            </Button>
            <Button variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={handleConfirmDelete}>
              Delete Faculty
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-[#252326] leading-relaxed">
            Are you sure you want to permanently remove <strong>{deletingFaculty?.name}</strong> from the faculty directory?
          </p>
          <div className="p-3 bg-[#FAF0F2] border border-[#ECD9DE] rounded text-xs text-[#6B2638] space-y-2">
            <div className="flex items-center gap-1.5 font-bold">
              <Trash2 className="w-4 h-4 text-[#6B2638] shrink-0" />
              <span>Data Integrity Warning</span>
            </div>
            <p className="text-[#252326]">
              This faculty member is assigned to{' '}
              <strong>
                {deletingFaculty ? storage.countFacultyAllocations(deletingFaculty.id) : 0} timetable slot(s)
              </strong>{' '}
              across stored days.
            </p>
            <p className="text-[#5E5B61]">
              Deleting them will safely turn all those allocations into <strong>unfilled shortage slots</strong> across all stored weekly timetables (preventing orphaned "Unknown" references).
            </p>
          </div>
        </div>
      </Modal>

      {/* Mark All Present Confirmation Modal */}
      <Modal
        isOpen={showMarkAllPresentConfirm}
        onClose={() => setShowMarkAllPresentConfirm(false)}
        title="Mark Faculty Present"
        maxWidth="sm"
        footer={
          <div className="flex items-center justify-end gap-2 w-full flex-wrap">
            <Button variant="secondary" onClick={() => setShowMarkAllPresentConfirm(false)}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={() => handleConfirmMarkAllPresent(true)}>
              Mark Present (All Days)
            </Button>
            <Button variant="primary" onClick={() => handleConfirmMarkAllPresent(false)}>
              Mark Present ({selectedDay})
            </Button>
          </div>
        }
      >
        <p className="text-sm text-[#5E5B61]">
          Are you sure you want to mark all {absentCount} absent faculty members on{' '}
          <strong className="text-[#252326] font-semibold">{selectedDay}</strong> as Present?
        </p>
      </Modal>

      {/* Validated JSON Import Preview Modal (H7) */}
      <Modal
        isOpen={Boolean(importPreview)}
        onClose={() => setImportPreview(null)}
        title="Faculty Import Validation Preview"
        subtitle="Review validated records and potential conflicts before committing to directory"
        maxWidth="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setImportPreview(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={importPreview ? importPreview.valid.length === 0 : true}
              onClick={handleApplyImport}
            >
              Apply Import ({importMode === 'replace' ? 'Replace All' : 'Merge Records'})
            </Button>
          </>
        }
      >
        {importPreview && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div className="p-2.5 bg-[#FAF7F2] rounded border border-[#E5E0D8]">
                <div className="text-[#5E5B61]">Total Parsed</div>
                <div className="text-lg font-bold text-[#252326]">{importPreview.total}</div>
              </div>
              <div className="p-2.5 bg-[#EEF5F0] rounded border border-[#C6DEC9]">
                <div className="text-[#235732]">Valid Records</div>
                <div className="text-lg font-bold text-[#235732]">{importPreview.valid.length}</div>
              </div>
              <div className="p-2.5 bg-[#FDF2F2] rounded border border-[#F6CECE]">
                <div className="text-[#A63232]">Invalid / Skipped</div>
                <div className="text-lg font-bold text-[#A63232]">{importPreview.invalid.length}</div>
              </div>
              <div className="p-2.5 bg-[#F8F3EA] rounded border border-[#E7D7BD]">
                <div className="text-[#7A5B28]">Duplicates</div>
                <div className="text-lg font-bold text-[#7A5B28]">{importPreview.duplicates.length}</div>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-xs font-semibold text-[#252326] block">Import Mode</span>
              <div className="flex gap-3">
                <label htmlFor="import-mode-merge" className="flex items-center gap-2 text-xs text-[#252326] cursor-pointer">
                  <input
                    id="import-mode-merge"
                    type="radio"
                    name="importMode"
                    value="merge"
                    checked={importMode === 'merge'}
                    onChange={() => setImportMode('merge')}
                  />
                  <span><strong>Merge:</strong> Add new faculty and update existing matching records by ID or name</span>
                </label>
                <label htmlFor="import-mode-replace" className="flex items-center gap-2 text-xs text-[#252326] cursor-pointer">
                  <input
                    id="import-mode-replace"
                    type="radio"
                    name="importMode"
                    value="replace"
                    checked={importMode === 'replace'}
                    onChange={() => setImportMode('replace')}
                  />
                  <span><strong>Replace:</strong> Completely replace entire faculty directory</span>
                </label>
              </div>
            </div>

            {importPreview.invalid.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-[#A63232]">Invalid Record Errors:</div>
                <div className="max-h-32 overflow-y-auto border border-[#F6CECE] rounded p-2 bg-[#FDF2F2] text-xs text-[#A63232] space-y-1">
                  {importPreview.invalid.map((inv, idx) => (
                    <div key={idx}>• {inv.reason}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Replace Confirmation Modal (H7) */}
      <Modal
        isOpen={showReplaceConfirm}
        onClose={() => setShowReplaceConfirm(false)}
        title="Confirm Directory Replacement"
        maxWidth="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowReplaceConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon={<Trash2 className="w-4 h-4" />}
              onClick={() => {
                if (!importPreview) return;
                saveToStorage(importPreview.valid);
                setShowReplaceConfirm(false);
                setImportPreview(null);
                setFeedback({
                  type: 'success',
                  text: `Replaced faculty directory with ${importPreview.valid.length} imported profiles.`,
                });
                setTimeout(() => setFeedback(null), 4000);
              }}
            >
              Confirm & Replace Directory
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-[#252326] leading-relaxed">
            Are you sure you want to completely <strong>replace</strong> the entire faculty directory with the{' '}
            <strong>{importPreview?.valid.length || 0}</strong> imported profiles?
          </p>
          <div className="p-3 bg-[#FAF0F2] border border-[#ECD9DE] rounded text-xs text-[#6B2638] space-y-1">
            <strong>Warning: Destructive Action</strong>
            <p>
              Existing faculty profiles will be overwritten. Any timetable allocations for teachers not present in the new import will become unfilled shortage slots.
            </p>
          </div>
        </div>
      </Modal>

      {/* Duplicate Faculty Name Detected on Add Modal (M8) */}
      <Modal
        isOpen={Boolean(duplicateAddWarning)}
        onClose={() => setDuplicateAddWarning(null)}
        title="Duplicate Faculty Name Detected"
        maxWidth="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDuplicateAddWarning(null)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (!duplicateAddWarning) return;
                const newFaculty: Faculty = {
                  id: `fac_${crypto.randomUUID()}`,
                  name: duplicateAddWarning.pendingName,
                  subjects: duplicateAddWarning.pendingSubjects,
                  maxPeriodsPerDay: currentFaculty.maxPeriodsPerDay || 4,
                  isAbsent: false,
                  absentDays: currentFaculty.absentDays || [],
                  assignedBatches: currentFaculty.assignedBatches || [],
                };
                saveToStorage([...faculties, newFaculty]);
                storage.logAuditAction('FACULTY_CREATE', {
                  reason: `Created separate duplicate faculty profile for ${newFaculty.name}.`,
                });
                setFeedback({ type: 'success', text: `Added ${newFaculty.name} as a separate profile.` });
                setDuplicateAddWarning(null);
                handleCloseModal();
                setTimeout(() => setFeedback(null), 3000);
              }}
            >
              Create Separate Profile
            </Button>
            <Button
              variant="gold"
              icon={<GitMerge className="w-4 h-4" />}
              onClick={() => {
                if (!duplicateAddWarning) return;
                const { existing, pendingSubjects } = duplicateAddWarning;
                const combinedSubjects = Array.from(new Set([...existing.subjects, ...pendingSubjects]));
                const updated = faculties.map(f => (f.id === existing.id ? { ...f, subjects: combinedSubjects } : f));
                saveToStorage(updated);
                storage.logAuditAction('FACULTY_UPDATE', {
                  reason: `Merged subjects (${pendingSubjects.join(', ')}) into existing profile for ${existing.name}.`,
                });
                setFeedback({
                  type: 'success',
                  text: `Merged subjects into existing ${existing.name} profile (${combinedSubjects.join(', ')}).`,
                });
                setDuplicateAddWarning(null);
                handleCloseModal();
                setTimeout(() => setFeedback(null), 3000);
              }}
            >
              Merge with Existing
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-[#252326]">
            A faculty member named <strong>"{duplicateAddWarning?.existing.name}"</strong> already exists in the directory.
          </p>
          <div className="p-3 bg-[#F8F3EA] border border-[#E7D7BD] rounded text-xs text-[#7A5B28] space-y-1.5">
            <div>
              <strong>Existing Profile:</strong> {duplicateAddWarning?.existing.name} (Subjects: {duplicateAddWarning?.existing.subjects.join(', ')})
            </div>
            <div>
              <strong>New Subjects:</strong> {duplicateAddWarning?.pendingSubjects.join(', ')}
            </div>
            <p className="text-[#5E5B61] pt-1">
              Would you like to merge these new subjects into the existing profile, or create a separate duplicate record?
            </p>
          </div>
        </div>
      </Modal>

      {/* Duplicate Faculty Profiles Merge Modal (M8) */}
      <Modal
        isOpen={showDuplicateResolutionModal}
        onClose={() => setShowDuplicateResolutionModal(false)}
        title="Resolve Duplicate Faculty Profiles"
        subtitle="Unify multiple records for the same instructor into single profiles"
        maxWidth="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowDuplicateResolutionModal(false)}>
              Cancel
            </Button>
            <Button variant="gold" icon={<GitMerge className="w-4 h-4" />} onClick={handleMergeDuplicates}>
              Merge All Duplicates
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-[#5E5B61] leading-relaxed">
            The following instructors have multiple entries across different departments. Merging will combine their qualified subject lists into single master records:
          </p>
          <div className="max-h-64 overflow-y-auto border border-[#E5E0D8] rounded divide-y divide-[#E5E0D8]">
            {duplicateGroups.map(([name, dupes]) => (
              <div key={name} className="p-3 text-xs flex justify-between items-center gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#252326] text-sm">{dupes[0].name}</span>
                    <Badge tone="gold">{dupes.length} entries</Badge>
                  </div>
                  <div className="text-[#5E5B61] mt-0.5 truncate">
                    Departments: {dupes.flatMap(d => d.subjects).join(', ')}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<GitMerge className="w-3.5 h-3.5 text-[#B08D57]" />}
                  onClick={() => handleMergeSingleGroup(dupes)}
                  title={`Merge duplicate entries for ${dupes[0].name}`}
                  className="shrink-0"
                >
                  Merge This Instructor
                </Button>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
