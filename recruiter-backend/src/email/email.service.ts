import {
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  Application,
  ApplyResolutionsInput,
  ApplyResolutionsResult,
  CreateApplicationFromEmailInput,
  EmailMessage,
  EmailResolution,
  EmailStatusVerdict,
  EmailStatus,
  EmailSyncResult,
  StatusSuggestion,
  TimelineEntry,
} from '@recruit/shared';
import { active } from '../application/active';
import { ApplicationService } from '../application/application.service';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { isJobDigestSender, JOB_DIGEST_SENDERS } from './ats';
import { AiUnavailableError } from '../ai/ai-errors';
import { toHttpException } from '../ai/ai-http';
import { classify, companyGuess } from './confirmation';
import { EmailClassifierService } from './email-classifier.service';
import { EmailResolverService } from './email-resolver.service';
import { excerpt, gmailUrl } from './email-text';
import { fetchSince, ImapError, type ImapConfig } from './imap.client';
import {
  matchByCompany,
  matchByThread,
  type Candidate,
  type MailFacts,
} from './matcher';
import {
  MAX_LISTED,
  toResolution,
  type ListedApplication,
} from './resolve-plan';
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

/** O bastante para o card dizer do que o email trata sem abrir o Gmail. */
const PREVIEW_CHARS = 420;

/** Chamadas simultâneas ao modelo em "Resolver por IA". */
const RESOLVE_PARALLEL = 4;

