import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { InvoiceRecordsService } from './invoice-records.service';

@Module({
  imports: [DatabaseModule],
  providers: [InvoiceRecordsService],
  exports: [InvoiceRecordsService],
})
export class InvoicesModule {}
