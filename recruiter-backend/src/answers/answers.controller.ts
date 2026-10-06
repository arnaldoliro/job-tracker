import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { draftAnswerSchema } from '@recruit/shared';
import type { AnswerDraft } from '@recruit/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AnswersService, type DraftRequest } from './answers.service';

@Controller('answers')
export class AnswersController {
  constructor(private readonly answers: AnswersService) {}

  /**
   * Gera um rascunho de resposta. POST porque custa chamada paga e leva
   * texto grande, não porque grave: nada é salvo.
   */
  @Post('draft')
  @HttpCode(HttpStatus.OK)
  draft(
    @Body(new ZodValidationPipe(draftAnswerSchema)) input: DraftRequest,
  ): Promise<AnswerDraft> {
    return this.answers.draft(input);
  }
}
