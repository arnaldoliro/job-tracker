import { Module } from '@nestjs/common';
import { ProfileModule } from '../profile/profile.module';
import { FormFillController } from './form-fill.controller';
import { FormFillService } from './form-fill.service';

@Module({
  imports: [ProfileModule],
  controllers: [FormFillController],
  providers: [FormFillService],
})
export class FormFillModule {}
