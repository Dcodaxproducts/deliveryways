import { Module } from '@nestjs/common';
import { MailerModule } from '../mailer/mailer.module';
import { ContactSubmissionsController } from './contact-submissions.controller';
import { ContactSubmissionsRepository } from './contact-submissions.repository';
import { ContactSubmissionsService } from './contact-submissions.service';

@Module({
  imports: [MailerModule],
  controllers: [ContactSubmissionsController],
  providers: [ContactSubmissionsRepository, ContactSubmissionsService],
  exports: [ContactSubmissionsService],
})
export class ContactSubmissionsModule {}
