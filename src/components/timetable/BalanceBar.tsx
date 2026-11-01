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
    <Card className="space-y-3.5 shadow-2xs border-[#E5E2DA]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-[#F0EFE9] text-[#252522] rounded-md shrink-0 border border-[#E5E2DA]">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#252522] leading-tight">
              Academic Balance &amp; Subject Quotas
            </h2>
            <p className="text-xs text-[#77766F] mt-0.5">
              Target Ratio: {quota.targetPCMB}% Core Science (PCMB) &middot; {quota.targetLang}% Languages &amp; Electives
            </p>
          </div>
        </div>

        <div className="text-xs font-medium text-[#77766F] bg-[#F0EFE9] px-2.5 py-1 rounded-md border border-[#E5E2DA] w-fit">
          <span className="text-[#252522] font-semibold">{total}</span> periods scheduled
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-[#F0EFE9]">
          <div
            className="bg-[#C47B59] h-full transition-all duration-300"
            style={{ width: `${quota.actualPCMBPct}%` }}
            title={`PCMB: ${quota.pcmb} slots (${quota.actualPCMBPct}%)`}
          />
          <div
            className="bg-[#A58A68] h-full transition-all duration-300"
            style={{ width: `${quota.actualLangPct}%` }}
            title={`Languages: ${quota.lang} slots (${quota.actualLangPct}%)`}
          />
        </div>

        <div className="flex flex-wrap justify-between text-xs font-medium text-[#77766F] gap-2 px-0.5">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#C47B59] inline-block shrink-0" />
            Core Science (PCMB): <strong className="text-[#252522] font-semibold">{quota.pcmb}</strong> ({quota.actualPCMBPct}%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#A58A68] inline-block shrink-0" />
            Languages &amp; Electives: <strong className="text-[#252522] font-semibold">{quota.lang}</strong> ({quota.actualLangPct}%)
          </span>
        </div>
      </div>

      {gapCount > 0 && (
        <div className="flex items-start gap-2.5 text-xs font-medium text-[#9E4334] bg-[#FDF2F0] border border-[#F5D5CF] rounded-md p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 text-[#C47B59] mt-0.5" />
          <div className="leading-relaxed">
            <strong className="font-semibold text-[#8A4C2E]">
              {gapCount} unresolved gap{gapCount > 1 ? 's' : ''} on {day}:
            </strong>{' '}
            Assigned instructor went absent and no substitute was found automatically. Click any gap slot to assign a replacement teacher or run &ldquo;Sync Absences&rdquo;.
          </div>
        </div>
      )}
    </Card>
  );
}
