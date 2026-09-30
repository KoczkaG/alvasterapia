import { Module } from '@nestjs/common';
import { PostalCodeController } from './postal-code.controller';
import { PostalCodeService } from './postal-code.service';

@Module({
  controllers: [PostalCodeController],
  providers: [PostalCodeService],
  exports: [PostalCodeService],
})
export class PostalCodeModule {}
