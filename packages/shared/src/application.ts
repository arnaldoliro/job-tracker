import { z } from 'zod';
import { applicationStatusSchema } from './application-status';
import { workModelSchema } from './job';

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
 * Só empresa e cargo são obrigatórios. É a regra dos ~30 segundos da seção 1
 * do CLAUDE.md: se registrar uma vaga exigir sete campos, o projeto é
 * abandonado. O resto entra na edição ou pela extração automática.
 */
export const createApplicationSchema = z.strictObject({
  profileId: z.string().min(1),
  company,
  title,
  url: z.url('Link inválido').optional(),
  status: applicationStatusSchema.optional(),
  notes: notes.optional(),
  appliedAt: z.iso.datetime().optional(),
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

/** `null` limpa o campo; ausente deixa como está. */
export const updateApplicationSchema = z.strictObject({
  company: company.optional(),
  title: title.optional(),
  url: z.url('Link inválido').nullable().optional(),
  status: applicationStatusSchema.optional(),
  notes: notes.nullable().optional(),
  appliedAt: z.iso.datetime().nullable().optional(),
});

export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;
