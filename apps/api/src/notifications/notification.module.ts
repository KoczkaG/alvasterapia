import { Global, Module } from '@nestjs/common';
import { NotificationMockAdapter } from './notification.mock';
import { NOTIFICATION_PORT } from './notification.port';

/**
 * Értesítés modul. A NOTIFICATION_PORT-hoz jelenleg a mock adaptert kötjük;
 * a valódi e-mail/SMS-szolgáltató ennek cseréjével illeszthető be. Globális,
 * mert több modul is küld értesítést.
 */
@Global()
@Module({
  providers: [{ provide: NOTIFICATION_PORT, useClass: NotificationMockAdapter }],
  exports: [NOTIFICATION_PORT],
})
export class NotificationModule {}
