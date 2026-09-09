import { z } from 'zod';
import { contractTypeSchema, externalUrlSchema, workModelSchema } from './job';

/**
 * O formulário que o Claude preenche.
 *
 * Repare no que NÃO está aqui: `url` e `source`. Eles vêm do que o usuário
 * colou e do host da página, nunca da saída do modelo. Se o modelo pudesse
 * devolver a URL, uma página conseguiria induzi-lo a emitir `javascript:` — e
 * esse valor vira `href` na tela. O jeito de não ter esse problema é não
 * oferecer o campo.
 *
 * Todo limite de tamanho aqui é contenção: a página é conteúdo de terceiro, e
 * sem teto uma vaga poderia despejar megabytes no banco pela via do modelo.
 */
export const jobExtractionSchema = z.object({
  company: z
    .string()
    .min(1)
    .max(160)
    .describe('Nome da empresa contratante, não o da consultoria que publicou'),
  title: z.string().min(1).max(200).describe('Cargo da vaga'),
  description: z
    .string()
    .max(8000)
    .nullable()
    .describe('Resumo objetivo das responsabilidades, em português'),
  stack: z
    .array(z.string().max(60))
    .max(40)
    .describe('Tecnologias citadas: linguagens, bancos, ferramentas'),
  requirements: z
    .array(z.string().max(300))
    .max(30)
    .describe('Requisitos, um por item'),
  benefits: z.array(z.string().max(200)).max(30).describe('Benefícios oferecidos'),
  seniority: z
    .string()
    .max(40)
    .nullable()
    .describe('junior, pleno, senior, staff, lead — null se não declarado'),
  workModel: workModelSchema.nullable().describe('Modalidade de trabalho'),
  contractType: contractTypeSchema.nullable().describe('Regime de contratação'),
  location: z.string().max(160).nullable().describe('Cidade e estado'),
  salaryMin: z
    .number()
    .int()
    .min(0)
    .max(10_000_000)
    .nullable()
    .describe('Piso da faixa, em valor mensal e sem formatação'),
  salaryMax: z.number().int().min(0).max(10_000_000).nullable(),
  salaryCurrency: z.string().max(8).nullable().describe('BRL, USD, EUR'),
  weeklyHours: z.number().int().min(1).max(80).nullable(),
});

export type JobExtraction = z.infer<typeof jobExtractionSchema>;

/** Entrada do endpoint. A URL passa pela mesma trava de esquema das vagas. */
export const extractJobSchema = z.strictObject({
  url: externalUrlSchema,
});

export type ExtractJobInput = z.infer<typeof extractJobSchema>;
