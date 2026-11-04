import { useState, useMemo, useRef } from 'react';
import {
  Settings as SettingsIcon,
  Save,
  RotateCcw,
  History,
  AlertTriangle,
  CheckCircle2,
  Database,
  Sliders,
  Download,
  Upload,
  BarChart2,
  FileCheck,
  Info,
} from 'lucide-react';
import type { SchedulerSettings, BackupData, SubjectCategory, DayOfWeek } from '../types';
import { storage, defaultSettings } from '../utils/storage';
import { calculateDetailedCapacityAnalysis } from '../utils/scheduler';
import { inferSubjectCategory } from '../utils/seedData';
import AuditLogView from '../components/AuditLogView';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';

type Tab = 'config' | 'capacity' | 'backup' | 'audit';

export default function SettingsView() {
  const [tab, setTab] = useState<Tab>('config');
  const [settings, setSettings] = useState<SchedulerSettings>(() => storage.getSettings());
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Backup & Restore states
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importedBackup, setImportedBackup] = useState<BackupData | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [restoreMode, setRestoreMode] = useState<'replace' | 'merge'>('replace');
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  const batches = useMemo(() => storage.getBatches(), []);
  const faculty = useMemo(() => storage.getFaculty(), []);

  const [newSubjName, setNewSubjName] = useState('');
  const [newSubjCategory, setNewSubjCategory] = useState<SubjectCategory>('Other');

  // Capacity calculation (N2)
  const detailedCapacity = useMemo(() => {
    const weekAllocs = storage.getWeekAllocationsExcluding();
    return calculateDetailedCapacityAnalysis(batches, faculty, settings, weekAllocs);
  }, [batches, faculty, settings]);

  const capacityReport = detailedCapacity.subjects;

  const allKnownSubjects = useMemo(() => {
    const set = new Set<string>();
    ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'English', 'K/H/S', 'Kannada', 'Hindi', 'Sanskrit'].forEach(s => set.add(s));
    batches.forEach(b => (b.subjects || []).forEach(s => {
      const norm = s.subject === 'Second Language' ? 'K/H/S' : s.subject;
      set.add(norm);
    }));
    faculty.forEach(f => (f.subjects || []).forEach(s => {
      const norm = s === 'Second Language' ? 'K/H/S' : s;
      set.add(norm);
    }));
    if (settings.subjectCategories) {
      Object.keys(settings.subjectCategories).forEach(s => set.add(s));
    }
    return Array.from(set).sort();
  }, [batches, faculty, settings.subjectCategories]);

  const handleCategoryChange = (subject: string, category: SubjectCategory) => {
    const norm = subject === 'Second Language' ? 'K/H/S' : subject;
    setSettings(prev => ({
      ...prev,
      subjectCategories: {
        ...(prev.subjectCategories || {}),
        [norm]: category,
      },
    }));
  };

  const handleAddCustomSubject = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newSubjName.trim();
    if (!trimmed) return;
    const norm = trimmed === 'Second Language' ? 'K/H/S' : trimmed;
    handleCategoryChange(norm, newSubjCategory);
    setNewSubjName('');
  };

  const handleChange = <K extends keyof SchedulerSettings>(key: K, value: SchedulerSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setValidationError(null);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    // M7: Settings Validation
    if (
      !Number.isInteger(settings.maxDailyPeriods) ||
      settings.maxDailyPeriods < 1 ||
      settings.maxDailyPeriods > 8
    ) {
      setValidationError('Max daily periods must be an integer between 1 and 8.');
      return;
    }

    if (
      !Number.isInteger(settings.pcmbWeight) ||
      settings.pcmbWeight < 0 ||
      settings.pcmbWeight > 100 ||
      !Number.isInteger(settings.languageWeight) ||
      settings.languageWeight < 0 ||
      settings.languageWeight > 100
    ) {
      setValidationError('Subject distribution weights must be integers between 0 and 100.');
      return;
    }

    if (settings.pcmbWeight === 0 && settings.languageWeight === 0) {
      setValidationError('Subject distribution weights cannot both be 0.');
      return;
    }

    if (
      settings.minTravelGapMinutes !== undefined &&
      (!Number.isInteger(settings.minTravelGapMinutes) || settings.minTravelGapMinutes < 0 || settings.minTravelGapMinutes > 120)
    ) {
      setValidationError('Inter-building travel gap must be an integer between 0 and 120 minutes.');
      return;
    }

    storage.setSettings(settings);
    setStatusMessage('Scheduler parameters saved successfully.');
    setTimeout(() => {
      setStatusMessage(null);
    }, 3500);
  };

  const handleResetSettings = () => {
    setSettings(defaultSettings);
    storage.setSettings(defaultSettings);
    setStatusMessage('Settings reverted to default parameters.');
    setTimeout(() => {
      setStatusMessage(null);
    }, 3500);
  };

  // Export JSON backup
  const handleExportBackup = () => {
    const backup = storage.createFullBackup();
    const jsonStr = JSON.stringify(backup, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    const link = document.createElement('a');
    link.href = url;
    link.download = `timetable_pro_backup_${dateStr}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setStatusMessage('Complete system backup exported successfully.');
    setTimeout(() => setStatusMessage(null), 3500);
  };

  // Upload JSON backup
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const text = evt.target?.result as string;
        const parsed = JSON.parse(text);
        const validation = storage.validateBackup(parsed);

        if (validation.valid && validation.data) {
          setImportedBackup(validation.data);
          setImportErrors([]);
        } else {
          setImportedBackup(null);
          setImportErrors(validation.errors);
        }
      } catch {
        setImportedBackup(null);
        setImportErrors(['Malformed JSON file. Please supply a valid Timetable Pro backup file.']);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExecuteRestore = () => {
    if (!importedBackup) return;

    const result = storage.restoreFromBackup(importedBackup, restoreMode);
    if (result.success) {
      setImportedBackup(null);
      setStatusMessage(
        `Successfully restored backup (${restoreMode} mode): ${result.stats.faculty} faculty, ${result.stats.batches} batches, ${result.stats.timetables} timetables.`
      );
      setTimeout(() => {
        setStatusMessage(null);
        window.location.reload();
      }, 1500);
    } else {
      setImportErrors([result.error || 'Failed to restore backup snapshot.']);
    }
  };

  const handleFactoryResetConfirm = () => {
    storage.resetToSeedData();
    setSettings(defaultSettings);
    setIsResetModalOpen(false);
    setStatusMessage('System restored to factory default seed data.');
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <PageHeader
        icon={<SettingsIcon className="w-5 h-5 text-[#6B2638]" />}
        title="Settings & Administration"
        subtitle="Manage heuristic weights, pre-check curriculum capacity, export backups, and inspect audit logs"
        actions={
          statusMessage ? (
            <span className="text-xs font-semibold text-[#252326] bg-[#F6F4F0] border border-[#B08D57]/40 px-3 py-1.5 rounded-md flex items-center gap-1.5 shadow-xs">
              <CheckCircle2 className="w-4 h-4 text-[#B08D57]" />
              <span>{statusMessage}</span>
            </span>
          ) : undefined
        }
      />

      {/* Tabs */}
      <div className="flex border-b border-[#A89B8A]/30 select-none overflow-x-auto">
        <button
          type="button"
          onClick={() => setTab('config')}
          className={`px-4 py-2.5 font-medium text-xs uppercase tracking-wider flex items-center gap-2 transition-colors border-b-2 -mb-px whitespace-nowrap ${
            tab === 'config'
              ? 'border-[#6B2638] text-[#6B2638] font-bold'
              : 'border-transparent text-[#252326]/60 hover:text-[#252326]'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Scheduler Rules</span>
        </button>

        <button
          type="button"
          onClick={() => setTab('capacity')}
          className={`px-4 py-2.5 font-medium text-xs uppercase tracking-wider flex items-center gap-2 transition-colors border-b-2 -mb-px whitespace-nowrap ${
            tab === 'capacity'
              ? 'border-[#6B2638] text-[#6B2638] font-bold'
              : 'border-transparent text-[#252326]/60 hover:text-[#252326]'
          }`}
        >
          <BarChart2 className="w-4 h-4" />
          <span>Capacity Pre-Check</span>
        </button>

        <button
          type="button"
          onClick={() => setTab('backup')}
          className={`px-4 py-2.5 font-medium text-xs uppercase tracking-wider flex items-center gap-2 transition-colors border-b-2 -mb-px whitespace-nowrap ${
            tab === 'backup'
              ? 'border-[#6B2638] text-[#6B2638] font-bold'
              : 'border-transparent text-[#252326]/60 hover:text-[#252326]'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Backup & Restore</span>
        </button>

        <button
          type="button"
          onClick={() => setTab('audit')}
          className={`px-4 py-2.5 font-medium text-xs uppercase tracking-wider flex items-center gap-2 transition-colors border-b-2 -mb-px whitespace-nowrap ${
            tab === 'audit'
              ? 'border-[#6B2638] text-[#6B2638] font-bold'
              : 'border-transparent text-[#252326]/60 hover:text-[#252326]'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Audit Log</span>
        </button>
      </div>

      {/* Tab 1: Config */}
      {tab === 'config' && (
        <div className="space-y-6">
          <Card className="border border-[#A89B8A]/30">
            <form onSubmit={handleSave} className="space-y-6">
              <div>
                <h3 className="text-base font-bold text-[#252326] leading-snug">
                  Curriculum Distribution Weights
                </h3>
                <p className="text-xs text-[#252326]/60 mt-0.5">
                  Controls target ratio between core PCMB science lectures and language/elective classes.
                </p>
              </div>

              {validationError && (
                <div className="p-3 bg-[#FAF0F2] text-[#6B2638] border border-[#ECD9DE] rounded-md text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{validationError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1">
                  <label htmlFor="settings-pcmb-weight" className="text-xs font-semibold text-[#252326]">
                    Core Science (PCMB) Weight (%)
                  </label>
                  <input
                    id="settings-pcmb-weight"
                    type="number"
                    min={0}
                    max={100}
                    value={settings.pcmbWeight}
                    onChange={e => handleChange('pcmbWeight', Number(e.target.value))}
                    className="w-full px-3 py-2 border border-[#A89B8A]/40 rounded-md text-sm bg-white focus:border-[#6B2638] outline-none text-[#252326]"
                  />
                  <p className="text-xs text-[#252326]/60">
                    Target allocation share for Physics, Chemistry, Math & Biology.
                  </p>
                </div>

                <div className="space-y-1">
                  <label htmlFor="settings-language-weight" className="text-xs font-semibold text-[#252326]">
                    Language & Elective Weight (%)
                  </label>
                  <input
                    id="settings-language-weight"
                    type="number"
                    min={0}
                    max={100}
                    value={settings.languageWeight}
                    onChange={e => handleChange('languageWeight', Number(e.target.value))}
                    className="w-full px-3 py-2 border border-[#A89B8A]/40 rounded-md text-sm bg-white focus:border-[#6B2638] outline-none text-[#252326]"
                  />
                  <p className="text-xs text-[#252326]/60">
                    Target allocation share for English, K/H/S, and second languages.
                  </p>
                </div>
              </div>

              {/* Normalized percentage helper text (M7) */}
              {(() => {
                const totalWeight = (settings.pcmbWeight || 0) + (settings.languageWeight || 0);
                const corePct = totalWeight > 0 ? Math.round((settings.pcmbWeight / totalWeight) * 100) : 0;
                const langPct = totalWeight > 0 ? 100 - corePct : 0;
                return (
                  <div className="p-2.5 bg-[#FAF7F2] rounded border border-[#E5E0D8] text-xs flex items-center justify-between">
                    <span className="text-[#252326]/70">Normalized Distribution Target:</span>
                    <span className="font-semibold text-[#252326]">
                      {totalWeight > 0 ? (
                        <>Core {corePct}% · Languages {langPct}%</>
                      ) : (
                        <span className="text-[#A63232]">Both weights cannot be 0</span>
                      )}
                    </span>
                  </div>
                );
              })()}

              <hr className="border-[#A89B8A]/20" />

              {/* Subject Categories (M6) */}
              <div>
                <h3 className="text-base font-bold text-[#252326] leading-snug">
                  Curriculum Subject Categories
                </h3>
                <p className="text-xs text-[#252326]/60 mt-0.5">
                  Categorize subjects as Core (PCMB), Language, or Other. Other subjects (e.g. Computer Science) are never counted as languages.
                </p>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {allKnownSubjects.map(subj => {
                  const currentCat =
                    settings.subjectCategories?.[subj] ||
                    inferSubjectCategory(subj, settings.subjectCategories);
                  return (
                    <div
                      key={subj}
                      className="flex items-center justify-between p-2.5 bg-white border border-[#A89B8A]/30 rounded-md text-xs"
                    >
                      <span className="font-semibold text-[#252326]">{subj}</span>
                      <div className="flex items-center gap-1">
                        {(['Core', 'Language', 'Other'] as const).map(cat => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => handleCategoryChange(subj, cat)}
                            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                              currentCat === cat
                                ? cat === 'Core'
                                  ? 'bg-[#6B2638] text-white shadow-2xs'
                                  : cat === 'Language'
                                  ? 'bg-[#B08D57] text-white shadow-2xs'
                                  : 'bg-[#5C6B73] text-white shadow-2xs'
                                : 'bg-[#F3EEE6] text-[#252326]/70 hover:bg-[#E8E2D9]'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  placeholder="New subject name (e.g. Computer Science)"
                  value={newSubjName}
                  onChange={e => setNewSubjName(e.target.value)}
                  className="flex-1 px-3 py-1.5 border border-[#A89B8A]/40 rounded-md text-xs bg-white text-[#252326] outline-none focus:border-[#6B2638]"
                />
                <select
                  value={newSubjCategory}
                  onChange={e => setNewSubjCategory(e.target.value as SubjectCategory)}
                  className="px-2.5 py-1.5 border border-[#A89B8A]/40 rounded-md text-xs bg-white text-[#252326] outline-none focus:border-[#6B2638]"
                >
                  <option value="Core">Core</option>
                  <option value="Language">Language</option>
                  <option value="Other">Other</option>
                </select>
                <Button size="sm" variant="secondary" onClick={handleAddCustomSubject}>
                  Add Category
                </Button>
              </div>

              <hr className="border-[#A89B8A]/20" />

              <div>
                <h3 className="text-base font-bold text-[#252326] leading-snug">
                  Faculty Workload & Scheduling Constraints
                </h3>
                <p className="text-xs text-[#252326]/60 mt-0.5">
                  Configure limits on instructor load and algorithmic guardrails.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="space-y-1">
                  <label htmlFor="settings-max-daily-periods" className="text-xs font-semibold text-[#252326]">
                    Maximum Daily Periods per Faculty (1–8)
                  </label>
                  <input
                    id="settings-max-daily-periods"
                    type="number"
                    min={1}
                    max={8}
                    value={settings.maxDailyPeriods}
                    onChange={e => handleChange('maxDailyPeriods', Number(e.target.value))}
                    className="w-full px-3 py-2 border border-[#A89B8A]/40 rounded-md text-sm bg-white focus:border-[#6B2638] outline-none text-[#252326]"
                  />
                  <p className="text-xs text-[#252326]/60">
                    Global daily teaching ceiling per instructor (1–8 periods).
                  </p>
                </div>

                <div className="space-y-1">
                  <label htmlFor="settings-min-travel-gap" className="text-xs font-semibold text-[#252326]">
                    Inter-Building Travel Gap (Minutes)
                  </label>
                  <input
                    id="settings-min-travel-gap"
                    type="number"
                    min={0}
                    max={60}
                    value={settings.minTravelGapMinutes ?? 0}
                    onChange={e => handleChange('minTravelGapMinutes', Math.max(0, Number(e.target.value)))}
                    className="w-full px-3 py-2 border border-[#A89B8A]/40 rounded-md text-sm bg-white focus:border-[#6B2638] outline-none text-[#252326]"
                  />
                  <p className="text-xs text-[#252326]/60">
                    Min gap when moving between Building 1 and 2 (soft penalty).
                  </p>
                </div>

                <div className="space-y-1">
                  <label htmlFor="settings-week-start-day" className="text-xs font-semibold text-[#252326]">
                    Academic Week Start Day
                  </label>
                  <select
                    id="settings-week-start-day"
                    value={settings.weekStartDay}
                    onChange={e => handleChange('weekStartDay', e.target.value as DayOfWeek)}
                    className="w-full px-3 py-2 border border-[#A89B8A]/40 rounded-md text-sm bg-white focus:border-[#6B2638] outline-none text-[#252326]"
                  >
                    <option value="Monday">Monday</option>
                    <option value="Tuesday">Tuesday</option>
                    <option value="Wednesday">Wednesday</option>
                    <option value="Thursday">Thursday</option>
                    <option value="Friday">Friday</option>
                    <option value="Saturday">Saturday</option>
                    <option value="Sunday">Sunday</option>
                  </select>
                  <p className="text-xs text-[#252326]/60">Initial day for weekly timetable generation cycles.</p>
                </div>
              </div>

              <div className="border-t border-[#A89B8A]/20 pt-4 space-y-3">
                <label htmlFor="settings-strict-p1-lang" className="flex items-center gap-2.5 text-xs text-[#252326] font-medium cursor-pointer">
                  <input
                    id="settings-strict-p1-lang"
                    type="checkbox"
                    checked={settings.enableStrictPeriod1NoLanguage ?? true}
                    onChange={e => handleChange('enableStrictPeriod1NoLanguage', e.target.checked)}
                    className="rounded text-[#6B2638] focus:ring-[#6B2638]"
                  />
                  <span>
                    <strong>Avoid Language in Period 1:</strong> Restrict first period of the day to core PCMB science lectures.
                  </span>
                </label>

                <label htmlFor="settings-respect-daily-limits" className="flex items-center gap-2.5 text-xs text-[#252326] font-medium cursor-pointer">
                  <input
                    id="settings-respect-daily-limits"
                    type="checkbox"
                    checked={settings.respectDailyLimits ?? true}
                    onChange={e => handleChange('respectDailyLimits', e.target.checked)}
                    className="rounded text-[#6B2638] focus:ring-[#6B2638]"
                  />
                  <span>
                    <strong>Strict Daily Teaching Limits:</strong> Do not assign faculty beyond their daily maximum.
                  </span>
                </label>

                <label htmlFor="settings-allow-same-subject" className="flex items-center gap-2.5 text-xs text-[#252326] font-medium cursor-pointer">
                  <input
                    id="settings-allow-same-subject"
                    type="checkbox"
                    checked={!settings.allowSameSubjectConsecutive}
                    onChange={e => handleChange('allowSameSubjectConsecutive', !e.target.checked)}
                    className="rounded text-[#6B2638] focus:ring-[#6B2638]"
                  />
                  <span>
                    <strong>Subject Spacing:</strong> Prevent identical subjects from being scheduled in consecutive periods for any batch.
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-[#A89B8A]/20">
                <Button
                  type="button"
                  variant="secondary"
                  icon={<RotateCcw className="w-4 h-4" />}
                  onClick={handleResetSettings}
                >
                  Restore Defaults
                </Button>
                <Button type="submit" variant="primary" icon={<Save className="w-4 h-4" />}>
                  Save Settings
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Tab 2: Capacity Pre-Check */}
      {tab === 'capacity' && (
        <div className="space-y-6">
          <Card className="border border-[#A89B8A]/30">
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-[#252326]">
                  Curriculum Demand vs Faculty Supply
                </h3>
                <p className="text-xs text-[#252326]/60 mt-0.5">
                  Verifies if your registered faculty pool has sufficient teaching capacity to deliver the required periods across all {batches.length} active batches.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-[#F3EEE6] rounded-md border border-[#A89B8A]/30">
                  <span className="text-[11px] font-semibold text-[#252326]/60 uppercase">Total Batches</span>
                  <div className="text-xl font-bold text-[#6B2638] mt-0.5">{batches.length}</div>
                </div>
                <div className="p-3 bg-[#F3EEE6] rounded-md border border-[#A89B8A]/30">
                  <span className="text-[11px] font-semibold text-[#252326]/60 uppercase">Teaching Faculty</span>
                  <div className="text-xl font-bold text-[#6B2638] mt-0.5">{faculty.length}</div>
                </div>
                <div className="p-3 bg-[#F3EEE6] rounded-md border border-[#A89B8A]/30">
                  <span className="text-[11px] font-semibold text-[#252326]/60 uppercase">Deficit Subjects</span>
                  <div className="text-xl font-bold text-[#6B2638] mt-0.5">
                    {capacityReport.filter(r => r.status === 'deficit').length}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#F3EEE6] border-b border-[#A89B8A]/30 font-semibold text-[#252326]/80 uppercase tracking-wider">
                      <th className="p-3">Subject</th>
                      <th className="p-3">Category</th>
                      <th className="p-3 text-right">Weekly Demand</th>
                      <th className="p-3 text-right">Faculty Pool</th>
                      <th className="p-3 text-right">Supply Capacity</th>
                      <th className="p-3 text-right">Deficit</th>
                      <th className="p-3 text-center">Health Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#A89B8A]/20">
                    {capacityReport.map((row, idx) => (
                      <tr key={idx} className="hover:bg-[#F3EEE6]/40 transition-colors">
                        <td className="p-3 font-bold text-[#252326]">{row.subject}</td>
                        <td className="p-3">
                          <Badge tone={row.category === 'Core' ? 'burgundy' : 'gold'}>
                            {row.category}
                          </Badge>
                        </td>
                        <td className="p-3 text-right font-medium text-[#252326]">
                          {row.requiredWeeklyPeriods} periods
                        </td>
                        <td className="p-3 text-right text-[#252326]/80">
                          {row.facultyCount} teachers
                        </td>
                        <td className="p-3 text-right font-medium text-[#252326]">
                          {row.availableWeeklyPeriods} periods
                        </td>
                        <td className="p-3 text-right font-bold text-[#252326]">
                          {row.deficit > 0 ? `-${row.deficit}` : '0'}
                        </td>
                        <td className="p-3 text-center">
                          {row.status === 'deficit' ? (
                            <Badge tone="danger">Deficit Warning</Badge>
                          ) : row.status === 'balanced' ? (
                            <Badge tone="gold">Balanced</Badge>
                          ) : (
                            <Badge tone="neutral">Surplus</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-3 bg-[#F6F4F0] border border-[#B08D57]/40 rounded-md text-xs text-[#252326] flex items-start gap-2.5">
                <Info className="w-4 h-4 text-[#B08D57] shrink-0 mt-0.5" />
                <p>
                  <strong>Optimization Tip:</strong> If any subject shows a <em>Deficit Warning</em>, consider hiring or qualifying additional faculty members in that subject, or adjusting daily period limits to avoid unfilled slots during timetable generation.
                </p>
              </div>

              {/* Overloaded & Near-Capacity Teachers Table (N2) */}
              <div className="pt-4 border-t border-[#A89B8A]/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-[#252326]">Teacher Workload Distribution</h4>
                    <p className="text-xs text-[#252326]/60">
                      Instructors flagged for excessive weekly periods or nearing their maximum weekly allocation.
                    </p>
                  </div>
                  <Badge tone={detailedCapacity.overloadedCount > 0 ? 'danger' : 'gold'}>
                    {detailedCapacity.overloadedCount} Overloaded · {detailedCapacity.overloadedTeachers.length} Under Review
                  </Badge>
                </div>

                {detailedCapacity.overloadedTeachers.length === 0 ? (
                  <div className="p-3 bg-[#F3EEE6]/60 rounded border border-[#A89B8A]/30 text-xs text-[#252326]/70 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#B08D57]" />
                    <span>All instructors are operating within balanced workload limits across current timetable allocations.</span>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#F3EEE6] border-b border-[#A89B8A]/30 font-semibold text-[#252326]/80 uppercase tracking-wider">
                          <th className="p-3">Instructor</th>
                          <th className="p-3">Subjects</th>
                          <th className="p-3 text-right">Daily Limit</th>
                          <th className="p-3 text-right">Weekly Max</th>
                          <th className="p-3 text-right">Assigned This Week</th>
                          <th className="p-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#A89B8A]/20">
                        {detailedCapacity.overloadedTeachers.map((t, idx) => (
                          <tr key={idx} className="hover:bg-[#F3EEE6]/40 transition-colors">
                            <td className="p-3 font-bold text-[#252326]">{t.facultyName}</td>
                            <td className="p-3 text-[#252326]/80">{t.subjects.join(', ')}</td>
                            <td className="p-3 text-right font-medium text-[#252326]">{t.dailyLimit} / day</td>
                            <td className="p-3 text-right font-medium text-[#252326]">{t.weeklyLimit} periods</td>
                            <td className="p-3 text-right font-bold text-[#6B2638]">{t.assignedPeriods} periods</td>
                            <td className="p-3 text-center">
                              {t.status === 'overloaded' ? (
                                <Badge tone="danger">Overloaded</Badge>
                              ) : (
                                <Badge tone="gold">Near Capacity</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 3: Backup & Restore */}
      {tab === 'backup' && (
        <div className="space-y-6">
          <Card className="border border-[#A89B8A]/30 space-y-6">
            <div>
              <h3 className="text-base font-bold text-[#252326]">Data Persistence & System Backups</h3>
              <p className="text-xs text-[#252326]/60 mt-0.5">
                Export and restore the complete system database (faculty, batches, timetables, and audit history) as JSON snapshots.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Export Box */}
              <div className="p-4 bg-[#F3EEE6]/60 border border-[#A89B8A]/30 rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-[#6B2638]" />
                  <h4 className="text-sm font-bold text-[#252326]">Export all data</h4>
                </div>
                <p className="text-xs text-[#252326]/70 leading-relaxed">
                  Downloads a single versioned JSON archive containing faculty, batches, settings, and full week timetables.
                </p>
                <Button
                  variant="primary"
                  icon={<Download className="w-4 h-4" />}
                  onClick={handleExportBackup}
                >
                  Export all data (JSON)
                </Button>
              </div>

              {/* Import Box */}
              <div className="p-4 bg-[#F3EEE6]/60 border border-[#A89B8A]/30 rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-[#B08D57]" />
                  <h4 className="text-sm font-bold text-[#252326]">Import backup</h4>
                </div>
                <p className="text-xs text-[#252326]/70 leading-relaxed">
                  Upload a previously exported backup file with schema validation, preview, and confirmation.
                </p>
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileSelected}
                />
                <Button
                  variant="secondary"
                  icon={<Upload className="w-4 h-4" />}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Import backup
                </Button>
              </div>
            </div>

            {/* Import Errors if any */}
            {importErrors.length > 0 && (
              <div className="p-3.5 bg-[#FAF0F2] text-[#6B2638] border border-[#ECD9DE] rounded-md space-y-1 text-xs font-medium">
                <div className="flex items-center gap-2 font-bold">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Backup Validation Errors:</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 pl-1">
                  {importErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Factory Reset */}
            <div className="pt-4 border-t border-[#A89B8A]/20 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-[#6B2638]">Factory Seed Reset</h4>
                <p className="text-xs text-[#252326]/60">
                  Restore original 145 faculty members, 70 batches, and default settings.
                </p>
              </div>
              <Button
                variant="danger"
                icon={<RotateCcw className="w-4 h-4" />}
                onClick={() => setIsResetModalOpen(true)}
              >
                Factory Reset
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 4: Audit Log */}
      {tab === 'audit' && (
        <Card className="border border-[#A89B8A]/30" padding={false}>
          <AuditLogView />
        </Card>
      )}

      {/* Backup Preview Modal */}
      <Modal
        isOpen={!!importedBackup}
        onClose={() => setImportedBackup(null)}
        title="Review & Confirm Backup Snapshot"
        subtitle="Inspect archive statistics and select restoration strategy"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setImportedBackup(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={<FileCheck className="w-4 h-4" />}
              onClick={handleExecuteRestore}
            >
              Apply Restoration
            </Button>
          </div>
        }
      >
        {importedBackup && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-2.5 bg-[#F3EEE6] rounded border border-[#A89B8A]/30 text-center">
                <span className="text-[10px] uppercase font-bold text-[#252326]/60">Faculty</span>
                <div className="text-lg font-bold text-[#6B2638]">{importedBackup.faculty?.length || 0}</div>
              </div>
              <div className="p-2.5 bg-[#F3EEE6] rounded border border-[#A89B8A]/30 text-center">
                <span className="text-[10px] uppercase font-bold text-[#252326]/60">Batches</span>
                <div className="text-lg font-bold text-[#6B2638]">{importedBackup.batches?.length || 0}</div>
              </div>
              <div className="p-2.5 bg-[#F3EEE6] rounded border border-[#A89B8A]/30 text-center">
                <span className="text-[10px] uppercase font-bold text-[#252326]/60">Timetables</span>
                <div className="text-lg font-bold text-[#6B2638]">
                  {Object.keys(importedBackup.weekTimetables || {}).length}
                </div>
              </div>
              <div className="p-2.5 bg-[#F3EEE6] rounded border border-[#A89B8A]/30 text-center">
                <span className="text-[10px] uppercase font-bold text-[#252326]/60">Schema Ver</span>
                <div className="text-lg font-bold text-[#6B2638]">{importedBackup.version || 1}</div>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <span className="text-xs font-bold text-[#252326] uppercase block">Restoration Mode</span>
              <div className="space-y-2">
                <label htmlFor="restore-mode-replace" className="flex items-start gap-2.5 p-3 rounded border border-[#A89B8A]/40 bg-white cursor-pointer hover:border-[#6B2638]">
                  <input
                    id="restore-mode-replace"
                    type="radio"
                    name="restoreMode"
                    value="replace"
                    checked={restoreMode === 'replace'}
                    onChange={() => setRestoreMode('replace')}
                    className="mt-0.5 text-[#6B2638] focus:ring-[#6B2638]"
                  />
                  <div>
                    <span className="text-xs font-bold text-[#252326] block">
                      Replace All Existing State (Recommended)
                    </span>
                    <span className="text-[11px] text-[#252326]/70">
                      Wipes current working state and restores this exact snapshot cleanly.
                    </span>
                  </div>
                </label>

                <label htmlFor="restore-mode-merge" className="flex items-start gap-2.5 p-3 rounded border border-[#A89B8A]/40 bg-white cursor-pointer hover:border-[#6B2638]">
                  <input
                    id="restore-mode-merge"
                    type="radio"
                    name="restoreMode"
                    value="merge"
                    checked={restoreMode === 'merge'}
                    onChange={() => setRestoreMode('merge')}
                    className="mt-0.5 text-[#6B2638] focus:ring-[#6B2638]"
                  />
                  <div>
                    <span className="text-xs font-bold text-[#252326] block">
                      Merge with Existing State
                    </span>
                    <span className="text-[11px] text-[#252326]/70">
                      Keeps current records and appends non-conflicting batches and faculty members.
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Factory Reset Modal */}
      <Modal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        title="Confirm Factory Reset"
        subtitle="This action will restore default demonstration seed data"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsResetModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" icon={<RotateCcw className="w-4 h-4" />} onClick={handleFactoryResetConfirm}>
              Reset to Factory Seed
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="p-3 bg-[#FAF0F2] border border-[#ECD9DE] rounded text-xs text-[#252326] flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-[#6B2638] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-[#6B2638]">Warning: All Custom Changes Will Be Lost</p>
              <p>
                This will reset all 145 faculty profiles, 70 batches, weekly timetables, and audit history back to the initial factory seed state.
              </p>
            </div>
          </div>
          <p className="text-xs text-[#252326]/70">
            If you wish to retain your current timetables, please export a JSON backup first from the Backup tab.
          </p>
        </div>
      </Modal>
    </div>
  );
}
