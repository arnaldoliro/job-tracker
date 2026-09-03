import { Body, Controller, Get, Post } from '@nestjs/common';
import { createProfileSchema } from '@recruit/shared';
import type { CreateProfileInput, Profile } from '@recruit/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ProfileService } from './profile.service';

@Controller('profiles')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  list(): Promise<Profile[]> {
    return this.profileService.list();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createProfileSchema))
    input: CreateProfileInput,
  ): Promise<Profile> {
    return this.profileService.create(input);
  }
}
