import { useState } from 'react';
import { History, Trash2, Filter, Clock } from 'lucide-react';
import type { AuditLog } from '../types';
import { storage } from '../utils/storage';
import Badge from './ui/Badge';
import Button from './ui/Button';
import SearchInput from './ui/SearchInput';

export default function AuditLogView() {
  const [logs, setLogs] = useState<AuditLog[]>(() => storage.getAuditLogs());
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  const handleClear = () => {
    if (confirm('Are you sure you want to clear all audit trail records? This cannot be undone.')) {
      storage.clearAuditLogs();
      setLogs([]);
    }
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

  const getActionBadgeTone = (action: AuditLog['action']) => {
    switch (action) {
      case 'MANUAL_OVERRIDE':
        return 'terracotta';
      case 'FREEZE_TOGGLE':
        return 'terracotta';
      case 'STATUS_CHANGE':
        return 'ochre';
      case 'TIMETABLE_GENERATE':
        return 'neutral';
      case 'ABSENCE_SYNC':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 bg-white border border-[#E5E2DA] px-3 py-1.5 rounded-md text-xs font-medium text-[#252522] shadow-2xs">
            <Filter className="w-3.5 h-3.5 text-[#77766F]" />
            <select
              value={actionFilter}
              onChange={e => setActionFilter(e.target.value)}
              className="bg-transparent border-none outline-none font-semibold text-[#252522]"
            >
              <option value="ALL">All Actions ({logs.length})</option>
              <option value="MANUAL_OVERRIDE">Manual Overrides</option>
              <option value="FREEZE_TOGGLE">Freeze Locks</option>
              <option value="STATUS_CHANGE">Status Changes</option>
              <option value="TIMETABLE_GENERATE">Generation Runs</option>
              <option value="ABSENCE_SYNC">Absence Syncs</option>
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
            onClick={handleClear}
            className="text-[#77766F] hover:text-[#9E4334] hover:bg-[#FDF2F0]"
          >
            Clear History
          </Button>
        )}
      </div>

      <div className="bg-white rounded-lg border border-[#E5E2DA] shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F0EFE9] border-b border-[#E5E2DA] text-xs text-[#77766F] font-semibold">
                <th className="p-3.5 w-48">Timestamp</th>
                <th className="p-3.5 w-44">Action Type</th>
                <th className="p-3.5">Event Details &amp; Justification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E2DA] text-sm">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-10 text-center">
                    <History className="w-8 h-8 text-[#77766F] mx-auto mb-2" />
                    <p className="font-semibold text-[#252522] text-sm">No audit trail records</p>
                    <p className="text-xs text-[#77766F] mt-0.5">
                      {logs.length === 0
                        ? 'Timetable generation, manual edits, and freeze actions will automatically appear here.'
                        : 'No records match your selected filter criteria.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-[#F0EFE9]/40 transition-colors">
                    <td className="p-3.5 text-[#77766F] whitespace-nowrap text-xs">
                      <div className="flex items-center gap-1.5 font-medium">
                        <Clock className="w-3 h-3 text-[#77766F]" />
                        {new Date(log.timestamp).toLocaleDateString()} &middot;{' '}
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
                    <td className="p-3.5 text-[#252522] font-normal">
                      <div className="text-xs text-[#252522] font-medium">
                        {log.reason || 'No description logged.'}
                      </div>
                      {log.batchId && (
                        <div className="text-[11px] text-[#77766F] mt-0.5">
                          Batch: {log.batchId} &middot; Period: {(log.periodIndex ?? 0) + 1}
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
    </div>
  );
}
