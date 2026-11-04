import { AlertTriangle, BookOpen } from 'lucide-react';
import Card from '../ui/Card';

export interface Quota {
  pcmb: number;
  lang: number;
  other?: number;
  targetPCMB: number;
  targetLang: number;
  actualPCMBPct: number;
  actualLangPct: number;
  actualOtherPct?: number;
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
  const otherCount = quota.other || 0;
  const total = quota.pcmb + quota.lang + otherCount;
  const otherPct = quota.actualOtherPct || 0;

  return (
    <Card className="space-y-3.5 shadow-2xs border-border">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-surface-muted text-accent rounded-md shrink-0 border border-border">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-ink leading-tight">
              Academic Balance & Subject Quotas
            </h2>
            <p className="text-xs text-ink-muted mt-0.5">
              Target Ratio: {quota.targetPCMB}% Core Science (PCMB) · {quota.targetLang}% Languages
            </p>
          </div>
        </div>

        <div className="text-xs font-medium text-ink-muted bg-surface-muted px-2.5 py-1 rounded-md border border-border w-fit">
          <span className="text-ink font-semibold">{total}</span> periods scheduled
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-surface-muted border border-border/60">
          <div
            className="bg-primary h-full transition-all duration-300"
            style={{ width: `${quota.actualPCMBPct}%` }}
            title={`PCMB: ${quota.pcmb} slots (${quota.actualPCMBPct}%)`}
          />
          <div
            className="bg-accent h-full transition-all duration-300"
            style={{ width: `${quota.actualLangPct}%` }}
            title={`Languages: ${quota.lang} slots (${quota.actualLangPct}%)`}
          />
          {otherCount > 0 && (
            <div
              className="bg-taupe h-full transition-all duration-300"
              style={{ width: `${otherPct}%` }}
              title={`Other: ${otherCount} slots (${otherPct}%)`}
            />
          )}
        </div>

        <div className="flex flex-wrap justify-between text-xs font-medium text-ink-muted gap-2 px-0.5">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary inline-block shrink-0" />
            Core Science (PCMB): <strong className="text-ink font-semibold">{quota.pcmb}</strong> ({quota.actualPCMBPct}%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-accent inline-block shrink-0" />
            Languages: <strong className="text-ink font-semibold">{quota.lang}</strong> ({quota.actualLangPct}%)
          </span>
          {otherCount > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-taupe inline-block shrink-0" />
              Other Subjects: <strong className="text-ink font-semibold">{otherCount}</strong> ({otherPct}%)
            </span>
          )}
        </div>
      </div>

      {gapCount > 0 && (
        <div className="flex items-start gap-2.5 text-xs font-medium text-burgundy bg-burgundy-soft border border-burgundy/20 rounded-md p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 text-burgundy mt-0.5" />
          <div className="leading-relaxed">
            <strong className="font-semibold text-burgundy">
              {gapCount} unresolved gap{gapCount > 1 ? 's' : ''} on {day}:
            </strong>{' '}
            Assigned instructor is absent and no conflict-free substitute was found automatically. Click any gap slot to assign a replacement teacher or run "Patch Absences".
          </div>
        </div>
      )}
    </Card>
  );
}
