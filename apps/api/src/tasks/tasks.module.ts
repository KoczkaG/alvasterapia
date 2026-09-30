import { Global, Module } from '@nestjs/common';
import { TASK_PORT } from './task.port';
import { TasksService } from './tasks.service';

/**
 * Feladatkezelő modul. A TASK_PORT tokenhez a minimál TasksService-t kötjük;
 * a VII/E majd kibővíti/kiváltja a teljes körű implementációval, a hívók
 * (pl. I/E hívásvégi jegyzet) változtatása nélkül.
 */
@Global()
@Module({
  providers: [
    TasksService,
    { provide: TASK_PORT, useExisting: TasksService },
  ],
  exports: [TASK_PORT, TasksService],
})
export class TasksModule {}
