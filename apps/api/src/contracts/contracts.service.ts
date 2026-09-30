import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DEFAULT_WARRANTY_RULES,
  canTransition,
  contractTotals,
  isGdprComplete,
  warrantyExpiry,
  type ContractItem,
  type ContractPatient,
  type ContractStatus,
  type GdprConsent,
  type SignatureMethod,
} from '@somnoshop/shared';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { INVOICE_PORT, type InvoicePort } from '../invoicing/invoice.port';
import { KVL_PORT, type KvlPort } from '../kvl/kvl.port';
import { TIMELINE_PORT, type TimelinePort } from '../timeline/timeline.port';
import { ESIGN_PORT, type ESignPort } from './esign.port';
import { OCR_PORT, type OcrPort } from './ocr.port';
import { PDF_PORT, type PdfPort } from './pdf.port';

export interface WarrantyDoc {
  serialNumber: string;
  productType: string;
  warrantyExpiry: string;
  uri: string;
}

export interface ContractRecord {
  id: string;
  partnerCode: string;
  status: ContractStatus;
  patient: ContractPatient;
  purchaseDate: string;
  gdprConsent: GdprConsent | null;
  items: ContractItem[];
  totalDeposit: number;
  totalPrice: number;
  grandTotal: number;
  signatureMethod: SignatureMethod | null;
  contractPdfUri: string | null;
  warrantyDocs: WarrantyDoc[];
}

/**
 * Próbakezelési Szerződés-modul logika (III. Modul / A).
 *
 * A pulti szerződéskötés egypontos, papírmentes folyamata: OCR-beemelés →
 * GDPR-kapu → kosár → fizetés → SMS-kódos (vagy papír) aláírás → PDF + jótállás,
 * a beteg Idővonalára (Timeline) rögzítve. A beteg KVL-profilját NEM módosítja.
 */
