import { useState, useMemo, useCallback } from 'react';
import {
  Lock,
  AlertTriangle,
  Save,
  Trash2,
  RefreshCw,
  User,
} from 'lucide-react';
import type {
  Faculty,
  Batch,
  Allocation,
  DayOfWeek,
  TimetableStatus,
  SubstituteCandidate,
} from '../../types';
import { canAssign } from '../../utils/validation';
import { regenerateSingleSlot, getRankedSubstitutes } from '../../utils/scheduler';
import { storage } from '../../utils/storage';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useToast } from '../../context/ToastContext';

export interface SlotEditState {
  batch: Batch;
  periodIndex: number;
  currentAllocation?: Allocation;
  subject: string;
  facultyId: string;
  isFrozen: boolean;
  allowConflictOverride: boolean;
}

export interface SlotEditSavePayload {
  batch: Batch;
  periodIndex: number;
  subject: string;
  facultyId: string;
  isFrozen: boolean;
  allowConflictOverride: boolean;
  conflictEvaluation: ReturnType<typeof canAssign> | null;
  isHardConflict: boolean;
}

interface SlotEditModalProps {
  editingSlot: SlotEditState;
  faculties: Faculty[];
  batches: Batch[];
  allocations: Allocation[];
  currentDay: DayOfWeek;
  currentStatus: TimetableStatus;
  onClose: () => void;
  onSave: (payload: SlotEditSavePayload) => void;
  onRegenerateSlotSuccess?: (newAllocation: Allocation) => void;
}

