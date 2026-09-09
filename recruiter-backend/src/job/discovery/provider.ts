import type { JobSearchResult } from '@recruit/shared';

/**
 * Uma fonte de vagas.
 *
 * Duas famílias vivem atrás desta mesma interface, e a diferença importa para
 * quem monta a watchlist:
 *
 *   por empresa   Greenhouse, Lever, Ashby — leem o board de uma empresa por
 *                 vez, então exigem lista de slugs. Precisão alta, volume baixo.
 *   por busca     Gupy, RemoteOK, Remotive — respondem a palavra-chave sobre o
 *                 acervo inteiro. Volume alto, sem curadoria.
 *
 * Sozinha, cada família falha no que a outra resolve.
 */
export interface DiscoverySource {
  /** Vai para `JobSearchResult.source` e para a mensagem de falha na tela. */
  readonly name: string;

  fetch(query: DiscoveryQuery): Promise<JobSearchResult[]>;
}

export interface DiscoveryQuery {
  /** Texto livre. As fontes por busca usam; as por empresa ignoram. */
  q?: string;
}

/**
 * Aplica um schema item a item, descartando o que não bate em vez de derrubar
 * a resposta inteira.
 *
 * É a forma prática da regra do §5: JSON de portal é dado externo, e um portal
 * que mude um campo não pode zerar a rodada. O que não valida some, e o
 * chamador registra quantos sumiram.
 */
export function parseEach<T>(
  items: unknown[],
  parse: (item: unknown) => T | null,
): { ok: T[]; dropped: number } {
  const ok: T[] = [];
  let dropped = 0;

  for (const item of items) {
    const parsed = parse(item);

    if (parsed === null) {
      dropped += 1;
      continue;
    }

    ok.push(parsed);
  }

  return { ok, dropped };
}
