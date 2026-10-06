/**
 * O filtro de soft delete, num lugar só.
 *
 * Morava dentro do `ApplicationService`, com o comentário de que repetir a
 * condição bastava "enquanto este for o único service que lê `Application`".
 * Deixou de ser: o `EmailService` já a repetia na linha do tempo, e as
 * métricas seriam a terceira cópia.
 *
 * Importa porque esquecê-la não dá erro. O §3 diz que candidatura apagada some
 * da listagem E DAS MÉTRICAS — sem isto, um painel reportaria 8 candidaturas
 * onde existem 4, com toda a cara de estar certo.
 */
export const active = { deletedAt: null } as const;
