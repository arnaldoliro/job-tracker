import type { EmailKind } from '@recruit/shared';
import { fold } from '../job/discovery/normalize';
import { domainOf, isAtsDomain, stripVia } from './ats';

/**
 * O que o email parece ser, por padrão de texto — não por modelo.
 *
 * Classificar o SENTIDO de uma mensagem é o que exige o Claude, e a seção 4
 * explica por quê: "we're moving forward with other candidates" e "we'd like to
 * move forward with you" são quase a mesma frase com sentidos opostos. Nada
 * aqui tenta isso.
 *
 * O que dá para reconhecer sem modelo é a FORMA: email de confirmação de
 * candidatura tem frase de recibo, e alerta de vaga tem cara de digest. É o
 * suficiente para o único efeito desta etapa — oferecer criar a candidatura
 * que você esqueceu de registrar.
 */

const CONFIRMATION = [
  'recebemos sua candidatura',
  'recebemos a sua candidatura',
  'candidatura recebida',
  'sua candidatura foi recebida',
  'obrigado por se candidatar',
  'obrigada por se candidatar',
  'inscricao confirmada',
  'we received your application',
  'we have received your application',
  'application received',
  'thank you for applying',
  'thanks for applying',
  'your application to',
  'your application for',
  'application submitted',
];

const ALERT = [
  'vagas para voce',
  'novas vagas',
  'vagas recomendadas',
  'oportunidades para voce',
  'job alert',
  'new jobs for you',
  'jobs you may be interested',
  'recommended for you',
  'vagas que combinam',
];

/**
 * Sinais de que o processo andou. NÃO diz para onde — só que não é recibo nem
 * digest. Para onde andou é trabalho do modelo, na etapa seguinte.
 */
const UPDATE = [
  'entrevista',
  'interview',
  'proxima etapa',
  'next step',
  'teste tecnico',
  'technical test',
  'desafio',
  'feedback',
  'processo seletivo',
  'infelizmente',
  'unfortunately',
  'proposta',
  'offer',
];

export function classify(subject: string, bodyText: string | null): EmailKind {
  const haystack = fold(`${subject} ${bodyText ?? ''}`);

  // Alerta antes de confirmação: um digest pode conter a palavra "candidatura"
  // num rodapé e seria classificado errado na ordem inversa.
  if (ALERT.some((phrase) => haystack.includes(phrase))) {
    return 'alerta';
  }

  if (CONFIRMATION.some((phrase) => haystack.includes(phrase))) {
    return 'confirmacao';
  }

  if (UPDATE.some((phrase) => haystack.includes(phrase))) {
    return 'atualizacao';
  }

  return 'desconhecido';
}

/**
 * A empresa que o email sugere — palpite, e é tratado como tal: vai para a
 * tela num campo editável, e você confirma antes de virar registro.
 *
 * O nome de exibição é a fonte mais confiável; o domínio próprio vem depois.
 * Domínio de ATS não serve: `greenhouse.io` não é o nome de empresa nenhuma.
 */
export function companyGuess(
  fromName: string | null,
  fromAddress: string,
  subject: string,
): string | null {
  const display = stripVia(fromName);

  if (display && !looksLikeRobot(display)) {
    return display;
  }

  const fromSubject = companyFromSubject(subject);

  if (fromSubject) {
    return fromSubject;
  }

  const domain = domainOf(fromAddress);

  if (domain && !isAtsDomain(domain)) {
    const [name] = domain.split('.');

    return name ? capitalize(name) : null;
  }

  return null;
}

/** "no-reply", "recrutamento", "talent acquisition" não são nome de empresa. */
const ROBOT = [
  'no-reply',
  'noreply',
  'nao-responda',
  'notificacao',
  'notification',
  'recrutamento',
  'recruiting',
  'talent',
  'careers',
  'jobs',
  'rh',
  'hr',
  'people',
];

function looksLikeRobot(name: string): boolean {
  const value = fold(name);

  return ROBOT.some((word) => value.includes(word));
}

/** "Sua candidatura para X na Nubank" / "Your application at Nubank". */
function companyFromSubject(subject: string): string | null {
  const match = subject.match(
    /(?:\b(?:na|no|em|at|with|para a|para o)\s+)([A-ZÁÂÃÉÊÍÓÔÕÚÇ][\w&.-]*(?:\s+[A-ZÁÂÃÉÊÍÓÔÕÚÇ][\w&.-]*){0,2})\s*$/,
  );

  return match ? match[1].trim() : null;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
