import { z } from 'zod';
import type { JobSearchResult } from '@recruit/shared';
import { htmlToText } from '../html-to-text';
import { canonicalJobUrl } from './canonical-url';
import {
  contractTypeFromLabel,
  seniorityFromTitle,
  stackFromText,
  toIsoDate,
  workModelFromText,
} from './normalize';

/**
 * Lê a vaga do `schema.org/JobPosting` embutido na página.
 *
 * Isto não é raspagem no sentido usual: o portal publica esse bloco de
 * propósito, porque o Google exige a marcação para a vaga aparecer no Google
 * Jobs. É dado estruturado, no HTML inicial, sem executar JavaScript — e é a
 * superfície mais estável que existe para ler portal, porque se ele quebrar a
 * marcação some da busca do Google.
 *
 * Um leitor só serve todos os portais. O que muda de um para outro é apenas
 * como achar os links das vagas na listagem.
 */

const MAX_DESCRIPTION = 4_000;

/** Um valor que às vezes é objeto, às vezes array do mesmo objeto. */
const one = <T extends z.ZodTypeAny>(schema: T) =>
  z
    .union([schema, z.array(schema)])
    .transform((value) => (Array.isArray(value) ? value[0] : value));

const addressSchema = z.object({
  addressLocality: z.string().nullish(),
  addressRegion: z.string().nullish(),
  addressCountry: z
    .union([z.string(), z.object({ name: z.string().nullish() })])
    .nullish(),
});

const salarySchema = z.object({
  currency: z.string().nullish(),
  value: z
    .object({
      value: z.union([z.number(), z.string()]).nullish(),
      minValue: z.union([z.number(), z.string()]).nullish(),
      maxValue: z.union([z.number(), z.string()]).nullish(),
    })
    .nullish(),
});

const jobPostingSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullish(),
  datePosted: z.string().nullish(),
  employmentType: z.union([z.string(), z.array(z.string())]).nullish(),
  jobLocationType: z.string().nullish(),
  jobBenefits: z.union([z.string(), z.array(z.string())]).nullish(),
  hiringOrganization: one(z.object({ name: z.string().nullish() })).nullish(),
  jobLocation: one(z.object({ address: addressSchema.nullish() })).nullish(),
  baseSalary: one(salarySchema).nullish(),
});

/**
 * Extrai o primeiro `JobPosting` da página.
 *
 * A busca por regex é intencional: um parser de HTML completo custaria uma
 * dependência para achar uma tag cujo formato é fixo. `[^<>]*` nos atributos,
 * e não `[^>]*`, pelo mesmo motivo do `html-to-text` — a segunda forma
 * retrocede e vira negação de serviço em página com `<` sem fechamento.
 */
export function readJobPosting(html: string): unknown {
  const blocks = html.matchAll(
    /<script[^<>]*type=["']application\/ld\+json["'][^<>]*>([\s\S]*?)<\/script>/gi,
  );

  for (const block of blocks) {
    let parsed: unknown;

    try {
      parsed = JSON.parse(block[1].trim());
    } catch {
      continue;
    }

    const found = findPosting(parsed);

    if (found) {
      return found;
    }
  }

  return null;
}

/** O bloco pode ser o objeto, um array, ou vir dentro de um `@graph`. */
function findPosting(value: unknown): unknown {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findPosting(item);

      if (found) {
        return found;
      }
    }

    return null;
  }

  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const node = value as Record<string, unknown>;

  if (node['@type'] === 'JobPosting') {
    return node;
  }

  return node['@graph'] ? findPosting(node['@graph']) : null;
}

export function jobPostingToResult(
  raw: unknown,
  pageUrl: string,
  source: string,
): JobSearchResult | null {
  const parsed = jobPostingSchema.safeParse(raw);

  if (!parsed.success) {
    return null;
  }

  const posting = parsed.data;
  const url = canonicalJobUrl(pageUrl);

  if (!url) {
    return null;
  }

  const description = posting.description
    ? htmlToText(posting.description, MAX_DESCRIPTION)
    : null;

  const location = formatLocation(posting.jobLocation?.address);
  const salary = readSalary(posting.baseSalary);

  return {
    company:
      posting.hiringOrganization?.name?.trim() || 'Empresa não informada',
    title: posting.title,
    url,
    source,
    description,
    stack: stackFromText(posting.title, description),
    requirements: [],
    benefits: toList(posting.jobBenefits),
    seniority: seniorityFromTitle(posting.title),
    // `TELECOMMUTE` é o valor que o schema.org define para remoto; fora dele,
    // sobra interpretar o texto da localização.
    workModel:
      posting.jobLocationType === 'TELECOMMUTE'
        ? 'remoto'
        : workModelFromText(location),
    contractType: contractTypeFromLabel(
      toList(posting.employmentType)[0] ?? null,
    ),
    location,
    salaryMin: salary.min,
    salaryMax: salary.max,
    salaryCurrency: salary.currency,
    weeklyHours: null,
    postedAt: toIsoDate(posting.datePosted ?? null),
  };
}

function formatLocation(
  address: z.infer<typeof addressSchema> | null | undefined,
): string | null {
  if (!address) {
    return null;
  }

  const country =
    typeof address.addressCountry === 'string'
      ? address.addressCountry
      : address.addressCountry?.name;

  // "BR" sozinho não diz nada na tela; o filtro de escopo procura "Brasil".
  const readable = country === 'BR' ? 'Brasil' : country;

  return (
    [address.addressLocality, address.addressRegion, readable]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(', ') || null
  );
}

function readSalary(salary: z.infer<typeof salarySchema> | null | undefined): {
  min: number | null;
  max: number | null;
  currency: string | null;
} {
  const value = salary?.value;

  if (!value) {
    return { min: null, max: null, currency: null };
  }

  const min = toInt(value.minValue ?? value.value);
  const max = toInt(value.maxValue ?? value.value);

  return {
    min,
    max,
    currency: min === null && max === null ? null : (salary?.currency ?? 'BRL'),
  };
}

function toInt(value: number | string | null | undefined): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value) : null;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^\d.,-]/g, '').replace(',', '.'));

    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
  }

  return null;
}

function toList(value: string | string[] | null | undefined): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }

  return typeof value === 'string' && value.trim() ? [value.trim()] : [];
}
