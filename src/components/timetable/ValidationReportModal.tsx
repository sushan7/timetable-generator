import React, { useState } from 'react';
import {
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  Clock,
  DoorClosed,
  UserX,
  ExternalLink,
  Filter,
} from 'lucide-react';
import type { DayValidationReport, TimetableViolation } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';

interface ValidationReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: DayValidationReport | null;
  onJumpToCell: (batchId: string, periodIndex: number) => void;
}

type FilterCategory = 'all' | 'overlap' | 'over_limit' | 'absent' | 'room_clash' | 'unfilled';

export const ValidationReportModal: React.FC<ValidationReportModalProps> = ({
  isOpen,
  onClose,
  report,
  onJumpToCell,
}) => {
  const [filter, setFilter] = useState<FilterCategory>('all');

  if (!report) return null;

  const filteredViolations = report.violations.filter(v => {
    if (filter === 'all') return true;
    return v.type === filter;
  });

  const handleJump = (v: TimetableViolation) => {
    onClose();
    setTimeout(() => {
      onJumpToCell(v.batchId, v.periodIndex);
    }, 100);
  };

  const getTypeIcon = (type: TimetableViolation['type']) => {
    switch (type) {
      case 'overlap':
        return <Clock className="w-4 h-4 text-[#6B2638]" />;
      case 'over_limit':
        return <AlertOctagon className="w-4 h-4 text-[#6B2638]" />;
      case 'absent':
        return <UserX className="w-4 h-4 text-[#6B2638]" />;
      case 'room_clash':
        return <DoorClosed className="w-4 h-4 text-[#6B2638]" />;
      case 'unfilled':
        return <AlertTriangle className="w-4 h-4 text-[#B08D57]" />;
    }
  };

  const getTypeBadgeTone = (type: TimetableViolation['type']) => {
    switch (type) {
      case 'overlap':
      case 'over_limit':
      case 'absent':
      case 'room_clash':
        return 'danger' as const;
      case 'unfilled':
        return 'gold' as const;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Validation Report — ${report.day}`}
      subtitle={`Diagnostic inspection across all ${report.totalSlots} scheduled periods`}
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-[#252326]/70">
            {report.summary.totalIssues === 0 ? (
              <span className="text-[#252326] font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[#B08D57]" />
                All rules satisfied
              </span>
            ) : (
              <span>
                {report.summary.overlaps + report.summary.overLimit + report.summary.absent + report.summary.roomClashes} Hard Conflicts · {report.summary.unfilled} Gaps
              </span>
            )}
          </div>
          <Button variant="secondary" onClick={onClose}>
            Close Report
          </Button>
        </div>
      }
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {/* Top Summary Banner */}
        {report.summary.totalIssues === 0 ? (
          <div className="p-4 bg-[#F6F4F0] border border-[#B08D57]/40 rounded-lg flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-[#B08D57] shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-[#252326]">Schedule Verified Clean</h4>
              <p className="text-xs text-[#252326]/70 mt-0.5">
                Zero teacher overlaps, zero daily workload exceedances, no absent teacher assignments, no room clashes, and all {report.totalSlots} periods are filled.
              </p>
            </div>
          </div>
        ) : (
          <div className="p-3.5 bg-[#FAF0F2] border border-[#ECD9DE] rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-[#6B2638]" />
              <h4 className="text-xs font-bold text-[#6B2638] uppercase tracking-wide">
                Detected Schedule Conflicts ({report.summary.totalIssues})
              </h4>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
              <div className="p-2 bg-white/80 rounded border border-[#ECD9DE]">
                <div className="text-[10px] uppercase font-bold text-[#252326]/60">Overlaps</div>
                <div className="text-base font-bold text-[#6B2638]">{report.summary.overlaps}</div>
              </div>
              <div className="p-2 bg-white/80 rounded border border-[#ECD9DE]">
                <div className="text-[10px] uppercase font-bold text-[#252326]/60">Over Limit</div>
                <div className="text-base font-bold text-[#6B2638]">{report.summary.overLimit}</div>
              </div>
              <div className="p-2 bg-white/80 rounded border border-[#ECD9DE]">
                <div className="text-[10px] uppercase font-bold text-[#252326]/60">Absent</div>
                <div className="text-base font-bold text-[#6B2638]">{report.summary.absent}</div>
              </div>
              <div className="p-2 bg-white/80 rounded border border-[#ECD9DE]">
                <div className="text-[10px] uppercase font-bold text-[#252326]/60">Rooms</div>
                <div className="text-base font-bold text-[#6B2638]">{report.summary.roomClashes}</div>
              </div>
              <div className="p-2 bg-white/80 rounded border border-[#ECD9DE]">
                <div className="text-[10px] uppercase font-bold text-[#252326]/60">Unfilled</div>
                <div className="text-base font-bold text-[#B08D57]">{report.summary.unfilled}</div>
              </div>
            </div>
          </div>
        )}

        {/* Filter Tabs */}
        {report.summary.totalIssues > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs select-none">
            <span className="text-[11px] font-bold text-[#252326]/50 uppercase flex items-center gap-1 mr-1">
              <Filter className="w-3 h-3" />
              Filter:
            </span>
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-[#6B2638] text-white font-bold'
                  : 'bg-[#F3EEE6] text-[#252326]/70 hover:bg-[#E5E0D8]'
              }`}
            >
              All ({report.summary.totalIssues})
            </button>
            {report.summary.overlaps > 0 && (
              <button
                type="button"
                onClick={() => setFilter('overlap')}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  filter === 'overlap'
                    ? 'bg-[#6B2638] text-white font-bold'
                    : 'bg-[#F3EEE6] text-[#252326]/70 hover:bg-[#E5E0D8]'
                }`}
              >
                Overlaps ({report.summary.overlaps})
              </button>
            )}
            {report.summary.overLimit > 0 && (
              <button
                type="button"
                onClick={() => setFilter('over_limit')}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  filter === 'over_limit'
                    ? 'bg-[#6B2638] text-white font-bold'
                    : 'bg-[#F3EEE6] text-[#252326]/70 hover:bg-[#E5E0D8]'
                }`}
              >
                Over Limit ({report.summary.overLimit})
              </button>
            )}
            {report.summary.absent > 0 && (
              <button
                type="button"
                onClick={() => setFilter('absent')}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  filter === 'absent'
                    ? 'bg-[#6B2638] text-white font-bold'
                    : 'bg-[#F3EEE6] text-[#252326]/70 hover:bg-[#E5E0D8]'
                }`}
              >
                Absent ({report.summary.absent})
              </button>
            )}
            {report.summary.roomClashes > 0 && (
              <button
                type="button"
                onClick={() => setFilter('room_clash')}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  filter === 'room_clash'
                    ? 'bg-[#6B2638] text-white font-bold'
                    : 'bg-[#F3EEE6] text-[#252326]/70 hover:bg-[#E5E0D8]'
                }`}
              >
                Rooms ({report.summary.roomClashes})
              </button>
            )}
            {report.summary.unfilled > 0 && (
              <button
                type="button"
                onClick={() => setFilter('unfilled')}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  filter === 'unfilled'
                    ? 'bg-[#B08D57] text-white font-bold'
                    : 'bg-[#F3EEE6] text-[#252326]/70 hover:bg-[#E5E0D8]'
                }`}
              >
                Unfilled ({report.summary.unfilled})
              </button>
            )}
          </div>
        )}

        {/* Violations List */}
        <div className="space-y-2">
          {filteredViolations.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#252326]/60 bg-[#F3EEE6]/40 rounded border border-[#A89B8A]/20">
              No issues in this category.
            </div>
          ) : (
            filteredViolations.map(v => (
              <div
                key={v.id}
                className={`p-3 rounded-lg border transition-all ${
                  v.severity === 'error'
                    ? 'bg-[#FAF0F2]/70 border-[#ECD9DE] hover:border-[#6B2638]'
                    : 'bg-[#FDFBF7] border-[#B08D57]/30 hover:border-[#B08D57]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5">{getTypeIcon(v.type)}</span>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge tone={getTypeBadgeTone(v.type)}>
                          {v.type.replace('_', ' ').toUpperCase()}
                        </Badge>
                        <span className="text-xs font-bold text-[#252326]">{v.batchName}</span>
                        <span className="text-xs text-[#252326]/60">
                          Period {v.periodIndex + 1}
                          {v.periodTime ? ` (${v.periodTime})` : ''}
                        </span>
                        {v.roomNumber && (
                          <span className="text-[11px] text-[#252326]/70 bg-white/70 px-1.5 py-0.5 rounded border border-[#A89B8A]/30">
                            Room {v.roomNumber}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#252326]/90 leading-relaxed">{v.description}</p>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleJump(v)}
                    className="shrink-0 text-xs font-semibold text-[#6B2638] hover:bg-[#6B2638]/10"
                    icon={<ExternalLink className="w-3.5 h-3.5" />}
                  >
                    Jump to cell
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
};
