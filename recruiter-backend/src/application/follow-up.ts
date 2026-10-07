import {
  FOLLOW_UP_DAYS,
  FOLLOW_UP_SNOOZE_DAYS,
  type ApplicationStatus,
  type FollowUpAction,
} from '@recruit/shared';

/**
 * Quando uma candidatura pede follow-up — sem estado novo além de
 * `nextFollowUpAt`, que só existe depois que você agiu sobre um lembrete.
 *
 * Em arquivo próprio e sem Prisma: é a regra que decide o que aparece na tela
 * "Hoje", e é onde um erro de data passaria despercebido. Separada, dá para
 * exercitar com datas fixas.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface FollowUpState {
  status: ApplicationStatus;
  /** Desde quando está neste status: a data do evento que a trouxe até ele. */
  since: Date;
  nextFollowUpAt: Date | null;
}

/** Quando o lembrete vence, ou `null` se este status não pede follow-up. */
export function followUpDueAt(state: FollowUpState): Date | null {
  const days = FOLLOW_UP_DAYS[state.status];

  if (days === null) {
    return null;
  }

  return (
    state.nextFollowUpAt ?? new Date(state.since.getTime() + days * DAY_MS)
  );
}

/** Dias inteiros desde `since`. Nunca negativo: data corrigida para o futuro conta como hoje. */
export function daysSince(since: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - since.getTime()) / DAY_MS));
}

/**
 * O próximo vencimento depois de agir sobre um lembrete.
 *
 * "Feito" recomeça o prazo do status a partir de agora: fez o follow-up de
 * uma candidatura parada em "aplicado", o próximo vem em dez dias se nada
 * mudar. "Adiar" é curto e igual para todos — é "agora não", não "nunca".
 */
export function nextFollowUpAfter(
  action: FollowUpAction,
  status: ApplicationStatus,
  now: Date,
): Date | null {
  const days =
    action === 'adiar' ? FOLLOW_UP_SNOOZE_DAYS : FOLLOW_UP_DAYS[status];

  return days === null ? null : new Date(now.getTime() + days * DAY_MS);
}
