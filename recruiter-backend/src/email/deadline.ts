/**
 * Prazo citado num email de processo seletivo, em dado estruturado.
 *
 * Duas regras guiam tudo aqui:
 *
 * - **Não inventar precisão.** "Até 28/11" não tem ano, e "até sexta" não tem
 *   data: ficam como texto, com estado `desconhecido`. Data sem hora é prazo
 *   do DIA (`dueDate`), nunca 00:00 nem 23:59. Só prazo relativo ("expira em
 *   48 horas") vira instante (`dueAt`), contado de quando o email chegou.
 * - **Prazo do email não é estado do portal.** Vencido quer dizer que a data
 *   citada passou, não que a etapa fechou: a tela diz isso, e a conta aqui
 *   não tenta adivinhar.
 *
 * O texto original sempre acompanha, como o email escreveu, para você
 * conferir o que o código entendeu.
 */

export type DeadlineState = 'proximo' | 'vencido' | 'desconhecido';

export interface DeadlineMention {
  /** O trecho do email, com a grafia original. */
  text: string;
  /** Data de calendário, quando o email deu dia, mês e ano válidos. */
  day: { year: number; month: number; day: number } | null;
  /** Duração a partir do recebimento, quando o prazo é relativo. */
  offsetMs: number | null;
}

export interface Deadline {
  text: string;
  /** `AAAA-MM-DD`: prazo do dia, sem hora. */
  dueDate: string | null;
  /** Instante, só para prazo relativo ao recebimento. */
  dueAt: string | null;
  state: DeadlineState;
  /** Dias de calendário até o prazo, no fuso de São Paulo. Negativo: passou. */
  daysLeft: number | null;
}

/** O fuso em que "hoje" e "o dia do prazo" são contados. */
const ZONE = 'America/Sao_Paulo';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const MONTHS: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const MONTH_NAMES = Object.keys(MONTHS).join('|');

/**
 * A palavra de prazo é obrigatória antes da data: sem ela, "recebido em
 * 10/11/2026" ou a data de uma entrevista passada viraria prazo.
 */
const LEAD =
  '(?:ate|prazo(?: final)?|data limite|deadline|until|by|before|no later than|vence(?:m)?(?: em)?|encerra(?:m)?(?: em)?)[: ]*(?:o dia |dia |the )?';

const ENGLISH_LEAD = /^(?:deadline|until|by|before|no later than)\b/;

const NUMERIC = new RegExp(`\\b${LEAD}(\\d{1,2})/(\\d{1,2})(?:/(\\d{4}))?\\b`);
const WRITTEN_PT = new RegExp(
  `\\b${LEAD}(\\d{1,2}) de (${MONTH_NAMES})(?: de (\\d{4}))?\\b`,
);
const WRITTEN_EN = new RegExp(
  `\\b${LEAD}(${MONTH_NAMES}) (\\d{1,2})(?:st|nd|rd|th)?(?:,? (\\d{4}))?\\b`,
);

/**
 * Relativo: "expira em 48 horas", "valid for 3 days", "nas próximas 72h".
 * "Dias úteis" fica de fora da conta: depende de feriado e de calendário da
 * empresa, e qualquer data calculada seria chute.
 */
const RELATIVE =
  /\b(?:(?:expira(?:ra)?|expires?|valid[oa]|valid|vence|disponivel|available)(?: (?:em|in|por|for|durante))?(?: (?:as proximas|the next))?|nas proximas|within|in the next|dentro de|no prazo de) (\d{1,3}) ?(horas?|hours?|h|dias?|days?)\b( uteis| business)?/;

export function findDeadline(original: string): DeadlineMention | null {
  const { text, slice } = fold(original);

  for (const [pattern, read] of [
    // Em inglês, 05/06 pode ser 6 de maio: ambígua, fica só o texto.
    [
      NUMERIC,
      (m: RegExpExecArray) =>
        ENGLISH_LEAD.test(m[0]) ? [m[1], m[2], undefined] : [m[1], m[2], m[3]],
    ],
    [WRITTEN_PT, (m: RegExpExecArray) => [m[1], m[2], m[3]]],
    [WRITTEN_EN, (m: RegExpExecArray) => [m[2], m[1], m[3]]],
  ] as const) {
    const match = pattern.exec(text);

    if (match) {
      const [day, month, year] = read(match);

      return {
        text: slice(match.index, match.index + match[0].length),
        day: calendarDay(day, month, year),
        offsetMs: null,
      };
    }
  }

  const relative = RELATIVE.exec(text);

  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2].startsWith('h') ? HOUR : DAY;

    return {
      text: slice(relative.index, relative.index + relative[0].length),
      day: null,
      offsetMs: relative[3] || amount === 0 ? null : amount * unit,
    };
  }

  return null;
}

