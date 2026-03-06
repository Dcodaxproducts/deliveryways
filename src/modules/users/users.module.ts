import { Module } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { UsersCleanupService } from './users.cleanup.service';

@Module({
  providers: [UsersService, UsersRepository, UsersCleanupService],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
