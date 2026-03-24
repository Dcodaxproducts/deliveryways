import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module';
import { AddressesController } from './addresses.controller';
import { AddressesService } from './addresses.service';
import { AddressesRepository } from './addresses.repository';

@Module({
  imports: [ProfilesModule],
  controllers: [AddressesController],
  providers: [AddressesService, AddressesRepository],
  exports: [AddressesService],
})
export class AddressesModule {}
