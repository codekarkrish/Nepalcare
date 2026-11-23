import AuditLog from '../models/AuditLog.js';
export async function writeAudit({ actor, action, resourceType, resourceId, metadata = {} }) {
  try { await AuditLog.create({ actor, action, resourceType, resourceId: String(resourceId || ''), metadata }); }
  catch (error) { console.error('Audit log write failed:', error.message); }
}
