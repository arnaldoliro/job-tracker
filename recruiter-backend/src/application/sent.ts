import type { ApplicationStatus } from '@recruit/shared';

/**
 * Quando uma candidatura passou a ser "enviada", para fins de currículo.
 *
 * O §3 pede que `ResumeVersion` diga o que a EMPRESA recebeu. Rascunho não foi
 * a lugar nenhum: congelar o currículo na criação do rascunho registrava a
 * versão de quando você anotou a vaga, não a de quando mandou — e, entre os
 * dois, é justamente quando se adapta o currículo para a vaga.
 *
 * `cancelado` não conta: a vaga sumiu, e de rascunho para cancelado nada foi
 * enviado. `rejeitado` conta: ser recusado pressupõe ter se candidatado.
 */
const SENT_STATUSES: ReadonlySet<ApplicationStatus> = new Set([
  'aplicado',
  'triagem',
  'entrevista',
  'teste',
  'oferta',
  'rejeitado',
]);

export interface SentFacts {
  status: ApplicationStatus;
  appliedAt: Date | null;
  /** `toStatus` dos eventos já gravados. */
  reached: readonly ApplicationStatus[];
}

export function hasBeenSent(facts: SentFacts): boolean {
  return (
    SENT_STATUSES.has(facts.status) ||
    facts.appliedAt !== null ||
    facts.reached.some((status) => SENT_STATUSES.has(status))
  );
}

/**
 * Se esta mudança é o envio: antes não contava como enviada, depois conta.
 *
 * Só nesse instante o currículo é congelado. Uma mudança posterior (triagem,
 * entrevista, até voltar para rascunho) não mexe na versão: ela é o registro
 * do que foi enviado, e reescrevê-la apagaria esse registro.
 */
export function isSending(before: SentFacts, after: SentFacts): boolean {
  return !hasBeenSent(before) && hasBeenSent(after);
}
