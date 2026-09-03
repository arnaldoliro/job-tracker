import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  createApplicationSchema,
  updateApplicationSchema,
} from '@recruit/shared';
import type {
  Application,
  CreateApplicationInput,
  UpdateApplicationInput,
} from '@recruit/shared';
import { ProfileExistsPipe } from '../common/pipes/profile-exists.pipe';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ApplicationService } from './application.service';

@Controller('applications')
export class ApplicationController {
  constructor(private readonly applicationService: ApplicationService) {}

  @Get()
  list(
    @Query('profileId', ProfileExistsPipe) profileId: string,
  ): Promise<Application[]> {
    return this.applicationService.list(profileId);
  }

  @Get(':id')
  findById(@Param('id') id: string): Promise<Application> {
    return this.applicationService.findById(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createApplicationSchema))
    input: CreateApplicationInput,
  ): Promise<Application> {
    return this.applicationService.create(input);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateApplicationSchema))
    input: UpdateApplicationInput,
  ): Promise<Application> {
    return this.applicationService.update(id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.applicationService.softDelete(id);
  }
}
