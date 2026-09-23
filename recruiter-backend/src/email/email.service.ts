import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  Application,
  CreateApplicationFromEmailInput,
  EmailMessage,
  EmailStatus,
  EmailSyncResult,
  TimelineEntry,
} from '@recruit/shared';
import { ApplicationService } from '../application/application.service';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { JOB_DIGEST_SENDERS } from './ats';
import { classify, companyGuess } from './confirmation';
import { fetchSince, ImapError, type ImapConfig } from './imap.client';
import {
  matchByCompany,
  matchByThread,
  type Candidate,
  type MailFacts,
} from './matcher';

/**
 * Ingestão de email: busca, guarda, vincula.
 *
 * Não classifica o sentido de nada e não muda status de candidatura. Isso é a
 * etapa seguinte, e exige o Claude — a seção 4 explica por quê.
 */

/** Primeira execução não varre anos de histórico de uma vez. */
const FIRST_RUN_DAYS = 30;

/** Sobreposição: `SINCE` do IMAP é granular por dia, não por hora. */
const OVERLAP_DAYS = 1;

/** Órfão mais velho que isto não vale mais tentar revincular. */
const RELINK_DAYS = 90;

const PREVIEW_CHARS = 220;

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly config: ImapConfig | null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly applications: ApplicationService,
    config: ConfigService<Env, true>,
  ) {
    const host = config.get('IMAP_HOST', { infer: true });
    const user = config.get('IMAP_USER', { infer: true });
    const password = config.get('IMAP_PASSWORD', { infer: true });

    // A porta não entra na checagem: ela tem default e está sempre presente.
    this.config =
      host && user && password
        ? {
            host,
            user,
            password,
            port: config.get('IMAP_PORT', { infer: true }),
            mailbox: config.get('IMAP_MAILBOX', { infer: true }),
          }
        : null;
  }

  get configured(): boolean {
    return this.config !== null;
  }

  status(): EmailStatus {
    return {
      configured: this.configured,
      // O nome do rótulo aparece na tela para você conferir contra o Gmail —
      // rótulo errado é o erro de configuração mais provável.
      mailbox: this.config?.mailbox ?? null,
    };
  }

  /**
   * Uma rodada de sincronização.
   *
   * Grava por mensagem, sem transação única: uma queda no meio deixa um
   * resultado parcial válido em vez de perder tudo, e o que falhou volta no
   * `failed` para a tela poder dizer que a lista está incompleta.
   */
  async sync(backfillDays?: number): Promise<EmailSyncResult> {
    if (!this.config) {
      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        message:
          'Email indisponível: defina IMAP_HOST, IMAP_USER e IMAP_PASSWORD no .env do backend.',
      });
    }

    // Cron, botão e boot não podem se sobrepor: seriam duas conexões IMAP
    // simultâneas e tempestade de chave duplicada.
    if (this.running) {
      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        message: 'Já existe uma sincronização em andamento.',
      });
    }

    this.running = true;

    const started = Date.now();
    const failed: string[] = [];
    let stored = 0;
    let linked = 0;

    try {
      const mails = await fetchSince(
        this.config,
        await this.watermark(backfillDays),
      );

      for (const mail of mails) {
        try {
          const outcome = await this.store(mail);

          if (outcome === 'stored') {
            stored += 1;
          }

          if (outcome === 'linked') {
            stored += 1;
            linked += 1;
          }
        } catch (error) {
          failed.push(describe(error));
        }
      }

      const relinked = await this.relinkOrphans();

      this.logger.log(
        `Sincronização: ${mails.length} lidos, ${stored} novos, ${linked} vinculados, ${relinked} revinculados em ${Date.now() - started}ms`,
      );

      return {
        fetched: mails.length,
        stored,
        linked,
        relinked,
        skipped: mails.length - stored,
        failed,
        tookMs: Date.now() - started,
      };
    } catch (error) {
      if (error instanceof ImapError) {
        this.logger.error(`IMAP falhou: ${error.message}`);

        throw new ServiceUnavailableException({
          error: 'Service Unavailable',
          message: error.message,
        });
      }

      throw error;
    } finally {
      this.running = false;
    }
  }

  /**
   * De quando buscar.
   *
   * A janela é limitada dos dois lados de propósito. Sem o teto superior, um
   * email com `receivedAt` no futuro — e eles existem — travaria a ingestão
   * para sempre, em silêncio. O `receivedAt` vem do INTERNALDATE justamente
   * para reduzir esse risco, mas o limite fica como segunda barreira.
   */
  private async watermark(backfillDays?: number): Promise<Date> {
    // Resgate explícito vence a marca d'água. Sem isto, ampliar o filtro do
    // Gmail é irrecuperável: os emails antigos entram no rótulo, mas a marca
    // já passou deles e a deduplicação nunca chega a vê-los.
    if (backfillDays !== undefined) {
      return daysAgo(backfillDays);
    }

    const latest = await this.prisma.emailMessage.findFirst({
      orderBy: { receivedAt: 'desc' },
      select: { receivedAt: true },
    });

    const floor = daysAgo(FIRST_RUN_DAYS);

    if (!latest) {
      return floor;
    }

    const wanted = new Date(
      latest.receivedAt.getTime() - OVERLAP_DAYS * 86_400_000,
    );

    if (wanted > daysAgo(OVERLAP_DAYS)) {
      return daysAgo(OVERLAP_DAYS);
    }

    return wanted < floor ? floor : wanted;
  }

  private async store(mail: {
    messageId: string;
    threadId: string | null;
    fromAddress: string;
    fromName: string | null;
    subject: string;
    receivedAt: Date;
    bodyText: string | null;
    references: string[];
  }): Promise<'stored' | 'linked' | 'skipped'> {
    // Global, e não pelo `@@unique([profileId, messageId])`: aquele índice é
    // por perfil, e o mesmo email entraria duas vezes se o perfil de espera
    // mudasse entre execuções.
    const known = await this.prisma.emailMessage.findFirst({
      where: { messageId: mail.messageId },
      select: { id: true },
    });

    if (known) {
      return 'skipped';
    }

    const match = await this.findApplication(mail);
    const profileId = match
      ? match.profileId
      : await this.placeholderProfile(mail.fromAddress);

    try {
      await this.prisma.emailMessage.create({
        data: {
          profileId,
          applicationId: match?.applicationId ?? null,
          messageId: mail.messageId,
          threadId: mail.threadId,
          fromAddress: mail.fromAddress,
          fromName: mail.fromName,
          subject: mail.subject,
          receivedAt: mail.receivedAt,
          bodyText: mail.bodyText,
          // `processedAt` fica nulo: ele significa "o job de classificação
          // rodou", e ele não rodou. Marcar aqui roubaria a fila da etapa de IA.
        },
      });
    } catch (error) {
      if (isDuplicate(error)) {
        return 'skipped';
      }

      throw error;
    }

    return match ? 'linked' : 'stored';
  }

  private async findApplication(mail: {
    fromAddress: string;
    fromName: string | null;
    subject: string;
    bodyText: string | null;
    receivedAt: Date;
    references: string[];
  }): Promise<{ applicationId: string; profileId: string } | null> {
    if (mail.references.length > 0) {
      const known = await this.prisma.emailMessage.findMany({
        where: {
          messageId: { in: mail.references },
          applicationId: { not: null },
        },
        select: { messageId: true, applicationId: true, profileId: true },
      });

      const byMessageId = new Map(
        known.map((row) => [row.messageId, row.applicationId!]),
      );
      const thread = matchByThread(mail.references, byMessageId);

      if (thread) {
        const owner = known.find(
          (row) => row.applicationId === thread.applicationId,
        );

        return {
          applicationId: thread.applicationId,
          profileId: owner!.profileId,
        };
      }
    }

    const rows = await this.prisma.application.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        profileId: true,
        createdAt: true,
        appliedAt: true,
        job: { select: { company: true, title: true, url: true } },
      },
    });

    const candidates: Candidate[] = rows.map((row) => ({
      applicationId: row.id,
      company: row.job.company,
      title: row.job.title,
      jobUrl: row.job.url,
      createdAt: row.createdAt,
      appliedAt: row.appliedAt,
    }));

    const facts: MailFacts = { ...mail };
    const match = matchByCompany(facts, candidates);

    if (!match) {
      return null;
    }

    const owner = rows.find((row) => row.id === match.applicationId)!;

    return { applicationId: match.applicationId, profileId: owner.profileId };
  }

  /**
   * Segunda chance para os órfãos.
   *
   * Sem isto, email que chegou ANTES de você registrar a candidatura fica
   * órfão para sempre: a deduplicação pula, e ele nunca é reavaliado. É a
   * sequência mais comum na vida real — o email de confirmação chega na hora,
   * o registro vem depois.
   */
  private async relinkOrphans(): Promise<number> {
    const orphans = await this.prisma.emailMessage.findMany({
      where: {
        applicationId: null,
        receivedAt: { gte: daysAgo(RELINK_DAYS) },
        // Digest de vagas nunca é correspondência de candidatura. Sem isto, um
        // alerta citando seis empresas pode casar com uma delas e entrar na
        // LINHA DO TEMPO da candidatura carregando 10 KB de digest — e sumir
        // da caixa de não vinculados, onde você o veria.
        //
        // Também encurta o laço, que reexamina todo órfão de 90 dias a cada
        // sincronização e vai passar a receber ~250 alertas por ano.
        fromAddress: { notIn: [...JOB_DIGEST_SENDERS] },
      },
      select: {
        id: true,
        fromAddress: true,
        fromName: true,
        subject: true,
        bodyText: true,
        receivedAt: true,
      },
    });

    let count = 0;

    for (const orphan of orphans) {
      const match = await this.findApplication({ ...orphan, references: [] });

      if (!match) {
        continue;
      }

      await this.prisma.emailMessage.update({
        where: { id: orphan.id },
        data: {
          applicationId: match.applicationId,
          profileId: match.profileId,
        },
      });

      count += 1;
    }

    return count;
  }

  /**
   * O perfil de espera de um email sem candidatura.
   *
   * Sai de evidência, não de `isDefault`: aquele campo é gravado uma única vez
   * como "o primeiro perfil criado", nenhuma tela o lê e ninguém consegue
   * mudá-lo. Aqui o endereço de destino é comparado ao `Profile.email`, que já
   * existe no schema e não era usado por nada.
   *
   * O palpite só é palpite: a tela de não vinculados não filtra por perfil, e
   * criar candidatura a partir do email corrige o dono na mesma transação.
   */
  private async placeholderProfile(toAddress: string): Promise<string> {
    const byEmail = await this.prisma.profile.findFirst({
      where: { email: { equals: toAddress, mode: 'insensitive' } },
      select: { id: true },
    });

    if (byEmail) {
      return byEmail.id;
    }

    const first = await this.prisma.profile.findFirst({
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: { id: true },
    });

    if (!first) {
      throw new NotFoundException({
        error: 'Not Found',
        message: 'Nenhum perfil cadastrado para receber o email.',
      });
    }

    return first.id;
  }

  /** A caixa não é por perfil: existe uma conta de email e vários perfis. */
  async listUnlinked(): Promise<EmailMessage[]> {
    const rows = await this.prisma.emailMessage.findMany({
      where: {
        applicationId: null,
        // Digest de vagas fora, e a exclusão precisa estar AQUI e não depois
        // do `map`: o `take` corta antes de classificar, e são ~250 alertas
        // por ano contra ~16 candidaturas. Filtrando em memória, a tela
        // mostraria 100 alertas e nenhuma candidatura.
        //
        // Eles não somem do sistema — alimentam a descoberta de vagas. Esta
        // tela é para o que você pode vincular, e alerta nunca vincula.
        fromAddress: { notIn: [...JOB_DIGEST_SENDERS] },
      },
      orderBy: { receivedAt: 'desc' },
      take: 100,
    });

    return (
      rows
        .map((row) => ({
          id: row.id,
          applicationId: row.applicationId,
          fromAddress: row.fromAddress,
          fromName: row.fromName,
          subject: row.subject,
          receivedAt: row.receivedAt.toISOString(),
          kind: classify(row.subject, row.bodyText),
          preview: row.bodyText
            ? row.bodyText.replace(/\s+/g, ' ').slice(0, PREVIEW_CHARS)
            : null,
          companyGuess: companyGuess(
            row.fromName,
            row.fromAddress,
            row.subject,
          ),
        }))
        // Rede de segurança: um remetente de alerta que ainda não esteja na
        // lista cai aqui pelo texto.
        .filter((email) => email.kind !== 'alerta')
    );
  }

  async link(id: string, applicationId: string): Promise<void> {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, deletedAt: null },
      select: { profileId: true },
    });

    if (!application) {
      throw new NotFoundException({
        error: 'Not Found',
        message: 'Candidatura não encontrada',
      });
    }

    await this.prisma.emailMessage.update({
      where: { id },
      data: { applicationId, profileId: application.profileId },
    });
  }

  async unlink(id: string): Promise<void> {
    await this.prisma.emailMessage.update({
      where: { id },
      data: { applicationId: null },
    });
  }

  /**
   * Cria a candidatura que o email prova existir.
   *
   * Passa pelo `ApplicationService.create()`, e não por um insert próprio: é
   * ele que garante a checagem de perfil, a de duplicata ciente do soft delete
   * e o `StatusEvent` inicial, tudo na mesma transação. Um atalho na origem
   * não pode virar um atalho na regra (seções 3 e 5).
   */
  async createApplication(
    id: string,
    input: CreateApplicationFromEmailInput,
  ): Promise<Application> {
    const email = await this.prisma.emailMessage.findUnique({
      where: { id },
      select: { id: true, receivedAt: true },
    });

    if (!email) {
      throw new NotFoundException({
        error: 'Not Found',
        message: 'Email não encontrado',
      });
    }

    const application = await this.applications.create({
      profileId: input.profileId,
      company: input.company,
      title: input.title,
      status: 'aplicado',
      appliedAt: email.receivedAt.toISOString(),
    });

    // O palpite de perfil vira fato no momento em que existe um fato.
    await this.prisma.emailMessage.update({
      where: { id },
      data: { applicationId: application.id, profileId: input.profileId },
    });

    return application;
  }

  /**
   * Linha do tempo: eventos de status e emails, na mesma ordem cronológica.
   *
   * Leitura combinada, sem escrita. Email não vira `StatusEvent` — `toStatus`
   * é obrigatório no banco, e "chegou um email" não afirma status nenhum.
   */
  async timeline(applicationId: string): Promise<TimelineEntry[]> {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, deletedAt: null },
      select: { id: true },
    });

    if (!application) {
      throw new NotFoundException({
        error: 'Not Found',
        message: 'Candidatura não encontrada',
      });
    }

    const [events, emails] = await Promise.all([
      this.prisma.statusEvent.findMany({
        where: { applicationId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.emailMessage.findMany({
        where: { applicationId },
        orderBy: { receivedAt: 'asc' },
      }),
    ]);

    const entries: TimelineEntry[] = [
      ...events.map((event) => ({
        kind: 'status' as const,
        id: event.id,
        at: event.createdAt.toISOString(),
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        source: event.source,
        note: event.note,
      })),
      ...emails.map((email) => ({
        kind: 'email' as const,
        id: email.id,
        at: email.receivedAt.toISOString(),
        fromAddress: email.fromAddress,
        fromName: email.fromName,
        subject: email.subject,
        body: email.bodyText,
      })),
    ];

    return entries.sort((a, b) => a.at.localeCompare(b.at));
  }
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

function isDuplicate(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'P2002'
  );
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
