import { Module } from '@nestjs/common';
import { ProfileModule } from '../profile/profile.module';
import { JobController } from './job.controller';
import {
  FixtureJobSearchProvider,
  JobSearchProvider,
} from './job-search.provider';
import { JobService } from './job.service';

@Module({
  // ProfileModule pelo ProfileExistsPipe, que injeta o ProfileService.
  imports: [ProfileModule],
  controllers: [JobController],
  providers: [
    JobService,
    // Trocar a busca fictícia pela real é trocar esta linha.
    { provide: JobSearchProvider, useClass: FixtureJobSearchProvider },
  ],
})
export class JobModule {}
