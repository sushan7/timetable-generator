import { useState, useMemo } from 'react';
import { Users, Plus, Trash2, Edit2, Upload, UserMinus, UserCheck, Link2, X, Save, CheckCheck, BookOpen } from 'lucide-react';
import type { Faculty, Batch } from '../types';
import { storage } from '../utils/storage';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import SearchInput from '../components/ui/SearchInput';

export default function FacultyManager() {
  const [faculties, setFaculties] = useState<Faculty[]>(() => {
    storage.initialize();
    return storage.getFaculty();
  });
  const [allBatches] = useState<Batch[]>(() => storage.getBatches());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PRESENT' | 'ABSENT'>('ALL');
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [currentFaculty, setCurrentFaculty] = useState<Partial<Faculty>>({
    name: '', subjects: [], maxPeriodsPerDay: 4, isAbsent: false, assignedBatches: []
  });
  const [subjectInput, setSubjectInput] = useState('');
  const [batchSearch, setBatchSearch] = useState('');

  const saveToStorage = (updated: Faculty[]) => {
    setFaculties(updated);
    storage.setFaculty(updated);
  };

  const toggleAbsent = (id: string) => {
    saveToStorage(faculties.map(f => (f.id === id ? { ...f, isAbsent: !f.isAbsent } : f)));
  };

  const handleMarkAllPresent = () => {
    if (confirm('Mark all faculty members as Present?')) {
      const updated = faculties.map(f => ({ ...f, isAbsent: false }));
      saveToStorage(updated);
    }
  };

  const handleSaveFaculty = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentFaculty.name?.trim()) return;

    if (currentFaculty.id) {
      saveToStorage(faculties.map(f => (f.id === currentFaculty.id ? (currentFaculty as Faculty) : f)));
    } else {
      const newFaculty: Faculty = {
        id: `fac_${crypto.randomUUID()}`,
        name: currentFaculty.name.trim(),
        subjects: currentFaculty.subjects || [],
        maxPeriodsPerDay: currentFaculty.maxPeriodsPerDay || 4,
        isAbsent: false,
        assignedBatches: currentFaculty.assignedBatches || []
      };
      saveToStorage([...faculties, newFaculty]);
    }
    handleCloseModal();
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to remove this faculty member?')) {
      saveToStorage(faculties.filter(f => f.id !== id));
    }
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
    setCurrentFaculty({ ...currentFaculty, subjects: (currentFaculty.subjects || []).filter(s => s !== subj) });
  };

  const toggleAssignedBatch = (batchId: string) => {
    const current = currentFaculty.assignedBatches || [];
    const updated = current.includes(batchId) ? current.filter(id => id !== batchId) : [...current, batchId];
    setCurrentFaculty({ ...currentFaculty, assignedBatches: updated });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (Array.isArray(json)) {
          saveToStorage(json);
          setImportMessage({ type: 'success', text: `Successfully imported ${json.length} faculty members.` });
        }
      } catch {
        setImportMessage({ type: 'error', text: 'Invalid JSON file format.' });
      }
      setTimeout(() => setImportMessage(null), 4000);
    };
    reader.readAsText(file);
  };

  const allSubjects = useMemo(() => {
    const set = new Set<string>();
    faculties.forEach(f => f.subjects.forEach(s => set.add(s)));
    return Array.from(set).sort();
  }, [faculties]);

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

  const filteredBatchOptions = allBatches.filter(b =>
    b.name.toLowerCase().includes(batchSearch.toLowerCase()) ||
    b.roomNumber.toLowerCase().includes(batchSearch.toLowerCase())
  );

  const getBatchName = (id: string) => allBatches.find(b => b.id === id)?.name || 'Unknown batch';

  const presentCount = faculties.filter(f => !f.isAbsent).length;
  const absentCount = faculties.filter(f => f.isAbsent).length;
  const lockedCount = faculties.filter(f => f.assignedBatches && f.assignedBatches.length > 0).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        icon={<Users className="w-6 h-6" />}
        title="Faculty Management"
        subtitle={`${faculties.length} professors and lecturers registered across departments`}
        actions={
          <>
            {absentCount > 0 && (
              <Button
                variant="secondary"
                icon={<CheckCheck className="w-4 h-4 text-emerald-600" />}
                onClick={handleMarkAllPresent}
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
              <input id="faculty-json-input" type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
            </label>
            <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => handleOpenEdit()}>
              Add Faculty
            </Button>
          </>
        }
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card padding={false} className="p-4">
          <div className="text-xs font-semibold text-slate-500 uppercase">Total Faculty</div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1">{faculties.length}</div>
        </Card>
        <Card
          padding={false}
          className={`p-4 cursor-pointer transition-colors ${statusFilter === 'PRESENT' ? 'ring-2 ring-emerald-500 bg-emerald-50/30' : ''}`}
          onClick={() => setStatusFilter(prev => prev === 'PRESENT' ? 'ALL' : 'PRESENT')}
        >
          <div className="text-xs font-semibold text-emerald-600 uppercase flex items-center justify-between">
            <span>Present Today</span>
            <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-700 mt-1">{presentCount}</div>
        </Card>
        <Card
          padding={false}
          className={`p-4 cursor-pointer transition-colors ${statusFilter === 'ABSENT' ? 'ring-2 ring-rose-500 bg-rose-50/30' : ''}`}
          onClick={() => setStatusFilter(prev => prev === 'ABSENT' ? 'ALL' : 'ABSENT')}
        >
          <div className="text-xs font-semibold text-rose-600 uppercase flex items-center justify-between">
            <span>Absent</span>
            <UserMinus className="w-3.5 h-3.5 text-rose-500" />
          </div>
          <div className="text-2xl font-extrabold text-rose-700 mt-1">{absentCount}</div>
        </Card>
        <Card padding={false} className="p-4">
          <div className="text-xs font-semibold text-amber-600 uppercase flex items-center justify-between">
            <span>Batch Locked</span>
            <Link2 className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-amber-700 mt-1">{lockedCount}</div>
        </Card>
      </div>

      {importMessage && (
        <div className={`text-sm font-medium px-4 py-2.5 rounded-xl border ${
          importMessage.type === 'success'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
            : 'bg-rose-50 text-rose-700 border-rose-100'
        }`}>
          {importMessage.text}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row justify-between gap-3">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search by faculty name or subject..."
            className="max-w-md w-full"
          />

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 uppercase">Status:</span>
            <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-3 py-1 rounded-lg transition-colors ${statusFilter === 'ALL' ? 'bg-white shadow-xs text-slate-900' : 'text-slate-600'}`}
              >
                All
              </button>
              <button
                onClick={() => setStatusFilter('PRESENT')}
                className={`px-3 py-1 rounded-lg transition-colors ${statusFilter === 'PRESENT' ? 'bg-white shadow-xs text-emerald-700' : 'text-slate-600'}`}
              >
                Present ({presentCount})
              </button>
              <button
                onClick={() => setStatusFilter('ABSENT')}
                className={`px-3 py-1 rounded-lg transition-colors ${statusFilter === 'ABSENT' ? 'bg-white shadow-xs text-rose-700' : 'text-slate-600'}`}
              >
                Absent ({absentCount})
              </button>
            </div>
          </div>
        </div>

        {/* Subject Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <button
            onClick={() => setSelectedSubject('ALL')}
            className={`px-3 py-1.5 rounded-full font-semibold transition-all shrink-0 ${
              selectedSubject === 'ALL'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
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
                onClick={() => setSelectedSubject(sub)}
                className={`px-3 py-1.5 rounded-full font-semibold transition-all shrink-0 ${
                  active
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {sub} ({count})
              </button>
            );
          })}
        </div>
      </div>

      <Card padding={false} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-xs uppercase text-slate-500 font-semibold tracking-wider">
                <th className="p-4 w-32">Status</th>
                <th className="p-4">Faculty Member</th>
                <th className="p-4">Qualified Subjects</th>
                <th className="p-4">Assigned Batches</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredFaculties.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-10">
                    <EmptyState
                      icon={<BookOpen className="w-8 h-8 text-slate-300" />}
                      title="No faculty members match your criteria"
                      description="Try clearing your filters or search terms."
                    />
                  </td>
                </tr>
              ) : (
                filteredFaculties.map(faculty => (
                  <tr
                    key={faculty.id}
                    className={`hover:bg-slate-50/70 transition-colors ${
                      faculty.isAbsent ? 'bg-rose-50/30' : ''
                    }`}
                  >
                    <td className="p-4 whitespace-nowrap">
                      {faculty.isAbsent ? (
                        <Badge tone="danger" icon={<UserMinus className="w-3 h-3" />}>Absent</Badge>
                      ) : (
                        <Badge tone="success" icon={<UserCheck className="w-3 h-3" />}>Present</Badge>
                      )}
                    </td>
                    <td className="p-4">
                      <div className={`font-semibold ${faculty.isAbsent ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                        {faculty.name}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Daily Cap: {faculty.maxPeriodsPerDay ?? 4} periods/day
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1.5">
                        {faculty.subjects.map((subj, idx) => (
                          <Badge key={idx} tone="info">{subj}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="p-4">
                      {faculty.assignedBatches && faculty.assignedBatches.length > 0 ? (
                        <Badge tone="warning" icon={<Link2 className="w-3 h-3" />}>
                          {faculty.assignedBatches.length} batch{faculty.assignedBatches.length > 1 ? 'es' : ''}
                        </Badge>
                      ) : (
                        <span className="text-xs text-slate-400 font-medium">Unrestricted</span>
                      )}
                    </td>
                    <td className="p-4 text-right space-x-1.5 whitespace-nowrap">
                      <Button
                        size="sm"
                        variant={faculty.isAbsent ? 'primary' : 'danger'}
                        onClick={() => toggleAbsent(faculty.id)}
                      >
                        {faculty.isAbsent ? 'Mark Present' : 'Mark Absent'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleOpenEdit(faculty)}
                        title="Edit Faculty"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(faculty.id)}
                        title="Delete Faculty"
                        className="hover:text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        isOpen={isEditing}
        onClose={handleCloseModal}
        title={currentFaculty.id ? 'Edit Faculty' : 'Add New Faculty'}
        footer={
          <>
            <Button variant="secondary" onClick={handleCloseModal}>Cancel</Button>
            <Button variant="primary" icon={<Save className="w-4 h-4" />} form="faculty-form" type="submit">
              Save Faculty
            </Button>
          </>
        }
      >
        <form id="faculty-form" onSubmit={handleSaveFaculty} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase text-slate-500">Faculty Name</label>
            <input
              type="text"
              required
              placeholder="e.g., Dr. Jane Smith"
              value={currentFaculty.name || ''}
              onChange={e => setCurrentFaculty({ ...currentFaculty, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase text-slate-500">Max Daily Periods Limit</label>
            <input
              type="number"
              min={1}
              max={8}
              placeholder="4"
              value={currentFaculty.maxPeriodsPerDay ?? 4}
              onChange={e => setCurrentFaculty({ ...currentFaculty, maxPeriodsPerDay: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase text-slate-500">Qualified Subjects</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g., Mathematics"
                value={subjectInput}
                onChange={e => setSubjectInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubject(); } }}
                className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm"
              />
              <Button type="button" variant="secondary" size="sm" onClick={handleAddSubject}>Add</Button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(currentFaculty.subjects || []).map((subj, idx) => (
                <Badge key={idx} tone="info">
                  {subj}
                  <button type="button" onClick={() => handleRemoveSubject(subj)} className="hover:text-rose-600 ml-1">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-1 border-t border-slate-100 pt-4">
            <label className="text-xs font-semibold uppercase text-slate-500 flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5" /> Assigned Batches (optional)
            </label>
            <p className="text-xs text-slate-500">
              Leave empty for unrestricted. Select specific batches to lock this faculty to only those.
            </p>
            <input
              type="text"
              placeholder="Search batches..."
              value={batchSearch}
              onChange={e => setBatchSearch(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm mt-1"
            />
            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 mt-2">
              {filteredBatchOptions.length === 0 ? (
                <div className="p-3 text-xs text-slate-400 text-center">No batches match your search.</div>
              ) : (
                filteredBatchOptions.map(batch => {
                  const isSelected = (currentFaculty.assignedBatches || []).includes(batch.id);
                  return (
                    <label key={batch.id} className="flex items-center gap-2 p-2.5 hover:bg-slate-50 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleAssignedBatch(batch.id)}
                        className="w-4 h-4 text-indigo-600 rounded"
                      />
                      <span className="font-medium text-slate-800">{batch.name}</span>
                      <span className="text-slate-400 text-xs">Room {batch.roomNumber} &middot; {batch.building}</span>
                    </label>
                  );
                })
              )}
            </div>
            {(currentFaculty.assignedBatches || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {(currentFaculty.assignedBatches || []).map(id => (
                  <Badge key={id} tone="warning">
                    {getBatchName(id)}
                    <button type="button" onClick={() => toggleAssignedBatch(id)} className="hover:text-rose-600 ml-1">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </form>
      </Modal>
    </div>
  );
}