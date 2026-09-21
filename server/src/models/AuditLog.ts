import { prisma } from "../config/db";

class AuditLogModel {
  // Best-effort: the audit trail is a side record, so a failure to write it (say the
  // table is missing on a database that has not been migrated yet) is logged rather
  // than turning an action that already succeeded into a 400.
  async create(data: { userId: string; action: string; entity: string; entityId?: string; oldValue?: any; newValue?: any; ip?: string }) {
    try {
      return await prisma.auditLog.create({ data });
    } catch (err: any) {
      console.error("[AUDIT]", err.message);
      return null;
    }
  }
}

export default new AuditLogModel();
