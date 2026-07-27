import { useState, useEffect, useRef, Fragment } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, Upload, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { Batch, PeriodTiming } from '../types';
import { storage } from '../utils/storage';
import Button from './ui/Button';
import Badge from './ui/Badge';
import Card from './ui/Card';

const BUILDINGS = ['Building 1', 'Building 2'];
const defaultPeriods: PeriodTiming[] = Array(6).fill(null).map(() => ({ startTime: '', endTime: '' }));

export default function BatchManagement() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [building, setBuilding] = useState('Building 1');
  const [yearCategory, setYearCategory] = useState('');
  const [name, setName] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [periods, setPeriods] = useState<PeriodTiming[]>(defaultPeriods);
  const [subjects, setSubjects] = useState<{ subject: string; count: number }[]>([{ subject: '', count: 1 }]);

  useEffect(() => {
    storage.initialize();
    setBatches(storage.getBatches());
  }, []);

  const saveToStorage = (newBatches: Batch[]) => {
    setBatches(newBatches);
    storage.setBatches(newBatches);
  };

  const validatePeriods = (p: PeriodTiming[]) => {
    for (let i = 0; i < 6; i++) {
      if (!p[i].startTime || !p[i].endTime) return "All 6 periods must have start and end times.";
      if (p[i].startTime >= p[i].endTime) return `Period ${i + 1}: Start time must be before end time.`;
      if (i > 0 && p[i].startTime < p[i - 1].endTime) return `Period ${i + 1} overlaps or is out of order with Period ${i}.`;
    }
    return null;
  };

  const handleAddBatch = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (batches.some(b => b.name.toLowerCase() === name.toLowerCase())) {
      setError("Batch name must be unique.");
      return;
    }
    const periodError = validatePeriods(periods);
    if (periodError) {
      setError(periodError);
      return;
    }

    const newBatch: Batch = {
      id: crypto.randomUUID(), building, yearCategory, name, roomNumber, periods,
      subjects: subjects.filter(s => s.subject.trim() !== '')
    };
    saveToStorage([...batches, newBatch]);

    setName('');
    setRoomNumber('');
    setPeriods(defaultPeriods);
    setSubjects([{ subject: '', count: 1 }]);
  };

  const handleDelete = (id: string) => saveToStorage(batches.filter(b => b.id !== id));

  const parseTimeStr = (str: string) => {
    if (!str) return '';
    const match = str.match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if (!match) return '';
    let [, h, m, ampm] = match;
    let hours = parseInt(h);
    if (ampm && ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
    if (ampm && ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:${m}`;
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws) as any[];
        const importedBatches: Batch[] = [];

        data.forEach((row, idx) => {
          const parsedPeriods: PeriodTiming[] = [];
          for (let i = 1; i <= 6; i++) {
            const periodRaw = row[`Period ${i}`] || '';
            const times = periodRaw.split('–');
            const splitChar = times.length > 1 ? '–' : '-';
            const parts = periodRaw.split(splitChar);
            parsedPeriods.push({ startTime: parseTimeStr(parts[0] || ''), endTime: parseTimeStr(parts[1] || '') });
          }

          const validationErr = validatePeriods(parsedPeriods);
          if (validationErr) throw new Error(`Row ${idx + 2} (${row['Batch Name']}): ${validationErr}`);

          importedBatches.push({
            id: crypto.randomUUID(),
            building: row['Building'] || 'Building 1',
            yearCategory: row['Year / Category'] || 'Unknown',
            name: row['Batch Name'],
            roomNumber: row['Room No.'],
            periods: parsedPeriods,
            subjects: []
          });
        });

        saveToStorage([...batches, ...importedBatches]);
      } catch (err: any) {
        setError(err.message || 'Error importing file. Check format.');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {error && (
        <div className="p-4 bg-red-50 text-red-700 border border-red-100 rounded-lg flex items-center gap-2 text-sm font-medium">
          <AlertCircle className="w-5 h-5 shrink-0" /> {error}
        </div>
      )}

      <Card>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-bold text-slate-900">Add New Batch</h2>
          <div>
            <input type="file" accept=".xlsx,.csv" className="hidden" ref={fileInputRef} onChange={handleImport} />
            <Button variant="secondary" icon={<Upload className="w-4 h-4" />} onClick={() => fileInputRef.current?.click()}>
              Import Excel
            </Button>
          </div>
        </div>

        <form onSubmit={handleAddBatch} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Building</label>
              <select value={building} onChange={e => setBuilding(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-sm" required>
                {BUILDINGS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Year / Category</label>
              <input
                list="years" value={yearCategory} onChange={e => setYearCategory(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg text-sm" required placeholder="e.g. 1st Year"
              />
              <datalist id="years">
                <option value="1st Year" /><option value="2nd Year" /><option value="NLT" />
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Batch Name</label>
              <input value={name} onChange={e => setName(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-sm" required placeholder="Lakshya-1" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Room No.</label>
              <input value={roomNumber} onChange={e => setRoomNumber(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-sm" required placeholder="206" />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-sm font-semibold mb-3 text-slate-700">Period Timings (Must be chronological)</h3>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              {periods.map((period, i) => (
                <div key={i} className="space-y-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <div className="text-xs font-semibold text-center text-slate-500">Period {i + 1}</div>
                  <input
                    type="time" required value={period.startTime}
                    onChange={(e) => { const newP = [...periods]; newP[i] = { ...newP[i], startTime: e.target.value }; setPeriods(newP); }}
                    className="w-full text-sm p-1 border border-slate-200 rounded"
                  />
                  <input
                    type="time" required value={period.endTime}
                    onChange={(e) => { const newP = [...periods]; newP[i] = { ...newP[i], endTime: e.target.value }; setPeriods(newP); }}
                    className="w-full text-sm p-1 border border-slate-200 rounded"
                  />
                </div>
              ))}
            </div>
          </div>

          <Button type="submit" variant="primary" icon={<Plus className="w-4 h-4" />}>Save Batch</Button>
        </form>
      </Card>

      <Card padding={false}>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="p-4 w-10"></th>
              <th className="p-4 font-semibold text-slate-600 text-sm">Building</th>
              <th className="p-4 font-semibold text-slate-600 text-sm">Category</th>
              <th className="p-4 font-semibold text-slate-600 text-sm">Batch Name</th>
              <th className="p-4 font-semibold text-slate-600 text-sm">Room</th>
              <th className="p-4 font-semibold text-slate-600 text-sm">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {batches.map(batch => (
              <Fragment key={batch.id}>
                <tr className="hover:bg-slate-50">
                  <td className="p-4">
                    <button onClick={() => setExpandedId(expandedId === batch.id ? null : batch.id)} className="text-slate-400 hover:text-slate-700">
                      {expandedId === batch.id ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                    </button>
                  </td>
                  <td className="p-4 text-sm text-slate-700">{batch.building}</td>
                  <td className="p-4"><Badge tone="info">{batch.yearCategory}</Badge></td>
                  <td className="p-4 font-medium text-slate-900 text-sm">{batch.name}</td>
                  <td className="p-4 text-sm text-slate-700">{batch.roomNumber}</td>
                  <td className="p-4">
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(batch.id)} className="hover:text-red-600 hover:bg-red-50">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
                {expandedId === batch.id && (
                  <tr className="bg-slate-50/60">
                    <td colSpan={6} className="p-4 border-l-4 border-indigo-500">
                      <div className="grid grid-cols-6 gap-4">
                        {batch.periods.map((p, i) => (
                          <div key={i} className="bg-white p-2 border border-slate-200 rounded-lg text-center">
                            <div className="text-xs font-semibold text-slate-500 mb-1">Period {i + 1}</div>
                            <div className="text-sm font-medium text-indigo-700">{p.startTime} - {p.endTime}</div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}