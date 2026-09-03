import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { saveJobSchema } from '@recruit/shared';
import type {
  Job,
  JobSearchResult,
  SaveJobInput,
  SavedJob,
} from '@recruit/shared';
import { ProfileExistsPipe } from '../common/pipes/profile-exists.pipe';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { JobService } from './job.service';

@Controller('jobs')
export class JobController {
  constructor(private readonly jobService: JobService) {}

  @Get('search')
  search(
    @Query('q') q?: string,
    @Query('source') source?: string,
  ): Promise<JobSearchResult[]> {
    return this.jobService.search({ q, source });
  }

  // Antes de `:id`, senão "saved" seria capturado como id de vaga.
  @Get('saved')
  listSaved(
    @Query('profileId', ProfileExistsPipe) profileId: string,
  ): Promise<SavedJob[]> {
    return this.jobService.listSaved(profileId);
  }

  @Post('saved')
  save(
    @Body(new ZodValidationPipe(saveJobSchema)) input: SaveJobInput,
  ): Promise<SavedJob> {
    return this.jobService.save(input);
  }

  @Delete('saved/:jobId')
  @HttpCode(HttpStatus.NO_CONTENT)
  unsave(
    @Param('jobId') jobId: string,
    @Query('profileId', ProfileExistsPipe) profileId: string,
  ): Promise<void> {
    return this.jobService.unsave(profileId, jobId);
  }

  @Get(':id')
  findById(@Param('id') id: string): Promise<Job> {
    return this.jobService.findById(id);
  }
}