/** O prazo em relação a agora. `receivedAt` é a base do prazo relativo. */
export function resolveDeadline(
  mention: DeadlineMention,
  receivedAt: Date,
  now: Date,
): Deadline {
  const today = zonedDay(now);

  if (mention.day) {
    const due = Date.UTC(
      mention.day.year,
      mention.day.month - 1,
      mention.day.day,
    );
    const daysLeft = Math.round((due - today) / DAY);

    return {
      text: mention.text,
      dueDate: new Date(due).toISOString().slice(0, 10),
      dueAt: null,
      state: daysLeft < 0 ? 'vencido' : 'proximo',
      daysLeft,
    };
  }

  if (mention.offsetMs !== null && !Number.isNaN(receivedAt.getTime())) {
    const dueAt = new Date(receivedAt.getTime() + mention.offsetMs);

    return {
      text: mention.text,
      dueDate: null,
      dueAt: dueAt.toISOString(),
      state: dueAt.getTime() < now.getTime() ? 'vencido' : 'proximo',
      daysLeft: Math.round((zonedDay(dueAt) - today) / DAY),
    };
  }

  return {
    text: mention.text,
    dueDate: null,
    dueAt: null,
    state: 'desconhecido',
    daysLeft: null,
  };
}

/**
 * Ordem dos avisos: prazo próximo primeiro (o mais apertado no topo), depois
 * os sem prazo conhecido, e por último os vencidos — ainda podem valer, mas
 * não à frente do que dá para cumprir. Dentro do mesmo grupo, o mais recente.
 */
export function byUrgency(
  a: { deadline: Deadline | null; receivedAt: string },
  b: { deadline: Deadline | null; receivedAt: string },
): number {
  const rank = (item: { deadline: Deadline | null }) =>
    ({ proximo: 0, desconhecido: 1, vencido: 2 })[
      item.deadline?.state ?? 'desconhecido'
    ];

  const byRank = rank(a) - rank(b);

  if (byRank !== 0) {
    return byRank;
  }

  if (a.deadline?.state === 'proximo' && b.deadline?.state === 'proximo') {
    const byDue = dueKey(a.deadline) - dueKey(b.deadline);

    if (byDue !== 0) {
      return byDue;
    }
  }

  return a.receivedAt < b.receivedAt ? 1 : a.receivedAt > b.receivedAt ? -1 : 0;
}

/** Prazo do dia vale até o fim dele; para comparar com instante, conta o dia todo. */
function dueKey(deadline: Deadline): number {
  if (deadline.dueAt) {
    return Date.parse(deadline.dueAt);
  }

  return Date.parse(`${deadline.dueDate}T23:59:59.999Z`);
}

function calendarDay(
  dayText: string | undefined,
  monthText: string | undefined,
  yearText: string | undefined,
): DeadlineMention['day'] {
  // Sem ano não há data: completar com o ano corrente erra todo prazo de
  // dezembro lido em janeiro, e é exatamente o "inventar" que a regra proíbe.
  if (!dayText || !monthText || !yearText) {
    return null;
  }

  const day = Number(dayText);
  const month = /^\d+$/.test(monthText) ? Number(monthText) : MONTHS[monthText];
  const year = Number(yearText);

  if (!month || year < 2000 || year > 2100) {
    return null;
  }

  // 31/02 vira 03/03 no Date: a volta pelo UTC denuncia a data inválida.
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? { year, month, day }
    : null;
}

/** Meia-noite UTC do dia de calendário que `instant` é em São Paulo. */
function zonedDay(instant: Date): number {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(instant)
    .split('-')
    .map(Number);

  return Date.UTC(year, month - 1, day);
}

/**
 * Minúsculas, sem acento e com espaços colapsados, guardando de onde veio
 * cada caractere: o padrão casa no texto dobrado, e o trecho devolvido sai do
 * original.
 */
function fold(original: string): {
  text: string;
  slice: (start: number, end: number) => string;
} {
  let text = '';
  const origin: number[] = [];
  let space = false;

  for (let index = 0; index < original.length; index += 1) {
    const char = original[index];

    if (/\s/.test(char)) {
      if (!space) {
        text += ' ';
        origin.push(index);
      }

      space = true;
      continue;
    }

    space = false;

    for (const folded of char
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()) {
      text += folded;
      origin.push(index);
    }
  }

  return {
    text,
    slice: (start, end) =>
      original
        .slice(origin[start], origin[end - 1] + 1)
        .replace(/\s+/g, ' ')
        .trim(),
  };
}
