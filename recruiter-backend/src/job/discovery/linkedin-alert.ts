import { countryFromText, fold } from './normalize';

/**
 * Lê as vagas dentro de um alerta do LinkedIn.
 *
 * O LinkedIn não publica API de vagas, e raspar o site arrisca a conta — o
 * §5 é explícito de que o custo seria a rede profissional inteira. Mas ele
 * **manda as vagas por email**, e ler a própria caixa não é raspagem.
 *
 * Medido contra a caixa real: 41 alertas em 45 dias, cada um com exatamente 6
 * vagas, corpo de ~10.400 caracteres. Cerca de 2.000 vagas por ano.
 *
 * O formato de cada bloco, em texto puro:
 *
 *     Desenvolvedor Back-end Node.js  - SP     <- título
 *     innolevels                                <- empresa
 *     São Paulo e Região                        <- local
 *     Esta empresa está contratando             <- ruído, opcional
 *     Visualizar vaga: https://www.linkedin.com/comm/jobs/view/446730.../?trk=...
 *
 * Puro de propósito: é a peça que vai errar quando o LinkedIn mudar o layout,
 * e precisa ser exercitável sem banco e sem IMAP.
 */

/** Uma vaga como ela aparece no digest, antes de virar `JobSearchResult`. */
export interface AlertJob {
  /** Id numérico do LinkedIn — a única identidade estável do email. */
  id: string;
  /** Canônica, RECONSTRUÍDA a partir do id. Nunca a URL crua do corpo. */
  url: string;
  title: string;
  company: string;
  location: string | null;
}

export interface AlertParse {
  jobs: AlertJob[];
  /** Âncoras `/jobs/view/<dígitos>` encontradas. Denominador da saúde. */
  anchors: number;
  /** Âncoras que não renderam vaga utilizável. */
  dropped: number;
  /** Blocos montados com deslocamento que a heurística não resolveu. */
  uncertain: number;
  /** Corpo no teto de `MAX_BODY_CHARS` — vagas do fim podem ter sido perdidas. */
  truncated: boolean;
}

/**
 * Teto do corpo em `imap.client.ts`. Duplicado como constante local em vez de
 * importado: o parser não deve depender do transporte, e o número só serve
 * para avisar que estamos perto dele.
 */
const BODY_CAP = 16_000;
const TRUNCATION_MARGIN = 100;

/** Âncora. Exige `/jobs/view/`, então o rodapé não casa — ver `parseLinkedInAlert`. */
const ANCHOR = /linkedin\.com\/(?:comm\/)?jobs\/view\/(?:[^\s/]*-)?(\d+)/;

/** Linha de tracinhos que o LinkedIn usa entre vagas. */
const SEPARATOR = /^-{20,}$/;

/**
 * Linhas que não são campo de vaga.
 *
 * Esta lista sozinha **não basta**, e é importante entender por quê: uma linha
 * nova que o LinkedIn introduza desloca título, empresa e local em um, e o
 * card sai com a empresa errada sem erro em lugar nenhum. A lista reduz o
 * trabalho da heurística de `assign()`, que é quem realmente protege.
 */
const NOISE: RegExp[] = [
  /^candidate-se/,
  /^candidatura simplificada$/,
  /^easy apply$/,
  /esta contratando/,
  /is hiring/,
  /^visualizar vaga/,
  /^ver vaga/,
  /^view job/,
  /^\d+\s*(candidatos?|applicants?)$/,
  /^(ha|há)\s+\d+/,
  /^\d+\s+(dias?|horas?|days?|hours?)\s+ago$/,
  /promovid/,
  /promoted/,
  /patrocinad/,
  /sponsored/,
  /^(nova|new)$/,
  /^seu alerta de vaga/,
  /^novas vagas correspondem/,
];

