import { prisma } from "../config/db.js";

class AuditLogModel {
  async create(data: { userId: string; action: string; entity: string; entityId?: string; oldValue?: any; newValue?: any; ip?: string }) {
    return prisma.auditLog.create({ data });
  }

  async getByEntity(entity: string, entityId: string) {
    return prisma.auditLog.findMany({ where: { entity, entityId }, orderBy: { timestamp: "desc" } });
  }

  async getAll(filters?: { userId?: string; action?: string }) {
    return prisma.auditLog.findMany({ where: filters, orderBy: { timestamp: "desc" }, take: 100 });
  }
}

export default new AuditLogModel();
