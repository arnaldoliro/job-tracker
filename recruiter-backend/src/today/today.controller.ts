import { Controller, Get, Query } from '@nestjs/common';
import type { Today } from '@recruit/shared';
import { ProfileExistsPipe } from '../common/pipes/profile-exists.pipe';
import { TodayService } from './today.service';

@Controller('today')
export class TodayController {
  constructor(private readonly todayService: TodayService) {}

  @Get()
  today(
    @Query('profileId', ProfileExistsPipe) profileId: string,
  ): Promise<Today> {
    return this.todayService.today(profileId);
  }
}
