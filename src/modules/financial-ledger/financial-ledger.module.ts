import { Module } from '@nestjs/common';
import { FinancialLedgerRepository } from './financial-ledger.repository';

@Module({
  providers: [FinancialLedgerRepository],
  exports: [FinancialLedgerRepository],
})
export class FinancialLedgerModule {}
