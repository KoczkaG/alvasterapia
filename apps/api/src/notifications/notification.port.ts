/**
 * Értesítés-küldő adapter (Port) — e-mail és SMS.
 *
 * A tényleges kézbesítést külső szolgáltatók végzik (marketing/e-mail rendszer,
 * SMS-gateway). Amíg a valódi integrációk nem élnek, egy mock adapter naplózza
 * a küldést, így a modulok (I/F adatpótló link, GDPR-igazolás, később I/A
 * automatizmusok) fejleszthetők a szolgáltatótól függetlenül.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

export interface SmsMessage {
  to: string;
  body: string;
}

export interface NotificationPort {
  sendEmail(message: EmailMessage): Promise<void>;
  sendSms(message: SmsMessage): Promise<void>;
}

export const NOTIFICATION_PORT = Symbol('NOTIFICATION_PORT');
