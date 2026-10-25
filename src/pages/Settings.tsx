import { useState } from 'react';
import { Settings as SettingsIcon, Save, RotateCcw, History, AlertTriangle, CheckCircle2, Database } from 'lucide-react';
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
        icon={<SettingsIcon className="w-6 h-6" />}
        title="Settings & Audit Trail"
        subtitle="Manage heuristic scheduler weights, fairness limits, and view change logs"
        actions={
          statusMessage ? (
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-2xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              {statusMessage}
            </span>
          ) : undefined
        }
      />

      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setTab('config')}
          className={`px-4 py-2.5 font-semibold text-sm flex items-center gap-2 transition-all ${
            tab === 'config'
              ? 'border-b-2 border-indigo-600 text-indigo-700'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <SettingsIcon className="w-4 h-4" /> Engine Configuration
        </button>
        <button
          onClick={() => setTab('audit')}
          className={`px-4 py-2.5 font-semibold text-sm flex items-center gap-2 transition-all ${
            tab === 'audit'
              ? 'border-b-2 border-indigo-600 text-indigo-700'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <History className="w-4 h-4" /> Audit & Activity Trail
        </button>
      </div>

      {tab === 'config' ? (
        <div className="space-y-6">
          <Card>
            <form onSubmit={handleSave} className="space-y-6">
              <div>
                <h3 className="text-base font-bold text-slate-900">Academic Subject Weighting</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Controls the automatic rotation ratio between core PCMB science lectures and language/elective classes.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-slate-700">PCMB Science Weight (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={settings.pcmbWeight}
                    onChange={e => handleChange('pcmbWeight', Number(e.target.value))}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                  <p className="text-xs text-slate-400">Target allocation quota for Physics, Chemistry, Math &amp; Biology.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-slate-700">Language &amp; Elective Weight (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={settings.languageWeight}
                    onChange={e => handleChange('languageWeight', Number(e.target.value))}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                  <p className="text-xs text-slate-400">Target allocation quota for English and Second Languages.</p>
                </div>
              </div>

              <hr className="border-slate-100" />

              <div>
                <h3 className="text-base font-bold text-slate-900">Workload &amp; Academic Scheduling Rules</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure constraints on daily teaching hours and weekly rotation cycles.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-slate-700">Max Daily Periods per Faculty</label>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={settings.maxDailyPeriods}
                    onChange={e => handleChange('maxDailyPeriods', Number(e.target.value))}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                  <p className="text-xs text-slate-400">Global ceiling for teaching slots per teacher each day.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-slate-700">Academic Week Start Day</label>
                  <select
                    value={settings.weekStartDay}
                    onChange={e => handleChange('weekStartDay', e.target.value as 'Monday' | 'Sunday')}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm bg-white"
                  >
                    <option value="Monday">Monday</option>
                    <option value="Sunday">Sunday</option>
                  </select>
                  <p className="text-xs text-slate-400">Defines when weekly workload quota counters reset.</p>
                </div>
              </div>

              <hr className="border-slate-100" />

              <div className="space-y-3">
                <h3 className="text-base font-bold text-slate-900">Heuristic Optimization Toggles</h3>
                <div className="space-y-2.5">
                  <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={settings.enableGapOptimization}
                      onChange={e => handleChange('enableGapOptimization', e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-semibold text-slate-800 block">
                        Enable Gap Optimization (Cluster periods)
                      </span>
                      <span className="text-xs text-slate-400 block mt-0.5">
                        Prefers assigning slots to minimize idle gaps between teaching periods for faculty.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={settings.enableConsecutivePeriodAvoidance}
                      onChange={e => handleChange('enableConsecutivePeriodAvoidance', e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-semibold text-slate-800 block">
                        Enable Consecutive Period Avoidance
                      </span>
                      <span className="text-xs text-slate-400 block mt-0.5">
                        Penalizes scheduling the same faculty back-to-back in consecutive slots for the same batch.
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
                  Reset Parameters
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  icon={<Save className="w-4 h-4" />}
                >
                  {saved ? 'Saved' : 'Save Configuration'}
                </Button>
              </div>
            </form>
          </Card>

          {/* Danger Zone: Restore Demo Data */}
          <Card className="border-rose-200 bg-rose-50/20">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h4 className="text-sm font-bold text-rose-950 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600" /> Demo &amp; Factory Reset
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  Restore all initial batches, classrooms, and 100+ faculty members to seed defaults.
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