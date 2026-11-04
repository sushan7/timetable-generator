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
        return <Clock className="w-4 h-4 text-burgundy" />;
      case 'over_limit':
        return <AlertOctagon className="w-4 h-4 text-burgundy" />;
      case 'absent':
        return <UserX className="w-4 h-4 text-burgundy" />;
      case 'room_clash':
        return <DoorClosed className="w-4 h-4 text-burgundy" />;
      case 'unfilled':
        return <AlertTriangle className="w-4 h-4 text-accent" />;
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
          <div className="text-xs text-ink-muted">
            {report.summary.totalIssues === 0 ? (
              <span className="text-ink font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-accent" />
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
          <div className="p-4 bg-surface-muted border border-accent/40 rounded-lg flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-accent shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-ink">Schedule Verified Clean</h4>
              <p className="text-xs text-ink-muted mt-0.5">
                Zero teacher overlaps, zero daily workload exceedances, no absent teacher assignments, no room clashes, and all {report.totalSlots} periods are filled.
              </p>
            </div>
          </div>
        ) : (
          <div className="p-3.5 bg-burgundy-soft border border-burgundy/20 rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-burgundy" />
              <h4 className="text-xs font-bold text-burgundy uppercase tracking-wide">
                Detected Schedule Conflicts ({report.summary.totalIssues})
              </h4>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
              <div className="p-2 bg-surface/80 rounded border border-burgundy/20">
                <div className="text-[10px] uppercase font-bold text-ink-muted">Overlaps</div>
                <div className="text-base font-bold text-burgundy">{report.summary.overlaps}</div>
              </div>
              <div className="p-2 bg-surface/80 rounded border border-burgundy/20">
                <div className="text-[10px] uppercase font-bold text-ink-muted">Over Limit</div>
                <div className="text-base font-bold text-burgundy">{report.summary.overLimit}</div>
              </div>
              <div className="p-2 bg-surface/80 rounded border border-burgundy/20">
                <div className="text-[10px] uppercase font-bold text-ink-muted">Absent</div>
                <div className="text-base font-bold text-burgundy">{report.summary.absent}</div>
              </div>
              <div className="p-2 bg-surface/80 rounded border border-burgundy/20">
                <div className="text-[10px] uppercase font-bold text-ink-muted">Rooms</div>
                <div className="text-base font-bold text-burgundy">{report.summary.roomClashes}</div>
              </div>
              <div className="p-2 bg-surface/80 rounded border border-burgundy/20">
                <div className="text-[10px] uppercase font-bold text-ink-muted">Unfilled</div>
                <div className="text-base font-bold text-accent">{report.summary.unfilled}</div>
              </div>
            </div>
          </div>
        )}

        {/* Filter Tabs */}
        {report.summary.totalIssues > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs select-none">
            <span className="text-[11px] font-bold text-ink-muted uppercase flex items-center gap-1 mr-1">
              <Filter className="w-3 h-3" />
              Filter:
            </span>
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-primary text-canvas font-bold'
                  : 'bg-surface-muted text-ink-muted hover:bg-border'
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
                    ? 'bg-primary text-canvas font-bold'
                    : 'bg-surface-muted text-ink-muted hover:bg-border'
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
                    ? 'bg-primary text-canvas font-bold'
                    : 'bg-surface-muted text-ink-muted hover:bg-border'
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
                    ? 'bg-primary text-canvas font-bold'
                    : 'bg-surface-muted text-ink-muted hover:bg-border'
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
                    ? 'bg-primary text-canvas font-bold'
                    : 'bg-surface-muted text-ink-muted hover:bg-border'
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
                    ? 'bg-accent text-ink font-bold'
                    : 'bg-surface-muted text-ink-muted hover:bg-border'
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
            <div className="p-6 text-center text-xs text-ink-muted bg-surface-muted/40 rounded border border-border">
              No issues in this category.
            </div>
          ) : (
            filteredViolations.map(v => (
              <div
                key={v.id}
                className={`p-3 rounded-lg border transition-all ${
                  v.severity === 'error'
                    ? 'bg-burgundy-soft/70 border-burgundy/20 hover:border-burgundy'
                    : 'bg-surface border-accent/30 hover:border-accent'
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
                        <span className="text-xs font-bold text-ink">{v.batchName}</span>
                        <span className="text-xs text-ink-muted">
                          Period {v.periodIndex + 1}
                          {v.periodTime ? ` (${v.periodTime})` : ''}
                        </span>
                        {v.roomNumber && (
                          <span className="text-[11px] text-ink-muted bg-surface/70 px-1.5 py-0.5 rounded border border-border">
                            Room {v.roomNumber}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-ink/90 leading-relaxed">{v.description}</p>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleJump(v)}
                    className="shrink-0 text-xs font-semibold text-accent hover:bg-accent-soft"
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
