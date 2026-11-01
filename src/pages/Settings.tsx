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
        icon={<SettingsIcon className="w-5 h-5 text-[#252522]" />}
        title="Settings &amp; Audit Trail"
        subtitle="Configure heuristic weights, fairness rules, and inspect the automated change history"
        actions={
          statusMessage ? (
            <span className="text-xs font-semibold text-[#8A4C2E] bg-[#FBF3EE] border border-[#F3DFD3] px-3 py-1.5 rounded-md flex items-center gap-1.5 shadow-2xs">
              <CheckCircle2 className="w-4 h-4 text-[#C47B59]" />
              <span>{statusMessage}</span>
            </span>
          ) : undefined
        }
      />

      {/* Tabs */}
      <div className="flex border-b border-[#E5E2DA] select-none">
        <button
          type="button"
          onClick={() => setTab('config')}
          className={`px-4 py-2.5 font-medium text-sm flex items-center gap-2 transition-colors border-b-2 -mb-px ${
            tab === 'config'
              ? 'border-[#C47B59] text-[#C47B59] font-semibold'
              : 'border-transparent text-[#77766F] hover:text-[#252522]'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Scheduler Configuration</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('audit')}
          className={`px-4 py-2.5 font-medium text-sm flex items-center gap-2 transition-colors border-b-2 -mb-px ${
            tab === 'audit'
              ? 'border-[#C47B59] text-[#C47B59] font-semibold'
              : 'border-transparent text-[#77766F] hover:text-[#252522]'
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
                <h3 className="text-base font-bold text-[#252522] leading-snug">
                  Academic Subject Distribution
                </h3>
                <p className="text-xs text-[#77766F] mt-0.5">
                  Controls the automatic rotation ratio between core PCMB science lectures and language/elective classes.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#252522]">
                    Core Science (PCMB) Weight (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={settings.pcmbWeight}
                    onChange={e => handleChange('pcmbWeight', Number(e.target.value))}
                    className="w-full px-3 py-2 border border-[#E5E2DA] rounded-md text-sm bg-white focus:border-[#C47B59] outline-none text-[#252522]"
                  />
                  <p className="text-xs text-[#77766F]">
                    Target allocation share for Physics, Chemistry, Math &amp; Biology.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#252522]">
                    Language &amp; Elective Weight (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={settings.languageWeight}
                    onChange={e => handleChange('languageWeight', Number(e.target.value))}
                    className="w-full px-3 py-2 border border-[#E5E2DA] rounded-md text-sm bg-white focus:border-[#C47B59] outline-none text-[#252522]"
                  />
                  <p className="text-xs text-[#77766F]">
                    Target allocation share for English and K/H/S.
                  </p>
                </div>
              </div>

              <hr className="border-[#E5E2DA]" />

              <div>
                <h3 className="text-base font-bold text-[#252522] leading-snug">
                  Workload &amp; Academic Scheduling Rules
                </h3>
                <p className="text-xs text-[#77766F] mt-0.5">
                  Configure constraints on daily teaching hours and weekly rotation cycles.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#252522]">
                    Maximum Daily Periods per Faculty
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={settings.maxDailyPeriods}
                    onChange={e => handleChange('maxDailyPeriods', Number(e.target.value))}
                    className="w-full px-3 py-2 border border-[#E5E2DA] rounded-md text-sm bg-white focus:border-[#C47B59] outline-none text-[#252522]"
                  />
                  <p className="text-xs text-[#77766F]">
                    Default global daily teaching ceiling per instructor.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#252522]">
                    Academic Week Start Day
                  </label>
                  <select
                    value={settings.weekStartDay}
                    onChange={e => handleChange('weekStartDay', e.target.value as 'Monday' | 'Sunday')}
                    className="w-full px-3 py-2 border border-[#E5E2DA] rounded-md text-sm bg-white focus:border-[#C47B59] outline-none text-[#252522]"
                  >
                    <option value="Monday">Monday</option>
                    <option value="Sunday">Sunday</option>
                  </select>
                  <p className="text-xs text-[#77766F]">
                    Defines the anchor point when weekly workload quota resets.
                  </p>
                </div>
              </div>

              <hr className="border-[#E5E2DA]" />

              <div className="space-y-3">
                <h3 className="text-base font-bold text-[#252522] leading-snug">
                  Heuristic Optimization Preferences
                </h3>
                <div className="space-y-2.5">
                  <label className="flex items-start gap-3 p-3 rounded-md border border-[#E5E2DA] hover:bg-[#F0EFE9] cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={settings.enableGapOptimization}
                      onChange={e => handleChange('enableGapOptimization', e.target.checked)}
                      className="w-4 h-4 text-[#C47B59] rounded border-[#E5E2DA] mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-semibold text-[#252522] block">
                        Enable Gap Optimization (Period clustering)
                      </span>
                      <span className="text-xs text-[#77766F] block mt-0.5">
                        Prefers assigning slots to minimize idle gaps between teaching periods for faculty.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded-md border border-[#E5E2DA] hover:bg-[#F0EFE9] cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={settings.enableConsecutivePeriodAvoidance}
                      onChange={e => handleChange('enableConsecutivePeriodAvoidance', e.target.checked)}
                      className="w-4 h-4 text-[#C47B59] rounded border-[#E5E2DA] mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-semibold text-[#252522] block">
                        Enable Consecutive Period Avoidance
                      </span>
                      <span className="text-xs text-[#77766F] block mt-0.5">
                        Penalizes scheduling the same teacher back-to-back in consecutive slots for the same batch.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-4 border-t border-[#E5E2DA]">
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
          <Card className="border-[#F5D5CF] bg-[#FDF2F0]/40">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h4 className="text-sm font-bold text-[#9E4334] flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-[#C47B59] shrink-0" />
                  <span>Demo &amp; Seed Data Reset</span>
                </h4>
                <p className="text-xs text-[#77766F] mt-1 leading-relaxed">
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
