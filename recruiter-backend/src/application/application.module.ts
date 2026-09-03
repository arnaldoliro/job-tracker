import { Module } from '@nestjs/common';
import { ProfileModule } from '../profile/profile.module';
import { ApplicationController } from './application.controller';
import { ApplicationService } from './application.service';

@Module({
  // ProfileModule pelo ProfileExistsPipe, que injeta o ProfileService.
  imports: [ProfileModule],
  controllers: [ApplicationController],
  providers: [ApplicationService],
})
export class ApplicationModule {}
