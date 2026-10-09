import { z } from 'zod';

/**
 * Quem responde pela IA em cada tarefa.
 *
 * `anthropic` é a API do Claude; `local` é um modelo rodando na própria
 * máquina, pelo Ollama. A escolha é por tarefa, no `.env` do backend, e a
 * Anthropic continua sendo o padrão de todas — ninguém perde o comportamento
 * de hoje por atualizar.
 */
export const aiProviderSchema = z.enum(['anthropic', 'local']);

export type AiProvider = z.infer<typeof aiProviderSchema>;
export const AI_PROVIDERS = aiProviderSchema.options;

/**
 * As quatro coisas que o app pede a um modelo.
 *
 * - `email`: ler um email vinculado e sugerir o status.
 * - `resolve`: "Resolver por IA" — vincular, criar ou ignorar emails pendentes.
 * - `extraction`: extrair os dados de uma vaga a partir do link.
 * - `answers`: redigir resposta para pergunta aberta de formulário.
 *
 * Separadas porque pedem coisas diferentes do modelo: as três primeiras são
 * leitura com resposta fechada, que um modelo pequeno dá conta; a última é
 * escrita, onde a diferença de qualidade aparece.
 */
export const aiTaskSchema = z.enum(['email', 'resolve', 'extraction', 'answers']);

export type AiTask = z.infer<typeof aiTaskSchema>;
export const AI_TASKS = aiTaskSchema.options;

export const aiTaskStatusSchema = z.object({
  /** Sempre definido: o `.env` tem padrão. "Nada configurado" é `configured: false`. */
  provider: aiProviderSchema,
  /** O modelo que atende a tarefa; nulo quando não dá para saber. */
  model: z.string().nullable(),
  /** `anthropic`: há chave. `local`: há modelo configurado. */
  configured: z.boolean(),
});

export type AiTaskStatus = z.infer<typeof aiTaskStatusSchema>;

/**
 * O que a tela mostra sobre a IA: quem atende cada tarefa e se dá para contar
 * com isso agora. Só leitura; nada aqui dispara chamada paga.
 */
export const aiStatusSchema = z.object({
  tasks: z.object({
    email: aiTaskStatusSchema,
    resolve: aiTaskStatusSchema,
    extraction: aiTaskStatusSchema,
    answers: aiTaskStatusSchema,
  }),
  anthropic: z.object({ configured: z.boolean() }),
  local: z.object({
    url: z.string(),
    model: z.string().nullable(),
    writingModel: z.string().nullable(),
    /** O Ollama respondeu à sondagem. `null` = nenhuma tarefa é local, não sondado. */
    reachable: z.boolean().nullable(),
    /**
     * Modelos configurados que não aparecem na lista do Ollama. Por nome, e
     * não um sim/não: o de escrita pode faltar sem afetar a leitura de emails.
     * `null` = não sondado ou Ollama fora do ar.
     */
    missingModels: z.array(z.string()).nullable(),
    checkedAt: z.iso.datetime().nullable(),
  }),
});

export type AiStatus = z.infer<typeof aiStatusSchema>;
