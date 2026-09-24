import { z } from 'zod';
import { applicationStatusSchema } from './application-status';
import { externalUrlSchema, workModelSchema } from './job';

/**
 * A vaga como a candidatura a expõe. Deliberadamente menor que a tabela `Job`:
 * `description`, `stack` e `requirements` existem no banco e não vêm aqui — a
 * API mostra o que a tela usa, não o espelho do schema.
 */
export const applicationJobSchema = z.object({
  id: z.string(),
  company: z.string(),
  title: z.string(),
  url: z.string().nullable(),
  seniority: z.string().nullable(),
  workModel: workModelSchema.nullable(),
  location: z.string().nullable(),
});

export const applicationSchema = z.object({
  id: z.string(),
  profileId: z.string(),
  status: applicationStatusSchema,
  notes: z.string().nullable(),
  appliedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  job: applicationJobSchema,
  /**
   * A versão do currículo congelada nesta candidatura.
   *
   * `null` quando o currículo estava vazio na hora — e não um objeto com
   * campos em branco, que afirmaria que você enviou um currículo vazio.
   */
  resumeVersion: z
    .object({ id: z.string(), label: z.string(), createdAt: z.iso.datetime() })
    .nullable(),
});

export type Application = z.infer<typeof applicationSchema>;

export const applicationListSchema = z.array(applicationSchema);

const company = z
  .string()
  .trim()
  .min(1, 'Informe a empresa')
  .max(120, 'Máximo de 120 caracteres');

const title = z
  .string()
  .trim()
  .min(1, 'Informe o cargo')
  .max(120, 'Máximo de 120 caracteres');

const notes = z.string().trim().max(2000, 'Máximo de 2000 caracteres');

/**
 * Dois caminhos para criar uma candidatura:
 *
 * - **do zero**: empresa e cargo, e nada mais obrigatório. É a regra dos ~30
 *   segundos da seção 1 do CLAUDE.md — se registrar exigir sete campos, o
 *   projeto é abandonado.
 * - **a partir de uma vaga salva**: só `jobId`. Sem esse caminho, aplicar a uma
 *   vaga salva criaria um Job NOVO, e a vaga salva nunca se reconheceria como
 *   já aplicada.
 *
 * `superRefine` em vez de `z.union`: a união reporta as tentativas de cada
 * lado, e o formulário precisa do erro no campo certo.
 */
export const createApplicationSchema = z
  .strictObject({
    profileId: z.string().min(1),
    jobId: z.string().min(1).optional(),
    company: company.optional(),
    title: title.optional(),
    url: externalUrlSchema.optional(),
    status: applicationStatusSchema.optional(),
    notes: notes.optional(),
    appliedAt: z.iso.datetime().optional(),
  })
  .superRefine((input, ctx) => {
    if (input.jobId) {
      return;
    }

    if (!input.company) {
      ctx.addIssue({
        code: 'custom',
        path: ['company'],
        message: 'Informe a empresa',
      });
    }

    if (!input.title) {
      ctx.addIssue({
        code: 'custom',
        path: ['title'],
        message: 'Informe o cargo',
      });
    }
  });

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

/** `null` limpa o campo; ausente deixa como está. */
export const updateApplicationSchema = z.strictObject({
  company: company.optional(),
  title: title.optional(),
  url: externalUrlSchema.nullable().optional(),
  status: applicationStatusSchema.optional(),
  notes: notes.nullable().optional(),
  appliedAt: z.iso.datetime().nullable().optional(),
});

export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;

/**
 * Corrigir QUANDO uma transição aconteceu.
 *
 * Só a data: o status não muda. Corrigir a data de um fato não altera o fato.
 */
export const setEventDateSchema = z.strictObject({
  occurredAt: z.iso.datetime(),
});

export type SetEventDateInput = z.infer<typeof setEventDateSchema>;
