import { Body, Controller, Post, Query } from '@nestjs/common';
import { fillFormSchema, type FillFormInput } from '@recruit/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ProfileExistsPipe } from '../common/pipes/profile-exists.pipe';
import { FormFillService, type FillReport } from './form-fill.service';

@Controller('form-fill')
export class FormFillController {
  constructor(private readonly formFill: FormFillService) {}

  @Post()
  fill(
    @Query('profileId', ProfileExistsPipe) profileId: string,
    @Body(new ZodValidationPipe(fillFormSchema)) input: FillFormInput,
  ): Promise<FillReport> {
    return this.formFill.fill(profileId, input.url);
  }
}
