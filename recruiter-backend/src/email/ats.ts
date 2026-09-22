import { fold } from '../job/discovery/normalize';

/**
 * Conhecimento sobre os ATS, isolado — é a parte que muda quando um portal
 * novo aparece.
 *
 * O ponto central deste arquivo é uma inversão que não é óbvia: **domínio de
 * ATS conhecido é anti-sinal para vincular**. A vaga veio da descoberta, então
 * a URL é `boards.greenhouse.io/nubank/jobs/123` e o remetente é
 * `no-reply@greenhouse.io`. Casar um com o outro casa com TODAS as suas
 * candidaturas via Greenhouse ao mesmo tempo.
 *
 * O sinal de verdade estava escondido ali dentro: o slug do board — `nubank`.
 */

/**
 * Domínios que hospedam vaga de muita empresa. Remetente daqui não identifica
 * empresa nenhuma.
 */
const ATS_DOMAINS = new Set([
  'greenhouse.io',
  'greenhouse-mail.io',
  'lever.co',
  'hire.lever.co',
  'ashbyhq.com',
  'gupy.io',
  'workable.com',
  'smartrecruiters.com',
  'icims.com',
  'myworkdayjobs.com',
  'workday.com',
  'taleo.net',
  'breezy.hr',
  'recruitee.com',
  'jobvite.com',
  'teamtailor.com',
  'bamboohr.com',
  'remoteok.com',
  'remotive.com',
  'infojobs.com.br',
  'vagas.com.br',
  'linkedin.com',
  'indeed.com',
]);

/**
 * O nome de exibição é o do PRÓPRIO portal, e não o de uma empresa.
 *
 * `stripVia` resolve "Nubank via Greenhouse", onde há um sufixo para remover.
 * Não resolve "LinkedIn", que é o remetente quando a candidatura foi feita
 * pelo portal — e aí o palpite de empresa devolveria "LinkedIn" para toda
 * candidatura feita por lá.
 */
const ATS_BRANDS = new Set([
  'linkedin',
  'greenhouse',
  'lever',
  'ashby',
  'ashbyhq',
  'gupy',
  'workable',
  'smartrecruiters',
  'icims',
  'workday',
  'taleo',
  'breezy',
  'recruitee',
  'jobvite',
  'teamtailor',
  'bamboohr',
  'remoteok',
  'remotive',
  'infojobs',
  'vagas',
  'indeed',
  'glassdoor',
  'catho',
]);

export function isAtsBrand(name: string): boolean {
  // Por token, não por substring: "LinkedIn Job Alerts" também é o portal,
  // e uma empresa chamada "Leverage" não pode virar "lever".
  return fold(name)
    .split(/[^a-z0-9]+/)
    .some((token) => token !== '' && ATS_BRANDS.has(token));
}

/**
 * Remetentes cujo email é digest de vagas, nunca correspondência de uma
 * candidatura sua.
 *
 * Mora aqui e não no parser porque é conhecimento sobre email, e porque o
 * `relinkOrphans()` precisa dele sem depender da descoberta.
 */
export const JOB_DIGEST_SENDERS: readonly string[] = [
  'jobalerts-noreply@linkedin.com',
  'jobs-listings@linkedin.com',
];

export function isJobDigestSender(address: string): boolean {
  return JOB_DIGEST_SENDERS.includes(address.trim().toLowerCase());
}

/** `no-reply@mail.greenhouse.io` → `greenhouse.io`. */
export function domainOf(address: string): string | null {
  const at = address.lastIndexOf('@');

  if (at < 0) {
    return null;
  }

  const host = address
    .slice(at + 1)
    .trim()
    .toLowerCase();

  return host === '' ? null : host;
}

/** Um domínio conta como de ATS se ele ou qualquer sufixo dele estiver na lista. */
export function isAtsDomain(domain: string | null): boolean {
  if (!domain) {
    return false;
  }

  const parts = domain.split('.');

  for (let i = 0; i < parts.length - 1; i += 1) {
    if (ATS_DOMAINS.has(parts.slice(i).join('.'))) {
      return true;
    }
  }

  return false;
}

/**
 * Tira o sufixo que os ATS grudam no nome de exibição.
 *
 * "Nubank via Greenhouse" → "Nubank". Sem isso, o nome nunca casa exatamente
 * com `Job.company`, e o sinal mais confiável de identificação da empresa se
 * perde no ruído do intermediário.
 */
export function stripVia(name: string | null): string | null {
  if (!name) {
    return null;
  }

  const clean = name
    .replace(
      /\s*[({[]?\s*(?:via|through|através de|por meio de)\s+[^)}\]]*[)}\]]?\s*$/i,
      '',
    )
    .replace(
      /\s*[-–|]\s*(?:greenhouse|lever|ashby|gupy|workable|workday)\s*$/i,
      '',
    )
    .trim();

  return clean === '' ? null : clean;
}

/**
 * O identificador da empresa dentro da URL do board.
 *
 *   boards.greenhouse.io/nubank/jobs/123   → nubank
 *   jobs.lever.co/spotify/abc              → spotify
 *   jobs.ashbyhq.com/linear/uuid           → linear
 *   quintoandar.gupy.io/job/...            → quintoandar
 *
 * É o que sobra de útil no sinal de domínio depois de descartar o domínio.
 */
export function boardSlugFromUrl(url: string | null): string | null {
  if (!url) {
    return null;
  }

  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  const segments = parsed.pathname.split('/').filter(Boolean);

  // Gupy e Teamtailor põem a empresa no subdomínio, não no caminho.
  if (host.endsWith('.gupy.io') || host.endsWith('.teamtailor.com')) {
    const sub = host.split('.')[0];

    return sub && sub !== 'www' && sub !== 'portal' ? sub : null;
  }

  if (!isAtsDomain(host) || segments.length === 0) {
    return null;
  }

  const first = segments[0];

  // `/embed/job_board?for=empresa` e afins não têm o slug na primeira posição.
  return /^[a-z0-9][a-z0-9-]{1,60}$/i.test(first) && first !== 'jobs'
    ? first
    : null;
}

/**
 * Compara nome de empresa com fronteira de palavra.
 *
 * `fold()` tira acento e caixa, mas não delimita — `fold("Nu")` é substring de
 * `fold("Menu")`. Sem `\b`, empresas de nome curto (Nu, Loft, Stone, Take, Hub)
 * casariam com quase qualquer texto.
 */
export function mentionsCompany(haystack: string, company: string): boolean {
  const needle = fold(company);

  if (needle.length < 2) {
    return false;
  }

  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return new RegExp(`\\b${escaped}\\b`).test(fold(haystack));
}
