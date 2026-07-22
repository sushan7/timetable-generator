import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, Upload, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { Batch, PeriodTiming } from '../types';

const BUILDINGS = ['Building 1', 'Building 2'];

const defaultPeriods: PeriodTiming[] = Array(6).fill({ startTime: '', endTime: '' });

export default function BatchManagement() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [building, setBuilding] = useState('Building 1');
  const [yearCategory, setYearCategory] = useState('');
  const [name, setName] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [periods, setPeriods] = useState<PeriodTiming[]>(defaultPeriods);
  const [subjects, setSubjects] = useState<{ subject: string; count: number }[]>([
    { subject: '', count: 1 }
  ]);

  // Migrate & Load Data
  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('batches') || '[]');
    const migrated = stored.map((b: any) => ({
      ...b,
      building: b.building || 'Building 1',
      yearCategory: b.yearCategory || 'Default',
      periods: b.periods?.length === 6 ? b.periods : defaultPeriods
    }));
    setBatches(migrated);
  }, []);

  const saveToStorage = (newBatches: Batch[]) => {
    setBatches(newBatches);
    localStorage.setItem('batches', JSON.stringify(newBatches));
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
      id: crypto.randomUUID(),
      building,
      yearCategory,
      name,
      roomNumber,
      periods,
      subjects: subjects.filter(s => s.subject.trim() !== '')
    };

    saveToStorage([...batches, newBatch]);
    
    // Reset Form
    setName('');
    setRoomNumber('');
    setPeriods(defaultPeriods);
    setSubjects([{ subject: '', count: 1 }]);
  };

  const handleDelete = (id: string) => {
    saveToStorage(batches.filter(b => b.id !== id));
  };

  // Helper to parse dirty 12hr time strings into 24hr "HH:mm"
  const parseTimeStr = (str: string) => {
    if (!str) return '';
    const match = str.match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if (!match) return '';
    let [_, h, m, ampm] = match;
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
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        const importedBatches: Batch[] = [];

        data.forEach((row, idx) => {
          const parsedPeriods: PeriodTiming[] = [];
          for (let i = 1; i <= 6; i++) {
            const periodRaw = row[`Period ${i}`] || '';
            const times = periodRaw.split('–'); // Split by en-dash or hyphen
            const splitChar = times.length > 1 ? '–' : '-';
            const parts = periodRaw.split(splitChar);
            
            parsedPeriods.push({
              startTime: parseTimeStr(parts[0] || ''),
              endTime: parseTimeStr(parts[1] || '')
            });
          }

          const validationErr = validatePeriods(parsedPeriods);
          if (validationErr) {
            throw new Error(`Row ${idx + 2} (${row['Batch Name']}): ${validationErr}`);
          }

          importedBatches.push({
            id: crypto.randomUUID(),
            building: row['Building'] || 'Building 1',
            yearCategory: row['Year / Category'] || 'Unknown',
            name: row['Batch Name'],
            roomNumber: row['Room No.'],
            periods: parsedPeriods,
            subjects: [] // Assign empty subjects initially for imported data
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
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" /> {error}
        </div>
      )}

      {/* Form Section */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-900">Add New Batch</h2>
          <div>
            <input type="file" accept=".xlsx,.csv" className="hidden" ref={fileInputRef} onChange={handleImport} />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100"
            >
              <Upload className="w-4 h-4" /> Import Excel
            </button>
          </div>
        </div>

        <form onSubmit={handleAddBatch} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Building</label>
              <select 
                value={building} onChange={e => setBuilding(e.target.value)}
                className="w-full p-2 border rounded-lg" required
              >
                {BUILDINGS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Year / Category</label>
              <input 
                list="years" value={yearCategory} onChange={e => setYearCategory(e.target.value)}
                className="w-full p-2 border rounded-lg" required placeholder="e.g. 1st Year"
              />
              <datalist id="years">
                <option value="1st Year" />
                <option value="2nd Year" />
                <option value="NLT" />
              </datalist>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Batch Name</label>
              <input 
                value={name} onChange={e => setName(e.target.value)}
                className="w-full p-2 border rounded-lg" required placeholder="Lakshya-1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Room No.</label>
              <input 
                value={roomNumber} onChange={e => setRoomNumber(e.target.value)}
                className="w-full p-2 border rounded-lg" required placeholder="206"
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold mb-3 text-gray-700">Period Timings (Must be chronological)</h3>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              {periods.map((period, i) => (
                <div key={i} className="space-y-2 bg-gray-50 p-2 rounded border">
                  <div className="text-xs font-semibold text-center text-gray-500">Period {i + 1}</div>
                  <input 
                    type="time" required
                    value={period.startTime}
                    onChange={(e) => {
                      const newP = [...periods];
                      newP[i].startTime = e.target.value;
                      setPeriods(newP);
                    }}
                    className="w-full text-sm p-1 border rounded"
                  />
                  <input 
                    type="time" required
                    value={period.endTime}
                    onChange={(e) => {
                      const newP = [...periods];
                      newP[i].endTime = e.target.value;
                      setPeriods(newP);
                    }}
                    className="w-full text-sm p-1 border rounded"
                  />
                </div>
              ))}
            </div>
          </div>

          <button type="submit" className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4" /> Save Batch
          </button>
        </form>
      </div>

      {/* List Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="p-4 font-semibold text-gray-600 w-10"></th>
              <th className="p-4 font-semibold text-gray-600">Building</th>
              <th className="p-4 font-semibold text-gray-600">Category</th>
              <th className="p-4 font-semibold text-gray-600">Batch Name</th>
              <th className="p-4 font-semibold text-gray-600">Room</th>
              <th className="p-4 font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {batches.map(batch => (
              <React.Fragment key={batch.id}>
                <tr className="hover:bg-gray-50">
                  <td className="p-4">
                    <button onClick={() => setExpandedId(expandedId === batch.id ? null : batch.id)}>
                      {expandedId === batch.id ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                    </button>
                  </td>
                  <td className="p-4">{batch.building}</td>
                  <td className="p-4"><span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-sm">{batch.yearCategory}</span></td>
                  <td className="p-4 font-medium text-gray-900">{batch.name}</td>
                  <td className="p-4">{batch.roomNumber}</td>
                  <td className="p-4">
                    <button onClick={() => handleDelete(batch.id)} className="text-red-500 hover:text-red-700">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
                {expandedId === batch.id && (
                  <tr className="bg-gray-50/50">
                    <td colSpan={6} className="p-4 border-l-4 border-blue-500">
                      <div className="grid grid-cols-6 gap-4">
                        {batch.periods.map((p, i) => (
                          <div key={i} className="bg-white p-2 border rounded-lg text-center shadow-sm">
                            <div className="text-xs font-semibold text-gray-500 mb-1">Period {i + 1}</div>
                            <div className="text-sm font-medium text-blue-700">{p.startTime} - {p.endTime}</div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}