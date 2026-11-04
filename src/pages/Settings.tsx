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
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useToast } from '../context/ToastContext';

type Tab = 'config' | 'capacity' | 'backup' | 'audit';

export default function SettingsView() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('config');
  const [settings, setSettings] = useState<SchedulerSettings>(() => storage.getSettings());
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Theme state
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark' | 'system'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark' | 'system') || 'system';
  });

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setCurrentTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    if (newTheme === 'dark' || (newTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

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
    toast.success('Scheduler parameters saved successfully.');
    setTimeout(() => {
      setStatusMessage(null);
    }, 3500);
  };

  const handleResetSettings = () => {
    setSettings(defaultSettings);
    storage.setSettings(defaultSettings);
    setStatusMessage('Settings reverted to default parameters.');
    toast.info('Settings reverted to default parameters.');
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
    toast.success('Complete system backup exported successfully.');
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
      const msg = `Successfully restored backup (${restoreMode} mode): ${result.stats.faculty} faculty, ${result.stats.batches} batches, ${result.stats.timetables} timetables.`;
      setStatusMessage(msg);
      toast.success(msg);
      setTimeout(() => {
        setStatusMessage(null);
        window.location.reload();
      }, 1500);
    } else {
      const errMsg = result.error || 'Failed to restore backup snapshot.';
      setImportErrors([errMsg]);
      toast.error(errMsg);
    }
  };

  const handleFactoryResetConfirm = () => {
    storage.resetToSeedData();
    setSettings(defaultSettings);
    setIsResetModalOpen(false);
    setStatusMessage('System restored to factory default seed data.');
    toast.success('System restored to factory default seed data.');
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <PageHeader
        icon={<SettingsIcon className="w-5 h-5 text-primary" />}
        title="Settings & Administration"
        subtitle="Manage heuristic weights, pre-check curriculum capacity, export backups, and inspect audit logs"
        actions={
          statusMessage ? (
            <span className="text-xs font-semibold text-ink bg-surface-muted border border-accent/40 px-3 py-1.5 rounded-md flex items-center gap-1.5 shadow-xs">
              <CheckCircle2 className="w-4 h-4 text-accent" />
              <span>{statusMessage}</span>
            </span>
          ) : undefined
        }
      />

      {/* Tabs */}
      <div className="flex border-b border-border select-none overflow-x-auto">
        <button
          type="button"
          onClick={() => setTab('config')}
          className={`px-4 py-2.5 font-medium text-xs uppercase tracking-wider flex items-center gap-2 transition-colors border-b-2 -mb-px whitespace-nowrap ${
            tab === 'config'
              ? 'border-accent text-primary font-bold'
              : 'border-transparent text-ink-muted hover:text-ink'
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
              ? 'border-accent text-primary font-bold'
              : 'border-transparent text-ink-muted hover:text-ink'
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
              ? 'border-accent text-primary font-bold'
              : 'border-transparent text-ink-muted hover:text-ink'
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
              ? 'border-accent text-primary font-bold'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Audit Log</span>
        </button>
      </div>

      {/* Tab 1: Config */}
      {tab === 'config' && (
        <div className="space-y-6">
          <Card className="border border-border">
            <form onSubmit={handleSave} className="space-y-6">
              <div>
                <h3 className="text-base font-bold text-ink leading-snug">
                  Curriculum Distribution Weights
                </h3>
                <p className="text-xs text-ink-muted mt-0.5">
                  Controls target ratio between core PCMB science lectures and language/elective classes.
                </p>
              </div>

              {validationError && (
                <div className="p-3 bg-burgundy-soft text-burgundy border border-burgundy/20 rounded-md text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{validationError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1">
                  <label htmlFor="settings-pcmb-weight" className="text-xs font-semibold text-ink">
                    Core Science (PCMB) Weight (%)
                  </label>
                  <input
                    id="settings-pcmb-weight"
                    type="number"
                    min={0}
                    max={100}
                    value={settings.pcmbWeight}
                    onChange={e => handleChange('pcmbWeight', Number(e.target.value))}
                    className="w-full px-3 py-2 border border-border rounded-md text-sm bg-surface focus:border-accent outline-none text-ink"
                  />
                  <p className="text-xs text-ink-muted">
                    Target allocation share for Physics, Chemistry, Math & Biology.
                  </p>
                </div>

                <div className="space-y-1">
                  <label htmlFor="settings-language-weight" className="text-xs font-semibold text-ink">
                    Language & Elective Weight (%)
                  </label>
                  <input
                    id="settings-language-weight"
                    type="number"
                    min={0}
                    max={100}
                    value={settings.languageWeight}
                    onChange={e => handleChange('languageWeight', Number(e.target.value))}
                    className="w-full px-3 py-2 border border-border rounded-md text-sm bg-surface focus:border-accent outline-none text-ink"
                  />
                  <p className="text-xs text-ink-muted">
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
                  <div className="p-2.5 bg-surface-muted rounded border border-border text-xs flex items-center justify-between">
                    <span className="text-ink-muted">Normalized Distribution Target:</span>
                    <span className="font-semibold text-ink">
                      {totalWeight > 0 ? (
                        <>Core {corePct}% · Languages {langPct}%</>
                      ) : (
                        <span className="text-burgundy">Both weights cannot be 0</span>
                      )}
                    </span>
                  </div>
                );
              })()}

              <hr className="border-border" />

              {/* Subject Categories (M6) */}
              <div>
                <h3 className="text-base font-bold text-ink leading-snug">
                  Curriculum Subject Categories
                </h3>
                <p className="text-xs text-ink-muted mt-0.5">
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
                      className="flex items-center justify-between p-2.5 bg-surface border border-border rounded-md text-xs"
                    >
                      <span className="font-semibold text-ink">{subj}</span>
                      <div className="flex items-center gap-1">
                        {(['Core', 'Language', 'Other'] as const).map(cat => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => handleCategoryChange(subj, cat)}
                            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                              currentCat === cat
                                ? cat === 'Core'
                                  ? 'bg-primary text-canvas shadow-2xs'
                                  : cat === 'Language'
                                  ? 'bg-accent text-ink shadow-2xs'
                                  : 'bg-taupe text-canvas shadow-2xs'
                                : 'bg-surface-muted text-ink-muted hover:bg-border/60'
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
                  className="flex-1 px-3 py-1.5 border border-border rounded-md text-xs bg-surface text-ink outline-none focus:border-accent"
                />
                <select
                  value={newSubjCategory}
                  onChange={e => setNewSubjCategory(e.target.value as SubjectCategory)}
                  className="px-2.5 py-1.5 border border-border rounded-md text-xs bg-surface text-ink outline-none focus:border-accent"
                >
                  <option value="Core">Core</option>
                  <option value="Language">Language</option>
                  <option value="Other">Other</option>
                </select>
                <Button size="sm" variant="secondary" onClick={handleAddCustomSubject}>
                  Add Category
                </Button>
              </div>

              <hr className="border-border" />

              <div>
                <h3 className="text-base font-bold text-ink leading-snug">
                  Faculty Workload & Scheduling Constraints
                </h3>
                <p className="text-xs text-ink-muted mt-0.5">
                  Configure limits on instructor load and algorithmic guardrails.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="space-y-1">
                  <label htmlFor="settings-max-daily-periods" className="text-xs font-semibold text-ink">
                    Maximum Daily Periods per Faculty (1–8)
                  </label>
                  <input
                    id="settings-max-daily-periods"
                    type="number"
                    min={1}
                    max={8}
                    value={settings.maxDailyPeriods}
                    onChange={e => handleChange('maxDailyPeriods', Number(e.target.value))}
                    className="w-full px-3 py-2 border border-border rounded-md text-sm bg-surface focus:border-accent outline-none text-ink"
                  />
                  <p className="text-xs text-ink-muted">
                    Global daily teaching ceiling per instructor (1–8 periods).
                  </p>
                </div>

                <div className="space-y-1">
                  <label htmlFor="settings-min-travel-gap" className="text-xs font-semibold text-ink">
                    Inter-Building Travel Gap (Minutes)
                  </label>
                  <input
                    id="settings-min-travel-gap"
                    type="number"
                    min={0}
                    max={60}
                    value={settings.minTravelGapMinutes ?? 0}
                    onChange={e => handleChange('minTravelGapMinutes', Math.max(0, Number(e.target.value)))}
                    className="w-full px-3 py-2 border border-border rounded-md text-sm bg-surface focus:border-accent outline-none text-ink"
                  />
                  <p className="text-xs text-ink-muted">
                    Min gap when moving between Building 1 and 2 (soft penalty).
                  </p>
                </div>

                <div className="space-y-1">
                  <label htmlFor="settings-week-start-day" className="text-xs font-semibold text-ink">
                    Academic Week Start Day
                  </label>
                  <select
                    id="settings-week-start-day"
                    value={settings.weekStartDay}
                    onChange={e => handleChange('weekStartDay', e.target.value as DayOfWeek)}
                    className="w-full px-3 py-2 border border-border rounded-md text-sm bg-surface focus:border-accent outline-none text-ink"
                  >
                    <option value="Monday">Monday</option>
                    <option value="Tuesday">Tuesday</option>
                    <option value="Wednesday">Wednesday</option>
                    <option value="Thursday">Thursday</option>
                    <option value="Friday">Friday</option>
                    <option value="Saturday">Saturday</option>
                    <option value="Sunday">Sunday</option>
                  </select>
                  <p className="text-xs text-ink-muted">Initial day for weekly timetable generation cycles.</p>
                </div>
              </div>

              <div className="border-t border-border pt-4 space-y-3">
                <label htmlFor="settings-strict-p1-lang" className="flex items-center gap-2.5 text-xs text-ink font-medium cursor-pointer">
                  <input
                    id="settings-strict-p1-lang"
                    type="checkbox"
                    checked={settings.enableStrictPeriod1NoLanguage ?? true}
                    onChange={e => handleChange('enableStrictPeriod1NoLanguage', e.target.checked)}
                    className="rounded text-primary focus:ring-accent accent-primary"
                  />
                  <span>
                    <strong>Avoid Language in Period 1:</strong> Restrict first period of the day to core PCMB science lectures.
                  </span>
                </label>

                <label htmlFor="settings-respect-daily-limits" className="flex items-center gap-2.5 text-xs text-ink font-medium cursor-pointer">
                  <input
                    id="settings-respect-daily-limits"
                    type="checkbox"
                    checked={settings.respectDailyLimits ?? true}
                    onChange={e => handleChange('respectDailyLimits', e.target.checked)}
                    className="rounded text-primary focus:ring-accent accent-primary"
                  />
                  <span>
                    <strong>Strict Daily Teaching Limits:</strong> Do not assign faculty beyond their daily maximum.
                  </span>
                </label>

                <label htmlFor="settings-allow-same-subject" className="flex items-center gap-2.5 text-xs text-ink font-medium cursor-pointer">
                  <input
                    id="settings-allow-same-subject"
                    type="checkbox"
                    checked={!settings.allowSameSubjectConsecutive}
                    onChange={e => handleChange('allowSameSubjectConsecutive', !e.target.checked)}
                    className="rounded text-primary focus:ring-accent accent-primary"
                  />
                  <span>
                    <strong>Subject Spacing:</strong> Prevent identical subjects from being scheduled in consecutive periods for any batch.
                  </span>
                </label>
              </div>

              <hr className="border-border" />

              <div>
                <h3 className="text-base font-bold text-ink leading-snug">
                  Appearance & Interface Theme
                </h3>
                <p className="text-xs text-ink-muted mt-0.5">
                  Choose between high-contrast editorial light mode and nocturnal dark mode.
                </p>
                <div className="flex items-center gap-2 mt-3">
                  {(['light', 'dark', 'system'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleThemeChange(t)}
                      className={`px-3.5 py-1.5 rounded-md text-xs font-semibold capitalize transition-colors ${
                        currentTheme === t
                          ? 'bg-primary text-canvas shadow-2xs'
                          : 'bg-surface-muted text-ink-muted hover:bg-border/60 hover:text-ink border border-border'
                      }`}
                    >
                      {t} Mode
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-border">
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
          <Card className="border border-border">
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-ink">
                  Curriculum Demand vs Faculty Supply
                </h3>
                <p className="text-xs text-ink-muted mt-0.5">
                  Verifies if your registered faculty pool has sufficient teaching capacity to deliver the required periods across all {batches.length} active batches.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-surface-muted rounded-md border border-border">
                  <span className="text-[11px] font-semibold text-ink-muted uppercase">Total Batches</span>
                  <div className="text-xl font-bold text-primary mt-0.5">{batches.length}</div>
                </div>
                <div className="p-3 bg-surface-muted rounded-md border border-border">
                  <span className="text-[11px] font-semibold text-ink-muted uppercase">Teaching Faculty</span>
                  <div className="text-xl font-bold text-primary mt-0.5">{faculty.length}</div>
                </div>
                <div className="p-3 bg-surface-muted rounded-md border border-border">
                  <span className="text-[11px] font-semibold text-ink-muted uppercase">Deficit Subjects</span>
                  <div className="text-xl font-bold text-primary mt-0.5">
                    {capacityReport.filter(r => r.status === 'deficit').length}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-surface-muted border-b border-border font-semibold text-ink-muted uppercase tracking-wider">
                      <th className="p-3">Subject</th>
                      <th className="p-3">Category</th>
                      <th className="p-3 text-right">Weekly Demand</th>
                      <th className="p-3 text-right">Faculty Pool</th>
                      <th className="p-3 text-right">Supply Capacity</th>
                      <th className="p-3 text-right">Deficit</th>
                      <th className="p-3 text-center">Health Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {capacityReport.map((row, idx) => (
                      <tr key={idx} className="hover:bg-surface-muted/40 transition-colors">
                        <td className="p-3 font-bold text-ink">{row.subject}</td>
                        <td className="p-3">
                          <Badge tone={row.category === 'Core' ? 'burgundy' : 'gold'}>
                            {row.category}
                          </Badge>
                        </td>
                        <td className="p-3 text-right font-medium text-ink">
                          {row.requiredWeeklyPeriods} periods
                        </td>
                        <td className="p-3 text-right text-ink-muted">
                          {row.facultyCount} teachers
                        </td>
                        <td className="p-3 text-right font-medium text-ink">
                          {row.availableWeeklyPeriods} periods
                        </td>
                        <td className="p-3 text-right font-bold text-ink">
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

              <div className="p-3 bg-surface-muted border border-accent/40 rounded-md text-xs text-ink flex items-start gap-2.5">
                <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <p>
                  <strong>Optimization Tip:</strong> If any subject shows a <em>Deficit Warning</em>, consider hiring or qualifying additional faculty members in that subject, or adjusting daily period limits to avoid unfilled slots during timetable generation.
                </p>
              </div>

              {/* Overloaded & Near-Capacity Teachers Table (N2) */}
              <div className="pt-4 border-t border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-ink">Teacher Workload Distribution</h4>
                    <p className="text-xs text-ink-muted">
                      Instructors flagged for excessive weekly periods or nearing their maximum weekly allocation.
                    </p>
                  </div>
                  <Badge tone={detailedCapacity.overloadedCount > 0 ? 'danger' : 'gold'}>
                    {detailedCapacity.overloadedCount} Overloaded · {detailedCapacity.overloadedTeachers.length} Under Review
                  </Badge>
                </div>

                {detailedCapacity.overloadedTeachers.length === 0 ? (
                  <div className="p-3 bg-surface-muted/60 rounded border border-border text-xs text-ink-muted flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-accent" />
                    <span>All instructors are operating within balanced workload limits across current timetable allocations.</span>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-surface-muted border-b border-border font-semibold text-ink-muted uppercase tracking-wider">
                          <th className="p-3">Instructor</th>
                          <th className="p-3">Subjects</th>
                          <th className="p-3 text-right">Daily Limit</th>
                          <th className="p-3 text-right">Weekly Max</th>
                          <th className="p-3 text-right">Assigned This Week</th>
                          <th className="p-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {detailedCapacity.overloadedTeachers.map((t, idx) => (
                          <tr key={idx} className="hover:bg-surface-muted/40 transition-colors">
                            <td className="p-3 font-bold text-ink">{t.facultyName}</td>
                            <td className="p-3 text-ink-muted">{t.subjects.join(', ')}</td>
                            <td className="p-3 text-right font-medium text-ink">{t.dailyLimit} / day</td>
                            <td className="p-3 text-right font-medium text-ink">{t.weeklyLimit} periods</td>
                            <td className="p-3 text-right font-bold text-burgundy">{t.assignedPeriods} periods</td>
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
          <Card className="border border-border space-y-6">
            <div>
              <h3 className="text-base font-bold text-ink">Data Persistence & System Backups</h3>
              <p className="text-xs text-ink-muted mt-0.5">
                Export and restore the complete system database (faculty, batches, timetables, and audit history) as JSON snapshots.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Export Box */}
              <div className="p-4 bg-surface-muted/60 border border-border rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-primary" />
                  <h4 className="text-sm font-bold text-ink">Export all data</h4>
                </div>
                <p className="text-xs text-ink-muted leading-relaxed">
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
              <div className="p-4 bg-surface-muted/60 border border-border rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-accent" />
                  <h4 className="text-sm font-bold text-ink">Import backup</h4>
                </div>
                <p className="text-xs text-ink-muted leading-relaxed">
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
              <div className="p-3.5 bg-burgundy-soft text-burgundy border border-burgundy/20 rounded-md space-y-1 text-xs font-medium">
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
            <div className="pt-4 border-t border-border flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-burgundy">Factory Seed Reset</h4>
                <p className="text-xs text-ink-muted">
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
        <Card className="border border-border" padding={false}>
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
              <div className="p-2.5 bg-surface-muted rounded border border-border text-center">
                <span className="text-[10px] uppercase font-bold text-ink-muted">Faculty</span>
                <div className="text-lg font-bold text-primary">{importedBackup.faculty?.length || 0}</div>
              </div>
              <div className="p-2.5 bg-surface-muted rounded border border-border text-center">
                <span className="text-[10px] uppercase font-bold text-ink-muted">Batches</span>
                <div className="text-lg font-bold text-primary">{importedBackup.batches?.length || 0}</div>
              </div>
              <div className="p-2.5 bg-surface-muted rounded border border-border text-center">
                <span className="text-[10px] uppercase font-bold text-ink-muted">Timetables</span>
                <div className="text-lg font-bold text-primary">
                  {Object.keys(importedBackup.weekTimetables || {}).length}
                </div>
              </div>
              <div className="p-2.5 bg-surface-muted rounded border border-border text-center">
                <span className="text-[10px] uppercase font-bold text-ink-muted">Schema Ver</span>
                <div className="text-lg font-bold text-primary">{importedBackup.version || 1}</div>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <span className="text-xs font-bold text-ink uppercase block">Restoration Mode</span>
              <div className="space-y-2">
                <label htmlFor="restore-mode-replace" className="flex items-start gap-2.5 p-3 rounded border border-border bg-surface cursor-pointer hover:border-accent">
                  <input
                    id="restore-mode-replace"
                    type="radio"
                    name="restoreMode"
                    value="replace"
                    checked={restoreMode === 'replace'}
                    onChange={() => setRestoreMode('replace')}
                    className="mt-0.5 text-primary focus:ring-accent accent-primary"
                  />
                  <div>
                    <span className="text-xs font-bold text-ink block">
                      Replace All Existing State (Recommended)
                    </span>
                    <span className="text-[11px] text-ink-muted">
                      Wipes current working state and restores this exact snapshot cleanly.
                    </span>
                  </div>
                </label>

                <label htmlFor="restore-mode-merge" className="flex items-start gap-2.5 p-3 rounded border border-border bg-surface cursor-pointer hover:border-accent">
                  <input
                    id="restore-mode-merge"
                    type="radio"
                    name="restoreMode"
                    value="merge"
                    checked={restoreMode === 'merge'}
                    onChange={() => setRestoreMode('merge')}
                    className="mt-0.5 text-primary focus:ring-accent accent-primary"
                  />
                  <div>
                    <span className="text-xs font-bold text-ink block">
                      Merge with Existing State
                    </span>
                    <span className="text-[11px] text-ink-muted">
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
      <ConfirmDialog
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onConfirm={handleFactoryResetConfirm}
        title="Confirm Factory Reset"
        variant="danger"
        confirmText="Reset to Factory Seed"
        message={
          <div className="space-y-3">
            <div className="p-3 bg-burgundy-soft border border-burgundy/20 rounded text-xs text-ink flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-burgundy shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-burgundy">Warning: All Custom Changes Will Be Lost</p>
                <p>
                  This will reset all 145 faculty profiles, 70 batches, weekly timetables, and audit history back to the initial factory seed state.
                </p>
              </div>
            </div>
            <p className="text-xs text-ink-muted">
              If you wish to retain your current timetables, please export a JSON backup first from the Backup tab.
            </p>
          </div>
        }
      />
    </div>
  );
}