/**
 * Teto de chamadas ao modelo por rodada. O dia a dia são poucos emails; o
 * teto é para o dia em que um resgate de 90 dias vincula dezenas de uma vez —
 * o resto fica para as sincronizações seguintes.
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
  private resolving = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly applications: ApplicationService,
    private readonly classifier: EmailClassifierService,
    private readonly resolver: EmailResolverService,
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

    // Botão e boot não podem se sobrepor: seriam duas conexões IMAP
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
    senderVerified: boolean;
  }): Promise<'stored' | 'linked' | 'skipped'> {
    // Global, e não pelo `@@unique([profileId, messageId])`: aquele índice é
    // por perfil, e o mesmo email entraria duas vezes se o perfil de espera
    // mudasse entre execuções.
    const known = await this.prisma.emailMessage.findFirst({
      where: { messageId: mail.messageId },
      select: { id: true, senderVerified: true },
    });

    if (known) {
      // Email guardado antes de a verificação existir: a releitura é a
      // chance de descobrir. Sem isto ele ficaria "não se sabe" para sempre,
      // porque a deduplicação pula antes de qualquer outra coisa.
      if (known.senderVerified === null) {
        await this.prisma.emailMessage.update({
          where: { id: known.id },
          data: { senderVerified: mail.senderVerified },
        });
      }

      return 'skipped';
    }

    // Remetente não confirmado não é vinculado sozinho: é o vínculo que
    // manda o email para o modelo. Ele fica na caixa de não vinculados, com
    // o aviso, e você decide.
    const match = mail.senderVerified ? await this.findApplication(mail) : null;
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
          senderVerified: mail.senderVerified,
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
        senderVerified: true,
        // Você tirou da tela: não volta sozinho para dentro de uma candidatura.
        dismissedAt: null,
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
        dismissedAt: null,
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
          preview: excerpt(row.bodyText, PREVIEW_CHARS),
          gmailUrl: gmailUrl(row.messageId, this.config),
          companyGuess: companyGuess(
            row.fromName,
            row.fromAddress,
            row.subject,
          ),
          senderVerified: row.senderVerified === true,
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
   * Só VINCULADOS e de remetente CONFIRMADO, e isso é o filtro da seção 4:
   * um email só chega aqui se entrou pelo rótulo do Gmail, casou com uma
   * candidatura sua e o servidor atestou quem o enviou. A caixa
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
          // Vale também para o email que VOCÊ vinculou à mão: o vínculo diz a
          // qual candidatura ele pertence, não que o texto dele é confiável.
          senderVerified: true,
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
            reason instanceof AiUnavailableError
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
              select: { toStatus: true, occurredAt: true },
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
        events: row.application!.statusEvents,
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
   * Tira um email da tela de pendentes.
   *
   * Só email sem candidatura: o que já está vinculado não aparece nessa tela,
   * e descartá-lo esconderia um item do histórico de uma candidatura.
   */
  async dismiss(id: string): Promise<void> {
    const { count } = await this.prisma.emailMessage.updateMany({
      where: { id, applicationId: null },
      data: { dismissedAt: new Date() },
    });

    if (count === 0) {
      throw new NotFoundException({
        error: 'Not Found',
        message: 'Email não encontrado entre os pendentes.',
      });
    }
  }

  async undismiss(id: string): Promise<void> {
    await this.prisma.emailMessage.updateMany({
      where: { id },
      data: { dismissedAt: null },
    });
  }

  /**
   * "Resolver por IA": um plano para os emails escolhidos. NÃO grava nada.
   *
   * Três tipos de email nunca chegam ao modelo, e voltam como "nada a fazer"
   * com o motivo: não identificado (você pediu, e é o que o texto não
   * sustenta como email de candidatura), alerta de vagas, e remetente não
   * confirmado — este último é a regra de `sender-auth.ts`: texto de quem
   * pode ter forjado o "De" não vai para o modelo.
   */
  async resolve(
    profileId: string,
    emailIds: string[],
  ): Promise<EmailResolution[]> {
    if (!this.resolver.configured) {
      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        message: this.resolver.unavailableMessage,
      });
    }

    // Cada rodada são até 20 chamadas pagas. Duas ao mesmo tempo é clique
    // duplo, não intenção.
    if (this.resolving) {
      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        message: 'Já existe uma resolução por IA em andamento.',
      });
    }

    this.resolving = true;

    try {
      await this.assertProfile(profileId);

      const ids = [...new Set(emailIds)];
      const [rows, applications] = await Promise.all([
        this.prisma.emailMessage.findMany({
          where: { id: { in: ids }, applicationId: null, dismissedAt: null },
          select: {
            id: true,
            subject: true,
            fromName: true,
            fromAddress: true,
            bodyText: true,
            senderVerified: true,
          },
        }),
        this.listedApplications(profileId),
      ]);
      const byId = new Map(rows.map((row) => [row.id, row]));
      const plan = new Map<string, EmailResolution>();
      const toAsk: typeof rows = [];

      for (const id of ids) {
        const row = byId.get(id);
        const skipped = row
          ? whyNotAsk(row)
          : 'Este email não está mais pendente.';

        if (skipped || !row) {
          plan.set(id, skip(id, skipped ?? ''));
        } else {
          toAsk.push(row);
        }
      }

      for (let start = 0; start < toAsk.length; start += RESOLVE_PARALLEL) {
        const chunk = toAsk.slice(start, start + RESOLVE_PARALLEL);
        const outcomes = await Promise.allSettled(
          chunk.map((row) => this.resolver.decide(row, applications)),
        );

        outcomes.forEach((outcome, index) => {
          const row = chunk[index];

          if (outcome.status === 'rejected') {
            throw outcome.reason;
          }

          plan.set(
            row.id,
            outcome.value
              ? toResolution(row, applications, outcome.value)
              : skip(row.id, 'A IA não devolveu uma resposta válida.'),
          );
        });
      }

      return ids.map((id) => plan.get(id)!);
    } catch (error) {
      if (error instanceof AiUnavailableError) {
        // A mensagem diz o que fazer conforme o provedor: crédito e chave na
        // Anthropic; subir o Ollama ou baixar o modelo no local.
        this.logger.warn(`Resolver por IA interrompido: ${error.message}`);

        throw toHttpException(error, 'resolve');
      }

      throw error;
    } finally {
      this.resolving = false;
    }
  }

  /**
   * Executa o que você aprovou do plano.
   *
   * O corpo veio do navegador, então cada item é conferido contra o banco
   * como uma ação manual: o email ainda está pendente, a candidatura existe e
   * é deste perfil. Item por item, sem transação única — uma falha não desfaz
   * os que deram certo, e volta em `failed` para a tela dizer qual foi.
   */
  async applyResolutions(
    input: ApplyResolutionsInput,
  ): Promise<ApplyResolutionsResult> {
    await this.assertProfile(input.profileId);

    const failed: ApplyResolutionsResult['failed'] = [];
    let applied = 0;

    // Do email mais antigo para o mais novo. A confirmação e a recusa do
    // mesmo processo chegam no mesmo plano, e é a última que diz em que pé a
    // candidatura está — fora de ordem, a recusa seria aplicada primeiro e o
    // histórico sairia ao contrário.
    const dates = await this.prisma.emailMessage.findMany({
      where: { id: { in: input.items.map((item) => item.emailId) } },
      select: { id: true, receivedAt: true },
    });
    const receivedAt = new Map(
      dates.map((row) => [row.id, row.receivedAt.getTime()]),
    );
    const items = [...input.items].sort(
      (a, b) =>
        (receivedAt.get(a.emailId) ?? 0) - (receivedAt.get(b.emailId) ?? 0),
    );

    for (const item of items) {
      try {
        const email = await this.prisma.emailMessage.findFirst({
          where: { id: item.emailId, applicationId: null, dismissedAt: null },
          select: { id: true, receivedAt: true, senderVerified: true },
        });

        if (!email) {
          throw new NotFoundException({
            error: 'Not Found',
            message: 'Este email não está mais pendente.',
          });
        }

        // Status vindo de leitura de modelo só vale para remetente
        // confirmado — a mesma regra da sugestão automática.
        if (item.status && email.senderVerified !== true) {
          throw new ConflictException({
            error: 'Conflict',
            message: 'Remetente não confirmado: o status não foi alterado.',
          });
        }

        const applicationId =
          item.action === 'link'
            ? await this.ownedApplication(item.applicationId, input.profileId)
            : await this.findOrCreate(input.profileId, item, email.receivedAt);

        await this.prisma.emailMessage.update({
          where: { id: email.id },
          data: {
            applicationId,
            profileId: input.profileId,
            // Já foi lido pelo modelo nesta rodada: marcar evita que a
            // próxima sincronização pague para ler de novo.
            processedAt: new Date(),
            suggestedStatus: item.status,
            suggestionNote: null,
            suggestionResolvedAt: item.status ? new Date() : null,
          },
        });

        if (item.status) {
          await this.moveStatus(applicationId, item.status, email);
        }

        applied += 1;
      } catch (error) {
        this.logger.warn(
          `Resolução do email ${item.emailId} falhou: ${describe(error)}`,
        );
        failed.push({ emailId: item.emailId, message: publicMessage(error) });
      }
    }

    return { applied, failed };
  }

  /**
   * A candidatura de um item "criar": a que já existe com essa empresa e esse
   * cargo, ou uma nova.
   *
   * Dois emails do mesmo processo propõem criar a mesma candidatura. Sem
   * procurar antes, o segundo bateria na regra de duplicata e ficaria de
   * fora — justamente o que traz o status mais recente.
   */
  private async findOrCreate(
    profileId: string,
    item: { company: string; title: string },
    appliedAt: Date,
  ): Promise<string> {
    const existing = await this.prisma.application.findFirst({
      where: {
        profileId,
        ...active,
        job: {
          company: { equals: item.company, mode: 'insensitive' },
          title: { equals: item.title, mode: 'insensitive' },
        },
      },
      select: { id: true },
    });

    if (existing) {
      return existing.id;
    }

    const created = await this.applications.create({
      profileId,
      company: item.company,
      title: item.title,
      status: 'aplicado',
      appliedAt: appliedAt.toISOString(),
    });

    return created.id;
  }

  /** Pelo `ApplicationService.update()`, como toda mudança de status. */
  private async moveStatus(
    applicationId: string,
    status: EmailStatusVerdict,
    email: { id: string; receivedAt: Date },
  ): Promise<void> {
    await this.applications.update(
      applicationId,
      { status },
      { source: 'ia', emailMessageId: email.id, occurredAt: email.receivedAt },
    );
  }

  private async ownedApplication(
    applicationId: string,
    profileId: string,
  ): Promise<string> {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, profileId, ...active },
      select: { id: true },
    });

    if (!application) {
      throw new NotFoundException({
        error: 'Not Found',
        message: 'Candidatura não encontrada neste perfil.',
      });
    }

    return application.id;
  }

  private async assertProfile(profileId: string): Promise<void> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { id: true },
    });

    if (!profile) {
      throw new NotFoundException({
        error: 'Not Found',
        message: 'Perfil não encontrado',
      });
    }
  }

  /** As candidaturas que o modelo vê, das mais recentes para as mais antigas. */
  private async listedApplications(
    profileId: string,
  ): Promise<ListedApplication[]> {
    const rows = await this.prisma.application.findMany({
      where: { profileId, ...active },
      orderBy: { updatedAt: 'desc' },
      take: MAX_LISTED,
      select: {
        id: true,
        status: true,
        job: { select: { company: true, title: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      company: row.job.company,
      title: row.job.title,
      status: row.status,
    }));
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

function skip(emailId: string, reason: string): EmailResolution {
  return {
    emailId,
    action: 'skip',
    applicationId: null,
    company: null,
    title: null,
    status: null,
    reason,
    grounded: false,
  };
}

/** Por que um email pendente não vai para o modelo, ou `null` se vai. */
function whyNotAsk(row: {
  subject: string;
  bodyText: string | null;
  fromAddress: string;
  senderVerified: boolean | null;
}): string | null {
  if (row.senderVerified !== true) {
    return 'Remetente não confirmado: o email não foi enviado à IA.';
  }

  const kind = classify(row.subject, row.bodyText);

  if (kind === 'alerta' || isJobDigestSender(row.fromAddress)) {
    return 'É um alerta de vagas, não um retorno de candidatura.';
  }

  if (kind === 'desconhecido') {
    return 'Não identificado como email de candidatura: não foi enviado à IA.';
  }

  return null;
}

/** A mensagem de um erro HTTP nosso; qualquer outro vira texto genérico. */
function publicMessage(error: unknown): string {
  if (error instanceof HttpException) {
    const body = error.getResponse();

    if (typeof body === 'object' && body !== null && 'message' in body) {
      const message: unknown = body.message;

      if (typeof message === 'string') {
        return message;
      }
    }
  }

  return 'Não foi possível aplicar esta ação.';
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
