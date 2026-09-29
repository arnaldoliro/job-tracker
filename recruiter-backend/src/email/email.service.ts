import {
  ConflictException,
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
  StatusSuggestion,
  TimelineEntry,
} from '@recruit/shared';
import { active } from '../application/active';
import { ApplicationService } from '../application/application.service';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { JOB_DIGEST_SENDERS } from './ats';
import { classify, companyGuess } from './confirmation';
import {
  ClassifierUnavailableError,
  EmailClassifierService,
} from './email-classifier.service';
import { fetchSince, ImapError, type ImapConfig } from './imap.client';
import {
  matchByCompany,
  matchByThread,
  type Candidate,
  type MailFacts,
} from './matcher';
import { pickSuggestions } from './suggestion';

/**
 * Ingestão de email: busca, guarda, vincula, e pede ao modelo o sentido dos
 * emails vinculados.
 *
 * Nunca muda status de candidatura sozinha. O que o modelo lê vira sugestão,
 * e só vira estado quando você confirma — a seção 4 explica por quê.
 */

/** Primeira execução não varre anos de histórico de uma vez. */
const FIRST_RUN_DAYS = 30;

/** Sobreposição: `SINCE` do IMAP é granular por dia, não por hora. */
const OVERLAP_DAYS = 1;

/** Órfão mais velho que isto não vale mais tentar revincular. */
const RELINK_DAYS = 90;

const PREVIEW_CHARS = 220;

/**
 * Teto de chamadas ao modelo por rodada. O dia a dia são poucos emails; o
 * teto é para o dia em que um resgate de 90 dias vincula dezenas de uma vez —
 * o resto fica para as rodadas seguintes, a cada 15 minutos.
 */
const CLASSIFY_BATCH = 20;

