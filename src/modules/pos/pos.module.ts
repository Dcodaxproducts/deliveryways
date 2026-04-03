import { Module } from '@nestjs/common';
import { PosController } from './pos.controller';
import { PosRepository } from './pos.repository';
import { PosService } from './pos.service';

@Module({
  controllers: [PosController],
  providers: [PosService, PosRepository],
  exports: [PosService],
})
export class PosModule {}
