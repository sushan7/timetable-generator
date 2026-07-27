import { useState, useEffect, useRef, useMemo } from 'react';
import { Calendar, Image as ImageIcon, Play, RefreshCw } from 'lucide-react';
import html2canvas from 'html2canvas';
import type { Faculty, Batch, Allocation, DayOfWeek } from '../types';
import { generateTimetableV2, patchAbsences } from '../utils/scheduler';
import { storage } from '../utils/storage';
import { SECTIONS, groupBatchesBySection } from '../utils/sections';
import PageHeader from './ui/PageHeader';
import Button from './ui/Button';
import EmptyState from './ui/EmptyState';
import DayTabs from './timetable/DayTabs';
import BalanceBar from './timetable/BalanceBar';
import SectionTable from './timetable/SectionTable';

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
    setAllocations(existing?.allocations || []);
    setHasGenerated(!!existing);
  };

  const persistDay = (day: DayOfWeek, newAllocations: Allocation[]) => {
    storage.setDayTimetable(day, { id: `tt_${day}`, date: day, status: 'Draft', allocations: newAllocations });
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
    const updated = allocations.map(a =>
      a.batchId === batchId && a.periodIndex === periodIndex ? { ...a, frozen: !a.frozen } : a
    );
    setAllocations(updated);
    persistDay(currentDay, updated);
  };

  const getFacultyName = (id: string) => {
    if (!id) return 'Unassigned';
    return faculties.find(f => f.id === id)?.name || 'Unknown';
  };

  const exportAsImage = async () => {
    if (!pageRef.current) return;
    setIsExporting(true);
    try {
      const canvas = await html2canvas(pageRef.current, { scale: 2, backgroundColor: '#f8fafc' });
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
    Object.values(allDays).forEach(dayAllocs => {
      dayAllocs.forEach(a => {
        if (!a.facultyId) return;
        if (PCMB_SUBJECTS.includes(a.subject)) pcmb++; else lang++;
      });
    });
    const total = pcmb + lang;
    const settings = storage.getSettings();
    const actualPCMBPct = total === 0 ? 0 : Math.round((pcmb / total) * 100);
    return {
      pcmb, lang,
      targetPCMB: settings.pcmbWeight,
      targetLang: settings.languageWeight,
      actualPCMBPct,
      actualLangPct: total === 0 ? 0 : 100 - actualPCMBPct,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allocations]);

  const gapCount = allocations.filter(a => a.vacatedFacultyId && !a.facultyId).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[95rem] mx-auto space-y-6" ref={pageRef}>
      <PageHeader
        icon={<Calendar className="w-6 h-6" />}
        title="Weekly Timetable"
        subtitle={`V2 Engine · ${currentDay} · 4 lecture/day cap`}
        actions={
          <>
            <Button variant="primary" icon={<Play className="w-4 h-4" />} loading={isGenerating} onClick={handleGenerate}>
              {hasGenerated ? 'Regenerate' : 'Generate'} {currentDay}
            </Button>
            <Button
              variant="secondary"
              icon={<RefreshCw className="w-4 h-4" />}
              loading={isSyncing}
              disabled={!hasGenerated}
              onClick={handleSyncAbsences}
              title="Re-check today's allocations against the current absence list"
            >
              Sync Absences
            </Button>
            <Button variant="secondary" icon={<ImageIcon className="w-4 h-4" />} loading={isExporting} onClick={exportAsImage}>
              Export
            </Button>
          </>
        }
      />

      <DayTabs currentDay={currentDay} onSelect={setCurrentDay} hasData={day => !!storage.getDayTimetable(day)} />

      <BalanceBar quota={quota} gapCount={gapCount} day={currentDay} />

      {!hasGenerated ? (
        <EmptyState
          icon={<Calendar className="w-8 h-8" />}
          title={`No timetable generated for ${currentDay} yet`}
          description={`Click "Generate ${currentDay}" above to build it.`}
        />
      ) : (
        SECTIONS.map(section => {
          const sectionBatches = sectionedBatches[section.id];
          if (sectionBatches.length === 0) return null;
          return (
            <SectionTable
              key={section.id}
              label={section.label}
              batches={sectionBatches}
              allocations={allocations}
              getFacultyName={getFacultyName}
              onToggleFreeze={toggleFreeze}
            />
          );
        })
      )}
    </div>
  );
}