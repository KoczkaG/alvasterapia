import { Injectable, Logger } from '@nestjs/common';
import type { OcrPatientData, OcrPort } from './ocr.port';

/**
 * MOCK OCR-adapter. Néhány beépített demó-ambulánslap alapján ad vissza
 * strukturált beteg-adatot, amíg a valódi OCR-motor el nem készül. A valódi
 * adaptert (kép/PDF → szöveg → mezők) ugyanezen interfész mögé kell illeszteni.
 */
@Injectable()
export class OcrMockAdapter implements OcrPort {
  private readonly logger = new Logger(OcrMockAdapter.name);

  private readonly demo = new Map<string, OcrPatientData>([
    [
      'ambulans-demo-1',
      {
        name: 'Kovács Lajosné',
        taj: '123456789',
        zip: '1145',
        city: 'Budapest',
        address: 'Lakatos utca 22.',
        doctorName: 'Dr. Szabó Anna',
        doctorStamp: '54321',
        pressure: 9.5,
      },
    ],
    [
      'ambulans-demo-2',
      {
        name: 'Nagy István',
        taj: '987654321',
        zip: '4025',
        city: 'Debrecen',
        address: 'Piac utca 5.',
        doctorName: 'Dr. Kiss Péter',
        doctorStamp: '11223',
        pressure: 11,
      },
    ],
  ]);

  async extractPatient(documentRef: string): Promise<OcrPatientData | null> {
    this.logger.debug(`[MOCK] OCR extractPatient ${documentRef}`);
    return this.demo.get(documentRef) ?? null;
  }
}
