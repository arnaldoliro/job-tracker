import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { EmailService } from './email.service';

/**
 * Uma sincronização ao subir o backend, e mais nenhuma sozinha.
 *
 * Havia um cron a cada 15 minutos. Com a leitura dos emails pelo Claude, cada
 * rodada pode virar chamada paga, e um processo seletivo não anda em quarto
 * de hora: o que chegou com o backend desligado entra no boot, o resto quando
 * você clica em "Sincronizar agora".
 *
 * Reiniciar não gasta tokens à toa: só email ainda não lido vai para o modelo.
 * O custo de um boot a mais é uma conexão IMAP.
 */
@Injectable()
export class EmailBootSync implements OnApplicationBootstrap {
  private readonly logger = new Logger(EmailBootSync.name);

  constructor(
    private readonly emails: EmailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onApplicationBootstrap(): void {
    // Sem credencial não há o que sincronizar, e não é erro: é configuração.
    if (
      !this.emails.configured ||
      !this.config.get('IMAP_SYNC_ON_BOOT', { infer: true })
    ) {
      return;
    }

    // Sem `await`: o Nest espera este hook antes de abrir a porta, e a API
    // ficaria fora do ar pelos segundos que IMAP e modelo levam.
    void this.emails
      .sync()
      .catch((error: unknown) =>
        this.logger.warn(
          `Sincronização do boot não completou: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
  }
}
