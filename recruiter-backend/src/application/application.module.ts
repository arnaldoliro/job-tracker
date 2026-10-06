import { Module } from '@nestjs/common';
import { ProfileModule } from '../profile/profile.module';
import { ApplicationController } from './application.controller';
import { ApplicationService } from './application.service';

@Module({
  // ProfileModule pelo ProfileExistsPipe, que injeta o ProfileService.
  imports: [ProfileModule],
  controllers: [ApplicationController],
  providers: [ApplicationService],
  // Exportado para o EmailModule: criar candidatura a partir de um email tem
  // que passar pelo mesmo `create()`, não por um insert próprio.
  exports: [ApplicationService],
})
export class ApplicationModule {}
