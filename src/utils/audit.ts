import type { AuditLog } from '../types';

export const getAuditLogs = (): AuditLog[] => {
  try {
    const stored = localStorage.getItem('sdtg_audit_logs');
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    return [];
  }
};

export const logAuditAction = (
  action: AuditLog['action'], 
  details: Omit<AuditLog, 'id' | 'timestamp'>
) => {
  const logs = getAuditLogs();
  const newLog: AuditLog = {
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    timestamp: Date.now(),
    action,
    ...details,
  };
  logs.unshift(newLog); // Keep newest logs at the top
  localStorage.setItem('sdtg_audit_logs', JSON.stringify(logs));
};