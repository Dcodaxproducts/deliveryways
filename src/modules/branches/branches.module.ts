import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { UsersModule } from '../users/users.module';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';
import { BranchesRepository } from './branches.repository';

@Module({
  imports: [UsersModule, StorageModule],
  controllers: [BranchesController],
  providers: [BranchesService, BranchesRepository],
  exports: [BranchesService],
})
export class BranchesModule {}
