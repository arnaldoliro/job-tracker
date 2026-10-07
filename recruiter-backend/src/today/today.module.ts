import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { ProfileModule } from '../profile/profile.module';
import { TodayController } from './today.controller';
import { TodayService } from './today.service';

@Module({
  // EmailModule pela contagem de sugestões pendentes: a regra de qual
  // sugestão ainda vale (`pickSuggestions`) mora lá, e não é para copiar.
  imports: [EmailModule, ProfileModule],
  controllers: [TodayController],
  providers: [TodayService],
})
export class TodayModule {}
