import { Module } from '@nestjs/common';
import { PackagePlansController } from './package-plans.controller';
import { PackagePlansRepository } from './package-plans.repository';
import { PackagePlansService } from './package-plans.service';

@Module({
  controllers: [PackagePlansController],
  providers: [PackagePlansService, PackagePlansRepository],
  exports: [PackagePlansService],
})
export class PackagePlansModule {}
