import { AlertTriangle, BookOpen } from 'lucide-react';
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
    <Card className="space-y-3.5 shadow-2xs border-slate-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-slate-100 text-slate-700 rounded-md shrink-0 border border-slate-200/60">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 leading-tight">
              Academic Ratio &amp; Quota Progress
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Target Balance: {quota.targetPCMB}% Core Science (PCMB) &middot; {quota.targetLang}% Languages &amp; Electives
            </p>
          </div>
        </div>

        <div className="text-xs font-semibold text-slate-600 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200/80 w-fit">
          <span className="text-slate-900 font-bold">{total}</span> periods scheduled this week
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-slate-100">
          <div
            className="bg-indigo-600 h-full transition-all duration-300"
            style={{ width: `${quota.actualPCMBPct}%` }}
            title={`PCMB: ${quota.pcmb} slots (${quota.actualPCMBPct}%)`}
          />
          <div
            className="bg-teal-600 h-full transition-all duration-300"
            style={{ width: `${quota.actualLangPct}%` }}
            title={`Languages: ${quota.lang} slots (${quota.actualLangPct}%)`}
          />
        </div>

        <div className="flex flex-wrap justify-between text-xs font-medium text-slate-600 gap-2 px-0.5">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-indigo-600 inline-block shrink-0" />
            Core Science (PCMB): <strong className="text-slate-900 font-bold">{quota.pcmb}</strong> ({quota.actualPCMBPct}%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-teal-600 inline-block shrink-0" />
            Languages &amp; Electives: <strong className="text-slate-900 font-bold">{quota.lang}</strong> ({quota.actualLangPct}%)
          </span>
        </div>
      </div>

      {gapCount > 0 && (
        <div className="flex items-start gap-2.5 text-xs font-medium text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
          <div className="leading-relaxed">
            <strong className="font-semibold text-rose-900">
              {gapCount} unresolved gap{gapCount > 1 ? 's' : ''} on {day}:
            </strong>{' '}
            Assigned faculty went absent and no substitute was found automatically. Click any gap slot to assign a replacement teacher or run &ldquo;Sync Absences&rdquo;.
          </div>
        </div>
      )}
    </Card>
  );
}