export function parseLinkedInAlert(bodyText: string): AlertParse {
  const lines = normalize(bodyText);

  const jobs: AlertJob[] = [];
  const seen = new Set<string>();

  let anchors = 0;
  let dropped = 0;
  let uncertain = 0;

  let previousAnchor = -1;
  let lastSeparator = -1;

  for (let i = 0; i < lines.length; i += 1) {
    if (SEPARATOR.test(lines[i])) {
      lastSeparator = i;
      continue;
    }

    const match = ANCHOR.exec(lines[i]);

    if (!match) {
      continue;
    }

    anchors += 1;

    // Piso do bloco. O tracinho é o sinal medido; a âncora anterior é um piso
    // rígido que segura mesmo se o LinkedIn parar de emitir o separador e o
    // corpo inteiro virar uma sequência só.
    const floor = Math.max(previousAnchor, lastSeparator) + 1;

    previousAnchor = i;

    const above: string[] = [];

    for (let j = i - 1; j >= floor; j -= 1) {
      const line = lines[j];

      if (NOISE.some((pattern) => pattern.test(fold(line)))) {
        continue;
      }

      above.push(line);
    }

    const job = assign(match[1], above);

    if (!job) {
      dropped += 1;
      continue;
    }

    if (job.uncertain) {
      uncertain += 1;
    }

    // A mesma vaga aparece mais de uma vez no mesmo digest? Não observado, mas
    // custa uma linha e evita contar duas.
    if (!seen.has(job.value.id)) {
      seen.add(job.value.id);
      jobs.push(job.value);
    }
  }

  return {
    jobs,
    anchors,
    dropped,
    uncertain,
    truncated: bodyText.length >= BODY_CAP - TRUNCATION_MARGIN,
  };
}

/**
 * Uma linha "vazia" que sobrevive ao `trim()` vira linha de conteúdo e desloca
 * o bloco inteiro em um — empresa errada no card, sem erro em lugar nenhum.
 *
 * Medido, não suposto: em JavaScript `\s` e `trim()` JÁ cobrem `\u00a0`,
 * `\u2007`, `\u202f` e `\ufeff`. O único invisível que escapa é `\u200b`, o
 * espaço de largura zero — e é só por ele que esta linha existe.
 *
 * Escrito como escape, nunca como caractere literal: invisível no fonte já
 * quebrou o lint deste projeto uma vez, em `html-to-text.ts`.
 */
function normalize(bodyText: string): string[] {
  return bodyText
    .replace(/\r\n?/g, '\n')
    .replace(/\u200b/g, ' ')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '');
}

/**
 * Local, empresa e título — nesta ordem, subindo a partir da URL.
 *
 * As duas linhas de cabeçalho do primeiro bloco ("Seu alerta de vaga em: X" e
 * "Novas vagas correspondem…") não precisam de caso especial: lendo de baixo
 * para cima elas caem em `above[3]` e `above[4]` e nunca são alcançadas.
 */
function assign(
  id: string,
  above: string[],
): { value: AlertJob; uncertain: boolean } | null {
  const fields = [...above];

  // Auto-correção. Uma linha de ruído não prevista empurra tudo em um; em vez
  // de confiar só na lista, confirmamos POSITIVAMENTE que a primeira linha
  // parece um local, e descartamos de cima quando não parece.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (fields.length < 4) {
      break;
    }

    if (looksLikeLocation(fields[0]) || !looksLikeLocation(fields[1])) {
      break;
    }

    fields.shift();
  }

  if (fields.length < 3) {
    return null;
  }

  const [location, company, title] = fields;

  if (
    !sane(title, 3, 200) ||
    !sane(company, 2, 160) ||
    !sane(location, 1, 120)
  ) {
    return null;
  }

  return {
    value: {
      id,
      // Reconstruída, nunca a URL do corpo: ela carrega `midToken`, `otpToken`
      // e `eid`, que identificam a CONTA de quem recebeu (§7). Depender do
      // `canonicalJobUrl` para limpar PII seria a dependência na direção
      // errada; reconstruir torna o vazamento estruturalmente impossível.
      url: `https://www.linkedin.com/jobs/view/${id}`,
      title,
      company,
      location,
    },
    // Nenhuma das duas primeiras linhas parece local: o bloco provavelmente
    // está deslocado. NÃO descartamos — a URL veio do regex, então a
    // identidade está certa e o defeito é cosmético. Descartar perderia uma
    // vaga real para proteger um rótulo.
    uncertain: !looksLikeLocation(location),
  };
}

function looksLikeLocation(value: string): boolean {
  const folded = fold(value);

  return (
    /,\s*[a-z]{2}$/.test(folded) ||
    countryFromText(value) !== null ||
    folded === 'remoto' ||
    folded === 'remote' ||
    folded === 'hibrido' ||
    / e regiao$/.test(folded) ||
    / (area|metropolitan area)$/.test(folded)
  );
}

function sane(value: string, min: number, max: number): boolean {
  return value.length >= min && value.length <= max && !value.includes('://');
}
