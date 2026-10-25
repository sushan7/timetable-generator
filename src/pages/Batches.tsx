import { useState, useRef, Fragment, useMemo } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, Upload, AlertCircle, Building2, CheckCircle2, Layers } from 'lucide-react';

import type { Batch, PeriodTiming } from '../types';
import { storage } from '../utils/storage';
import { parseTimeMinutes } from '../utils/validation';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import SearchInput from '../components/ui/SearchInput';

const BUILDINGS = ['Building 1', 'Building 2'];

const defaultPeriods: PeriodTiming[] = [
  { startTime: '08:30', endTime: '10:00' },
  { startTime: '10:15', endTime: '11:45' },
  { startTime: '12:00', endTime: '13:30' },
  { startTime: '14:15', endTime: '15:45' },
  { startTime: '', endTime: '' },
  { startTime: '', endTime: '' },
];

export default function Batches() {
  const [batches, setBatches] = useState<Batch[]>(() => {
    storage.initialize();
    return storage.getBatches();
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBuilding, setSelectedBuilding] = useState<string>('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [building, setBuilding] = useState('Building 1');
  const [yearCategory, setYearCategory] = useState('First PU');
  const [name, setName] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [periods, setPeriods] = useState<PeriodTiming[]>(defaultPeriods);

  const saveToStorage = (newBatches: Batch[]) => {
    setBatches(newBatches);
    storage.setBatches(newBatches);
  };

  const validatePeriods = (p: PeriodTiming[]): string | null => {
    // Collect periods that have either start or end time defined
    const activePeriods = p.filter(item => item.startTime || item.endTime);
    if (activePeriods.length < 1) {
      return "A batch must have at least one valid period timing defined.";
    }

    let prevEndMinutes = -1;

    for (let i = 0; i < p.length; i++) {
      const { startTime, endTime } = p[i];
      // Trailing empty slots are valid
      if (!startTime && !endTime) continue;

      if (!startTime || !endTime) {
        return `Period ${i + 1}: Both start and end time must be specified.`;
      }

      const startMin = parseTimeMinutes(startTime);
      const endMin = parseTimeMinutes(endTime);

      if (startMin >= endMin) {
        return `Period ${i + 1}: Start time (${startTime}) must be strictly before end time (${endTime}).`;
      }

      if (prevEndMinutes > 0 && startMin < prevEndMinutes) {
        return `Period ${i + 1} (${startTime}) overlaps or is scheduled before the end of the previous period.`;
      }

      prevEndMinutes = endMin;
    }

    return null;
  };

  const handleAddBatch = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Batch name is required.");
      return;
    }

    if (batches.some(b => b.name.toLowerCase() === trimmedName.toLowerCase())) {
      setError(`A batch named "${trimmedName}" already exists.`);
      return;
    }

    const periodError = validatePeriods(periods);
    if (periodError) {
      setError(periodError);
      return;
    }

    // Ensure array is padded to exactly 6 slots
    const paddedPeriods = [...periods];
    while (paddedPeriods.length < 6) {
      paddedPeriods.push({ startTime: '', endTime: '' });
    }

    const newBatch: Batch = {
      id: `batch_${crypto.randomUUID()}`,
      building,
      yearCategory,
      name: trimmedName,
      roomNumber: roomNumber.trim(),
      periods: paddedPeriods,
      subjects: [
        { subject: 'Physics', count: 2 },
        { subject: 'Chemistry', count: 2 },
        { subject: 'Mathematics', count: 1 },
        { subject: 'Biology', count: 1 },
        { subject: 'English', count: 2 },
        { subject: 'Second Language', count: 2 },
      ],
    };

    saveToStorage([...batches, newBatch]);
    setIsAddModalOpen(false);
    setName('');
    setRoomNumber('');
    setPeriods(defaultPeriods);
    setSuccessMsg(`Batch "${trimmedName}" created successfully.`);
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  const handleDelete = (id: string, batchName: string) => {
    if (confirm(`Are you sure you want to delete batch "${batchName}"?`)) {
      saveToStorage(batches.filter(b => b.id !== id));
    }
  };

  const parseTimeStr = (str: string, fallbackAmPm?: string): string => {
    if (!str) return '';
    const match = str.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (!match) return '';
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    let ampm = match[3]?.toUpperCase() || fallbackAmPm;

    // If afternoon heuristics apply and ampm is missing
    if (!ampm && hours >= 1 && hours <= 6) {
      ampm = 'PM';
    }

    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      // Dynamic import of xlsx for lightweight bundle loading
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws) as Record<string, string>[];
      const importedBatches: Batch[] = [];

      rows.forEach((row, idx) => {
        const batchName = row['Batch Name'] || row['Name'] || `Imported Batch ${idx + 1}`;
        const parsedPeriods: PeriodTiming[] = [];

        for (let i = 1; i <= 6; i++) {
          const periodRaw = row[`Period ${i}`] || row[`P${i}`] || '';
          if (!periodRaw.trim()) {
            parsedPeriods.push({ startTime: '', endTime: '' });
            continue;
          }

          const splitMatch = periodRaw.match(/[-–—]/);
          const splitChar = splitMatch ? splitMatch[0] : '-';
          const parts = periodRaw.split(splitChar);

          const endPart = parts[1]?.trim() || '';
          const endAmPmMatch = endPart.match(/AM|PM/i);
          const fallbackAmPm = endAmPmMatch ? endAmPmMatch[0].toUpperCase() : undefined;

          parsedPeriods.push({
            startTime: parseTimeStr(parts[0] || '', fallbackAmPm),
            endTime: parseTimeStr(endPart, fallbackAmPm),
          });
        }

        const validationErr = validatePeriods(parsedPeriods);
        if (validationErr) {
          throw new Error(`Row ${idx + 2} (${batchName}): ${validationErr}`);
        }

        importedBatches.push({
          id: `batch_${crypto.randomUUID()}`,
          building: row['Building'] || 'Building 1',
          yearCategory: row['Year / Category'] || row['Category'] || 'First PU',
          name: batchName,
          roomNumber: row['Room No.'] || row['Room'] || '-',
          periods: parsedPeriods,
          subjects: [
            { subject: 'Physics', count: 2 },
            { subject: 'Chemistry', count: 2 },
            { subject: 'Mathematics', count: 1 },
            { subject: 'Biology', count: 1 },
            { subject: 'English', count: 2 },
            { subject: 'Second Language', count: 2 },
          ],
        });
      });

      saveToStorage([...batches, ...importedBatches]);
      setSuccessMsg(`Successfully imported ${importedBatches.length} batch(es) from Excel.`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error importing file. Check column headers and format.';
      setError(msg);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const filteredBatches = useMemo(() => {
    return batches.filter(b => {
      if (selectedBuilding !== 'ALL' && b.building !== selectedBuilding) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return b.name.toLowerCase().includes(q) ||
               b.roomNumber.toLowerCase().includes(q) ||
               b.yearCategory.toLowerCase().includes(q);
      }
      return true;
    });
  }, [batches, selectedBuilding, searchQuery]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        icon={<Building2 className="w-6 h-6" />}
        title="Batch & Section Management"
        subtitle={`${batches.length} total academic batches and room timing schedules`}
        actions={
          <>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
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
              Import Excel
            </Button>
            <Button
              variant="primary"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setIsAddModalOpen(true)}
            >
              Add New Batch
            </Button>
          </>
        }
      />

      {error && (
        <div className="p-4 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl flex items-center gap-2 text-sm font-medium shadow-2xs">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-500" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl flex items-center gap-2 text-sm font-medium shadow-2xs">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Building Filter Pills & Search */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold">
            <button
              onClick={() => setSelectedBuilding('ALL')}
              className={`px-3.5 py-1.5 rounded-lg transition-all ${
                selectedBuilding === 'ALL'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Buildings ({batches.length})
            </button>
            {BUILDINGS.map(b => (
              <button
                key={b}
                onClick={() => setSelectedBuilding(b)}
                className={`px-3.5 py-1.5 rounded-lg transition-all ${
                  selectedBuilding === b
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {b} ({batches.filter(item => item.building === b).length})
              </button>
            ))}
          </div>
        </div>

        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search batches by name or room..."
          className="max-w-xs w-full"
        />
      </div>

      <Card padding={false} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-xs uppercase text-slate-500 font-semibold tracking-wider">
                <th className="p-4 w-12 text-center"></th>
                <th className="p-4">Batch Name</th>
                <th className="p-4">Campus Building</th>
                <th className="p-4">Year / Category</th>
                <th className="p-4">Room No.</th>
                <th className="p-4">Active Periods</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-10 text-center">
                    <Layers className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-600 text-sm">No batches match your search</p>
                    <p className="text-xs text-slate-400 mt-0.5">Try selecting another building or clearing your query.</p>
                  </td>
                </tr>
              ) : (
                filteredBatches.map(batch => {
                  const activePeriodCount = batch.periods.filter(p => p.startTime && p.endTime).length;
                  const isExpanded = expandedId === batch.id;
                  return (
                    <Fragment key={batch.id}>
                      <tr
                        className={`hover:bg-slate-50/70 transition-colors ${isExpanded ? 'bg-indigo-50/20' : ''}`}
                      >
                        <td className="p-4 text-center">
                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : batch.id)}
                            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                            aria-label={isExpanded ? 'Collapse timings' : 'Expand timings'}
                          >
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                        </td>
                        <td className="p-4 font-bold text-slate-900">
                          {batch.name}
                        </td>
                        <td className="p-4 text-slate-600">
                          {batch.building}
                        </td>
                        <td className="p-4">
                          <Badge tone="info">{batch.yearCategory}</Badge>
                        </td>
                        <td className="p-4 font-medium text-slate-700">
                          Room {batch.roomNumber || '-'}
                        </td>
                        <td className="p-4">
                          <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md">
                            {activePeriodCount} period{activePeriodCount !== 1 ? 's' : ''} / day
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(batch.id, batch.name)}
                            className="hover:text-rose-600 hover:bg-rose-50"
                            title="Delete Batch"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={7} className="p-4 sm:p-6 border-l-4 border-indigo-600">
                            <div className="mb-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                              Daily Timing Schedule for {batch.name}
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                              {batch.periods.map((p, i) => (
                                <div
                                  key={i}
                                  className={`p-3 rounded-xl border text-center transition-all ${
                                    p.startTime && p.endTime
                                      ? 'bg-white border-indigo-100 shadow-2xs'
                                      : 'bg-slate-100/60 border-dashed border-slate-200 text-slate-400'
                                  }`}
                                >
                                  <div className="text-[11px] font-bold text-slate-400 mb-1">
                                    Period {i + 1}
                                  </div>
                                  <div className="text-xs font-bold text-indigo-950">
                                    {p.startTime && p.endTime ? `${p.startTime} – ${p.endTime}` : 'Unassigned'}
                                  </div>
                                </div>
                              ))}
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

      {/* Add Batch Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Create New Academic Batch"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
            <Button variant="primary" icon={<Plus className="w-4 h-4" />} form="add-batch-form" type="submit">
              Save Batch
            </Button>
          </>
        }
      >
        <form id="add-batch-form" onSubmit={handleAddBatch} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase text-slate-500">Campus Building</label>
              <select
                value={building}
                onChange={e => setBuilding(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white"
                required
              >
                {BUILDINGS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase text-slate-500">Year / Section Category</label>
              <input
                list="years-list"
                value={yearCategory}
                onChange={e => setYearCategory(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
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
              <label className="text-xs font-semibold uppercase text-slate-500">Batch Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                required
                placeholder="e.g. Lakshya 10"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase text-slate-500">Room Number</label>
              <input
                value={roomNumber}
                onChange={e => setRoomNumber(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                required
                placeholder="e.g. 204(A)"
              />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold uppercase text-slate-700">
                Period Timings (Chronological 24-Hour Format)
              </label>
              <span className="text-[11px] text-slate-400">Leave unused trailing periods blank</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {periods.map((period, i) => (
                <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                  <div className="text-[11px] font-bold text-slate-500 text-center">Period {i + 1}</div>
                  <div className="space-y-1">
                    <input
                      type="time"
                      value={period.startTime}
                      onChange={e => {
                        const newP = [...periods];
                        newP[i] = { ...newP[i], startTime: e.target.value };
                        setPeriods(newP);
                      }}
                      className="w-full text-xs p-1.5 border border-slate-200 rounded-lg bg-white"
                      title="Start Time"
                    />
                    <input
                      type="time"
                      value={period.endTime}
                      onChange={e => {
                        const newP = [...periods];
                        newP[i] = { ...newP[i], endTime: e.target.value };
                        setPeriods(newP);
                      }}
                      className="w-full text-xs p-1.5 border border-slate-200 rounded-lg bg-white"
                      title="End Time"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}