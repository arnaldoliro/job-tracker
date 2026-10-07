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
  followUpActionSchema,
  setEventDateSchema,
  updateApplicationSchema,
} from '@recruit/shared';
import type {
  Application,
  CreateApplicationInput,
  FollowUpAction,
  Resume,
  SetEventDateInput,
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

  /** Corrige quando uma transição de status aconteceu. */
  @Patch(':id/events/:eventId')
  @HttpCode(HttpStatus.NO_CONTENT)
  setEventDate(
    @Param('id') id: string,
    @Param('eventId') eventId: string,
    @Body(new ZodValidationPipe(setEventDateSchema)) input: SetEventDateInput,
  ): Promise<void> {
    return this.applicationService.setEventDate(
      id,
      eventId,
      new Date(input.occurredAt),
    );
  }

  /**
   * "Fiz o follow-up" ou "adiar" — muda só quando o próximo lembrete vence.
   * Não é mudança de status: nada entra na linha do tempo.
   */
  @Patch(':id/follow-up')
  @HttpCode(HttpStatus.NO_CONTENT)
  followUp(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(followUpActionSchema))
    input: { action: FollowUpAction },
  ): Promise<void> {
    return this.applicationService.recordFollowUp(id, input.action);
  }

  /** O currículo como foi enviado nesta candidatura. */
  @Get(':id/resume')
  resume(@Param('id') id: string): Promise<Resume> {
    return this.applicationService.resumeOf(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.applicationService.softDelete(id);
  }
}
