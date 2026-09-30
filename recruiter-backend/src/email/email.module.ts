import { Module } from '@nestjs/common';
import { ApplicationModule } from '../application/application.module';
import { ProfileModule } from '../profile/profile.module';
import { EmailBootSync } from './email-boot-sync';
import { EmailClassifierService } from './email-classifier.service';
import { EmailController } from './email.controller';
import { EmailResolverService } from './email-resolver.service';
import { EmailService } from './email.service';

@Module({
  // ApplicationModule porque criar candidatura a partir de um email passa pelo
  // mesmo `create()` da tela — com a transação e o StatusEvent que ele garante.
  imports: [ApplicationModule, ProfileModule],
  controllers: [EmailController],
  providers: [
    EmailService,
    EmailClassifierService,
    EmailResolverService,
    EmailBootSync,
  ],
})
export class EmailModule {}
