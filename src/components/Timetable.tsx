import { useState, useEffect, useRef } from 'react';
import { Calendar, Image as ImageIcon, Loader2, Play, Lock, Unlock, Clock, MapPin } from 'lucide-react';
import html2canvas from 'html2canvas';
import type { Faculty, Batch, Allocation } from '../types';
import { generateTimetableV2 } from '../utils/scheduler';
import { initialFaculty, initialBatches } from '../utils/seedData';

export default function Timetable() {
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const storedFaculties = JSON.parse(localStorage.getItem('sdtg_faculties') || 'null') || initialFaculty;
    const storedBatches = JSON.parse(localStorage.getItem('batches') || 'null') || initialBatches;
    
    setFaculties(storedFaculties);
    setBatches(storedBatches);

    const generated = generateTimetableV2(storedBatches, storedFaculties, [], []);
    setAllocations(generated);
  }, []);

  const handleRegenerate = () => {
    setIsGenerating(true);
    setTimeout(() => {
      const freshFaculties = JSON.parse(localStorage.getItem('sdtg_faculties') || 'null') || faculties;
      setFaculties(freshFaculties);

      const updatedAllocations = generateTimetableV2(batches, freshFaculties, allocations, []);
      setAllocations(updatedAllocations);
      setIsGenerating(false);
    }, 400); // slightly longer timeout so the spinner animation looks natural
  };

  const toggleFreeze = (batchId: string, periodIndex: number) => {
    setAllocations(prev =>
      prev.map(a => {
        if (a.batchId === batchId && a.periodIndex === periodIndex) {
          return { ...a, frozen: !a.frozen };
        }
        return a;
      })
    );
  };

  const getFacultyName = (id: string) => {
    if (!id) return 'Unassigned';
    return faculties.find(f => f.id === id)?.name || 'Unknown';
  };

  const formatTime = (time24: string) => {
    if (!time24) return '';
    const parts = time24.split(':');
    if (parts.length < 2) return '';
    const [h, m] = parts;
    let hours = parseInt(h);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${m} ${ampm}`;
  };

  const exportAsImage = async () => {
    if (!tableRef.current) return;
    setIsExporting(true);
    try {
      const canvas = await html2canvas(tableRef.current, { 
        scale: 2,
        backgroundColor: '#f8fafc' // Force light background for export
      });
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = 'Smart_Timetable.png';
      link.click();
    } finally { 
      setIsExporting(false); 
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[90rem] mx-auto space-y-8 font-sans bg-slate-50/50 min-h-screen">
      
      {/* --- HEADER SECTION --- */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Calendar className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-indigo-700 tracking-tight">
              Master Timetable
            </h1>
            <p className="text-sm font-medium text-slate-500 mt-1 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>
              V2 Engine Active
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button 
            onClick={handleRegenerate} 
            disabled={isGenerating}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-emerald-500/30 hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-70 disabled:hover:translate-y-0"
          >
            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />} 
            Regenerate
          </button>
          <button 
            onClick={exportAsImage} 
            disabled={isExporting} 
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-white border-2 border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 hover:border-blue-200 hover:text-blue-700 hover:-translate-y-0.5 transition-all duration-200"
          >
            {isExporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />} 
            Export
          </button>
        </div>
      </div>

      {/* --- TABLE SECTION --- */}
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto" ref={tableRef}>
          <table className="w-full text-left border-collapse min-w-[1200px]">
            
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200">
                <th className="p-5 font-bold text-slate-700 uppercase tracking-wider text-xs w-64">
                  Batch Information
                </th>
                {Array.from({ length: 6 }).map((_, i) => (
                  <th key={i} className="p-5 font-bold text-slate-700 uppercase tracking-wider text-xs text-center border-l border-slate-200 w-48">
                    Period {i + 1}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {batches.map((batch) => (
                <tr key={batch.id} className="group hover:bg-blue-50/30 transition-colors duration-200">
                  
                  {/* Batch Details Column */}
                  <td className="p-5 bg-white group-hover:bg-transparent transition-colors">
                    <div className="font-extrabold text-slate-800 text-base mb-1">
                      {batch.name || 'Unnamed Batch'}
                    </div>
                    <div className="flex flex-col gap-1.5 mt-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md w-max">
                        <MapPin className="w-3.5 h-3.5" /> 
                        {batch.building || 'Main Block'}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-md w-max">
                        Room {batch.roomNumber || '-'}
                      </span>
                    </div>
                  </td>
                  
                  {/* Period Columns */}
                  {Array.from({ length: 6 }).map((_, i) => {
                    const period = (batch.periods && Array.isArray(batch.periods)) ? batch.periods[i] : null;
                    const allocation = allocations.find(a => a.batchId === batch.id && a.periodIndex === i);
                    
                    return (
                      <td key={i} className="p-3 border-l border-slate-100 align-top">
                        
                        {/* Time Indicator */}
                        {period && period.startTime && (
                          <div className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-400 mb-2">
                            <Clock className="w-3 h-3" />
                            {formatTime(period.startTime)} - {formatTime(period.endTime)}
                          </div>
                        )}

                        {/* Assignment Card */}
                        <div 
                          className={`relative group/card flex flex-col justify-center h-20 px-3 py-2 rounded-xl transition-all duration-200 ${
                            !allocation 
                              ? 'bg-slate-50 border-2 border-dashed border-slate-200 text-slate-400 hover:border-slate-300' 
                              : allocation.frozen 
                                ? 'bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/80 shadow-sm shadow-amber-100 text-amber-900' 
                                : 'bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200/80 shadow-sm shadow-blue-100 text-blue-900 hover:shadow-md hover:-translate-y-0.5'
                          }`}
                          title={allocation?.explanation ? allocation.explanation.join('\n') : 'Unassigned'}
                        >
                          {/* Subject */}
                          <div className={`font-bold text-sm leading-tight text-center ${!allocation ? 'text-slate-400' : ''}`}>
                            {allocation?.subject || 'Empty Slot'}
                          </div>
                          
                          {/* Faculty */}
                          <div className={`text-xs text-center mt-1 font-medium ${!allocation ? 'hidden' : allocation.frozen ? 'text-amber-700' : 'text-blue-600'}`}>
                            {getFacultyName(allocation?.facultyId || '')}
                          </div>

                          {/* Action Button (Lock/Unlock) */}
                          {allocation && (
                            <button
                              onClick={() => toggleFreeze(batch.id, i)}
                              className={`absolute -top-2 -right-2 p-1.5 rounded-full shadow-sm transition-all duration-200 ${
                                allocation.frozen 
                                  ? 'bg-amber-400 text-white hover:bg-amber-500 hover:scale-110 z-10' 
                                  : 'bg-white text-slate-400 border border-slate-200 opacity-0 group-hover/card:opacity-100 hover:text-indigo-600 hover:border-indigo-200 hover:scale-110 z-10'
                              }`}
                              title={allocation.frozen ? 'Unfreeze Slot' : 'Freeze Slot'}
                            >
                              {allocation.frozen ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>

                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>

          </table>
        </div>
      </div>
    </div>
  );
}