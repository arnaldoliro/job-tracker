import { Controller, Get } from '@nestjs/common';
import type { AiStatus } from '@recruit/shared';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  /**
   * Quem atende cada tarefa de IA e se está pronto. Só leitura: não carrega
   * modelo nem gasta chamada — no máximo uma sondagem barata no Ollama, com
   * cache de 30 s.
   */
  @Get('status')
  status(): Promise<AiStatus> {
    return this.ai.status();
  }
}
