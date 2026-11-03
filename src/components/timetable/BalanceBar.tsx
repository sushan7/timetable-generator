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
    <Card className="space-y-3.5 shadow-2xs border-[#E5E0D8]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-[#FAF7F2] text-[#6B2638] rounded-md shrink-0 border border-[#E5E0D8]">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#252326] leading-tight">
              Academic Balance & Subject Quotas
            </h2>
            <p className="text-xs text-[#5E5B61] mt-0.5">
              Target Ratio: {quota.targetPCMB}% Core Science (PCMB) · {quota.targetLang}% Languages
            </p>
          </div>
        </div>

        <div className="text-xs font-medium text-[#5E5B61] bg-[#FAF7F2] px-2.5 py-1 rounded-md border border-[#E5E0D8] w-fit">
          <span className="text-[#252326] font-semibold">{total}</span> periods scheduled
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-[#FAF7F2] border border-[#E5E0D8]/60">
          <div
            className="bg-[#6B2638] h-full transition-all duration-300"
            style={{ width: `${quota.actualPCMBPct}%` }}
            title={`PCMB: ${quota.pcmb} slots (${quota.actualPCMBPct}%)`}
          />
          <div
            className="bg-[#B08D57] h-full transition-all duration-300"
            style={{ width: `${quota.actualLangPct}%` }}
            title={`Languages: ${quota.lang} slots (${quota.actualLangPct}%)`}
          />
          {otherCount > 0 && (
            <div
              className="bg-[#5C6B73] h-full transition-all duration-300"
              style={{ width: `${otherPct}%` }}
              title={`Other: ${otherCount} slots (${otherPct}%)`}
            />
          )}
        </div>

        <div className="flex flex-wrap justify-between text-xs font-medium text-[#5E5B61] gap-2 px-0.5">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#6B2638] inline-block shrink-0" />
            Core Science (PCMB): <strong className="text-[#252326] font-semibold">{quota.pcmb}</strong> ({quota.actualPCMBPct}%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#B08D57] inline-block shrink-0" />
            Languages: <strong className="text-[#252326] font-semibold">{quota.lang}</strong> ({quota.actualLangPct}%)
          </span>
          {otherCount > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#5C6B73] inline-block shrink-0" />
              Other Subjects: <strong className="text-[#252326] font-semibold">{otherCount}</strong> ({otherPct}%)
            </span>
          )}
        </div>
      </div>

      {gapCount > 0 && (
        <div className="flex items-start gap-2.5 text-xs font-medium text-[#A63232] bg-[#FDF2F2] border border-[#F6CECE] rounded-md p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 text-[#A65E3B] mt-0.5" />
          <div className="leading-relaxed">
            <strong className="font-semibold text-[#8F2424]">
              {gapCount} unresolved gap{gapCount > 1 ? 's' : ''} on {day}:
            </strong>{' '}
            Assigned instructor is absent and no conflict-free substitute was found automatically. Click any gap slot to assign a replacement teacher or run "Patch Absences".
          </div>
        </div>
      )}
    </Card>
  );
}
