import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, RotateCcw, History } from 'lucide-react';
import type { SchedulerSettings } from '../types';
import { storage, defaultSettings } from '../utils/storage';
import AuditLogView from '../components/AuditLogView';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

type Tab = 'config' | 'audit';

export default function SettingsView() {
  const [tab, setTab] = useState<Tab>('config');
  const [settings, setSettings] = useState<SchedulerSettings>(defaultSettings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSettings(storage.getSettings());
  }, []);

  const handleChange = (key: keyof SchedulerSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    storage.setSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = () => {
    setSettings(defaultSettings);
    storage.setSettings(defaultSettings);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <PageHeader
        icon={<SettingsIcon className="w-6 h-6" />}
        title="Settings & Audit Trail"
        actions={saved ? (
          <span className="text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-full">
            Settings saved
          </span>
        ) : undefined}
      />

      <div className="flex gap-1 border-b border-slate-200">
        <button
          onClick={() => setTab('config')}
          className={`px-4 py-2.5 font-semibold text-sm flex items-center gap-1.5 transition-colors ${
            tab === 'config' ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <SettingsIcon className="w-4 h-4" /> Configuration
        </button>
        <button
          onClick={() => setTab('audit')}
          className={`px-4 py-2.5 font-semibold text-sm flex items-center gap-1.5 transition-colors ${
            tab === 'audit' ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <History className="w-4 h-4" /> Audit Log
        </button>
      </div>

      {tab === 'config' ? (
        <Card as="form" className="space-y-6">
          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">PCMB Weight (%)</label>
                <input
                  type="number" value={settings.pcmbWeight}
                  onChange={e => handleChange('pcmbWeight', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
                <p className="text-xs text-slate-500">Priority weighting for core science and math subjects.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">Language Weight (%)</label>
                <input
                  type="number" value={settings.languageWeight}
                  onChange={e => handleChange('languageWeight', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
                <p className="text-xs text-slate-500">Priority weighting for second language and elective assignments.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">Max Daily Periods per Faculty</label>
                <input
                  type="number" value={settings.maxDailyPeriods}
                  onChange={e => handleChange('maxDailyPeriods', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
                <p className="text-xs text-slate-500">Hard limit on teaching allocations per teacher in a single day.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">Week Start Day</label>
                <select
                  value={settings.weekStartDay}
                  onChange={e => handleChange('weekStartDay', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                >
                  <option value="Monday">Monday</option>
                  <option value="Sunday">Sunday</option>
                </select>
                <p className="text-xs text-slate-500">Defines when weekly workload counts and rotation counters reset.</p>
              </div>
            </div>

            <hr className="border-slate-100" />

            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-800">Heuristic Engine Toggles</h3>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox" checked={settings.enableGapOptimization}
                  onChange={e => handleChange('enableGapOptimization', e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded"
                />
                <span className="text-sm font-medium text-slate-700">Enable Gap Optimization (minimize idle periods)</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox" checked={settings.enableConsecutivePeriodAvoidance}
                  onChange={e => handleChange('enableConsecutivePeriodAvoidance', e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded"
                />
                <span className="text-sm font-medium text-slate-700">Enable Consecutive Period Avoidance</span>
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <Button type="button" variant="secondary" icon={<RotateCcw className="w-4 h-4" />} onClick={handleReset}>
                Reset to Defaults
              </Button>
              <Button type="submit" variant="primary" icon={<Save className="w-4 h-4" />}>
                Save Configuration
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <AuditLogView />
      )}
    </div>
  );
}