import { AlertTriangle } from 'lucide-react';
import Card from '../ui/Card';

interface Quota {
  pcmb: number; lang: number; targetPCMB: number; targetLang: number;
  actualPCMBPct: number; actualLangPct: number;
}

export default function BalanceBar({ quota, gapCount, day }: { quota: Quota; gapCount: number; day: string }) {
  return (
    <Card className="space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Weekly PCMB / Language Balance</h2>
        <span className="text-xs text-slate-400">Target: {quota.targetPCMB}% PCMB · {quota.targetLang}% Language</span>
      </div>
      <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-slate-100">
        <div className="bg-indigo-500 h-full transition-all duration-500" style={{ width: `${quota.actualPCMBPct}%` }} />
        <div className="bg-indigo-200 h-full transition-all duration-500" style={{ width: `${quota.actualLangPct}%` }} />
      </div>
      <div className="flex justify-between text-xs font-medium text-slate-500">
        <span>PCMB: {quota.pcmb} periods ({quota.actualPCMBPct}%)</span>
        <span>Language: {quota.lang} periods ({quota.actualLangPct}%)</span>
      </div>
      {gapCount > 0 && (
        <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {gapCount} unresolved gap{gapCount > 1 ? 's' : ''} on {day} — a faculty went absent and no substitute or alternate subject was available.
        </div>
      )}
    </Card>
  );
}