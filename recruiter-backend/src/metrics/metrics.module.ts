import { Module } from '@nestjs/common';
import { ProfileModule } from '../profile/profile.module';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

@Module({
  imports: [ProfileModule],
  controllers: [MetricsController],
  providers: [MetricsService],
})
export class MetricsModule {}
