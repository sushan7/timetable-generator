import { useState } from 'react';
import {
  Settings as SettingsIcon,
  Save,
  RotateCcw,
  History,
  AlertTriangle,
  CheckCircle2,
  Database,
  Sliders,
} from 'lucide-react';
import type { SchedulerSettings } from '../types';
import { storage, defaultSettings } from '../utils/storage';
import AuditLogView from '../components/AuditLogView';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

type Tab = 'config' | 'audit';

export default function SettingsView() {
  const [tab, setTab] = useState<Tab>('config');
  const [settings, setSettings] = useState<SchedulerSettings>(() => storage.getSettings());
  const [saved, setSaved] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleChange = <K extends keyof SchedulerSettings>(key: K, value: SchedulerSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    storage.setSettings(settings);
    setSaved(true);
    setStatusMessage('Scheduler parameters saved successfully.');
    setTimeout(() => {
      setSaved(false);
      setStatusMessage(null);
    }, 3500);
  };

  const handleResetSettings = () => {
    if (confirm('Reset scheduler parameters back to default values?')) {
      setSettings(defaultSettings);
      storage.setSettings(defaultSettings);
      setSaved(true);
      setStatusMessage('Settings reverted to defaults.');
      setTimeout(() => {
        setSaved(false);
        setStatusMessage(null);
      }, 3500);
    }
  };

  const handleFactoryReset = () => {
    const verified = confirm(
      'WARNING: This will completely restore all Faculty, Batches, and Settings back to original seed data, and clear all generated weekly timetables and audit trails.\n\nDo you want to proceed?'
    );
    if (verified) {
      storage.resetToSeedData();
      setSettings(defaultSettings);
      alert('System successfully restored to initial demo data! Refreshing application state.');
      window.location.reload();
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <PageHeader
        icon={<SettingsIcon className="w-5 h-5" />}
        title="Settings &amp; Audit Trail"
        subtitle="Configure heuristic weights, fairness rules, and inspect the automated change history"
        actions={
          statusMessage ? (
            <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-md flex items-center gap-1.5 shadow-2xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{statusMessage}</span>
            </span>
          ) : undefined
        }
      />

      {/* Tabs */}
      <div className="flex border-b border-slate-200 select-none">
        <button
          type="button"
          onClick={() => setTab('config')}
          className={`px-4 py-2.5 font-semibold text-sm flex items-center gap-2 transition-colors border-b-2 -mb-px ${
            tab === 'config'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Scheduler Configuration</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('audit')}
          className={`px-4 py-2.5 font-semibold text-sm flex items-center gap-2 transition-colors border-b-2 -mb-px ${
            tab === 'audit'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Audit &amp; Activity Log</span>
        </button>
      </div>

      {tab === 'config' ? (
        <div className="space-y-6">
          <Card>
            <form onSubmit={handleSave} className="space-y-6">
              <div>
                <h3 className="text-base font-bold text-slate-900 leading-snug">
                  Academic Subject Distribution
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Controls the automatic rotation ratio between core PCMB science lectures and language/elective classes.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    Core Science (PCMB) Weight (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={settings.pcmbWeight}
                    onChange={e => handleChange('pcmbWeight', Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-indigo-600 outline-none"
                  />
                  <p className="text-xs text-slate-400">
                    Target allocation share for Physics, Chemistry, Math &amp; Biology.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    Language &amp; Elective Weight (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={settings.languageWeight}
                    onChange={e => handleChange('languageWeight', Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-indigo-600 outline-none"
                  />
                  <p className="text-xs text-slate-400">
                    Target allocation share for English and Second Languages.
                  </p>
                </div>
              </div>

              <hr className="border-slate-100" />

              <div>
                <h3 className="text-base font-bold text-slate-900 leading-snug">
                  Workload &amp; Academic Scheduling Rules
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure constraints on daily teaching hours and weekly rotation cycles.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    Maximum Daily Periods per Faculty
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={settings.maxDailyPeriods}
                    onChange={e => handleChange('maxDailyPeriods', Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-indigo-600 outline-none"
                  />
                  <p className="text-xs text-slate-400">
                    Default global daily teaching ceiling per instructor.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    Academic Week Start Day
                  </label>
                  <select
                    value={settings.weekStartDay}
                    onChange={e => handleChange('weekStartDay', e.target.value as 'Monday' | 'Sunday')}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:border-indigo-600 outline-none"
                  >
                    <option value="Monday">Monday</option>
                    <option value="Sunday">Sunday</option>
                  </select>
                  <p className="text-xs text-slate-400">
                    Defines the anchor point when weekly workload quota resets.
                  </p>
                </div>
              </div>

              <hr className="border-slate-100" />

              <div className="space-y-3">
                <h3 className="text-base font-bold text-slate-900 leading-snug">
                  Heuristic Optimization Preferences
                </h3>
                <div className="space-y-2.5">
                  <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={settings.enableGapOptimization}
                      onChange={e => handleChange('enableGapOptimization', e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300 mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-semibold text-slate-900 block">
                        Enable Gap Optimization (Period clustering)
                      </span>
                      <span className="text-xs text-slate-500 block mt-0.5">
                        Prefers assigning slots to minimize idle gaps between teaching periods for faculty.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={settings.enableConsecutivePeriodAvoidance}
                      onChange={e => handleChange('enableConsecutivePeriodAvoidance', e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300 mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-semibold text-slate-900 block">
                        Enable Consecutive Period Avoidance
                      </span>
                      <span className="text-xs text-slate-500 block mt-0.5">
                        Penalizes scheduling the same teacher back-to-back in consecutive slots for the same batch.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="secondary"
                  icon={<RotateCcw className="w-4 h-4" />}
                  onClick={handleResetSettings}
                >
                  Reset Defaults
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  icon={<Save className="w-4 h-4" />}
                >
                  {saved ? 'Saved' : 'Save Parameters'}
                </Button>
              </div>
            </form>
          </Card>

          {/* Danger Zone */}
          <Card className="border-rose-200 bg-rose-50/20">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h4 className="text-sm font-bold text-rose-950 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Demo &amp; Seed Data Reset</span>
                </h4>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Completely restore all default classrooms, seed batches, and 100+ faculty members back to clean demonstration defaults.
                </p>
              </div>
              <Button
                type="button"
                variant="danger"
                icon={<Database className="w-4 h-4" />}
                onClick={handleFactoryReset}
              >
                Restore Seed Data
              </Button>
            </div>
          </Card>
        </div>
      ) : (
        <AuditLogView />
      )}
    </div>
  );
}
