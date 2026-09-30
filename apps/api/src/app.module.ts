import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module';
import { CalendarModule } from './calendar/calendar.module';
import { CallsModule } from './calls/calls.module';
import { CompletenessModule } from './completeness/completeness.module';
import { DatabaseModule } from './database/database.module';
import { EanPoolModule } from './ean-pool/ean-pool.module';
import { HealthController } from './health.controller';
import { InvoicingModule } from './invoicing/invoicing.module';
import { KvlModule } from './kvl/kvl.module';
import { NotificationModule } from './notifications/notification.module';
import { PatientsModule } from './patients/patients.module';
import { PostalCodeModule } from './postal-code/postal-code.module';
import { TasksModule } from './tasks/tasks.module';
import { TimelineModule } from './timeline/timeline.module';

@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    KvlModule,
    NotificationModule,
    PostalCodeModule,
    PatientsModule,
    CalendarModule,
    TimelineModule,
    TasksModule,
    CallsModule,
    CompletenessModule,
    InvoicingModule,
    EanPoolModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
