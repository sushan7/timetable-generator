import { useState } from 'react';
import { History, Trash2, Filter, Clock } from 'lucide-react';
import type { AuditLog, AuditLogAction } from '../types';
import { storage } from '../utils/storage';
import Badge, { type BadgeTone } from './ui/Badge';
import Button from './ui/Button';
import SearchInput from './ui/SearchInput';
import ConfirmDialog from './ui/ConfirmDialog';
import { useToast } from '../context/ToastContext';

export default function AuditLogView() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<AuditLog[]>(() => storage.getAuditLogs());
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleConfirmClear = () => {
    storage.clearAuditLogs();
    setLogs([]);
    setShowClearConfirm(false);
    toast.success('Audit history cleared successfully.');
  };

  const filteredLogs = logs.filter(log => {
    if (actionFilter !== 'ALL' && log.action !== actionFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const reasonMatch = log.reason?.toLowerCase().includes(q);
      const batchMatch = log.batchId?.toLowerCase().includes(q);
      const facultyMatch = log.newFacultyId?.toLowerCase().includes(q);
      return reasonMatch || batchMatch || facultyMatch;
    }
    return true;
  });

  const getActionBadgeTone = (action: AuditLogAction): BadgeTone => {
    switch (action) {
      case 'MANUAL_OVERRIDE':
        return 'cognac';
      case 'FREEZE_TOGGLE':
        return 'gold';
      case 'STATUS_CHANGE':
        return 'burgundy';
      case 'TIMETABLE_GENERATE':
        return 'neutral';
      case 'ABSENCE_SYNC':
        return 'danger';
      case 'FACULTY_DELETE':
      case 'BATCH_DELETE':
        return 'danger';
      case 'BACKUP_RESTORE':
        return 'info';
      default:
        return 'neutral';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 bg-surface border border-border px-3 py-1.5 rounded-md text-xs font-medium text-ink shadow-2xs">
            <Filter className="w-3.5 h-3.5 text-ink-muted" />
            <select
              value={actionFilter}
              onChange={e => setActionFilter(e.target.value)}
              className="bg-transparent border-none outline-none font-semibold text-ink"
            >
              <option value="ALL">All Actions ({logs.length})</option>
              <option value="MANUAL_OVERRIDE">Manual Overrides</option>
              <option value="FREEZE_TOGGLE">Freeze Locks</option>
              <option value="STATUS_CHANGE">Status Changes</option>
              <option value="TIMETABLE_GENERATE">Generation Runs</option>
              <option value="ABSENCE_SYNC">Absence Syncs</option>
              <option value="SLOT_REGENERATE">Slot Regenerations</option>
              <option value="FACULTY_DELETE">Faculty Deletions</option>
              <option value="BATCH_DELETE">Batch Deletions</option>
              <option value="BACKUP_RESTORE">Backups & Restores</option>
            </select>
          </div>

          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search audit trail..."
            className="w-48 sm:w-56"
          />
        </div>

        {logs.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 className="w-3.5 h-3.5" />}
            onClick={() => setShowClearConfirm(true)}
            className="text-ink-muted hover:text-burgundy hover:bg-burgundy-soft"
          >
            Clear History
          </Button>
        )}
      </div>

      <div className="bg-surface rounded-lg border border-border shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-muted border-b border-border text-xs text-ink-muted font-semibold">
                <th className="p-3.5 w-48">Timestamp</th>
                <th className="p-3.5 w-44">Action Type</th>
                <th className="p-3.5">Event Details & Justification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-10 text-center">
                    <History className="w-8 h-8 text-ink-muted mx-auto mb-2" />
                    <p className="font-semibold text-ink text-sm">No audit trail records</p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      {logs.length === 0
                        ? 'Timetable generation, manual edits, and freeze actions will automatically appear here.'
                        : 'No records match your selected filter criteria.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-surface-muted/40 transition-colors">
                    <td className="p-3.5 text-ink-muted whitespace-nowrap text-xs">
                      <div className="flex items-center gap-1.5 font-medium">
                        <Clock className="w-3 h-3 text-ink-muted" />
                        {new Date(log.timestamp).toLocaleDateString()} ·{' '}
                        {new Date(log.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </div>
                    </td>
                    <td className="p-3.5">
                      <Badge tone={getActionBadgeTone(log.action)}>
                        {log.action.replace(/_/g, ' ')}
                      </Badge>
                    </td>
                    <td className="p-3.5 text-ink font-normal">
                      <div className="text-xs text-ink font-medium">
                        {log.reason || 'No description logged.'}
                      </div>
                      {log.batchId && (
                        <div className="text-[11px] text-ink-muted mt-0.5">
                          Batch: {log.batchId} · Period: {(log.periodIndex ?? 0) + 1}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Clear Confirmation Modal */}
      <ConfirmDialog
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleConfirmClear}
        title="Clear Audit History"
        variant="danger"
        confirmText="Clear All Logs"
        message="Are you sure you want to permanently clear all audit history records? This administrative action cannot be undone."
      />
    </div>
  );
}
