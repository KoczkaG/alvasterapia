import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module';
import { CalendarModule } from './calendar/calendar.module';
import { CallsModule } from './calls/calls.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { KvlModule } from './kvl/kvl.module';
import { PatientsModule } from './patients/patients.module';
import { PostalCodeModule } from './postal-code/postal-code.module';
import { TasksModule } from './tasks/tasks.module';
import { TimelineModule } from './timeline/timeline.module';

@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    KvlModule,
    PostalCodeModule,
    PatientsModule,
    CalendarModule,
    TimelineModule,
    TasksModule,
    CallsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
