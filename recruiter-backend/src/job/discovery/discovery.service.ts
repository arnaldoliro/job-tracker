import { Injectable, Logger } from '@nestjs/common';
import type {
  DiscoverResult,
  JobPreferences,
  JobSearchResult,
} from '@recruit/shared';
import { AshbySource } from './sources/ashby';
import { GreenhouseSource } from './sources/greenhouse';
import { GupySource } from './sources/gupy';
import { LeverSource } from './sources/lever';
import { RemoteOkSource, RemotiveSource } from './sources/remote-boards';
import { fold } from './normalize';
import type { DiscoverySource } from './provider';
import { scoreJob, sortKey } from './scoring';

/**
 * Junta as fontes, filtra, ordena e fatia.
 *
 * Roda dentro da requisição, e não numa fila. É o certo por enquanto: medido,
 * onze boards em paralelo levam 2,9 segundos, e o resultado fica em cache por
 * 15 minutos — então só a primeira busca da sessão espera. Fila entra quando
 * houver varredura agendada rodando sem ninguém na tela.
 */

const BATCH_SIZE = 20;

/** Vagas mudam em dias, não em minutos. */
const CACHE_TTL_MS = 15 * 60 * 1000;

/** Uma fonte lenta não pode segurar o lote inteiro. */
const SOURCE_DEADLINE_MS = 15_000;

interface CacheEntry {
  at: number;
  items: JobSearchResult[];
  failed: string[];
}

@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);

  private readonly sources: DiscoverySource[] = [
    new GupySource(),
    new GreenhouseSource(),
    new AshbySource(),
    new LeverSource(),
    new RemoteOkSource(),
    new RemotiveSource(),
  ];

  private readonly cache = new Map<string, CacheEntry>();

  async discover(params: {
    q?: string;
    skills: string[];
    preferences: JobPreferences;
    excludedUrls: Set<string>;
    cursor?: string;
  }): Promise<DiscoverResult> {
    const { items, failed } = await this.collect(params.q);

    const eligible = items.filter((job) => matches(job, params.preferences));

    const ranked = eligible
      .map((job) => ({
        job,
        key: sortKey(job, scoreJob(job, params.skills, params.preferences)),
      }))
      .sort((a, b) => (a.key < b.key ? -1 : 1));

    const unseen = ranked.filter(
      ({ job }) => !params.excludedUrls.has(job.url),
    );

    // Chave ordenável, e não deslocamento: o usuário descarta vagas entre uma
    // requisição e a seguinte, o conjunto encolhe, e um deslocamento numérico
    // pularia em silêncio tantas vagas quantas foram removidas.
    const after = params.cursor
      ? unseen.filter(({ key }) => key > params.cursor!)
      : unseen;

    const page = after.slice(0, BATCH_SIZE);
    const last = page.at(-1);

    return {
      items: page.map(({ job }) => job),
      nextCursor: after.length > page.length && last ? last.key : null,
      total: eligible.length,
      exhausted:
        page.length > 0 ? null : eligible.length > 0 ? 'nada-novo' : 'fim',
      failedSources: failed,
    };
  }

  /**
   * Busca em todas as fontes, com cache por termo.
   *
   * `Promise.allSettled` com prazo por fonte: um board fora do ar ou lento vira
   * um nome na lista de falhas, e a tela mostra que a cobertura foi parcial em
   * vez de fingir que o acervo é aquele.
   */
  private async collect(
    q?: string,
  ): Promise<{ items: JobSearchResult[]; failed: string[] }> {
    const key = fold(q ?? '');
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return { items: cached.items, failed: cached.failed };
    }

    const started = Date.now();

    const settled = await Promise.allSettled(
      this.sources.map((source) => withDeadline(source, q)),
    );

    const items: JobSearchResult[] = [];
    const failed: string[] = [];
    const byUrl = new Set<string>();

    settled.forEach((outcome, index) => {
      const source = this.sources[index];

      if (outcome.status === 'rejected') {
        failed.push(source.name);
        this.logger.warn(
          `Fonte ${source.name} falhou: ${describe(outcome.reason)}`,
        );

        return;
      }

      for (const job of outcome.value) {
        // A mesma vaga aparece em mais de uma fonte — o RemoteOK republica
        // anúncio que também está no board da empresa.
        if (byUrl.has(job.url)) {
          continue;
        }

        byUrl.add(job.url);
        items.push(job);
      }
    });

    this.logger.log(
      `Descoberta: ${items.length} vagas de ${this.sources.length - failed.length}/${this.sources.length} fontes em ${Date.now() - started}ms`,
    );

    const entry: CacheEntry = { at: Date.now(), items, failed };

    this.cache.set(key, entry);

    return { items, failed };
  }
}

async function withDeadline(
  source: DiscoverySource,
  q?: string,
): Promise<JobSearchResult[]> {
  return Promise.race([
    source.fetch({ q }),
    new Promise<never>((_resolve, reject) =>
      setTimeout(
        () => reject(new Error(`prazo de ${SOURCE_DEADLINE_MS}ms estourado`)),
        SOURCE_DEADLINE_MS,
      ).unref(),
    ),
  ]);
}

/**
 * Corte pelas preferências.
 *
 * Preferência ELIMINA, currículo ORDENA — são coisas diferentes de propósito.
 * E campo que a vaga não declarou PASSA: cortar em silêncio esconde vaga boa
 * por defeito do portal, e o usuário não fica sabendo do que perdeu.
 */
function matches(job: JobSearchResult, preferences: JobPreferences): boolean {
  const title = fold(job.title);

  if (preferences.titleExcludes.some((term) => title.includes(fold(term)))) {
    return false;
  }

  if (
    preferences.titleIncludes.length > 0 &&
    !preferences.titleIncludes.some((term) => title.includes(fold(term)))
  ) {
    return false;
  }

  if (
    job.workModel !== null &&
    preferences.workModels.length > 0 &&
    !preferences.workModels.includes(job.workModel)
  ) {
    return false;
  }

  if (
    job.contractType !== null &&
    preferences.contractTypes.length > 0 &&
    !preferences.contractTypes.includes(job.contractType)
  ) {
    return false;
  }

  return withinScope(job, preferences);
}

function withinScope(
  job: JobSearchResult,
  preferences: JobPreferences,
): boolean {
  if (preferences.scope === 'ambos') {
    return true;
  }

  const isBrazil = job.location ? /bra[sz]il/i.test(job.location) : null;

  // Localização não reconhecida passa, pela mesma regra acima. Na prática é
  // raro: quase toda vaga declara cidade ou país em algum formato.
  if (isBrazil === null) {
    return true;
  }

  return preferences.scope === 'brasil' ? isBrazil : !isBrazil;
}

function describe(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
