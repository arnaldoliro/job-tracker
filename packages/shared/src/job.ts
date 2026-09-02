import { z } from 'zod';

/** Modalidade de trabalho da vaga. Espelha o enum WorkModel do Prisma. */
export const workModelSchema = z.enum(['remoto', 'hibrido', 'presencial']);

export type WorkModel = z.infer<typeof workModelSchema>;

export const WORK_MODELS = workModelSchema.options;
