import { Module } from '@nestjs/common';
import { PosPrinterController } from './pos-printer.controller';
import { PosPrinterRepository } from './pos-printer.repository';
import { PosPrinterService } from './pos-printer.service';

@Module({
  controllers: [PosPrinterController],
  providers: [PosPrinterRepository, PosPrinterService],
})
export class PosPrinterModule {}
