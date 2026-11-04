import React, { useState, useMemo } from 'react';
import { CheckCircle2, AlertTriangle, Search } from 'lucide-react';
import type { WeekQuotaFitReport } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

interface WeekQuotaFitModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: WeekQuotaFitReport | null;
}

export const WeekQuotaFitModal: React.FC<WeekQuotaFitModalProps> = ({
  isOpen,
  onClose,
  report,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'FIT' | 'VARIANCE'>('ALL');

  const filteredBatches = useMemo(() => {
    if (!report) return [];
    let list = report.batchFits;
    if (filterType === 'FIT') {
      list = list.filter(b => b.isFit);
    } else if (filterType === 'VARIANCE') {
      list = list.filter(b => !b.isFit);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(b => b.batchName.toLowerCase().includes(q));
    }
    return list;
  }, [report, filterType, searchQuery]);

  if (!isOpen || !report) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Weekly Subject Quota Fit Report"
      subtitle="Evaluates weekly curriculum allocations against target batch quotas across all 6 days (N9)"
      maxWidth="2xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-xs text-[#5E5B61]">
            Order-independent multi-day generation completed.
          </span>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Metric Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-[#FAF7F2] rounded-lg border border-[#E5E0D8]">
            <span className="text-[11px] font-bold text-[#5E5B61] uppercase tracking-wider block">
              Total Batches
            </span>
            <span className="text-2xl font-bold text-[#252326] mt-0.5 block">
              {report.totalBatches}
            </span>
          </div>

          <div className="p-3 bg-emerald-50/60 rounded-lg border border-emerald-200">
            <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">
              Within ±1 Quota Fit
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-2xl font-bold text-emerald-900">
                {report.batchesWithFit}
              </span>
              <span className="text-xs font-semibold text-emerald-700">
                / {report.totalBatches}
              </span>
            </div>
          </div>

          <div className="p-3 bg-blue-50/60 rounded-lg border border-blue-200">
            <span className="text-[11px] font-bold text-blue-800 uppercase tracking-wider block">
              Perfect Fit (±0)
            </span>
            <span className="text-2xl font-bold text-blue-900 mt-0.5 block">
              {report.batchesWithPerfectFit}
            </span>
          </div>

          <div className="p-3 bg-[#FAF7F2] rounded-lg border border-[#E5E0D8]">
            <span className="text-[11px] font-bold text-[#6B2638] uppercase tracking-wider block">
              Fit Quality
            </span>
            <span className="text-2xl font-bold text-[#6B2638] mt-0.5 block">
              {report.fitPercentage}%
            </span>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#5E5B61]" />
            <input
              type="text"
              placeholder="Search batch..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-[#E5E0D8] rounded focus:border-[#6B2638] outline-none text-[#252326]"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilterType('ALL')}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                filterType === 'ALL'
                  ? 'bg-[#6B2638] text-white'
                  : 'bg-[#FAF7F2] text-[#5E5B61] hover:bg-[#E5E0D8]'
              }`}
            >
              All ({report.totalBatches})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('FIT')}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                filterType === 'FIT'
                  ? 'bg-emerald-800 text-white'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              Within ±1 ({report.batchesWithFit})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('VARIANCE')}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                filterType === 'VARIANCE'
                  ? 'bg-amber-800 text-white'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              Variance ({report.totalBatches - report.batchesWithFit})
            </button>
          </div>
        </div>

        {/* Batch Fit Table */}
        <div className="border border-[#E5E0D8] rounded-lg overflow-hidden max-h-96 overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#FAF7F2] border-b border-[#E5E0D8] sticky top-0 z-10">
              <tr>
                <th className="p-2.5 font-bold text-[#252326]">Batch Name</th>
                <th className="p-2.5 font-bold text-[#252326] text-center">Weekly Slots</th>
                <th className="p-2.5 font-bold text-[#252326]">Subject Breakdown (Allocated / Target)</th>
                <th className="p-2.5 font-bold text-[#252326] text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E0D8] bg-white">
              {filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-[#5E5B61]">
                    No batches matching filter criteria.
                  </td>
                </tr>
              ) : (
                filteredBatches.map(b => (
                  <tr key={b.batchId} className="hover:bg-[#FAF7F2]/50 transition-colors">
                    <td className="p-2.5 font-semibold text-[#252326]">
                      {b.batchName}
                    </td>
                    <td className="p-2.5 text-center text-[#5E5B61]">
                      <span className="font-bold text-[#252326]">{b.totalAllocated}</span>
                      <span className="text-[10px] text-[#5E5B61]"> / {b.totalTarget}</span>
                    </td>
                    <td className="p-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {b.subjectFits.map(s => {
                          const delta = s.delta;
                          const isExact = delta === 0;
                          const isClose = Math.abs(delta) <= 1;

                          let badgeTone = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                          if (!isClose) {
                            badgeTone = 'bg-amber-50 text-amber-800 border-amber-300';
                          } else if (!isExact) {
                            badgeTone = 'bg-blue-50 text-blue-800 border-blue-200';
                          }

                          return (
                            <span
                              key={s.subject}
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${badgeTone}`}
                              title={`${s.subject}: ${s.allocated} allocated vs ${s.target} target (${delta >= 0 ? `+${delta}` : delta})`}
                            >
                              <span>{s.subject}:</span>
                              <strong>
                                {s.allocated}/{s.target}
                              </strong>
                              {!isExact && (
                                <span className="text-[9px] font-bold">
                                  {delta > 0 ? `+${delta}` : delta}
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="p-2.5 text-right">
                      {b.isPerfectFit ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Exact</span>
                        </span>
                      ) : b.isFit ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-300">
                          <span>±1 Fit</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Variance</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
};
