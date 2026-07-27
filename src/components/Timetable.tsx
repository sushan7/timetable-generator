import { useState, useEffect, useRef, useMemo } from 'react';
import { Calendar, Image as ImageIcon, Loader2, Play, Lock, Unlock, Clock, MapPin, RefreshCw, AlertTriangle, Building2, Users } from 'lucide-react';
import html2canvas from 'html2canvas';
import type { Faculty, Batch, Allocation, DayOfWeek } from '../types';
import { WEEKDAYS } from '../types';
import { generateTimetableV2, patchAbsences } from '../utils/scheduler';
import { storage } from '../utils/storage';
import { SECTIONS, groupBatchesBySection, type SectionId } from '../utils/sections';

const PCMB_SUBJECTS = ['Physics', 'Chemistry', 'Mathematics', 'Biology'];

export default function Timetable() {
  const [currentDay, setCurrentDay] = useState<DayOfWeek>('Monday');
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    storage.initialize();
    setFaculties(storage.getFaculty());
    setBatches(storage.getBatches());
  }, []);

  useEffect(() => {
    loadDay(currentDay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDay, batches.length]);

  const loadDay = (day: DayOfWeek) => {
    const existing = storage.getDayTimetable(day);
    if (existing) {
      setAllocations(existing.allocations);
      setHasGenerated(true);
    } else {
      setAllocations([]);
      setHasGenerated(false);
    }
  };

  const persistDay = (day: DayOfWeek, newAllocations: Allocation[]) => {
    storage.setDayTimetable(day, {
      id: `tt_${day}`,
      date: day,
      status: 'Draft',
      allocations: newAllocations,
    });
  };

  const handleGenerate = () => {
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
      persistDay(currentDay, generated);
      setIsGenerating(false);
    }, 400);
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
    }, 300);
  };

  const toggleFreeze = (batchId: string, periodIndex: number) => {
    const target = allocations.find(a => a.batchId === batchId && a.periodIndex === periodIndex);
    if (target) {
      storage.logAuditAction('FREEZE_TOGGLE', {
        batchId,
        periodIndex,
        newFacultyId: target.facultyId,
        reason: target.frozen ? `Unfroze slot (${currentDay})` : `Froze slot (${currentDay})`,
      });
    }

    const updated = allocations.map(a => {
      if (a.batchId === batchId && a.periodIndex === periodIndex) {
        return { ...a, frozen: !a.frozen };
      }
      return a;
    });
    setAllocations(updated);
    persistDay(currentDay, updated);
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
    if (!pageRef.current) return;
    setIsExporting(true);
    try {
      const canvas = await html2canvas(pageRef.current, {
        scale: 2,
        backgroundColor: '#f8fafc'
      });
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `Timetable_${currentDay}.png`;
      link.click();
    } finally {
      setIsExporting(false);
    }
  };

  const sectionedBatches = useMemo(() => groupBatchesBySection(batches), [batches]);

  const quota = useMemo(() => {
    const allDays = storage.getAllWeekAllocations();
    let pcmb = 0, lang = 0;
    WEEKDAYS.forEach(d => {
      (allDays[d] || []).forEach(a => {
        if (!a.facultyId) return;
        if (PCMB_SUBJECTS.includes(a.subject)) pcmb++; else lang++;
      });
    });
    const total = pcmb + lang;
    const settings = storage.getSettings();
    const actualPCMBPct = total === 0 ? 0 : Math.round((pcmb / total) * 100);
    return {
      pcmb, lang, total,
      targetPCMB: settings.pcmbWeight,
      targetLang: settings.languageWeight,
      actualPCMBPct,
      actualLangPct: total === 0 ? 0 : 100 - actualPCMBPct,
    };
  }, [allocations]);

  const getSectionStats = (sectionBatches: Batch[]) => {
    const batchIds = new Set(sectionBatches.map(b => b.id));
    const sectionAllocations = allocations.filter(a => batchIds.has(a.batchId));
    const totalSlots = sectionBatches.reduce((sum, b) => sum + b.periods.filter(p => p.startTime).length, 0);
    const filled = sectionAllocations.filter(a => a.facultyId).length;
    const gaps = sectionAllocations.filter(a => a.vacatedFacultyId && !a.facultyId).length;
    const uniqueFaculty = new Set(sectionAllocations.filter(a => a.facultyId).map(a => a.facultyId)).size;
    return { totalSlots, filled, gaps, uniqueFaculty, batchCount: sectionBatches.length };
  };

  const gapCount = allocations.filter(a => a.vacatedFacultyId && !a.facultyId).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[95rem] mx-auto space-y-6 font-sans bg-slate-50/50 min-h-screen" ref={pageRef}>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Calendar className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-indigo-700 tracking-tight">
              Weekly Timetable
            </h1>
            <p className="text-sm font-medium text-slate-500 mt-1 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>
              V2 Engine Active — {currentDay} — 4 lecture/day cap
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-emerald-500/30 hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-70 disabled:hover:translate-y-0"
          >
            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
            {hasGenerated ? 'Regenerate' : 'Generate'} {currentDay}
          </button>
          <button
            onClick={handleSyncAbsences}
            disabled={isSyncing || !hasGenerated}
            title="Re-check today's allocations against the current absence list, without regenerating the whole day"
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-amber-50 border-2 border-amber-200 text-amber-700 font-semibold rounded-xl hover:bg-amber-100 transition-all duration-200 disabled:opacity-50"
          >
            {isSyncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
            Sync Absences
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

      <div className="flex flex-wrap gap-2 bg-white p-2 rounded-xl shadow-sm border border-slate-200">
        {WEEKDAYS.map(day => {
          const dayHasData = !!storage.getDayTimetable(day);
          return (
            <button
              key={day}
              onClick={() => setCurrentDay(day)}
              className={`flex-1 min-w-[100px] px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                currentDay === day ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {day}
              {dayHasData && <span className={`ml-1.5 inline-block w-1.5 h-1.5 rounded-full ${currentDay === day ? 'bg-white' : 'bg-emerald-400'}`}></span>}
            </button>
          );
        })}
      </div>

      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Weekly PCMB / Language Balance</h2>
          <span className="text-xs text-slate-400">Target: {quota.targetPCMB}% PCMB · {quota.targetLang}% Language</span>
        </div>
        <div className="flex h-3 w-full rounded-full overflow-hidden bg-slate-100">
          <div className="bg-blue-500 h-full transition-all duration-500" style={{ width: `${quota.actualPCMBPct}%` }} />
          <div className="bg-indigo-300 h-full transition-all duration-500" style={{ width: `${quota.actualLangPct}%` }} />
        </div>
        <div className="flex justify-between text-xs font-medium text-slate-500">
          <span>PCMB: {quota.pcmb} periods ({quota.actualPCMBPct}%)</span>
          <span>Language: {quota.lang} periods ({quota.actualLangPct}%)</span>
        </div>
        {gapCount > 0 && (
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4" />
            {gapCount} unresolved gap{gapCount > 1 ? 's' : ''} on {currentDay} — a faculty went absent and no substitute or alternate subject was available.
          </div>
        )}
      </div>

      {!hasGenerated && (
        <div className="bg-white p-10 rounded-2xl shadow-sm border border-dashed border-slate-300 text-center text-slate-500">
          No timetable generated for <span className="font-semibold">{currentDay}</span> yet. Click "Generate {currentDay}" above to build it.
        </div>
      )}

      {hasGenerated && SECTIONS.map(section => {
        const sectionBatches = sectionedBatches[section.id];
        if (sectionBatches.length === 0) return null;
        const stats = getSectionStats(sectionBatches);
        const fillPct = stats.totalSlots === 0 ? 0 : Math.round((stats.filled / stats.totalSlots) * 100);

        return (
          <div key={section.id} className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden">

            <div className="p-5 bg-gradient-to-r from-slate-50 to-white border-b border-slate-200 flex flex-col md:flex-row justify-between md:items-center gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-lg">{section.label}</h3>
                  <p className="text-xs text-slate-500">{stats.batchCount} batch{stats.batchCount !== 1 ? 'es' : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <Users className="w-3.5 h-3.5" /> {stats.uniqueFaculty} faculty involved
                </span>
                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
                  {stats.filled}/{stats.totalSlots} periods filled ({fillPct}%)
                </span>
                {stats.gaps > 0 && (
                  <span className="px-2.5 py-1 bg-red-50 text-red-700 rounded-full border border-red-100">
                    {stats.gaps} gap{stats.gaps > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1100px]">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200">
                    <th className="p-4 font-bold text-slate-700 uppercase tracking-wider text-xs w-60">Batch Information</th>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <th key={i} className="p-4 font-bold text-slate-700 uppercase tracking-wider text-xs text-center border-l border-slate-200 w-44">
                        Period {i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {sectionBatches.map((batch) => (
                    <tr key={batch.id} className="group hover:bg-blue-50/30 transition-colors duration-200">

                      <td className="p-4 bg-white group-hover:bg-transparent transition-colors">
                        <div className="font-extrabold text-slate-800 text-base mb-1">
                          {batch.name || 'Unnamed Batch'}
                        </div>
                        <div className="flex flex-col gap-1.5 mt-2">
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md w-max">
                            <MapPin className="w-3.5 h-3.5" />
                            {batch.yearCategory}
                          </span>
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-md w-max">
                            Room {batch.roomNumber || '-'}
                          </span>
                        </div>
                      </td>

                      {Array.from({ length: 6 }).map((_, i) => {
                        const period = (batch.periods && Array.isArray(batch.periods)) ? batch.periods[i] : null;
                        const allocation = allocations.find(a => a.batchId === batch.id && a.periodIndex === i);
                        const isGap = !!(allocation && allocation.vacatedFacultyId && !allocation.facultyId);
                        const hasNoTiming = !period || !period.startTime;

                        return (
                          <td key={i} className="p-3 border-l border-slate-100 align-top">

                            {!hasNoTiming && (
                              <div className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-400 mb-2">
                                <Clock className="w-3 h-3" />
                                {formatTime(period!.startTime)} - {formatTime(period!.endTime)}
                              </div>
                            )}

                            {hasNoTiming ? (
                              <div className="h-20 flex items-center justify-center text-[11px] text-slate-300 italic">
                                No period slot
                              </div>
                            ) : (
                              <div
                                className={`relative group/card flex flex-col justify-center h-20 px-3 py-2 rounded-xl transition-all duration-200 ${
                                  isGap
                                    ? 'bg-red-50 border-2 border-dashed border-red-300 text-red-600'
                                    : !allocation
                                      ? 'bg-slate-50 border-2 border-dashed border-slate-200 text-slate-400 hover:border-slate-300'
                                      : allocation.frozen
                                        ? 'bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/80 shadow-sm shadow-amber-100 text-amber-900'
                                        : 'bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200/80 shadow-sm shadow-blue-100 text-blue-900 hover:shadow-md hover:-translate-y-0.5'
                                }`}
                                title={allocation?.explanation ? allocation.explanation.join('\n') : 'Unassigned — free period'}
                              >
                                {isGap ? (
                                  <>
                                    <div className="font-bold text-xs leading-tight text-center flex items-center justify-center gap-1">
                                      <AlertTriangle className="w-3.5 h-3.5" /> Gap
                                    </div>
                                    <div className="text-[11px] text-center mt-1 font-medium">
                                      was {allocation!.vacatedFacultyName} (absent)
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className={`font-bold text-sm leading-tight text-center ${!allocation ? 'text-slate-400' : ''}`}>
                                      {allocation?.subject || 'Free Period'}
                                    </div>
                                    <div className={`text-xs text-center mt-1 font-medium ${!allocation ? 'hidden' : allocation.frozen ? 'text-amber-700' : 'text-blue-600'}`}>
                                      {getFacultyName(allocation?.facultyId || '')}
                                    </div>
                                  </>
                                )}

                                {allocation && !isGap && (
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
                            )}

                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}