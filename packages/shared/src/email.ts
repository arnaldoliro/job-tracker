import { z } from 'zod';
import { applicationStatusSchema } from './application-status';
import { statusEventSourceSchema } from './status-event';

/**
 * Email ingerido por IMAP.
 *
 * Não expõe o corpo inteiro na listagem: um trecho basta para você decidir se
 * o email interessa, e mandar milhares de caracteres de corpo para desenhar
 * uma lista é desperdício. O corpo completo vem na linha do tempo.
 */

/**
 * O que o email parece ser, por padrão de texto — não por modelo.
 *
 * `confirmacao` é o único que dispara oferta de criar candidatura: é o email
 * que prova que você aplicou em algum lugar e esqueceu de registrar.
 */
export const emailKindSchema = z.enum([
  'confirmacao',
  'atualizacao',
  'alerta',
  'desconhecido',
]);

export type EmailKind = z.infer<typeof emailKindSchema>;

export const emailMessageSchema = z.object({
  id: z.string(),
  applicationId: z.string().nullable(),
  fromAddress: z.string(),
  /** CONTEÚDO NÃO CONFIÁVEL: nome escolhido por quem enviou. */
  fromName: z.string().nullable(),
  /** CONTEÚDO NÃO CONFIÁVEL. */
  subject: z.string(),
  receivedAt: z.iso.datetime(),
  kind: emailKindSchema,
  /** Primeiras linhas do corpo, em texto puro. Nunca HTML. */
  preview: z.string().nullable(),
  /** A empresa que o texto sugere, quando dá para deduzir. */
  companyGuess: z.string().nullable(),
});

export type EmailMessage = z.infer<typeof emailMessageSchema>;
export const emailMessageListSchema = z.array(emailMessageSchema);

/**
 * Um item da linha do tempo de uma candidatura.
 *
 * União discriminada, e os dois lados carregam `at`: assim a tela ordena sem
 * saber de qual tipo cada item é.
 *
 * Email NÃO é `StatusEvent` — `StatusEvent.toStatus` é obrigatório no banco, e
 * "chegou um email" não afirma status nenhum. Escrever um evento por email
 * mentiria no schema e corromperia as métricas da seção 3.
 */
export const timelineEntrySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('status'),
    id: z.string(),
    at: z.iso.datetime(),
    fromStatus: applicationStatusSchema.nullable(),
    toStatus: applicationStatusSchema,
    source: statusEventSourceSchema,
    note: z.string().nullable(),
  }),
  z.object({
    kind: z.literal('email'),
    id: z.string(),
    at: z.iso.datetime(),
    fromAddress: z.string(),
    fromName: z.string().nullable(),
    subject: z.string(),
    /** Texto puro, com teto. Renderizado como texto, nunca como HTML. */
    body: z.string().nullable(),
  }),
]);

export type TimelineEntry = z.infer<typeof timelineEntrySchema>;
export const timelineSchema = z.array(timelineEntrySchema);

export const linkEmailSchema = z.strictObject({
  applicationId: z.string().min(1),
});

export type LinkEmailInput = z.infer<typeof linkEmailSchema>;

/**
 * Criar candidatura a partir de um email de confirmação.
 *
 * Empresa e cargo vêm editáveis: o que o texto sugere é palpite, e você
 * confirma antes de virar registro. `profileId` decide de quem é — o email
 * não sabe, porque a caixa é da pessoa e os perfis são só um seletor.
 */
export const createApplicationFromEmailSchema = z.strictObject({
  profileId: z.string().min(1),
  company: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(120),
});

export type CreateApplicationFromEmailInput = z.infer<
  typeof createApplicationFromEmailSchema
>;

/**
 * Se o backend tem credencial de IMAP.
 *
 * Endpoint próprio, e não deduzido de um 503 na sincronização: inferir estado
 * a partir de código de erro dá certo até a rota mudar de forma — foi
 * exatamente o que aconteceu, um HEAD numa rota POST devolveu 404 e a tela
 * concluiu que estava tudo configurado.
 */
export const emailStatusSchema = z.object({
  configured: z.boolean(),
  mailbox: z.string().nullable(),
});

export type EmailStatus = z.infer<typeof emailStatusSchema>;

/**
 * Resultado de uma sincronização.
 *
 * A seção 8 pede tipo de payload de job em `packages/shared`. A fila ficou
 * para depois, mas o contrato do resultado não: é o corpo de `POST /emails/sync`
 * de qualquer forma.
 *
 * `failed` existe porque a sincronização grava por mensagem, sem transação
 * única — uma queda no meio deixa resultado parcial válido, e a tela precisa
 * poder dizer isso em vez de fingir sucesso.
 */
export const emailSyncResultSchema = z.object({
  fetched: z.number().int(),
  stored: z.number().int(),
  linked: z.number().int(),
  relinked: z.number().int(),
  skipped: z.number().int(),
  failed: z.array(z.string()),
  tookMs: z.number().int(),
});

export type EmailSyncResult = z.infer<typeof emailSyncResultSchema>;