/** Chamadas simultâneas: rápido o bastante sem esbarrar no limite da API. */
const CLASSIFY_PARALLEL = 4;

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly config: ImapConfig | null;
  private running = false;
  private classifying = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly applications: ApplicationService,
    private readonly classifier: EmailClassifierService,
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
      const classified = await this.classifyPending();

      this.logger.log(
        `Sincronização: ${mails.length} lidos, ${stored} novos, ${linked} vinculados, ${relinked} revinculados, ${classified} classificados em ${Date.now() - started}ms`,
      );

      return {
        fetched: mails.length,
        stored,
        linked,
        relinked,
        classified,
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
      // Candidatura nova, contexto novo: o email volta para a fila e é lido
      // de novo com a empresa e o status certos.
      data: {
        applicationId,
        profileId: application.profileId,
        ...unclassified,
      },
    });

    // Sem esperar: vincular é um clique e não pode demorar o que o modelo
    // demora. A sugestão aparece na candidatura assim que ficar pronta.
    void this.classifyPending().catch((error: unknown) =>
      this.logger.warn(
        `Classificação após vincular o email ${id} (candidatura ${applicationId}) falhou: ${describe(error)}`,
      ),
    );
  }

  async unlink(id: string): Promise<void> {
    await this.prisma.emailMessage.update({
      where: { id },
      data: { applicationId: null, ...unclassified },
    });
  }

  /**
   * Lê os emails vinculados que ainda não foram lidos.
   *
   * Só VINCULADOS, e isso é o filtro da seção 4: um email só chega aqui se
   * entrou pelo rótulo do Gmail e casou com uma candidatura sua. A caixa
   * inteira nunca sai da máquina, e os alertas de vaga também não — digest
   * não é notícia de processo nenhum.
   */
  async classifyPending(): Promise<number> {
    if (!this.classifier.configured || this.classifying) {
      return 0;
    }

    this.classifying = true;

    try {
      const pending = await this.prisma.emailMessage.findMany({
        where: {
          processedAt: null,
          fromAddress: { notIn: [...JOB_DIGEST_SENDERS] },
          application: { is: active },
        },
        orderBy: { receivedAt: 'asc' },
        take: CLASSIFY_BATCH,
        select: {
          id: true,
          applicationId: true,
          subject: true,
          fromName: true,
          fromAddress: true,
          bodyText: true,
          application: {
            select: {
              status: true,
              job: { select: { company: true, title: true } },
            },
          },
        },
      });

      let classified = 0;

      for (let start = 0; start < pending.length; start += CLASSIFY_PARALLEL) {
        const chunk = pending.slice(start, start + CLASSIFY_PARALLEL);
        const outcomes = await Promise.allSettled(
          chunk.map(async (email) => {
            const application = email.application!;
            const verdict = await this.classifier.classify({
              subject: email.subject,
              fromName: email.fromName,
              fromAddress: email.fromAddress,
              bodyText: email.bodyText,
              company: application.job.company,
              title: application.job.title,
              current: application.status,
            });

            if (!verdict) {
              // Resposta fora do schema é do email, não da API: tentar de novo
              // daria o mesmo. Fica marcado como lido, sem sugestão.
              this.logger.warn(
                `Email ${email.id} (candidatura ${email.applicationId}) sem classificação válida`,
              );
            }

            await this.prisma.emailMessage.update({
              where: { id: email.id },
              data: {
                processedAt: new Date(),
                suggestedStatus:
                  verdict && verdict.status !== 'nenhum'
                    ? verdict.status
                    : null,
                suggestionNote: verdict?.motivo ?? null,
              },
            });
          }),
        );

        classified += outcomes.filter(
          (outcome) => outcome.status === 'fulfilled',
        ).length;

        const failure = outcomes.find(
          (outcome) => outcome.status === 'rejected',
        );

        if (failure) {
          // API fora, sem crédito, limite: insistir agora só repete o erro.
          // O que sobrou continua com `processedAt` nulo e volta na próxima
          // rodada.
          const reason: unknown = failure.reason;

          this.logger.warn(
            reason instanceof ClassifierUnavailableError
              ? `Classificação interrompida: ${reason.message}`
              : `Classificação interrompida: ${describe(reason)}`,
          );
          break;
        }
      }

      return classified;
    } finally {
      this.classifying = false;
    }
  }

  /** As sugestões que ainda são notícia, no máximo uma por candidatura. */
  async suggestions(profileId: string): Promise<StatusSuggestion[]> {
    const rows = await this.prisma.emailMessage.findMany({
      where: {
        suggestedStatus: { not: null },
        suggestionResolvedAt: null,
        application: { is: { profileId, ...active } },
      },
      select: {
        id: true,
        applicationId: true,
        subject: true,
        receivedAt: true,
        suggestedStatus: true,
        suggestionNote: true,
        application: {
          select: {
            status: true,
            statusEvents: {
              where: { fromStatus: { not: null } },
              orderBy: { occurredAt: 'desc' },
              take: 1,
              select: { occurredAt: true },
            },
          },
        },
      },
    });

    const picked = pickSuggestions(
      rows.map((row) => ({
        ...row,
        emailId: row.id,
        applicationId: row.applicationId!,
        suggested: row.suggestedStatus!,
        current: row.application!.status,
        lastTransitionAt: row.application!.statusEvents[0]?.occurredAt ?? null,
      })),
    );

    return picked.map((row) => ({
      emailId: row.emailId,
      applicationId: row.applicationId,
      toStatus: row.suggested,
      note: row.suggestionNote,
      subject: row.subject,
      receivedAt: row.receivedAt.toISOString(),
    }));
  }

  /**
   * Você confirmou: a sugestão vira status.
   *
   * Pelo `ApplicationService.update()`, o único lugar que muda status, com o
   * evento marcado como `ia`, apontando para o email e datado de quando o
   * email CHEGOU — é quando a empresa respondeu, e é o que o tempo até a
   * primeira resposta mede.
   *
   * A sugestão é reivindicada antes, num `updateMany` condicional: dois
   * cliques seguidos não gravam dois eventos.
   */
  async acceptSuggestion(id: string): Promise<Application> {
    const email = await this.prisma.emailMessage.findUnique({
      where: { id },
      select: {
        applicationId: true,
        suggestedStatus: true,
        receivedAt: true,
      },
    });

    if (!email?.applicationId || !email.suggestedStatus) {
      throw new NotFoundException({
        error: 'Not Found',
        message: 'Sugestão não encontrada',
      });
    }

    await this.claimSuggestion(id);

    try {
      return await this.applications.update(
        email.applicationId,
        { status: email.suggestedStatus },
        {
          source: 'ia',
          emailMessageId: id,
          occurredAt: email.receivedAt,
        },
      );
    } catch (error) {
      // O status não mudou, então a sugestão não foi resolvida.
      await this.prisma.emailMessage.update({
        where: { id },
        data: { suggestionResolvedAt: null },
      });

      throw error;
    }
  }

  async dismissSuggestion(id: string): Promise<void> {
    await this.claimSuggestion(id);
  }

  private async claimSuggestion(id: string): Promise<void> {
    const { count } = await this.prisma.emailMessage.updateMany({
      where: {
        id,
        suggestedStatus: { not: null },
        suggestionResolvedAt: null,
      },
      data: { suggestionResolvedAt: new Date() },
    });

    if (count === 0) {
      throw new ConflictException({
        error: 'Conflict',
        message: 'Esta sugestão já foi resolvida.',
      });
    }
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
        orderBy: { occurredAt: 'asc' },
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
        // Quando ACONTECEU, não quando foi registrado — é o que a linha do
        // tempo existe para mostrar.
        at: event.occurredAt.toISOString(),
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

/** Volta o email para a fila de classificação, sem sugestão pendente. */
const unclassified = {
  processedAt: null,
  suggestedStatus: null,
  suggestionNote: null,
  suggestionResolvedAt: null,
} as const;

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
