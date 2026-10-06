import { Module } from '@nestjs/common';
import { ProfileModule } from '../profile/profile.module';
import { DiscoveryService } from './discovery/discovery.service';
import { JobController } from './job.controller';
import { JobExtractionService } from './job-extraction.service';
import { JobService } from './job.service';

@Module({
  // ProfileModule pelo ProfileExistsPipe, que injeta o ProfileService.
  imports: [ProfileModule],
  controllers: [JobController],
  providers: [JobService, JobExtractionService, DiscoveryService],
})
export class JobModule {}
