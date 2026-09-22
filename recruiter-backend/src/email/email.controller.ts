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
import {
  createApplicationFromEmailSchema,
  linkEmailSchema,
  syncEmailsSchema,
} from '@recruit/shared';
import type {
  Application,
  CreateApplicationFromEmailInput,
  EmailMessage,
  EmailStatus,
  EmailSyncResult,
  LinkEmailInput,
  SyncEmailsQuery,
  TimelineEntry,
} from '@recruit/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { EmailService } from './email.service';

@Controller()
export class EmailController {
  constructor(private readonly emails: EmailService) {}

  /** Não filtra por perfil: existe uma caixa de email e vários perfis. */
  @Get('emails')
  listUnlinked(): Promise<EmailMessage[]> {
    return this.emails.listUnlinked();
  }

  /** Antes de `emails/:id/...`, e é rota estática, então não conflita. */
  @Get('emails/status')
  status(): EmailStatus {
    return this.emails.status();
  }

  @Post('emails/sync')
  sync(
    @Query(new ZodValidationPipe(syncEmailsSchema)) query: SyncEmailsQuery,
  ): Promise<EmailSyncResult> {
    return this.emails.sync(query.days);
  }

  @Post('emails/:id/link')
  @HttpCode(HttpStatus.NO_CONTENT)
  link(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(linkEmailSchema)) input: LinkEmailInput,
  ): Promise<void> {
    return this.emails.link(id, input.applicationId);
  }

  @Delete('emails/:id/link')
  @HttpCode(HttpStatus.NO_CONTENT)
  unlink(@Param('id') id: string): Promise<void> {
    return this.emails.unlink(id);
  }

  @Post('emails/:id/application')
  createApplication(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createApplicationFromEmailSchema))
    input: CreateApplicationFromEmailInput,
  ): Promise<Application> {
    return this.emails.createApplication(id, input);
  }

  /**
   * Mora aqui, e não no controller de candidaturas, para a dependência entre
   * módulos correr num sentido só — Email precisa de Application, e não o
   * contrário. Rota no Nest não está presa ao nome do módulo.
   */
  @Get('applications/:id/timeline')
  timeline(@Param('id') id: string): Promise<TimelineEntry[]> {
    return this.emails.timeline(id);
  }
}