export default function SlotEditModal({
  editingSlot,
  faculties,
  batches,
  allocations,
  currentDay,
  currentStatus,
  onClose,
  onSave,
  onRegenerateSlotSuccess,
}: SlotEditModalProps) {
  const { toast } = useToast();
  const [slotState, setSlotState] = useState<SlotEditState>(editingSlot);
  // Auto-load substitute recommendations for gap or unfilled cells on mount (N8)
  const [substituteCandidates, setSubstituteCandidates] = useState<SubstituteCandidate[]>(() => {
    if (!editingSlot.facultyId || editingSlot.currentAllocation?.vacatedFacultyId) {
      const settings = storage.getSettings();
      return getRankedSubstitutes(
        editingSlot.batch.id,
        editingSlot.periodIndex,
        editingSlot.subject,
        allocations,
        batches,
        faculties,
        settings,
        currentDay,
        currentDay
      );
    }
    return [];
  });

  // Conflict evaluation against current timetable allocations (C2, M5)
  const conflictEvaluation = useMemo(() => {
    if (!slotState.facultyId) return null;
    const selectedFac = faculties.find(f => f.id === slotState.facultyId);
    if (!selectedFac) return null;

    const settings = storage.getSettings();
    return canAssign(
      selectedFac,
      slotState.batch,
      slotState.periodIndex,
      allocations,
      batches,
      settings,
      { dayOfWeek: currentDay, dateKey: currentDay }
    );
  }, [slotState.facultyId, slotState.batch, slotState.periodIndex, faculties, allocations, batches, currentDay]);

  const isHardConflict = Boolean(
    conflictEvaluation &&
      !conflictEvaluation.ok &&
      ['TIME_OVERLAP', 'ABSENT', 'MAX_LOAD', 'BATCH_RESTRICTION'].includes(
        conflictEvaluation.type || ''
      )
  );

  // Load ranked substitutes (Phase 5I / N8)
  const handleLoadSubstitutes = useCallback(() => {
    const settings = storage.getSettings();
    const ranked = getRankedSubstitutes(
      slotState.batch.id,
      slotState.periodIndex,
      slotState.subject,
      allocations,
      batches,
      faculties,
      settings,
      currentDay,
      currentDay
    );
    setSubstituteCandidates(ranked);
  }, [slotState.batch.id, slotState.periodIndex, slotState.subject, allocations, batches, faculties, currentDay]);

  // Regenerate single slot (Phase 5H / N10)
  const handleRegenerateSlot = () => {
    if (currentStatus === 'Finalized') return;
    const settings = storage.getSettings();
    const result = regenerateSingleSlot(
      slotState.batch.id,
      slotState.periodIndex,
      allocations,
      batches,
      faculties,
      settings,
      slotState.subject,
      currentDay,
      currentDay
    );

    if (result.success && result.newAllocation) {
      onRegenerateSlotSuccess?.(result.newAllocation);
      onClose();
    } else {
      toast.error(
        result.reason ||
          'Could not find an available eligible teacher for this slot without causing conflicts.'
      );
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentStatus === 'Finalized') return;

    if (isHardConflict && !slotState.allowConflictOverride) {
      toast.error(
        'A scheduling conflict was detected (TIME_OVERLAP, ABSENT, MAX_LOAD, or BATCH_RESTRICTION). Please check "Override anyway" to confirm this assignment.'
      );
      return;
    }

    onSave({
      ...slotState,
      conflictEvaluation,
      isHardConflict,
    });
  };

  const periodTiming = slotState.batch.periods[slotState.periodIndex];

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={`Edit Period ${slotState.periodIndex + 1} · ${slotState.batch.name}`}
      subtitle={`${slotState.batch.building} · Room ${slotState.batch.roomNumber || '-'}`}
      footer={
        <div className="flex items-center justify-between w-full">
          <div>
            {slotState.currentAllocation?.facultyId && (
              <Button
                type="button"
                variant="danger"
                icon={<Trash2 className="w-4 h-4" />}
                onClick={() => setSlotState(prev => ({ ...prev, facultyId: '' }))}
              >
                Clear Slot
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              icon={<Save className="w-4 h-4" />}
              form="slot-override-form"
              disabled={isHardConflict && !slotState.allowConflictOverride}
            >
              Save Assignment
            </Button>
          </div>
        </div>
      }
    >
      <form id="slot-override-form" onSubmit={handleSubmit} className="space-y-4">
        {/* Slot info badge */}
        <div className="bg-surface-muted p-3 rounded-md border border-border space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-ink-muted font-medium">Campus & Room:</span>
            <span className="font-semibold text-ink">
              Room {slotState.batch.roomNumber || '-'} · {slotState.batch.building}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-muted font-medium">Slot Timing:</span>
            <span className="font-semibold text-ink">
              {periodTiming?.startTime ? `${periodTiming.startTime} - ${periodTiming.endTime}` : 'No timing set'}
            </span>
          </div>
        </div>

        {/* Quick Actions inside Dialog */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            icon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={handleRegenerateSlot}
            disabled={currentStatus === 'Finalized'}
          >
            Regenerate Slot Only
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            icon={<User className="w-3.5 h-3.5" />}
            onClick={handleLoadSubstitutes}
          >
            Suggest Substitutes
          </Button>
        </div>

        {/* Substitute candidates list */}
        {substituteCandidates.length > 0 && (
          <div className="p-3 bg-surface rounded border border-border space-y-2">
            <span className="text-[11px] font-bold text-accent uppercase block">
              Top Recommended Substitute Candidates
            </span>
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {substituteCandidates.map(c => (
                <div
                  key={c.faculty.id}
                  className="flex items-center justify-between p-2 rounded bg-surface-muted border border-border text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-ink">{c.faculty.name}</span>
                      {c.currentDayLoad === 0 && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-accent-soft text-ink border border-accent/40">
                          Free
                        </span>
                      )}
                      {c.currentDayLoad > 0 && c.currentDayLoad <= 2 && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-surface-muted text-ink border border-border">
                          Light load
                        </span>
                      )}
                      {c.faculty.assignedBatches && c.faculty.assignedBatches.includes(slotState.batch.id) && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-accent-soft text-ink border border-accent/40">
                          Batch owner
                        </span>
                      )}
                      {!c.eligible && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-burgundy-soft text-burgundy border border-burgundy/20">
                          Conflict
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-ink-muted">
                      {c.faculty.subjects.join(', ')} · Daily load: {c.currentDayLoad}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setSlotState(prev => ({
                        ...prev,
                        facultyId: c.faculty.id,
                        allowConflictOverride: false,
                      }))
                    }
                  >
                    Select
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Subject Dropdown */}
        <div className="space-y-1">
          <label htmlFor="slot-edit-subject" className="text-xs font-semibold text-ink">
            Subject
          </label>
          <select
            id="slot-edit-subject"
            value={slotState.subject}
            onChange={e => setSlotState(prev => ({ ...prev, subject: e.target.value }))}
            className="w-full px-3 py-2 border border-border rounded-md text-sm bg-surface focus:border-accent outline-none text-ink"
          >
            {slotState.batch.subjects.map(s => (
              <option key={s.subject} value={s.subject}>
                {s.subject}
              </option>
            ))}
            {!slotState.batch.subjects.some(s => s.subject === slotState.subject) && (
              <option value={slotState.subject}>{slotState.subject}</option>
            )}
          </select>
        </div>

        {/* Faculty Dropdown */}
        <div className="space-y-1">
          <label htmlFor="slot-edit-faculty" className="text-xs font-semibold text-ink">
            Assigned Instructor
          </label>
          <select
            id="slot-edit-faculty"
            value={slotState.facultyId}
            onChange={e =>
              setSlotState(prev => ({
                ...prev,
                facultyId: e.target.value,
                allowConflictOverride: false,
              }))
            }
            className="w-full px-3 py-2 border border-border rounded-md text-sm bg-surface focus:border-accent outline-none text-ink"
          >
            <option value="">-- Vacant (Free Period) --</option>
            {faculties
              .filter(f => f.subjects.includes(slotState.subject))
              .map(f => (
                <option key={f.id} value={f.id}>
                  {f.name} {f.isAbsent ? '(ABSENT)' : ''}
                </option>
              ))}
          </select>
        </div>

        {/* Conflict Warning & Confirmation Checkbox (C2) */}
        {conflictEvaluation && !conflictEvaluation.ok && (
          <div className="p-3 bg-burgundy-soft text-burgundy border border-burgundy/20 rounded-md text-xs space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Scheduling Conflict Detected:</strong>
                <p className="mt-0.5 leading-relaxed">{conflictEvaluation.reason}</p>
              </div>
            </div>
            {isHardConflict && (
              <label
                htmlFor="slot-conflict-override"
                className="flex items-center gap-2 pt-2 border-t border-burgundy/20 cursor-pointer font-bold select-none text-burgundy"
              >
                <input
                  id="slot-conflict-override"
                  type="checkbox"
                  checked={slotState.allowConflictOverride}
                  onChange={e =>
                    setSlotState(prev => ({ ...prev, allowConflictOverride: e.target.checked }))
                  }
                  className="w-4 h-4 text-burgundy focus:ring-burgundy rounded"
                />
                <span>Override anyway</span>
              </label>
            )}
          </div>
        )}

        {/* Freeze slot toggle */}
        <div className="pt-2 border-t border-border">
          <label
            htmlFor="slot-is-frozen"
            className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-ink select-none"
          >
            <input
              id="slot-is-frozen"
              type="checkbox"
              checked={slotState.isFrozen}
              onChange={e => setSlotState(prev => ({ ...prev, isFrozen: e.target.checked }))}
              className="w-4 h-4 text-accent focus:ring-accent rounded"
            />
            <span className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-accent" />
              Freeze this slot (protect from future automatic regeneration)
            </span>
          </label>
        </div>
      </form>
    </Modal>
  );
}
