import { Logger } from '@nestjs/common';
import { jobSearchResultSchema, type JobSearchResult } from '@recruit/shared';
import { JOB_DIGEST_SENDERS } from '../../../email/ats';
import type { PrismaService } from '../../../prisma/prisma.service';
import { parseLinkedInAlert, type AlertJob } from '../linkedin-alert';
import {
  fold,
  seniorityFromTitle,
  stackFromText,
  workModelFromText,
} from '../normalize';
import type { DiscoverySource } from '../provider';
import { parseEach } from '../provider';

/**
 * As vagas que o LinkedIn já te mandou por email.
 *
 * Única fonte que lê o banco em vez da rede, e a única que alcança o LinkedIn
 * sem tocar no LinkedIn — o §5 põe "job alerts por email" como fonte
 * PREFERENCIAL, acima dos feeds públicos, exatamente por isso.
 *
 * Custo medido de uma falha de cache: 0,04 ms por email, ~2 ms para a janela
 * inteira. Uma tabela de colheita por cron custaria migration, um segundo
 * agendador e um estado derivado que pode divergir da caixa — caro demais
 * para 2 ms.
 *
 * NÃO filtra por perfil, e isso é deliberado: existe uma conta de email e
 * vários perfis, todos do mesmo dono (§1). A diferenciação já acontece depois,
 * em `matches`, `scoreJob` e `resolvedUrls`. Filtrar aqui seria pior que
 * inútil — `placeholderProfile` recebe o remetente no lugar do destinatário,
 * então todo alerta cai no perfil padrão e o segundo perfil veria zero vagas,
 * para sempre, sem erro.
 */

/** Igual ao `FRESHNESS_WINDOW_DAYS` do scoring: além disso a vaga já foi. */
const WINDOW_DAYS = 45;

/** Acima disto, o formato provavelmente mudou. */
const DROP_ALARM = 0.2;

export class LinkedInAlertsSource implements DiscoverySource {
  readonly name = 'linkedin-alerts';

  /** Leitura local que demora 5 s está quebrada, não lenta. */
  readonly deadlineMs = 5_000;

  private readonly logger = new Logger(LinkedInAlertsSource.name);

  constructor(private readonly prisma: PrismaService) {}

  async fetch(): Promise<JobSearchResult[]> {
    // Domínio no SQL (barato), lista exata em JS (precisa). Um remetente
    // `linkedin.com` fora da lista é avisado em vez de ignorado: é o aviso
    // antecipado de que o LinkedIn mudou de endereço.
    const rows = await this.prisma.emailMessage.findMany({
      where: {
        fromAddress: { endsWith: 'linkedin.com', mode: 'insensitive' },
        receivedAt: { gte: daysAgo(WINDOW_DAYS) },
        bodyText: { not: null },
      },
      select: { fromAddress: true, receivedAt: true, bodyText: true },
      // Mais antigo primeiro: com isso "o primeiro vence" na deduplicação
      // abaixo é exatamente `min(receivedAt)`.
      orderBy: { receivedAt: 'asc' },
    });

    const firstSeen = new Map<string, { job: AlertJob; at: Date }>();
    const unknown = new Set<string>();

    let digests = 0;
    let anchors = 0;
    let dropped = 0;
    let uncertain = 0;
    let truncated = 0;

    for (const row of rows) {
      if (!JOB_DIGEST_SENDERS.includes(row.fromAddress)) {
        if (!isKnownLinkedInSender(row.fromAddress)) {
          unknown.add(row.fromAddress);
        }

        continue;
      }

      digests += 1;

      const parsed = parseLinkedInAlert(row.bodyText ?? '');

      anchors += parsed.anchors;
      dropped += parsed.dropped;
      uncertain += parsed.uncertain;
      truncated += parsed.truncated ? 1 : 0;

      for (const job of parsed.jobs) {
        // A mesma vaga reaparece em digests ao longo do ano. O primeiro vence,
        // então `postedAt` só envelhece — usar o mais recente faria uma vaga
        // republicada rejuvenescer e flutuar no topo para sempre.
        if (!firstSeen.has(job.id)) {
          firstSeen.set(job.id, { job, at: row.receivedAt });
        }
      }
    }

    const items = dropReposts(
      [...firstSeen.values()].map(({ job, at }) => toResult(job, at)),
    );

    this.report({
      digests,
      anchors,
      jobs: items.length,
      dropped,
      uncertain,
      truncated,
      unknown,
    });

    // O frontend faz `discoverResultSchema.parse()`, que LANÇA: um item
    // malformado apagaria a tela de vagas inteira, Greenhouse e Gupy junto.
    // Bug de parser custa uma vaga, não a página.
    return parseEach(items, (item) =>
      jobSearchResultSchema.safeParse(item).success
        ? (item as JobSearchResult)
        : null,
    ).ok;
  }

