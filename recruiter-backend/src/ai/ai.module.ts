import { Global, Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

/**
 * Global, como o `PrismaModule`: quatro módulos diferentes pedem IA, e cada
 * um importar este só para injetar um serviço seria ruído.
 */
@Global()
@Module({
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
