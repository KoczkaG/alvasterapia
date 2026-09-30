import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { pgPoolProvider } from './pg-pool.provider';

@Global()
@Module({
  providers: [pgPoolProvider, DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
