import { APPLICATION_STATUSES } from '@recruit/shared';
import type { ApplicationStatus } from '@recruit/shared';

/**
 * Quais sugestões de status ainda valem a pena mostrar.
 *
 * O modelo lê o email e diz o que ele significa. Se isso ainda é notícia é
 * outra pergunta, e não é dele: depende do que aconteceu com a candidatura
 * depois que o email chegou. Função pura, porque é aqui que mora o erro que
 * não dá erro — uma sugestão velha pedindo para desfazer o que você já fez.
 */

export interface SuggestionFacts {
  emailId: string;
  applicationId: string;
  suggested: ApplicationStatus;
  receivedAt: Date;
  current: ApplicationStatus;
  /**
   * A última TRANSIÇÃO da candidatura — evento com `fromStatus`. O evento de
   * criação não conta: registrar a candidatura depois de receber a recusa é
   * a ordem comum, e não quer dizer que você leu a recusa.
   */
  lastTransitionAt: Date | null;
}

export function isActionable(facts: SuggestionFacts): boolean {
  if (facts.suggested === facts.current) {
    return false;
  }

  // Encerrada. Reabrir um processo é raro o bastante para ser à mão.
  if (facts.current === 'rejeitado') {
    return false;
  }

  // Você mexeu no status depois que o email chegou: já leu a notícia.
  if (facts.lastTransitionAt && facts.lastTransitionAt >= facts.receivedAt) {
    return false;
  }

  // Um email antigo não puxa a candidatura para trás no funil. Rejeição é a
  // exceção: ela encerra a partir de qualquer etapa.
  if (
    facts.suggested !== 'rejeitado' &&
    depth(facts.suggested) <= depth(facts.current)
  ) {
    return false;
  }

  return true;
}

/**
 * Uma sugestão por candidatura: a do email mais recente que ainda vale.
 *
 * Filtra ANTES de escolher. Escolhendo primeiro, um email novo e irrelevante
 * esconderia um mais antigo que ainda é notícia.
 */
export function pickSuggestions<T extends SuggestionFacts>(rows: T[]): T[] {
  const newestFirst = [...rows].sort(
    (a, b) => b.receivedAt.getTime() - a.receivedAt.getTime(),
  );
  const seen = new Set<string>();
  const picked: T[] = [];

  for (const row of newestFirst) {
    if (seen.has(row.applicationId) || !isActionable(row)) {
      continue;
    }

    seen.add(row.applicationId);
    picked.push(row);
  }

  return picked;
}

function depth(status: ApplicationStatus): number {
  return APPLICATION_STATUSES.indexOf(status);
}
