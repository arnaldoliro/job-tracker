import { z } from 'zod';
import { applicationStatusSchema } from './application-status';

/**
 * As métricas do painel.
 *
 * O §3 diz que o `StatusEvent` existe para responder "quantas viraram
 * entrevista?". Este contrato é essa resposta.
 */

/**
 * As etapas do funil, em ordem.
 *
 * Começa em `aplicado` e não em `rascunho`: candidatura criada já como
 * `aplicado` — que é o que o fluxo de email faz — nunca passa por `rascunho`,
 * e incluí-lo compararia coisas diferentes. `rascunho` vira indicador à parte.
 *
 * `rejeitado` também fica fora: ele acontece a partir de QUALQUER etapa, então
 * não é um degrau mais fundo que `oferta`. Vai reportado em separado.
 */
export const FUNNEL_STAGES = [
  'aplicado',
  'triagem',
  'entrevista',
  'teste',
  'oferta',
] as const;

export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const funnelStageSchema = z.enum(FUNNEL_STAGES);

export const funnelStepSchema = z.object({
  stage: funnelStageSchema,
  /**
   * Candidaturas que chegaram nesta etapa OU ALÉM.
   *
   * "Ou além" é o que torna o funil monotônico: quem pula `triagem` e vai
   * direto para `entrevista` ainda conta em `triagem`. Sem isso o funil
   * cresceria no meio e a conversão passaria de 100%.
   */
  reached: z.number().int().min(0),
  /**
   * Conversão desde a etapa anterior, de 0 a 1.
   *
   * `null` na primeira etapa, quando a anterior está zerada, e **quando não há
   * candidaturas suficientes** — ver `minimumForRates`. O corte vive aqui, no
   * contrato, e não na tela: assim o frontend fica impossibilitado de imprimir
   * um percentual que o backend considera ruído, e o limiar não pode divergir
   * entre os dois apps.
   */
  conversion: z.number().min(0).max(1).nullable(),
});

export type FunnelStep = z.infer<typeof funnelStepSchema>;

export const sourceCountSchema = z.object({
  /**
   * CONTEÚDO A INTERPRETAR COM CUIDADO: `manual` é o que o fluxo de email
   * grava quando não sabe a origem, não "cadastrei à mão".
   */
  source: z.string(),
  count: z.number().int().min(0),
});

export const metricsSchema = z.object({
  funnel: z.array(funnelStepSchema),

  /** Fora do funil: terminal a partir de qualquer etapa. */
  rejected: z.number().int().min(0),
  /** Fora do funil: ainda não enviadas. */
  drafts: z.number().int().min(0),

  /** Candidaturas vivas, já descontado o soft delete. */
  active: z.number().int().min(0),
  /** Saíram de `aplicado` alguma vez — a empresa respondeu. */
  answered: z.number().int().min(0),

  /** Vagas que a descoberta chegou a te mostrar. Zero antes da primeira busca. */
  jobsSeen: z.number().int().min(0),
  jobsSaved: z.number().int().min(0),
  jobsDismissed: z.number().int().min(0),

  emailsReceived: z.number().int().min(0),
  emailsLinked: z.number().int().min(0),

  bySource: z.array(sourceCountSchema),

  /**
   * Candidaturas apagadas, que NÃO entram em número nenhum desta tela (§3).
   *
   * Existe só para a tela poder dizer isso. Hoje são 4 de 8, e ver "4
   * candidaturas" lembrando de 8 parece defeito — a tela está certa, e
   * precisa conseguir explicar por quê.
   */
  excluded: z.number().int().min(0),

  /** Abaixo disto, `conversion` vem nula. Vai no payload para a tela explicar. */
  minimumForRates: z.number().int().positive(),
});

export type Metrics = z.infer<typeof metricsSchema>;

export const metricsQuerySchema = z.strictObject({
  profileId: z.string().min(1),
});

export type MetricsQuery = z.infer<typeof metricsQuerySchema>;

/** Só para o backend montar a entrada da função pura. */
export const applicationFactsSchema = z.object({
  applicationId: z.string(),
  /** Status ATUAL. Entra no máximo junto com os eventos — ver `buildFunnel`. */
  status: applicationStatusSchema,
  /** `toStatus` de todos os eventos desta candidatura. */
  reached: z.array(applicationStatusSchema),
});

export type ApplicationFacts = z.infer<typeof applicationFactsSchema>;
