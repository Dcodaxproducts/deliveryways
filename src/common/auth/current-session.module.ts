import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { CurrentSessionValidator } from './current-session-validator.service';

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [CurrentSessionValidator],
  exports: [CurrentSessionValidator],
})
export class CurrentSessionModule {}
