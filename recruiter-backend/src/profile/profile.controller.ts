import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { createProfileSchema, updateProfileSchema } from '@recruit/shared';
import type {
  CreateProfileInput,
  Profile,
  ProfileDetail,
  UpdateProfileInput,
} from '@recruit/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ProfileService } from './profile.service';

@Controller('profiles')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  list(): Promise<Profile[]> {
    return this.profileService.list();
  }

  @Get(':id')
  findDetailById(@Param('id') id: string): Promise<ProfileDetail> {
    return this.profileService.findDetailById(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProfileSchema))
    input: UpdateProfileInput,
  ): Promise<ProfileDetail> {
    return this.profileService.update(id, input);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createProfileSchema))
    input: CreateProfileInput,
  ): Promise<Profile> {
    return this.profileService.create(input);
  }
}
