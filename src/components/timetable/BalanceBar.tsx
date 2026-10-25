import { AlertTriangle, BookOpen, Sparkles } from 'lucide-react';
import Card from '../ui/Card';

interface Quota {
  pcmb: number;
  lang: number;
  targetPCMB: number;
  targetLang: number;
  actualPCMBPct: number;
  actualLangPct: number;
}

export default function BalanceBar({
  quota,
  gapCount,
  day,
}: {
  quota: Quota;
  gapCount: number;
  day: string;
}) {
  const total = quota.pcmb + quota.lang;

  return (
    <Card className="space-y-4 shadow-xs border-slate-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Academic Balance & Quota Progress
            </h2>
            <p className="text-xs text-slate-400">
              Target balance: {quota.targetPCMB}% Science/Math (PCMB) &middot; {quota.targetLang}% Languages &amp; Electives
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs font-semibold text-slate-600">
          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-md">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            Total Scheduled: {total} periods
          </span>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex h-3 w-full rounded-full overflow-hidden bg-slate-100 p-0.5 ring-1 ring-slate-200/60">
          <div
            className="bg-gradient-to-r from-indigo-600 to-indigo-500 h-full rounded-full transition-all duration-500"
            style={{ width: `${quota.actualPCMBPct}%` }}
            title={`PCMB: ${quota.pcmb} slots (${quota.actualPCMBPct}%)`}
          />
          <div
            className="bg-gradient-to-r from-cyan-400 to-teal-400 h-full rounded-full transition-all duration-500"
            style={{ width: `${quota.actualLangPct}%` }}
            title={`Languages: ${quota.lang} slots (${quota.actualLangPct}%)`}
          />
        </div>
        <div className="flex justify-between text-xs font-medium text-slate-600 px-0.5">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-indigo-600 inline-block" />
            PCMB (Core Science): <strong className="text-slate-800">{quota.pcmb}</strong> ({quota.actualPCMBPct}%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-teal-400 inline-block" />
            Languages &amp; Electives: <strong className="text-slate-800">{quota.lang}</strong> ({quota.actualLangPct}%)
          </span>
        </div>
      </div>

      {gapCount > 0 && (
        <div className="flex items-center gap-2.5 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 shadow-2xs">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
          <span>
            <strong>{gapCount} unresolved gap{gapCount > 1 ? 's' : ''}</strong> detected on {day}. A faculty member went absent and no substitute or alternate subject could be placed automatically. Use &ldquo;Sync Absences&rdquo; or click the cell to assign manually.
          </span>
        </div>
      )}
    </Card>
  );
}