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

/**
 * Prazo citado no email. `text` é o trecho como o email escreveu.
 *
 * `dueDate` (só o dia) e `dueAt` (instante) nunca vêm juntos: data sem hora
 * no email não ganha hora aqui. `dueAt` só existe para prazo relativo
 * ("expira em 48 horas"), contado do recebimento. Sem ano, com data
 * inválida ou em "dias úteis", os dois são nulos e o estado é `desconhecido`.
 *
 * `vencido` diz que a data do email passou, NÃO que a etapa fechou no portal.
 */
export const emailDeadlineSchema = z.object({
  text: z.string(),
  dueDate: z.iso.date().nullable(),
  dueAt: z.iso.datetime().nullable(),
  state: z.enum(['proximo', 'vencido', 'desconhecido']),
  /** Dias de calendário até o prazo, em São Paulo. Negativo: já passou. */
  daysLeft: z.number().int().nullable(),
});
export type EmailDeadline = z.infer<typeof emailDeadlineSchema>;

export const emailActionSchema = z.object({
  emailId: z.string(),
  subject: z.string(),
  sender: z.string(),
  receivedAt: z.iso.datetime(),
  kind: z.enum(['entrevista', 'teste', 'pendencia']),
  /** Nulo: o email não cita prazo nenhum. */
  deadline: emailDeadlineSchema.nullable(),
  gmailUrl: z.url().nullable(),
});
export type EmailAction = z.infer<typeof emailActionSchema>;
/**
 * Em que pé está a leitura dos emails, para a tela não confundir "nada a
 * fazer" com "nada lido".
 *
 * Vive na memória da API: reiniciar zera o histórico até a próxima rodada
 * (a do boot, quando ligada). Por isso `lastSuccessAt` nulo é dito como "sem
 * sincronização desde que a API iniciou", não "nunca".
 */
export const emailSyncStateSchema = z.object({
  /** IMAP configurado no .env do backend. */
  configured: z.boolean(),
  /** O ÚNICO rótulo que o app lê. O resgate de 90 dias também fica nele. */
  mailbox: z.string().nullable(),
  /** Rodada em curso, de clique ou do boot. */
  runningSince: z.iso.datetime().nullable(),
  /** Fim da última rodada sem nenhuma falha. */
  lastSuccessAt: z.iso.datetime().nullable(),
  /** A última rodada terminada, com sucesso ou não. */
  lastAttempt: z
    .object({
      finishedAt: z.iso.datetime(),
      /** `parcial`: leu, mas alguns emails não foram gravados. */
      outcome: z.enum(['ok', 'parcial', 'falhou']),
      /** Emails que falharam (parcial) ou o erro (falhou). */
      failed: z.number().int().min(0),
      message: z.string().nullable(),
    })
    .nullable(),
  /**
   * `em-dia`: último sucesso há menos de `EMAIL_STALE_HOURS`.
   * `desatualizado`: sucesso mais antigo, ou a última rodada falhou.
   * `sem-dados`: nenhum sucesso desde que a API iniciou.
   */
  freshness: z.enum(['em-dia', 'desatualizado', 'sem-dados']),
});
export type EmailSyncState = z.infer<typeof emailSyncStateSchema>;

/**
 * Depois de quanto tempo sem sincronizar a tela avisa. Um dia: processo
 * seletivo responde em dias, e não há sincronização automática (cada rodada
 * pode chamar o modelo, ver `email-boot-sync.ts`).
 */
export const EMAIL_STALE_HOURS = 24;

export const todaySchema = z.object({
  emailSync: emailSyncStateSchema.default({
    configured: false,
    mailbox: null,
    runningSince: null,
    lastSuccessAt: null,
    lastAttempt: null,
    freshness: 'sem-dados',
  }),
  /** Já em ordem: prazo próximo primeiro, depois sem prazo, vencidos no fim. */
  emailActions: z.array(emailActionSchema).default([]),
  /**
   * Busca do Gmail pelos remetentes de recrutamento do .env
   * (`RECRUITING_RESCUE_SENDERS`). Nula quando a lista está vazia. Vem da API,
   * e não de uma constante aqui, porque a lista é da pessoa e não pode ir
   * para o repositório.
   */
  rescueQuery: z.string().nullable().default(null),
  followUps: z.array(dueFollowUpSchema),
  /** Sugestões de status lidas dos emails, esperando o seu clique. */
  pendingSuggestions: z.number().int(),
  /** Vagas que você salvou e ainda não virou candidatura. */
  savedNotApplied: z.array(savedNotAppliedSchema),
  /** Candidaturas ativas por status. */
  pipeline: z.record(applicationStatusSchema, z.number().int()),
});

export type Today = z.infer<typeof todaySchema>;
