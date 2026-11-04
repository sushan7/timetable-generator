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
          <span className="text-xs text-ink-muted">
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
          <div className="p-3 bg-surface-muted rounded-lg border border-border">
            <span className="text-[11px] font-bold text-ink-muted uppercase tracking-wider block">
              Total Batches
            </span>
            <span className="text-2xl font-bold text-ink mt-0.5 block">
              {report.totalBatches}
            </span>
          </div>

          <div className="p-3 bg-surface-muted rounded-lg border border-border">
            <span className="text-[11px] font-bold text-accent uppercase tracking-wider block">
              Within ±1 Quota Fit
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-2xl font-bold text-ink">
                {report.batchesWithFit}
              </span>
              <span className="text-xs font-semibold text-ink-muted">
                / {report.totalBatches}
              </span>
            </div>
          </div>

          <div className="p-3 bg-surface-muted rounded-lg border border-border">
            <span className="text-[11px] font-bold text-ink-muted uppercase tracking-wider block">
              Perfect Fit (±0)
            </span>
            <span className="text-2xl font-bold text-ink mt-0.5 block">
              {report.batchesWithPerfectFit}
            </span>
          </div>

          <div className="p-3 bg-surface-muted rounded-lg border border-border">
            <span className="text-[11px] font-bold text-accent uppercase tracking-wider block">
              Fit Quality
            </span>
            <span className="text-2xl font-bold text-accent mt-0.5 block">
              {report.fitPercentage}%
            </span>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-ink-muted" />
            <input
              type="text"
              placeholder="Search batch..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface border border-border rounded focus:border-accent outline-none text-ink"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilterType('ALL')}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                filterType === 'ALL'
                  ? 'bg-primary text-canvas'
                  : 'bg-surface-muted text-ink-muted hover:bg-border'
              }`}
            >
              All ({report.totalBatches})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('FIT')}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                filterType === 'FIT'
                  ? 'bg-accent text-ink font-bold'
                  : 'bg-accent-soft/40 text-ink hover:bg-accent-soft'
              }`}
            >
              Within ±1 ({report.batchesWithFit})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('VARIANCE')}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                filterType === 'VARIANCE'
                  ? 'bg-cognac text-canvas'
                  : 'bg-cognac-soft text-cognac hover:bg-cognac-soft/80'
              }`}
            >
              Variance ({report.totalBatches - report.batchesWithFit})
            </button>
          </div>
        </div>

        {/* Batch Fit Table */}
        <div className="border border-border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-surface-muted border-b border-border sticky top-0 z-10">
              <tr>
                <th className="p-2.5 font-bold text-ink">Batch Name</th>
                <th className="p-2.5 font-bold text-ink text-center">Weekly Slots</th>
                <th className="p-2.5 font-bold text-ink">Subject Breakdown (Allocated / Target)</th>
                <th className="p-2.5 font-bold text-ink text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-ink-muted">
                    No batches matching filter criteria.
                  </td>
                </tr>
              ) : (
                filteredBatches.map(b => (
                  <tr key={b.batchId} className="hover:bg-surface-muted/50 transition-colors">
                    <td className="p-2.5 font-semibold text-ink">
                      {b.batchName}
                    </td>
                    <td className="p-2.5 text-center text-ink-muted">
                      <span className="font-bold text-ink">{b.totalAllocated}</span>
                      <span className="text-[10px] text-ink-muted"> / {b.totalTarget}</span>
                    </td>
                    <td className="p-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {b.subjectFits.map(s => {
                          const delta = s.delta;
                          const isExact = delta === 0;
                          const isClose = Math.abs(delta) <= 1;

                          let badgeTone = 'bg-accent-soft text-ink border-accent/40';
                          if (!isClose) {
                            badgeTone = 'bg-cognac-soft text-cognac border-cognac/30';
                          } else if (!isExact) {
                            badgeTone = 'bg-surface-muted text-ink border-border';
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
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-accent-soft text-ink border border-accent/40">
                          <CheckCircle2 className="w-3 h-3 text-accent" />
                          <span>Exact</span>
                        </span>
                      ) : b.isFit ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-surface-muted text-ink border border-border">
                          <span>±1 Fit</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-cognac-soft text-cognac border border-cognac/30">
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
