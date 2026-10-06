import { Controller, Get, Query } from '@nestjs/common';
import type { Metrics } from '@recruit/shared';
import { ProfileExistsPipe } from '../common/pipes/profile-exists.pipe';
import { MetricsService } from './metrics.service';

/**
 * Controller próprio, e não uma rota em `ApplicationController`.
 *
 * Lá, `@Get('metrics')` seria engolida por `@Get(':id')` a menos que declarada
 * antes — o Nest casa na ordem de declaração. Módulo separado tira a armadilha
 * do caminho e mantém aquele controller fino.
 */
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  forProfile(
    @Query('profileId', ProfileExistsPipe) profileId: string,
  ): Promise<Metrics> {
    return this.metrics.forProfile(profileId);
  }
}
