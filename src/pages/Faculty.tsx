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
} from 'lucide-react';
import type { Faculty, Batch } from '../types';
import { storage } from '../utils/storage';
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
    assignedBatches: [],
  });
  const [subjectInput, setSubjectInput] = useState('');
  const [batchSearch, setBatchSearch] = useState('');

  // Delete Confirmation State
  const [deletingFaculty, setDeletingFaculty] = useState<Faculty | null>(null);

  // Import Preview State (H7)
  const [importPreview, setImportPreview] = useState<ImportValidationResult | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');

  // Mark All Present Modal
  const [showMarkAllPresentConfirm, setShowMarkAllPresentConfirm] = useState(false);

  // Duplicate Resolution State (M8)
  const [showDuplicateResolutionModal, setShowDuplicateResolutionModal] = useState(false);

  const saveToStorage = (updated: Faculty[]) => {
    setFaculties(updated);
    storage.setFaculty(updated);
  };

  const toggleAbsent = (id: string) => {
    const updated = faculties.map(f => (f.id === id ? { ...f, isAbsent: !f.isAbsent } : f));
    saveToStorage(updated);
    const target = updated.find(f => f.id === id);
    if (target) {
      storage.logAuditAction('STATUS_CHANGE', {
        reason: `Marked teacher ${target.name} as ${target.isAbsent ? 'Absent' : 'Present'}.`,
      });
    }
  };

  const handleConfirmMarkAllPresent = () => {
    const updated = faculties.map(f => ({ ...f, isAbsent: false }));
    saveToStorage(updated);
    setShowMarkAllPresentConfirm(false);
    setFeedback({ type: 'success', text: 'All faculty members marked as Present.' });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleSaveFaculty = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentFaculty.name?.trim()) return;

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
        name: currentFaculty.name.trim(),
        subjects: currentFaculty.subjects && currentFaculty.subjects.length > 0 ? currentFaculty.subjects : ['General Studies'],
        maxPeriodsPerDay: currentFaculty.maxPeriodsPerDay || 4,
        isAbsent: false,
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
      text: `Removed ${deletingFaculty.name}. Vacated ${res.allocationsAffected} timetable slots.`,
    });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleOpenEdit = (faculty?: Faculty) => {
    setCurrentFaculty(
      faculty
        ? { ...faculty, assignedBatches: faculty.assignedBatches || [] }
        : { name: '', subjects: [], maxPeriodsPerDay: 4, isAbsent: false, assignedBatches: [] }
    );
    setBatchSearch('');
    setIsEditing(true);
  };

  const handleCloseModal = () => {
    setIsEditing(false);
    setCurrentFaculty({ name: '', subjects: [], maxPeriodsPerDay: 4, isAbsent: false, assignedBatches: [] });
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

  // Validated File Upload (H7)
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
          setFeedback({ type: 'error', text: 'JSON structure error: Expected an array of faculty objects.' });
          setTimeout(() => setFeedback(null), 4000);
          return;
        }

        const valid: Faculty[] = [];
        const invalid: { record: unknown; reason: string }[] = [];
        const duplicates: { name: string; existingId: string }[] = [];

        const existingNames = new Map(faculties.map(f => [f.name.trim().toLowerCase(), f.id]));

        json.forEach((item, idx) => {
          if (!item || typeof item !== 'object') {
            invalid.push({ record: item, reason: `Item #${idx + 1} is not an object` });
            return;
          }

          const raw = item as Record<string, unknown>;
          if (!raw.name || typeof raw.name !== 'string' || !raw.name.trim()) {
            invalid.push({ record: item, reason: `Item #${idx + 1} is missing a valid 'name'` });
            return;
          }

          if (!Array.isArray(raw.subjects) || raw.subjects.length === 0) {
            invalid.push({ record: item, reason: `Faculty "${raw.name}" must have at least one subject in 'subjects'` });
            return;
          }

          const normName = raw.name.trim().toLowerCase();
          if (existingNames.has(normName)) {
            duplicates.push({ name: raw.name.trim(), existingId: existingNames.get(normName)! });
          }

          const validatedFaculty: Faculty = {
            id: typeof raw.id === 'string' && raw.id ? raw.id : `fac_${Date.now()}_${idx}`,
            name: raw.name.trim(),
            subjects: raw.subjects.map(s => String(s).trim()),
            maxPeriodsPerDay: typeof raw.maxPeriodsPerDay === 'number' && raw.maxPeriodsPerDay > 0 ? raw.maxPeriodsPerDay : 4,
            isAbsent: Boolean(raw.isAbsent),
            assignedBatches: Array.isArray(raw.assignedBatches) ? raw.assignedBatches.map(b => String(b)) : [],
          };
          valid.push(validatedFaculty);
        });

        setImportPreview({
          total: json.length,
          valid,
          invalid,
          duplicates,
        });
      } catch (err) {
        setFeedback({ type: 'error', text: `Failed to parse JSON: ${err}` });
        setTimeout(() => setFeedback(null), 4000);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleApplyImport = () => {
    if (!importPreview) return;
    if (importMode === 'replace') {
      saveToStorage(importPreview.valid);
      setFeedback({ type: 'success', text: `Replaced directory with ${importPreview.valid.length} faculty profiles.` });
    } else {
      // Merge mode
      const map = new Map(faculties.map(f => [f.id, f]));
      importPreview.valid.forEach(f => map.set(f.id, f));
      const merged = Array.from(map.values());
      saveToStorage(merged);
      setFeedback({ type: 'success', text: `Merged ${importPreview.valid.length} imported profiles with existing faculty.` });
    }
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

  const handleMergeDuplicates = () => {
    const mergedList: Faculty[] = [];
    const processedNames = new Set<string>();

    faculties.forEach(f => {
      const norm = f.name.trim().toLowerCase();
      if (processedNames.has(norm)) return;

      const dupes = faculties.filter(item => item.name.trim().toLowerCase() === norm);
      if (dupes.length === 1) {
        mergedList.push(dupes[0]);
      } else {
        // Merge multiple profiles for same person
        const combinedSubjects = Array.from(new Set(dupes.flatMap(d => d.subjects)));
        const combinedBatches = Array.from(new Set(dupes.flatMap(d => d.assignedBatches || [])));
        const primary = dupes[0];

        mergedList.push({
          ...primary,
          subjects: combinedSubjects,
          assignedBatches: combinedBatches,
        });
      }
      processedNames.add(norm);
    });

    saveToStorage(mergedList);
    setShowDuplicateResolutionModal(false);
    setFeedback({
      type: 'success',
      text: `Successfully merged ${duplicateGroups.length} duplicate faculty profiles into unified records.`,
    });
    setTimeout(() => setFeedback(null), 4000);
  };

  const allSubjects = useMemo(() => {
    const set = new Set<string>();
    faculties.forEach(f => f.subjects.forEach(s => set.add(s)));
    return Array.from(set).sort();
  }, [faculties]);

  const presentCount = faculties.filter(f => !f.isAbsent).length;
  const absentCount = faculties.filter(f => f.isAbsent).length;
  const lockedCount = faculties.filter(f => f.assignedBatches && f.assignedBatches.length > 0).length;

  const filteredFaculties = useMemo(() => {
    return faculties.filter(f => {
      if (statusFilter === 'PRESENT' && f.isAbsent) return false;
      if (statusFilter === 'ABSENT' && !f.isAbsent) return false;
      if (selectedSubject !== 'ALL' && !f.subjects.includes(selectedSubject)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesName = f.name.toLowerCase().includes(q);
        const matchesSubj = f.subjects.some(s => s.toLowerCase().includes(q));
        if (!matchesName && !matchesSubj) return false;
      }
      return true;
    });
  }, [faculties, statusFilter, selectedSubject, searchQuery]);

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
                {duplicateGroups.length} Duplicate Teacher Profiles Detected:
              </strong>
              <p className="text-[#7A5B28]/90 mt-0.5 leading-relaxed">
                Found identical names split across subjects (e.g.{' '}
                {duplicateGroups.slice(0, 3).map(([name]) => name).join(', ')}).
                Merging combines their subject qualifications into single unified profiles.
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
            Review &amp; Merge
          </Button>
        </div>
      )}

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
            <span>Present Today</span>
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
            <span>Absent Today</span>
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
                <th className="p-3.5 w-32">Status</th>
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
                  return (
                    <tr
                      key={faculty.id}
                      className={`hover:bg-[#FAF7F2]/40 transition-colors ${
                        faculty.isAbsent ? 'bg-[#FDF2F2]/40' : ''
                      }`}
                    >
                      <td className="p-3.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => toggleAbsent(faculty.id)}
                          className="outline-none"
                          title="Click to toggle attendance status"
                        >
                          {faculty.isAbsent ? (
                            <Badge tone="danger" icon={<UserMinus className="w-3 h-3" />}>
                              Absent
                            </Badge>
                          ) : (
                            <Badge tone="burgundy" icon={<UserCheck className="w-3 h-3" />}>
                              Present
                            </Badge>
                          )}
                        </button>
                      </td>
                      <td className="p-3.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`font-semibold ${
                              faculty.isAbsent ? 'text-[#5E5B61] line-through' : 'text-[#252326]'
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
            <label className="text-xs font-semibold text-[#252326]">Instructor Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Dr. Jane Smith"
              value={currentFaculty.name || ''}
              onChange={e => setCurrentFaculty({ ...currentFaculty, name: e.target.value })}
              className="w-full px-3 py-2 border border-[#E5E0D8] rounded-md text-sm bg-white focus:border-[#6B2638] focus:ring-1 focus:ring-[#6B2638] outline-none text-[#252326]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#252326]">
              Maximum Daily Teaching Limit (Periods/Day)
            </label>
            <input
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
            <label className="text-xs font-semibold text-[#252326]">Qualified Subjects</label>
            <div className="flex gap-2">
              <input
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
            <label className="text-xs font-semibold text-[#252326] flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-[#5E5B61]" />
              <span>Assigned Batches (Optional Lock)</span>
            </label>
            <p className="text-xs text-[#5E5B61]">
              Leave unrestricted to let the heuristic scheduler place this teacher anywhere, or select specific batches to lock them exclusively.
            </p>
            <input
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
          <div className="p-3 bg-[#FDF2F2] border border-[#F6CECE] rounded text-xs text-[#A63232] space-y-1">
            <strong>Data Integrity Notice:</strong>
            <p>
              Deleting this faculty member will safely clean up all batch restrictions and convert their current timetable assignments into flagged vacant slots.
            </p>
          </div>
        </div>
      </Modal>

      {/* Mark All Present Confirmation Modal */}
      <Modal
        isOpen={showMarkAllPresentConfirm}
        onClose={() => setShowMarkAllPresentConfirm(false)}
        title="Mark All Faculty Present"
        maxWidth="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowMarkAllPresentConfirm(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleConfirmMarkAllPresent}>
              Confirm
            </Button>
          </>
        }
      >
        <p className="text-sm text-[#5E5B61]">
          Are you sure you want to reset attendance and mark all {absentCount} absent faculty members as Present?
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
              <label className="text-xs font-semibold text-[#252326]">Import Mode</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 text-xs text-[#252326] cursor-pointer">
                  <input
                    type="radio"
                    name="importMode"
                    value="merge"
                    checked={importMode === 'merge'}
                    onChange={() => setImportMode('merge')}
                  />
                  <span><strong>Merge:</strong> Add new faculty and update existing matching records</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-[#252326] cursor-pointer">
                  <input
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
              Confirm Merge Profiles
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-[#5E5B61] leading-relaxed">
            The following instructors have multiple entries across different departments. Merging will combine their qualified subject lists into single master records:
          </p>
          <div className="max-h-56 overflow-y-auto border border-[#E5E0D8] rounded divide-y divide-[#E5E0D8]">
            {duplicateGroups.map(([name, dupes]) => (
              <div key={name} className="p-3 text-xs flex justify-between items-center">
                <div>
                  <span className="font-bold text-[#252326] text-sm">{dupes[0].name}</span>
                  <div className="text-[#5E5B61] mt-0.5">
                    Found {dupes.length} separate entries ({dupes.flatMap(d => d.subjects).join(', ')})
                  </div>
                </div>
                <Badge tone="gold">Will Combine</Badge>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
