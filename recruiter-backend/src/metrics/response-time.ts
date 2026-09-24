import type { ApplicationStatus } from '@recruit/shared';

/**
 * Tempo até a primeira resposta.
 *
 * A métrica mais óbvia de um funil, e a única que o painel não conseguia
 * calcular: com só `createdAt`, ela mediria quando você CLICOU. Com
 * `occurredAt`, mede quando a empresa respondeu.
 *
 * Pura e sem banco, como o resto do cálculo do painel.
 */

export interface TimedApplication {
  appliedAt: Date | null;
  events: { toStatus: ApplicationStatus; occurredAt: Date }[];
}

/** Qualquer movimento além de `aplicado` é resposta — inclusive a recusa. */
const NOT_A_RESPONSE: ReadonlySet<ApplicationStatus> = new Set([
  'rascunho',
  'aplicado',
]);

const DAY_MS = 24 * 60 * 60 * 1000;

export function responseTime(applications: TimedApplication[]): {
  medianDays: number | null;
  sample: number;
} {
  const days: number[] = [];

  for (const application of applications) {
    const start = appliedMoment(application);

    // Rascunho não tem relógio: sem envio, não há o que a empresa responder.
    if (!start) {
      continue;
    }

    const response = application.events
      .filter((event) => !NOT_A_RESPONSE.has(event.toStatus))
      .map((event) => event.occurredAt)
      // Resposta ANTES do envio é dado errado, não resposta instantânea. Contar
      // com zero ou negativo puxaria a mediana para baixo em silêncio.
      .filter((at) => at.getTime() >= start.getTime())
      .sort((a, b) => a.getTime() - b.getTime())[0];

    if (response) {
      days.push((response.getTime() - start.getTime()) / DAY_MS);
    }
  }

  return { medianDays: median(days), sample: days.length };
}

/**
 * Quando a candidatura foi enviada.
 *
 * `appliedAt` quando você informou; senão, o primeiro evento `aplicado`. O
 * `createdAt` da candidatura NÃO entra: é quando você registrou, e registrar
 * no fim de semana uma candidatura de segunda-feira inflaria o prazo.
 */
function appliedMoment(application: TimedApplication): Date | null {
  if (application.appliedAt) {
    return application.appliedAt;
  }

  const applied = application.events
    .filter((event) => event.toStatus === 'aplicado')
    .map((event) => event.occurredAt)
    .sort((a, b) => a.getTime() - b.getTime());

  return applied[0] ?? null;
}

/**
 * Mediana, não média: um processo que ficou três meses parado puxaria a média
 * para longe do que acontece normalmente, e a pergunta é "quanto costuma
 * demorar", não "quanto demorou em média".
 */
function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  const value =
    sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];

  // Uma casa: "4,3 dias" é informação, "4,2916 dias" é ruído.
  return Math.round(value * 10) / 10;
}
