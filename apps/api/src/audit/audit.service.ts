import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export type AuditAction = 'CREATE' | 'READ' | 'UPDATE' | 'EXPORT' | 'DELETE';

export interface AuditEntry {
  actor: string;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  detail?: Record<string, unknown>;
}

/**
 * Módosíthatatlan (append-only) audit-napló. Minden személyesadat-műveletet
 * ide kell rögzíteni — lásd docs/adatvedelem.md 2. pont.
 */
@Injectable()
export class AuditService {
  constructor(private readonly db: DatabaseService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_log (actor, action, entity_type, entity_id, detail)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        entry.actor,
        entry.action,
        entry.entityType,
        entry.entityId ?? null,
        entry.detail ? JSON.stringify(entry.detail) : null,
      ],
    );
  }
}
