import { useState } from 'react';
import { History, Trash2, Filter, Search, Clock } from 'lucide-react';
import type { AuditLog } from '../types';
import { storage } from '../utils/storage';
import Badge from './ui/Badge';
import Button from './ui/Button';

export default function AuditLogView() {
  const [logs, setLogs] = useState<AuditLog[]>(() => storage.getAuditLogs());
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  const handleClear = () => {
    if (confirm('Are you sure you want to clear all audit trail logs? This cannot be undone.')) {
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
        return 'warning';
      case 'FREEZE_TOGGLE':
        return 'info';
      case 'STATUS_CHANGE':
        return 'success';
      case 'TIMETABLE_GENERATE':
        return 'info';
      case 'ABSENCE_SYNC':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={actionFilter}
              onChange={e => setActionFilter(e.target.value)}
              className="bg-transparent border-none outline-none font-medium text-slate-700"
            >
              <option value="ALL">All Actions ({logs.length})</option>
              <option value="MANUAL_OVERRIDE">Manual Overrides</option>
              <option value="FREEZE_TOGGLE">Freeze Toggles</option>
              <option value="STATUS_CHANGE">Status Changes</option>
              <option value="TIMETABLE_GENERATE">Generation Runs</option>
              <option value="ABSENCE_SYNC">Absence Syncs</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search audit trail..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="outline-none text-xs bg-transparent w-40 placeholder:text-slate-400"
            />
          </div>
        </div>

        {logs.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 className="w-3.5 h-3.5" />}
            onClick={handleClear}
            className="text-slate-500 hover:text-rose-600 hover:bg-rose-50"
          >
            Clear History
          </Button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-semibold tracking-wider">
                <th className="p-4 w-48">Timestamp</th>
                <th className="p-4 w-44">Action Type</th>
                <th className="p-4">Event Details &amp; Justification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-10 text-center">
                    <History className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-600 text-sm">No audit trail records found</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {logs.length === 0
                        ? 'Actions like timetable generation, manual overrides, and freeze toggles will automatically appear here.'
                        : 'No events match the selected filter criteria.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-4 text-slate-500 whitespace-nowrap text-xs">
                      <div className="flex items-center gap-1.5 font-medium">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {new Date(log.timestamp).toLocaleDateString()} &middot; {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                    </td>
                    <td className="p-4">
                      <Badge tone={getActionBadgeTone(log.action)}>
                        {log.action.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="p-4 text-slate-700 font-normal">
                      <div className="text-xs text-slate-800 font-medium">
                        {log.reason || 'No description logged.'}
                      </div>
                      {log.batchId && (
                        <div className="text-[11px] text-slate-400 mt-0.5">
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