import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Users,
  Play,
  Info,
} from 'lucide-react';
import type { DetailedCapacityAnalysis } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';

interface CapacityPreCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: DetailedCapacityAnalysis | null;
  onProceedGenerate: () => void;
  dayName: string;
}

export const CapacityPreCheckModal: React.FC<CapacityPreCheckModalProps> = ({
  isOpen,
  onClose,
  report,
  onProceedGenerate,
  dayName,
}) => {
  if (!report) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Curriculum Capacity Pre-Check — ${dayName}`}
      subtitle="Evaluates subject period demand against available faculty limits before schedule generation"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-[#252326]/70">
            {report.hasCapacityIssues ? (
              <span className="text-[#6B2638] font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-[#6B2638]" />
                {report.shortageCount} subject shortages · {report.overloadedCount} overloaded teachers
              </span>
            ) : (
              <span className="text-[#252326] font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[#B08D57]" />
                Faculty capacity is balanced across all subjects
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={<Play className="w-4 h-4" />}
              onClick={() => {
                onClose();
                onProceedGenerate();
              }}
            >
              Generate {dayName} Schedule
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {/* Metric summary banner */}
        {report.hasCapacityIssues ? (
          <div className="p-3 bg-[#FAF0F2] border border-[#ECD9DE] rounded-md text-xs text-[#6B2638] flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-[#6B2638] shrink-0 mt-0.5" />
            <div>
              <strong>Capacity Warning:</strong> Teaching demand in some subjects exceeds available faculty capacity, or specific instructors are carrying high weekly loads. Unfilled slots may occur during generation if constraints are strictly enforced.
            </div>
          </div>
        ) : (
          <div className="p-3 bg-[#F6F4F0] border border-[#B08D57]/40 rounded-md text-xs text-[#252326] flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-[#B08D57] shrink-0 mt-0.5" />
            <div>
              <strong>Sufficient Capacity:</strong> All subjects have enough qualified, non-absent faculty to fulfill curriculum demand for this academic cycle.
            </div>
          </div>
        )}

        {/* Per-subject demand vs supply table */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#252326]">
            Subject Demand vs Supply
          </h4>
          <div className="overflow-x-auto border border-[#A89B8A]/30 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F3EEE6] border-b border-[#A89B8A]/30 font-semibold text-[#252326]/80 uppercase tracking-wider">
                  <th className="p-2.5">Subject</th>
                  <th className="p-2.5">Category</th>
                  <th className="p-2.5 text-right">Weekly Demand</th>
                  <th className="p-2.5 text-right">Teachers</th>
                  <th className="p-2.5 text-right">Supply Capacity</th>
                  <th className="p-2.5 text-right">Deficit</th>
                  <th className="p-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#A89B8A]/20">
                {report.subjects.map((row, idx) => (
                  <tr key={idx} className="hover:bg-[#F3EEE6]/30 transition-colors">
                    <td className="p-2.5 font-bold text-[#252326]">{row.subject}</td>
                    <td className="p-2.5">
                      <Badge tone={row.category === 'Core' ? 'burgundy' : 'gold'}>
                        {row.category}
                      </Badge>
                    </td>
                    <td className="p-2.5 text-right font-medium text-[#252326]">
                      {row.requiredWeeklyPeriods}
                    </td>
                    <td className="p-2.5 text-right text-[#252326]/70">
                      {row.facultyCount}
                    </td>
                    <td className="p-2.5 text-right font-medium text-[#252326]">
                      {row.availableWeeklyPeriods}
                    </td>
                    <td className="p-2.5 text-right font-bold text-[#252326]">
                      {row.deficit > 0 ? `-${row.deficit}` : '0'}
                    </td>
                    <td className="p-2.5 text-center">
                      {row.status === 'deficit' ? (
                        <Badge tone="danger">Shortage</Badge>
                      ) : row.status === 'balanced' ? (
                        <Badge tone="gold">Balanced</Badge>
                      ) : (
                        <Badge tone="neutral">Surplus</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Overloaded & Near-Capacity Teachers Table */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#252326] flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[#6B2638]" />
              Overloaded & High-Volume Teachers
            </h4>
            <span className="text-[11px] text-[#252326]/60">
              {report.overloadedTeachers.length} flagged
            </span>
          </div>

          {report.overloadedTeachers.length === 0 ? (
            <div className="p-3 bg-[#F3EEE6]/50 rounded border border-[#A89B8A]/30 text-xs text-[#252326]/70 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#B08D57]" />
              <span>All instructors are within balanced weekly teaching limits.</span>
            </div>
          ) : (
            <div className="overflow-x-auto border border-[#A89B8A]/30 rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F3EEE6] border-b border-[#A89B8A]/30 font-semibold text-[#252326]/80 uppercase tracking-wider">
                    <th className="p-2.5">Teacher</th>
                    <th className="p-2.5">Subjects</th>
                    <th className="p-2.5 text-right">Daily Limit</th>
                    <th className="p-2.5 text-right">Weekly Max</th>
                    <th className="p-2.5 text-right">Assigned So Far</th>
                    <th className="p-2.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#A89B8A]/20">
                  {report.overloadedTeachers.map((t, idx) => (
                    <tr key={idx} className="hover:bg-[#F3EEE6]/30 transition-colors">
                      <td className="p-2.5 font-bold text-[#252326]">{t.facultyName}</td>
                      <td className="p-2.5 text-[#252326]/80">{t.subjects.join(', ')}</td>
                      <td className="p-2.5 text-right font-medium text-[#252326]">{t.dailyLimit} / day</td>
                      <td className="p-2.5 text-right font-medium text-[#252326]">{t.weeklyLimit}</td>
                      <td className="p-2.5 text-right font-bold text-[#6B2638]">{t.assignedPeriods}</td>
                      <td className="p-2.5 text-center">
                        {t.status === 'overloaded' ? (
                          <Badge tone="danger">Overloaded</Badge>
                        ) : (
                          <Badge tone="gold">Near Limit</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="p-3 bg-[#F6F4F0] border border-[#B08D57]/40 rounded-md text-xs text-[#252326] flex items-start gap-2">
          <Info className="w-4 h-4 text-[#B08D57] shrink-0 mt-0.5" />
          <p>
            The scheduling engine automatically applies <strong>weekly-load fairness</strong> to rotate subjects among available alternate instructors, keeping individual teaching volume balanced.
          </p>
        </div>
      </div>
    </Modal>
  );
};
