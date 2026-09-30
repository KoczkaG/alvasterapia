import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  checkClosingRules,
  invoiceTotal,
  type CreateDraft,
  type InvoiceItem,
  type PaymentMethod,
} from '@somnoshop/shared';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { TIMELINE_PORT, type TimelinePort } from '../timeline/timeline.port';
import { INVOICE_PORT, type InvoicePort } from './invoice.port';

export interface DraftRecord {
  id: string;
  partnerCode: string;
  items: InvoiceItem[];
  payment: PaymentMethod;
  amountGross: number;
  status: string;
  invoiceNumber: string | null;
  pdfUri: string | null;
}

export interface FinalizeResult {
  status: 'issued' | 'declined';
  draft: DraftRecord;
  /** Elutasítás oka, ha a terminál nem hagyta jóvá. */
  declineReason?: string;
}

/**
 * Pulti Védőháló és Terminál-Kassza logika (II/D).
 *
 * A biztonságos folyamat:
 *  1. createDraft — a kétirányú zárási szűrő ELLENŐRZI a tételeket/fizetési
 *     módot; siker esetén TERVEZET jön létre (nincs NAV-sorszám).
 *  2. finalize — bankkártyánál a terminál dönt; elutasításnál a tervezet nyitva
 *     marad (nincs NAV-számla, nincs stornó). Éles számla csak sikeres fizetés
 *     után generálódik. Nem-kártyás módnál közvetlenül kiállítjuk.
 */
@Injectable()
export class InvoicingService {
  private readonly logger = new Logger(InvoicingService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    @Inject(INVOICE_PORT) private readonly invoices: InvoicePort,
    @Inject(TIMELINE_PORT) private readonly timeline: TimelinePort,
  ) {}

  /** Tervezet létrehozása a zárási szűrő ellenőrzésével. */
  async createDraft(input: CreateDraft, operator: string): Promise<DraftRecord> {
    // Kétirányú logikai zárási szűrő (postaköltség ⇄ fizetési mód).
    const closing = checkClosingRules(
      input.items.map((i) => ({
        code: i.code,
        name: i.name,
        isPostage: i.isPostage,
      })),
      input.payment,
    );
    if (!closing.ok) {
      throw new BadRequestException({
        error: { code: closing.code, message: closing.message },
      });
    }

    const amount = invoiceTotal(input.items);
    const res = await this.db.query<{ id: string }>(
      `INSERT INTO invoice_drafts
         (partner_code, items, payment, amount_gross, status, operator)
       VALUES ($1, $2, $3, $4, 'draft', $5)
       RETURNING id`,
      [
        input.partnerCode,
        JSON.stringify(input.items),
        input.payment,
        amount,
        operator,
      ],
    );
    const id = res.rows[0].id;

    await this.audit.record({
      actor: operator,
      action: 'CREATE',
      entityType: 'invoice_draft',
      entityId: id,
      detail: { partnerCode: input.partnerCode, amount, payment: input.payment },
    });

    return this.getOrThrow(id);
  }

  /**
   * Tervezet véglegesítése. Bankkártyánál a terminál eredményétől függ; sikeres
   * fizetés (vagy nem-kártyás mód) után éles NAV-számla generálódik.
   */
  async finalize(draftId: string, operator: string): Promise<FinalizeResult> {
    const draft = await this.getOrThrow(draftId);
    if (draft.status === 'issued') {
      throw new BadRequestException({
        error: { code: 'ALREADY_ISSUED', message: 'A számla már ki van állítva.' },
      });
    }

    // Bankkártyás fizetésnél a terminál dönt (limit/fedezet védőháló).
    if (draft.payment === 'card') {
      const terminal = await this.invoices.chargeCard({
        amountGross: draft.amountGross,
        reference: draftId,
      });
      if (!terminal.approved) {
        // A tervezet NYITVA marad — nincs NAV-számla, nincs stornó.
        await this.db.query(
          `UPDATE invoice_drafts SET status = 'awaiting_payment' WHERE id = $1`,
          [draftId],
        );
        await this.audit.record({
          actor: operator,
          action: 'UPDATE',
          entityType: 'invoice_draft',
          entityId: draftId,
          detail: { terminal: 'declined', reason: terminal.declineReason },
        });
        this.logger.log(
          `Kártyás fizetés elutasítva (${draftId}) — a számla nem élesedett.`,
        );
        return {
          status: 'declined',
          draft: await this.getOrThrow(draftId),
          declineReason: terminal.declineReason,
        };
      }
    }

    // Éles NAV-számla kiállítása (sikeres fizetés után).
    const issued = await this.invoices.issueInvoice({
      partnerCode: draft.partnerCode,
      amountGross: draft.amountGross,
      reference: draftId,
    });

    await this.db.query(
      `UPDATE invoice_drafts
          SET status = 'issued', invoice_number = $1, pdf_uri = $2, issued_at = now()
        WHERE id = $3`,
      [issued.invoiceNumber, issued.pdfUri, draftId],
    );

    await this.audit.record({
      actor: operator,
      action: 'CREATE',
      entityType: 'invoice',
      entityId: issued.invoiceNumber,
      detail: { draftId, amount: draft.amountGross },
    });

    // A kiállított számla a beteg Idővonalára (I/D).
    await this.timeline.append({
      partnerCode: draft.partnerCode,
      type: 'INVOICE_ISSUED',
      text: `Számla kiállítva — ${issued.invoiceNumber} (${draft.amountGross} Ft)`,
      occurredAt: new Date().toISOString(),
      detail: {
        invoiceNumber: issued.invoiceNumber,
        amount: draft.amountGross,
        payment: draft.payment,
      },
    });

    return { status: 'issued', draft: await this.getOrThrow(draftId) };
  }

  async get(draftId: string): Promise<DraftRecord | null> {
    const res = await this.db.query<{
      id: string;
      partner_code: string;
      items: InvoiceItem[];
      payment: PaymentMethod;
      amount_gross: string | number;
      status: string;
      invoice_number: string | null;
      pdf_uri: string | null;
    }>(
      `SELECT id, partner_code, items, payment, amount_gross, status,
              invoice_number, pdf_uri
         FROM invoice_drafts WHERE id = $1`,
      [draftId],
    );
    const r = res.rows[0];
    if (!r) return null;
    return {
      id: r.id,
      partnerCode: r.partner_code,
      items: Array.isArray(r.items) ? r.items : [],
      payment: r.payment,
      amountGross: Number(r.amount_gross),
      status: r.status,
      invoiceNumber: r.invoice_number,
      pdfUri: r.pdf_uri,
    };
  }

  private async getOrThrow(draftId: string): Promise<DraftRecord> {
    const draft = await this.get(draftId);
    if (!draft) {
      throw new NotFoundException({
        error: { code: 'DRAFT_NOT_FOUND', message: 'Ismeretlen számlatervezet.' },
      });
    }
    return draft;
  }
}
