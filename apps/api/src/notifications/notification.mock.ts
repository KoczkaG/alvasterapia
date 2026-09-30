import { Injectable, Logger } from '@nestjs/common';
import type {
  EmailMessage,
  NotificationPort,
  SmsMessage,
} from './notification.port';

/**
 * Mock értesítés-adapter. Naplózza a kimenő e-maileket/SMS-eket, amíg a valódi
 * szolgáltató-integrációk el nem készülnek.
 */
@Injectable()
export class NotificationMockAdapter implements NotificationPort {
  private readonly logger = new Logger(NotificationMockAdapter.name);

  async sendEmail(message: EmailMessage): Promise<void> {
    this.logger.debug(`[MOCK e-mail] → ${message.to}: ${message.subject}`);
  }

  async sendSms(message: SmsMessage): Promise<void> {
    this.logger.debug(`[MOCK SMS] → ${message.to}: ${message.body}`);
  }
}
