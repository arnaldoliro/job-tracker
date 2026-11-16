import { isJobDigestSender } from './ats';
import { findDeadline, type DeadlineMention } from './deadline';

/** Sinal para revisão, nunca prova de aprovação ou de vaga ainda aberta. */
export function actionRequired(mail: {
  subject: string;
  bodyText: string | null;
  fromAddress: string;
}): {
  kind: 'entrevista' | 'teste' | 'pendencia';
  deadline: DeadlineMention | null;
} | null {
  if (isJobDigestSender(mail.fromAddress)) return null;
  const own = `${mail.subject}\n${ownText(mail.bodyText ?? '')}`;
  const text = normalize(own);
  if (ANNOUNCEMENT.test(normalize(mail.subject)) || CLOSED.test(text))
    return null;
  let kind: 'entrevista' | 'teste' | 'pendencia';
  if (INTERVIEW.test(text)) kind = 'entrevista';
  else if (TEST.test(text)) kind = 'teste';
  else if (PENDING.test(text)) kind = 'pendencia';
  else return null;
  // O prazo sai do texto original, para a tela mostrar como o email
  // escreveu; a conta (vencido ou não) é de `deadline.ts`.
  return { kind, deadline: findDeadline(own) };
}

/**
 * Só o texto novo do email. Convite antigo citado numa resposta ("On ...
 * wrote:", "Em ... escreveu:", linhas com ">", cabeçalho do Outlook) já foi
 * tratado quando chegou; reabri-lo faria um "obrigado" virar pendência.
 */
function ownText(body: string): string {
  return body.split(
    /\n(?:On .+wrote:|Em .+escreveu:|>|-{2,}\s*(?:original message|mensagem original)|(?:From|De):\s.+)/i,
  )[0];
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Assunto de divulgação: webinar, newsletter, dica, lista de vagas. Falam de
 * entrevista e teste o tempo todo, e nenhum pede ação sobre uma candidatura.
 * Só no assunto: no corpo, "dicas" aparece também em convite de verdade.
 */
const ANNOUNCEMENT =
  /webinar|newsletter|dicas? (?:para|de|pra)|como (?:se preparar|ir bem|mandar bem)|novas vagas|vagas (?:recomendadas|para voce|em destaque)|job alert|jobs? (?:for you|you may)|recommended jobs|tips (?:for|to)/;

/** Negativa ou vaga encerrada: o convite que aparece junto já não vale. */
const CLOSED =
  /(?:vaga|posicao|processo seletivo).{0,60}(?:encerrad|cancelad|preenchid|congelad)|nao (?:seguiremos|avancaremos|daremos continuidade)|nao seguira|optamos por (?:seguir|nao seguir)|decidimos (?:seguir|prosseguir) com outr|nao (?:foi|fomos) selecionad|position.{0,30}(?:closed|filled)|not (?:moving|proceeding) forward|(?:have )?decided (?:to (?:move|proceed) forward with other|not to (?:move|proceed))|will not be (?:moving|proceeding)/;

/**
 * Convite de entrevista: o verbo pede ação AGORA ("agende", "schedule your").
 * Descrição de etapas ("as etapas são triagem, entrevista e teste") não tem
 * esse verbo e não casa.
 */
const INTERVIEW = new RegExp(
  [
    'convite para (?:a |uma )?entrevista',
    'entrevista para a vaga',
    'convidad[oa].{0,60}entrevista',
    'falta (?:a|uma) entrevista',
    '(?:agende|agendar|marque|marcar) (?:a |sua |uma |o horario da |o horario de )?entrevista',
    'agendamento (?:da |de |de sua |da sua )?entrevista',
    '(?:escolha|selecione) (?:um|o|o seu|seu) horario.{0,60}entrevista',
    'entrevista.{0,60}(?:escolha|selecione) (?:um|o|o seu|seu) horario',
    'interview invit',
    'invit(?:e|ed|ation) (?:you )?to (?:an? |the |your )?(?:\\w+ )?interview',
    '(?:schedule|book) (?:your|an|a|the) (?:\\w+ )?interview',
    '(?:pick|choose|select) a (?:time|slot).{0,40}interview',
    'ai interview',
    'complete.{0,30}interview',
  ].join('|'),
);

/** Teste, desafio ou avaliação liberados para você fazer. */
const TEST = new RegExp(
  [
    'etapa de teste',
    'etapa.{0,100}desbloqueada',
    'convid.{0,60}(?:realizar|responder|fazer).{0,30}(?:teste|avaliacao|desafio)',
    'convite para (?:o |a )?(?:teste|desafio|avaliacao)',
    '(?:realize|faca|responda|inicie|acesse|conclua|finalize) (?:o |a |seu |sua )?(?:teste|desafio|avaliacao|case|prova)\\b',
    '(?:seu|sua) (?:teste|desafio|avaliacao).{0,30}(?:disponivel|liberad)',
    '(?:complete|take|start|finish) (?:the |your |an |a )?(?:online |technical |coding |skills? )?(?:assessment|test|challenge|exercise)',
    'coding challenge',
    'take-home',
    'online assessment',
  ].join('|'),
);

/** Candidatura começada e não concluída, ou pergunta esperando resposta. */
const PENDING =
  /candidatura.{0,60}nao finalizada|ainda nao finalizou|falta um passo|ultima chamada|responda (?:a )?\d+ perguntas/;
