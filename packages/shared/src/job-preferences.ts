import { z } from 'zod';
import {
  contractTypeSchema,
  jobSearchResultSchema,
  workModelSchema,
} from './job';

/**
 * Preferências de vaga — o filtro que o currículo NÃO tem como adivinhar.
 *
 * A divisão importa: o currículo diz o que você sabe fazer, e isso vira
 * ORDENAÇÃO (aderência). Isto aqui diz o que você aceita, e vira CORTE. Se o
 * currículo cortasse, uma vaga em Go sumiria de quem só tem Node — e pode ser
 * exatamente a vaga que interessa.
 *
 * Array vazio significa "tanto faz", nunca "nenhum". É a diferença entre um
 * filtro recém-criado e um filtro que zera a lista sem explicar por quê.
 */

/** Onde a vaga pode estar. `brasil` inclui remoto que aceite o Brasil. */
export const locationScopeSchema = z.enum(['brasil', 'internacional', 'ambos']);
export type LocationScope = z.infer<typeof locationScopeSchema>;
export const LOCATION_SCOPES = locationScopeSchema.options;

/**
 * Senioridade canônica, derivada do título — nenhuma fonte declara este campo.
 * Separada do `contractType` de propósito: estágio é forma de contrato,
 * júnior é nível.
 */
export const senioritySchema = z.enum([
  'junior',
  'pleno',
  'senior',
  'staff',
  'lead',
]);
export type Seniority = z.infer<typeof senioritySchema>;
export const SENIORITIES = senioritySchema.options;

const keyword = z.string().trim().min(1).max(40);

export const jobPreferencesSchema = z.object({
  scope: locationScopeSchema,
  workModels: z.array(workModelSchema).max(3),
  contractTypes: z.array(contractTypeSchema).max(4),
  seniorities: z.array(senioritySchema).max(5),
  /** Título precisa conter uma destas. Vazio = qualquer título. */
  titleIncludes: z.array(keyword).max(30),
  /** Título com qualquer uma destas é descartado. Vence o `titleIncludes`. */
  titleExcludes: z.array(keyword).max(30),
});

export type JobPreferences = z.infer<typeof jobPreferencesSchema>;

/**
 * Não existe filtro de salário mínimo, e é deliberado: medindo as fontes, 4 de
 * 100 vagas do RemoteOK declaram faixa, o `compensation` do Ashby vem vazio, e
 * Greenhouse, Lever e Gupy não têm o campo. Um filtro de salário ou zera a
 * lista ou não faz nada — as duas formas de mentir para quem o configurou.
 * Volta quando a extração por URL preencher o salário das vagas abertas.
 */

/**
 * O padrão já vem útil: os boards são majoritariamente de vagas não técnicas
 * (medido: 449 técnicas em 1.334), e um filtro vazio faria a primeira tela ser
 * uma lista de vagas de vendas.
 */
export const defaultJobPreferences: JobPreferences = {
  scope: 'ambos',
  workModels: [],
  contractTypes: [],
  seniorities: [],
  titleIncludes: [
    'engineer',
    'engenhei',
    'developer',
    'desenvolved',
    'backend',
    'back-end',
    'fullstack',
    'full-stack',
    'software',
    'sre',
    'platform',
    'infra',
    'devops',
    'tech lead',
    'arquitet',
    'programad',
  ],
  titleExcludes: [
    'sales',
    'recruiter',
    'account executive',
    'vendas',
    'estágio',
    'estagio',
  ],
};

/**
 * Query da descoberta.
 *
 * `cursor` é opaco e ordenável, no formato `pontuação:url`, não um deslocamento
 * numérico. Deslocamento seria errado aqui: o usuário descarta vagas enquanto
 * navega, o conjunto encolhe entre uma requisição e a seguinte, e o item que
 * estava na posição 20 passa para a 12 — as vagas 20 a 27 nunca apareceriam.
 * Chave ordenável não desloca quando se remove do meio.
 */
export const discoverJobsSchema = z.strictObject({
  profileId: z.string().min(1),
  cursor: z.string().trim().max(2100).optional(),
  q: z.string().trim().max(120).optional(),
});

export type DiscoverJobsQuery = z.infer<typeof discoverJobsSchema>;

/**
 * Por que a busca parou.
 *
 * `fim` — acabaram as vagas que passam nas preferências.
 * `nada-novo` — ainda existem vagas, mas você já salvou, aplicou ou descartou
 * todas elas.
 *
 * Confundir as duas quebra a confiança na ferramenta: uma pede para afrouxar o
 * filtro, a outra diz que você está em dia.
 */
export const exhaustionSchema = z.enum(['fim', 'nada-novo']);
export type Exhaustion = z.infer<typeof exhaustionSchema>;

/**
 * Resposta da descoberta.
 *
 * `total` é quantas vagas passam no filtro, não quantas vieram no lote — é o
 * número que diz "42 vagas em 20 empresas" e evita a tela prometer um fluxo
 * infinito que não existe.
 */
export const discoverResultSchema = z.object({
  items: z.array(jobSearchResultSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int(),
  exhausted: exhaustionSchema.nullable(),
  /** Fontes que falharam nesta rodada, para a tela não fingir cobertura total. */
  failedSources: z.array(z.string()),
});

export type DiscoverResult = z.infer<typeof discoverResultSchema>;

export const dismissJobSchema = z.strictObject({
  profileId: z.string().min(1),
  url: z.string().trim().min(1).max(2048),
});

export type DismissJobInput = z.infer<typeof dismissJobSchema>;
