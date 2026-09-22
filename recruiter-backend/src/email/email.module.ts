import { Module } from '@nestjs/common';
import { ApplicationModule } from '../application/application.module';
import { EmailController } from './email.controller';
import { EmailSyncScheduler } from './email-sync.scheduler';
import { EmailService } from './email.service';

@Module({
  // ApplicationModule porque criar candidatura a partir de um email passa pelo
  // mesmo `create()` da tela — com a transação e o StatusEvent que ele garante.
  imports: [ApplicationModule],
  controllers: [EmailController],
  providers: [EmailService, EmailSyncScheduler],
})
export class EmailModule {}
