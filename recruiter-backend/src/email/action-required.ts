import { isJobDigestSender } from './ats';

/** Sinal para revisão, nunca prova de aprovação ou de vaga ainda aberta. */
export function actionRequired(mail: {
  subject: string;
  bodyText: string | null;
  fromAddress: string;
}): {
  kind: 'entrevista' | 'teste' | 'pendencia';
  deadlineLabel: string | null;
} | null {
  if (isJobDigestSender(mail.fromAddress)) return null;
  // Não reabre convites antigos citados em respostas.
  const body = (mail.bodyText ?? '').split(
    /\n(?:On .+wrote:|Em .+escreveu:|>)/i,
  )[0];
  const text = `${mail.subject} ${body}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (
    /(?:vaga|posicao|processo seletivo).{0,60}(?:encerrad|cancelad|preenchid|congelad)|nao (?:seguiremos|avancaremos|daremos continuidade)|nao seguira|optamos por (?:seguir|nao seguir)|position.{0,30}(?:closed|filled)|not (?:moving|proceeding) forward/.test(
      text,
    )
  )
    return null;
  let kind: 'entrevista' | 'teste' | 'pendencia';
  if (
    /convite para (?:a )?entrevista|entrevista para a vaga|interview invite|ai interview|complete your interview|falta (?:a|uma) entrevista|convidad[oa].{0,60}entrevista|complete.{0,30}(?:ai )?interview/.test(
      text,
    )
  )
    kind = 'entrevista';
  else if (
    /etapa de teste|etapa.{0,100}desbloqueada|convid.{0,60}(?:realizar|responder).{0,30}(?:teste|avaliacao)|complete.{0,30}assessment/.test(
      text,
    )
  )
    kind = 'teste';
  else if (
    /candidatura.{0,60}nao finalizada|ainda nao finalizou|falta um passo|ultima chamada|responda (?:a )?\d+ perguntas/.test(
      text,
    )
  )
    kind = 'pendencia';
  else return null;
  // Não inventa ano nem confunde prazo do email com disponibilidade do portal.
  const deadline = text.match(
    /(?:ate|prazo(?: final)?[: ]+)\s*(\d{1,2}\s+de\s+[a-z]+\s+de\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4})\b/,
  );
  const relative = text.match(
    /(?:expira(?:ra)?|expire(?:s)?|valid[oa])\s*(?:em|in|por)?\s*(\d+\s*(?:horas?|hours?|dias?|days?))\b/,
  );
  return {
    kind,
    deadlineLabel:
      deadline?.[1] ?? (relative ? `${relative[1]} a partir do envio` : null),
  };
}
