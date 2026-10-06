import type { DayCount, SourceYield } from '@recruit/shared';

/**
 * As duas métricas novas, puras e testáveis sem banco.
 */

/** Dias que a série cobre. Curto o bastante para caber numa tela estreita. */
export const SERIES_DAYS = 60;

export interface SeenJob {
  url: string;
  source: string;
}

/**
 * Quanto cada fonte rende do que ela mostra.
 *
 * `saved` e `applied` contam SÓ vagas presentes em `seen`. É o que garante que
 * o numerador nunca ultrapasse o denominador: uma vaga salva antes desta
 * medição existir não tem como entrar em `seen`, e contá-la produziria uma
 * taxa acima de 100% sem nada acusar.
 *
 * A fonte vem do registro de exibição, e não do `Job.source`: o `Job` guarda
 * `manual` quando veio de email ou de link colado, e isso não é portal.
 */
export function buildSourceYield(
  seen: SeenJob[],
  savedUrls: string[],
  appliedUrls: string[],
): SourceYield[] {
  const sourceByUrl = new Map(seen.map((job) => [job.url, job.source]));
  const tally = new Map<string, SourceYield>();

  for (const job of seen) {
    const row = tally.get(job.source) ?? {
      source: job.source,
      seen: 0,
      saved: 0,
      applied: 0,
    };

    row.seen += 1;
    tally.set(job.source, row);
  }

  const count = (urls: string[], field: 'saved' | 'applied'): void => {
    // `Set` porque a mesma URL pode aparecer duas vezes — salva e candidatada.
    for (const url of new Set(urls)) {
      const source = sourceByUrl.get(url);
      const row = source === undefined ? undefined : tally.get(source);

      if (row) {
        row[field] += 1;
      }
    }
  };

  count(savedUrls, 'saved');
  count(appliedUrls, 'applied');

  return [...tally.values()].sort((a, b) => b.seen - a.seen);
}

/**
 * Emails por dia, com os dias vazios preenchidos com zero.
 *
 * O preenchimento não é enfeite: uma série que omite os dias sem email desenha
 * uma linha ligando 8 de setembro a 15 como se fosse contínua, e o gráfico
 * passa a mentir sobre o ritmo — que é exatamente o que ele existe para
 * mostrar.
 */
export function buildDailySeries(
  dates: Date[],
  days: number,
  today = new Date(),
): DayCount[] {
  const tally = new Map<string, number>();

  for (const date of dates) {
    const key = isoDay(date);

    tally.set(key, (tally.get(key) ?? 0) + 1);
  }

  const series: DayCount[] = [];

  for (let back = days - 1; back >= 0; back -= 1) {
    const day = new Date(today);

    day.setUTCDate(day.getUTCDate() - back);

    const key = isoDay(day);

    series.push({ date: key, count: tally.get(key) ?? 0 });
  }

  return series;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
