import { useState, useEffect } from 'react';
import { History, ShieldAlert } from 'lucide-react';
import type { AuditLog } from '../types';
import { getAuditLogs } from '../utils/audit';

export default function AuditLogView() {
  const [logs, setLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    setLogs(getAuditLogs());
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3 border-b pb-4">
        <History className="w-8 h-8 text-blue-600" />
        <h1 className="text-3xl font-bold text-gray-900">System Audit Trail</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b text-xs uppercase text-gray-500 font-semibold">
                <th className="p-4">Timestamp</th>
                <th className="p-4">Action Type</th>
                <th className="p-4">Details / Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-gray-400">
                    No manual overrides or audit events recorded yet.
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="p-4 text-gray-500 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="p-4">
                      <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold">
                        {log.action}
                      </span>
                    </td>
                    <td className="p-4 text-gray-700">
                      {log.reason ? <span className="font-medium">Reason: {log.reason}</span> : 'No reason provided.'}
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