@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    @Inject(OCR_PORT) private readonly ocr: OcrPort,
    @Inject(ESIGN_PORT) private readonly esign: ESignPort,
    @Inject(PDF_PORT) private readonly pdf: PdfPort,
    @Inject(INVOICE_PORT) private readonly invoices: InvoicePort,
    @Inject(TIMELINE_PORT) private readonly timeline: TimelinePort,
    @Inject(KVL_PORT) private readonly kvl: KvlPort,
  ) {}

  /** OCR: ambuláns lap → strukturált beteg-adat (a pulton szerkeszthető előnézet). */
  async scanAmbulatorySheet(documentRef: string): Promise<ContractPatient> {
    const data = await this.ocr.extractPatient(documentRef);
    if (!data) {
      throw new BadRequestException({
        error: {
          code: 'OCR_NO_DATA',
          message: 'Az ambuláns lap nem olvasható vagy ismeretlen.',
        },
      });
    }
    return data;
  }

  /**
   * Új szerződéstervezet (draft) létrehozása az OCR-beemelt (és a pulton pótolt)
   * beteg-adatokból. A beteg KVL-profilja érintetlen marad.
   */
  async create(
    input: { partnerCode: string; patient: ContractPatient; purchaseDate: string },
    operator: string,
  ): Promise<ContractRecord> {
    const res = await this.db.query<{ id: string }>(
      `INSERT INTO contracts (partner_code, status, patient, purchase_date, operator)
       VALUES ($1, 'draft', $2, $3, $4)
       RETURNING id`,
      [
        input.partnerCode,
        JSON.stringify(input.patient),
        input.purchaseDate,
        operator,
      ],
    );
    const id = res.rows[0].id;
    await this.audit.record({
      actor: operator,
      action: 'CREATE',
      entityType: 'contract',
      entityId: id,
      detail: { partnerCode: input.partnerCode },
    });
    return this.getOrThrow(id);
  }

  /**
   * GDPR-kapu: a 4 kötelező hozzájárulás rögzítése. Enélkül nem lehet kosárhoz
   * lépni (draft → gdpr_ok).
   */
  async recordConsent(
    id: string,
    consent: GdprConsent,
    operator: string,
  ): Promise<ContractRecord> {
    const c = await this.getOrThrow(id);
    this.assertTransition(c.status, 'gdpr_ok');
    if (!isGdprComplete(consent)) {
      throw new BadRequestException({
        error: {
          code: 'GDPR_INCOMPLETE',
          message: 'Mind a 4 GDPR/marketing kérdést meg kell válaszolni.',
        },
      });
    }
    await this.db.query(
      `UPDATE contracts SET gdpr_consent = $1, status = 'gdpr_ok' WHERE id = $2`,
      [JSON.stringify(consent), id],
    );
    await this.audit.record({
      actor: operator,
      action: 'UPDATE',
      entityType: 'contract',
      entityId: id,
      detail: { step: 'gdpr_ok' },
    });
    return this.getOrThrow(id);
  }

  /** A kosár véglegesítése (gdpr_ok → cart). Kiszámítja a végösszeget. */
  async setCart(
    id: string,
    items: ContractItem[],
    operator: string,
  ): Promise<ContractRecord> {
    const c = await this.getOrThrow(id);
    this.assertTransition(c.status, 'cart');
    if (items.length === 0) {
      throw new BadRequestException({
        error: { code: 'EMPTY_CART', message: 'A kosár nem lehet üres.' },
      });
    }
    const totals = contractTotals(items);
    await this.db.query(
      `UPDATE contracts
          SET items = $1, total_deposit = $2, total_price = $3, grand_total = $4,
              status = 'cart'
        WHERE id = $5`,
      [
        JSON.stringify(items),
        totals.totalDeposit,
        totals.totalPrice,
        totals.grandTotal,
        id,
      ],
    );
    await this.audit.record({
      actor: operator,
      action: 'UPDATE',
      entityType: 'contract',
      entityId: id,
      detail: { step: 'cart', grandTotal: totals.grandTotal },
    });
    return this.getOrThrow(id);
  }

  /**
   * Fizetés (cart → paid). A kaució + baktériumszűrő egyben megy a terminálra;
   * elutasításnál a szerződés NEM lép tovább (nincs adatvesztés, újrapróbálható).
   */
  async pay(
    id: string,
    operator: string,
  ): Promise<{ status: 'paid' | 'declined'; contract: ContractRecord; declineReason?: string }> {
    const c = await this.getOrThrow(id);
    this.assertTransition(c.status, 'paid');

    const terminal = await this.invoices.chargeCard({
      amountGross: c.grandTotal,
      reference: id,
    });
    if (!terminal.approved) {
      await this.audit.record({
        actor: operator,
        action: 'UPDATE',
        entityType: 'contract',
        entityId: id,
        detail: { step: 'pay', terminal: 'declined', reason: terminal.declineReason },
      });
      return {
        status: 'declined',
        contract: c,
        declineReason: terminal.declineReason,
      };
    }

    await this.db.query(
      `UPDATE contracts SET status = 'paid', paid_at = now() WHERE id = $1`,
      [id],
    );
    await this.audit.record({
      actor: operator,
      action: 'UPDATE',
      entityType: 'contract',
      entityId: id,
      detail: { step: 'paid', amount: c.grandTotal },
    });
    return { status: 'paid', contract: await this.getOrThrow(id) };
  }

  /**
   * SMS-kódos aláírási kihívás indítása (a beteg mobiljára). A szerződés paid
   * státuszban kell legyen. A telefonszámot a KVL-profilból vesszük.
   */
  async requestSmsSignature(
    id: string,
  ): Promise<{ challengeId: string }> {
    const c = await this.getOrThrow(id);
    if (c.status !== 'paid') {
      throw new BadRequestException({
        error: {
          code: 'NOT_PAYABLE_STATE',
          message: 'Aláírás csak sikeres fizetés után indítható.',
        },
      });
    }
    const search = await this.kvl.searchPartner({ partnerCode: c.partnerCode });
    const phone =
      search.matchType === 'single' ? search.partner.mobile : null;
    if (!phone) {
      throw new BadRequestException({
        error: {
          code: 'NO_PHONE',
          message:
            'Nincs mobilszám az SMS-aláíráshoz. Papíralapú aláírás szükséges.',
        },
      });
    }
    const challenge = await this.esign.requestSignature({
      phone,
      documentRef: id,
    });
    // pg-mem: explicit létezés-ellenőrzés az ON CONFLICT helyett.
    const existing = await this.db.query<{ challenge_id: string }>(
      `SELECT challenge_id FROM contract_sign_challenges WHERE challenge_id = $1`,
      [challenge.challengeId],
    );
    if (!existing.rows[0]) {
      await this.db.query(
        `INSERT INTO contract_sign_challenges (challenge_id, contract_id)
         VALUES ($1, $2)`,
        [challenge.challengeId, id],
      );
    }
    return { challengeId: challenge.challengeId };
  }

  /**
   * Az SMS-kód ellenőrzése és a szerződés aláírása (paid → signed).
   * Siker esetén rögzíti az eIDAS aláírás-hivatkozást és időbélyeget.
   */
  async confirmSmsSignature(
    id: string,
    challengeId: string,
    code: string,
    operator: string,
  ): Promise<ContractRecord> {
    const c = await this.getOrThrow(id);
    this.assertTransition(c.status, 'signed');

    const link = await this.db.query<{ contract_id: string }>(
      `SELECT contract_id FROM contract_sign_challenges WHERE challenge_id = $1`,
      [challengeId],
    );
    if (link.rows[0]?.contract_id !== id) {
      throw new BadRequestException({
        error: { code: 'UNKNOWN_CHALLENGE', message: 'Ismeretlen aláírási kihívás.' },
      });
    }

    const result = await this.esign.verifyCode({ challengeId, code });
    if (!result.signed) {
      throw new BadRequestException({
        error: { code: 'BAD_CODE', message: 'Hibás vagy lejárt SMS-kód.' },
      });
    }

    await this.db.query(
      `UPDATE contracts
          SET status = 'signed', signature_method = 'sms',
              signature_ref = $1, signed_at = $2
        WHERE id = $3`,
      [result.signatureRef ?? null, result.signedAt ?? new Date().toISOString(), id],
    );
    await this.db.query(
      `DELETE FROM contract_sign_challenges WHERE challenge_id = $1`,
      [challengeId],
    );
    await this.audit.record({
      actor: operator,
      action: 'UPDATE',
      entityType: 'contract',
      entityId: id,
      detail: { step: 'signed', method: 'sms', signatureRef: result.signatureRef },
    });
    return this.getOrThrow(id);
  }

  /**
   * Papíralapú aláírás rögzítése (paid → signed) — az idős/okostelefon nélküli
   * betegek fallback ága. A beteg a kinyomtatott szerződést tollal aláírja, a
   * pultos beszkenneli; a szkennelt dokumentum tényét itt rögzítjük.
   */
  async signOnPaper(
    id: string,
    operator: string,
  ): Promise<ContractRecord> {
    const c = await this.getOrThrow(id);
    this.assertTransition(c.status, 'signed');
    await this.db.query(
      `UPDATE contracts
          SET status = 'signed', signature_method = 'paper', signed_at = now()
        WHERE id = $1`,
      [id],
    );
    await this.audit.record({
      actor: operator,
      action: 'UPDATE',
      entityType: 'contract',
      entityId: id,
      detail: { step: 'signed', method: 'paper' },
    });
    return this.getOrThrow(id);
  }

  /**
   * Lezárás (signed → closed): a szerződés PDF és a jótállási jegyek (SN-hez
   * kötött garanciaévekkel) generálása, majd a beteg Idővonalára rögzítés.
   */
  async close(id: string, operator: string): Promise<ContractRecord> {
    const c = await this.getOrThrow(id);
    this.assertTransition(c.status, 'closed');

    const contractPdf = await this.pdf.generateContract({
      contractId: id,
      partnerCode: c.partnerCode,
      patientName: c.patient.name,
    });

    // Jótállási jegy minden gyári számmal (SN) rendelkező tételre.
    const warrantyDocs: WarrantyDoc[] = [];
    for (const item of c.items) {
      if (!item.serialNumber) continue;
      const expiry =
        warrantyExpiry(c.purchaseDate, item.productType, DEFAULT_WARRANTY_RULES) ??
        c.purchaseDate;
      const doc = await this.pdf.generateWarranty({
        contractId: id,
        serialNumber: item.serialNumber,
        productType: item.productType,
        warrantyExpiry: expiry,
      });
      warrantyDocs.push({
        serialNumber: item.serialNumber,
        productType: item.productType,
        warrantyExpiry: expiry,
        uri: doc.uri,
      });
    }

    await this.db.query(
      `UPDATE contracts
          SET status = 'closed', contract_pdf_uri = $1, warranty_docs = $2,
              closed_at = now()
        WHERE id = $3`,
      [contractPdf.uri, JSON.stringify(warrantyDocs), id],
    );

    await this.timeline.append({
      partnerCode: c.partnerCode,
      type: 'CONTRACT_SIGNED',
      text: `Próbakezelési szerződés lezárva (${c.signatureMethod === 'paper' ? 'papír' : 'SMS-aláírás'}) — kaució ${c.totalDeposit} Ft`,
      occurredAt: new Date().toISOString(),
      detail: {
        contractId: id,
        grandTotal: c.grandTotal,
        contractPdf: contractPdf.uri,
        warranties: warrantyDocs.length,
      },
    });

    await this.audit.record({
      actor: operator,
      action: 'CREATE',
      entityType: 'contract_document',
      entityId: id,
      detail: { contractPdf: contractPdf.uri, warranties: warrantyDocs.length },
    });

    return this.getOrThrow(id);
  }

  async get(id: string): Promise<ContractRecord | null> {
    const res = await this.db.query<{
      id: string;
      partner_code: string;
      status: ContractStatus;
      patient: ContractPatient;
      purchase_date: string | Date;
      gdpr_consent: GdprConsent | null;
      items: ContractItem[];
      total_deposit: string | number;
      total_price: string | number;
      grand_total: string | number;
      signature_method: SignatureMethod | null;
      contract_pdf_uri: string | null;
      warranty_docs: WarrantyDoc[];
    }>(
      `SELECT id, partner_code, status, patient, purchase_date, gdpr_consent,
              items, total_deposit, total_price, grand_total, signature_method,
              contract_pdf_uri, warranty_docs
         FROM contracts WHERE id = $1`,
      [id],
    );
    const r = res.rows[0];
    if (!r) return null;
    return {
      id: r.id,
      partnerCode: r.partner_code,
      status: r.status,
      patient: r.patient,
      purchaseDate:
        typeof r.purchase_date === 'string'
          ? r.purchase_date.slice(0, 10)
          : new Date(r.purchase_date).toISOString().slice(0, 10),
      gdprConsent: r.gdpr_consent ?? null,
      items: Array.isArray(r.items) ? r.items : [],
      totalDeposit: Number(r.total_deposit),
      totalPrice: Number(r.total_price),
      grandTotal: Number(r.grand_total),
      signatureMethod: r.signature_method ?? null,
      contractPdfUri: r.contract_pdf_uri ?? null,
      warrantyDocs: Array.isArray(r.warranty_docs) ? r.warranty_docs : [],
    };
  }

  private async getOrThrow(id: string): Promise<ContractRecord> {
    const c = await this.get(id);
    if (!c) {
      throw new NotFoundException({
        error: { code: 'CONTRACT_NOT_FOUND', message: 'Ismeretlen szerződés.' },
      });
    }
    return c;
  }

  private assertTransition(from: ContractStatus, to: ContractStatus): void {
    if (!canTransition(from, to)) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_TRANSITION',
          message: `Érvénytelen lépés: ${from} → ${to}.`,
        },
      });
    }
  }
}
