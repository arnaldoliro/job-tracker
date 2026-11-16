import { z } from 'zod';
import {
  applicationStatusSchema,
  type ApplicationStatus,
} from './application-status';

/**
 * A tela "Hoje": o que pede ação agora, juntado de lugares diferentes.
 *
 * A busca de emprego se perde em silêncio — a candidatura sem resposta há
 * três semanas não avisa que ficou esquecida. Esta tela é o lugar onde ela
 * avisa.
 */

/**
 * Depois de quantos dias parada num status uma candidatura pede follow-up.
 *
 * `null` = não pede: recusa não tem próximo passo. Os prazos seguem o ritmo
 * de um processo seletivo: proposta pede resposta em dias, candidatura enviada
 * costuma levar uma ou duas semanas para alguém olhar.
 */
export const FOLLOW_UP_DAYS: Record<ApplicationStatus, number | null> = {
  rascunho: 3,
  aplicado: 10,
  triagem: 7,
  entrevista: 5,
  teste: 5,
  oferta: 2,
  rejeitado: null,
  cancelado: null,
};

/** "Adiar" empurra o lembrete por este tanto, qualquer que seja o status. */
export const FOLLOW_UP_SNOOZE_DAYS = 3;

export const followUpActionSchema = z.strictObject({
  /**
   * `feito`: você fez o follow-up; o próximo vence no prazo do status.
   * `adiar`: ainda não é hora; volta em FOLLOW_UP_SNOOZE_DAYS.
   */
  action: z.enum(['feito', 'adiar']),
});

export type FollowUpAction = z.infer<typeof followUpActionSchema>['action'];

export const dueFollowUpSchema = z.object({
  applicationId: z.string(),
  company: z.string(),
  title: z.string(),
  status: applicationStatusSchema,
  /** Desde quando a candidatura está neste status. */
  since: z.iso.datetime(),
  /** Quando o lembrete venceu. */
  dueAt: z.iso.datetime(),
  /** Dias inteiros desde `since`, para a tela não fazer conta de data. */
  daysInStatus: z.number().int(),
});

export type DueFollowUp = z.infer<typeof dueFollowUpSchema>;

export const savedNotAppliedSchema = z.object({
  jobId: z.string(),
  company: z.string(),
  title: z.string(),
  url: z.string().nullable(),
  savedAt: z.iso.datetime(),
});

export const emailActionSchema = z.object({
  emailId: z.string(),
  subject: z.string(),
  sender: z.string(),
  receivedAt: z.iso.datetime(),
  kind: z.enum(['entrevista', 'teste', 'pendencia']),
  deadlineLabel: z.string().nullable(),
  gmailUrl: z.url().nullable(),
});
export type EmailAction = z.infer<typeof emailActionSchema>;
/** Busca manual complementar: não amplia o acesso do IMAP. */
export const RECRUITING_RESCUE_QUERY =
  'newer_than:90d {from:noreplyhiring@ciandt.com from:fcinterview.fcamara.com.br from:micro1.ai from:mailer.digai.ai}';

export const todaySchema = z.object({
  emailActions: z.array(emailActionSchema).default([]),
  followUps: z.array(dueFollowUpSchema),
  /** Sugestões de status lidas dos emails, esperando o seu clique. */
  pendingSuggestions: z.number().int(),
  /** Vagas que você salvou e ainda não virou candidatura. */
  savedNotApplied: z.array(savedNotAppliedSchema),
  /** Candidaturas ativas por status. */
  pipeline: z.record(applicationStatusSchema, z.number().int()),
});

export type Today = z.infer<typeof todaySchema>;
