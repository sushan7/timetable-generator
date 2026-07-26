import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, RotateCcw, History } from 'lucide-react';
import type { SchedulerSettings } from '../types';
import { storage, defaultSettings } from '../utils/storage';
import AuditLogView from '../components/AuditLogView';

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
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div className="flex items-center gap-3">
          <SettingsIcon className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900">Settings & Audit Trail</h1>
        </div>
        {saved && (
          <span className="text-sm font-medium text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
            Settings saved successfully!
          </span>
        )}
      </div>

      <div className="flex gap-2 border-b">
        <button
          onClick={() => setTab('config')}
          className={`px-4 py-2 font-medium text-sm ${tab === 'config' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-gray-500'}`}
        >
          <SettingsIcon className="w-4 h-4 inline mr-1" /> Configuration
        </button>
        <button
          onClick={() => setTab('audit')}
          className={`px-4 py-2 font-medium text-sm ${tab === 'audit' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-gray-500'}`}
        >
          <History className="w-4 h-4 inline mr-1" /> Audit Log
        </button>
      </div>

      {tab === 'config' ? (
        <form onSubmit={handleSave} className="bg-white rounded-xl shadow-sm border p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">PCMB Weight (%)</label>
              <input
                type="number"
                value={settings.pcmbWeight}
                onChange={e => handleChange('pcmbWeight', Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <p className="text-xs text-gray-500">Priority weighting for core science and math subjects.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Language Weight (%)</label>
              <input
                type="number"
                value={settings.languageWeight}
                onChange={e => handleChange('languageWeight', Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <p className="text-xs text-gray-500">Priority weighting for second language and elective assignments.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Max Daily Periods per Faculty</label>
              <input
                type="number"
                value={settings.maxDailyPeriods}
                onChange={e => handleChange('maxDailyPeriods', Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <p className="text-xs text-gray-500">Hard limit on teaching allocations per teacher in a single day.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Week Start Day</label>
              <select
                value={settings.weekStartDay}
                onChange={e => handleChange('weekStartDay', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                <option value="Monday">Monday</option>
                <option value="Sunday">Sunday</option>
              </select>
              <p className="text-xs text-gray-500">Defines when weekly workload counts and rotation counters reset.</p>
            </div>
          </div>

          <hr />

          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">Heuristic Engine Toggles</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.enableGapOptimization}
                  onChange={e => handleChange('enableGapOptimization', e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Enable Gap Optimization (Minimize idle periods)</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.enableConsecutivePeriodAvoidance}
                  onChange={e => handleChange('enableConsecutivePeriodAvoidance', e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Enable Consecutive Period Avoidance</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 border text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <RotateCcw className="w-4 h-4" /> Reset to Defaults
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <Save className="w-4 h-4" /> Save Configuration
            </button>
          </div>
        </form>
      ) : (
        <AuditLogView />
      )}
    </div>
  );
}