  /**
   * Zero vagas é indistinguível de "o filtro do Gmail não foi ampliado", de
   * "o LinkedIn mudou o layout" e de "está tudo certo e não havia nada". Cada
   * um tem uma frase diferente.
   */
  private report(s: {
    digests: number;
    anchors: number;
    jobs: number;
    dropped: number;
    uncertain: number;
    truncated: number;
    unknown: Set<string>;
  }): void {
    this.logger.log(
      `linkedin-alerts: ${s.digests} digests, ${s.anchors} âncoras, ${s.jobs} vagas, ${s.dropped} descartadas, ${s.uncertain} incertas`,
    );

    for (const address of s.unknown) {
      this.logger.warn(
        `remetente do LinkedIn fora da lista de digests: ${address}`,
      );
    }

    if (s.digests === 0) {
      this.logger.warn(
        'nenhum alerta do LinkedIn na janela — o filtro do Gmail pode não incluir jobalerts-noreply@linkedin.com.',
      );

      return;
    }

    if (s.anchors === 0) {
      this.logger.warn(
        'alertas encontrados mas nenhum link de vaga — o formato do digest pode ter mudado.',
      );

      return;
    }

    if (s.dropped / s.anchors > DROP_ALARM) {
      this.logger.warn(
        `${s.dropped} de ${s.anchors} blocos descartados — o formato do digest pode ter mudado.`,
      );
    }

    if (s.truncated > 0) {
      this.logger.warn(
        `${s.truncated} alertas no teto do corpo — vagas do fim do digest podem ter sido perdidas.`,
      );
    }
  }
}

/**
 * O alerta traz título, empresa, local e link. Não traz descrição — e buscar a
 * página da vaga para obtê-la fica fora: o `robots.txt` do LinkedIn é
 * `Disallow: /` e o contrato deles proíbe acesso automatizado, sem cláusula de
 * volume. O preço é `stack` sair só do título e estas vagas caírem no
 * `NO_STACK_PRIOR` da pontuação.
 */
function toResult(job: AlertJob, firstSeen: Date): JobSearchResult {
  return {
    company: job.company,
    title: job.title,
    url: job.url,
    source: 'linkedin-alerts',
    description: null,
    // Só o título. O nome da empresa NUNCA entra: uma empresa chamada "Node
    // Solutions" injetaria uma tag falsa que depois dirige `overlap()` e
    // `matchesTerm`. O vocabulário é fechado justamente para a tag não ser
    // escolhida por quem publica.
    stack: stackFromText(job.title),
    requirements: [],
    benefits: [],
    seniority: seniorityFromTitle(job.title),
    // Só o local, não o título: `matches()` ELIMINA com `workModel` não nulo,
    // então um `presencial` falso esconderia a vaga inteira. Na prática fica
    // quase sempre nulo, que é o estado honesto de "sem evidência".
    workModel: workModelFromText(job.location),
    contractType: null,
    location: job.location,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    weeklyHours: null,
    // Teto honesto: o LinkedIn só alerta sobre vaga nova, então a data do
    // primeiro digest que a citou é o mais velho que sabemos dela.
    postedAt: firstSeen.toISOString(),
  };
}

/**
 * Republicação: a MESMA vaga relistada ganha id novo no LinkedIn.
 *
 * Medido no lote real — "Jungle Gaming / Backend Developer Júnior — Go —
 * Remoto" apareceu três vezes, com ids diferentes e datas de 9, 16 e 18 de
 * setembro. Eram 3 grupos repetidos em 22 vagas, e o usuário vê cards
 * idênticos lado a lado.
 *
 * A chave é EXATA nos três campos, não difusa: empresa, cargo e local
 * idênticos. Duas aberturas genuínas com o mesmo cargo na mesma empresa E na
 * mesma cidade são muito mais raras que uma republicação — e o local no meio
 * da chave preserva "Desenvolvedor Júnior na Jobbol" em Salvador e em São
 * Paulo como vagas distintas, que é o certo.
 *
 * Fica a mais NOVA: republicar sugere que a anterior expirou ou foi fechada,
 * então o anúncio recente é o que ainda aceita candidatura.
 *
 * Só dentro desta fonte. Entre fontes diferentes isto seria perigoso — os
 * campos vêm de formatos distintos e fundir duas vagas reais é pior que
 * mostrar duas.
 */
function dropReposts(items: JobSearchResult[]): JobSearchResult[] {
  const best = new Map<string, JobSearchResult>();

  for (const item of items) {
    const key = [
      fold(item.company),
      fold(item.title),
      fold(item.location ?? ''),
    ].join('|');

    const current = best.get(key);

    if (!current || (item.postedAt ?? '') > (current.postedAt ?? '')) {
      best.set(key, item);
    }
  }

  return [...best.values()];
}

/** Remetentes do LinkedIn que já sabemos que não são digest de vagas. */
const KNOWN_NON_DIGEST = [
  'jobs-noreply@linkedin.com',
  'messages-noreply@linkedin.com',
  'notifications-noreply@linkedin.com',
  'invitations@linkedin.com',
  'updates-noreply@linkedin.com',
  'groups-noreply@linkedin.com',
  'newsletters-noreply@linkedin.com',
  'messaging-digest-noreply@linkedin.com',
];

function isKnownLinkedInSender(address: string): boolean {
  return KNOWN_NON_DIGEST.includes(address.trim().toLowerCase());
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
