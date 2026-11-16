/**
 * Candidaturas por fonte: puro, para ser testável sem banco.
 */

export interface SentFacts {
  /** Status atual. */
  status: string;
  /** Data de envio. Só é preenchida para candidatura enviada. */
  appliedAt: Date | null;
  /** Todos os status por onde passou, pelos `StatusEvent`. */
  reached: string[];
}

/**
 * A candidatura chegou a ser enviada à empresa.
 *
 * Rascunho nunca enviado não conta: contá-lo por fonte diria que um portal
 * rendeu candidaturas que você nem mandou.
 *
 * Mas o status atual sozinho não basta (§3: métricas derivam do histórico).
 * Uma candidatura enviada que voltou a `rascunho` — existe no banco real o
 * laço `rejeitado → rascunho → rejeitado` — foi recebida pela empresa, e a
 * fonte rendeu aquela candidatura. Por isso conta como enviada quem tem data
 * de envio ou passou por qualquer status além de `rascunho`. Rejeitadas e
 * canceladas também: saíram do funil, mas a empresa recebeu.
 */
export function isSent(facts: SentFacts): boolean {
  return (
    facts.status !== 'rascunho' ||
    facts.appliedAt !== null ||
    facts.reached.some((status) => status !== 'rascunho')
  );
}

export function countBySource(
  rows: (SentFacts & { job: { source: string | null } })[],
): { source: string; count: number }[] {
  const tally = new Map<string, number>();

  for (const row of rows) {
    if (!isSent(row)) {
      continue;
    }

    // Nulo vira `desconhecido`, NUNCA é filtrado fora: descartar faz o total
    // parar de fechar com as enviadas sem que nada acuse.
    //
    // E não vira `manual`: `manual` é o que o código grava quando VOCÊ colou um
    // link ou criou a partir de um email. Juntar os dois apagaria a diferença
    // entre "cadastrei à mão" e "a coluna estava vazia".
    const source = row.job.source ?? 'desconhecido';

    tally.set(source, (tally.get(source) ?? 0) + 1);
  }

  return [...tally.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);
}
