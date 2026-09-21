import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import type { Env } from '../config/env';
import { EmailService } from './email.service';

/**
 * O relógio da ingestão.
 *
 * Aqui o cron se justifica, diferente da busca de vagas: email chega quando
 * chega, e ninguém está na tela esperando. Quinze minutos é mais rápido que a
 * velocidade com que um processo seletivo anda.
 */
@Injectable()
export class EmailSyncScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(EmailSyncScheduler.name);

  constructor(
    private readonly emails: EmailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * O `@nestjs/schedule` não dispara ao subir, e a máquina é do usuário: sem
   * uma execução no boot, tudo que chegou com o backend desligado só entraria
   * no próximo quarto de hora.
   *
   * Atrás de flag e desligado por padrão porque `nest start --watch` reinicia
   * a cada arquivo salvo — em desenvolvimento isso seria uma conexão IMAP por
   * gravação.
   */
  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.get('IMAP_SYNC_ON_BOOT', { infer: true })) {
      return;
    }

    await this.run('boot');
  }

  // Expressão literal: o enum do @nestjs/schedule tem 5, 10 e 30 minutos, e
  // não 15. Trocar o intervalo para caber no enum seria a decisão errada.
  @Cron('*/15 * * * *')
  async everyQuarterHour(): Promise<void> {
    await this.run('cron');
  }

  /**
   * Sem credencial o cron não faz barulho: lançar a cada quinze minutos
   * encheria o log de um erro que não é erro, é configuração ausente.
   */
  private async run(trigger: string): Promise<void> {
    if (!this.emails.configured) {
      return;
    }

    try {
      await this.emails.sync();
    } catch (error) {
      this.logger.warn(
        `Sincronização (${trigger}) não completou: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
