import { useState, useEffect } from 'react';
import { Users, Plus, Trash2, Edit2, Search, Save, X, Upload, UserMinus, UserCheck } from 'lucide-react';
import type { Faculty } from '../types';
import { HARDCODED_FACULTIES } from '../utils/faculties';

const STORAGE_KEY = 'sdtg_faculties';

export default function FacultyManager() {
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal State
  const [isEditing, setIsEditing] = useState(false);
  const [currentFaculty, setCurrentFaculty] = useState<Partial<Faculty>>({
    name: '',
    subjects: [],
    maxPeriodsPerDay: 4,
    isAbsent: false
  });
  const [subjectInput, setSubjectInput] = useState('');

  useEffect(() => {
    // FORCE INITIALIZATION WITH HARDCODED DATA IF EMPTY
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored || JSON.parse(stored).length === 0) {
      setFaculties(HARDCODED_FACULTIES);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(HARDCODED_FACULTIES));
    } else {
      setFaculties(JSON.parse(stored));
    }
  }, []);

  const saveToStorage = (updated: Faculty[]) => {
    setFaculties(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  // --- ABSENT TOGGLE ---
  const toggleAbsent = (id: string) => {
    const updated = faculties.map(f => 
      f.id === id ? { ...f, isAbsent: !f.isAbsent } : f
    );
    saveToStorage(updated);
  };

  // --- MANUAL EDITING LOGIC ---
  const handleSaveFaculty = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentFaculty.name) return;

    if (currentFaculty.id) {
      const updated = faculties.map(f => 
        f.id === currentFaculty.id ? (currentFaculty as Faculty) : f
      );
      saveToStorage(updated);
    } else {
      const newFaculty: Faculty = {
        id: `fac_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: currentFaculty.name,
        subjects: currentFaculty.subjects || [],
        maxPeriodsPerDay: currentFaculty.maxPeriodsPerDay || 4,
        isAbsent: false
      };
      saveToStorage([...faculties, newFaculty]);
    }
    handleCloseModal();
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to remove this faculty member?')) {
      const updated = faculties.filter(f => f.id !== id);
      saveToStorage(updated);
    }
  };

  const handleOpenEdit = (faculty?: Faculty) => {
    if (faculty) {
      setCurrentFaculty({ ...faculty });
    } else {
      setCurrentFaculty({ name: '', subjects: [], maxPeriodsPerDay: 4, isAbsent: false });
    }
    setIsEditing(true);
  };

  const handleCloseModal = () => {
    setIsEditing(false);
    setCurrentFaculty({ name: '', subjects: [], maxPeriodsPerDay: 4, isAbsent: false });
    setSubjectInput('');
  };

  const handleAddSubject = () => {
    if (!subjectInput.trim()) return;
    const currentSubjects = currentFaculty.subjects || [];
    if (!currentSubjects.includes(subjectInput.trim())) {
      setCurrentFaculty({
        ...currentFaculty,
        subjects: [...currentSubjects, subjectInput.trim()]
      });
    }
    setSubjectInput('');
  };

  const handleRemoveSubject = (subj: string) => {
    setCurrentFaculty({
      ...currentFaculty,
      subjects: (currentFaculty.subjects || []).filter(s => s !== subj)
    });
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
          alert(`Successfully imported ${json.length} faculty members!`);
        }
      } catch (err) {
        alert('Invalid JSON file format.');
      }
    };
    reader.readAsText(file);
  };

  const filteredFaculties = faculties.filter(f => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.subjects.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-4">
        <div className="flex items-center gap-3">
          <Users className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Faculty Management</h1>
            <p className="text-sm text-gray-500">Manage your pool and absence ({faculties.length} members loaded)</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium shadow-sm cursor-pointer text-sm">
            <Upload className="w-4 h-4" /> Import JSON
            <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
          </label>
          <button
            onClick={() => handleOpenEdit()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm text-sm"
          >
            <Plus className="w-4 h-4" /> Add Faculty Member
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl shadow-sm border max-w-md">
        <Search className="w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search by faculty name or subject..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full outline-none text-sm bg-transparent"
        />
      </div>

      {/* Faculty Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b text-xs uppercase text-gray-500 font-semibold">
                <th className="p-4">Status</th>
                <th className="p-4">Faculty Name</th>
                <th className="p-4">Qualified Subjects</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {filteredFaculties.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-400">
                    No faculty members found.
                  </td>
                </tr>
              ) : (
                filteredFaculties.map(faculty => (
                  <tr key={faculty.id} className={`hover:bg-gray-50 transition-colors ${faculty.isAbsent ? 'bg-red-50/50' : ''}`}>
                    
                    {/* Status Column */}
                    <td className="p-4">
                      {faculty.isAbsent ? (
                        <span className="px-2.5 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold flex items-center gap-1 w-max">
                          <UserMinus className="w-3 h-3" /> Absent
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold flex items-center gap-1 w-max">
                          <UserCheck className="w-3 h-3" /> Present
                        </span>
                      )}
                    </td>

                    {/* Name Column */}
                    <td className={`p-4 font-medium ${faculty.isAbsent ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                      {faculty.name}
                      {faculty.maxPeriodsPerDay !== 4 && (
                        <span className="ml-2 text-xs text-gray-400 font-normal">(Max: {faculty.maxPeriodsPerDay})</span>
                      )}
                    </td>

                    {/* Subjects Column */}
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1.5">
                        {faculty.subjects.map((subj, idx) => (
                          <span key={idx} className="px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-md text-xs font-medium border border-blue-100">
                            {subj}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Actions Column */}
                    <td className="p-4 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => toggleAbsent(faculty.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          faculty.isAbsent 
                            ? 'bg-green-600 text-white hover:bg-green-700' 
                            : 'bg-red-50 text-red-600 hover:bg-red-100'
                        }`}
                      >
                        {faculty.isAbsent ? 'Mark Present' : 'Mark Absent'}
                      </button>
                      <button
                        onClick={() => handleOpenEdit(faculty)}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit Faculty"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(faculty.id)}
                        className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Faculty"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {isEditing && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b bg-gray-50">
              <h2 className="text-xl font-bold text-gray-900">
                {currentFaculty.id ? 'Edit Faculty' : 'Add New Faculty'}
              </h2>
              <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFaculty} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase text-gray-500">Faculty Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Dr. Jane Smith"
                  value={currentFaculty.name || ''}
                  onChange={e => setCurrentFaculty({ ...currentFaculty, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase text-gray-500">Max Daily Periods Limit</label>
                <input
                  type="number"
                  placeholder="4"
                  value={currentFaculty.maxPeriodsPerDay ?? 4}
                  onChange={e => setCurrentFaculty({ ...currentFaculty, maxPeriodsPerDay: Number(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase text-gray-500">Qualified Subjects</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g., Mathematics"
                    value={subjectInput}
                    onChange={e => setSubjectInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubject(); } }}
                    className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleAddSubject}
                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(currentFaculty.subjects || []).map((subj, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md text-xs font-medium border border-blue-100">
                      {subj}
                      <button type="button" onClick={() => handleRemoveSubject(subj)} className="hover:text-red-600">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 border text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
                >
                  <Save className="w-4 h-4" /> Save Faculty
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}