import {
  boardSlugFromUrl,
  domainOf,
  isAtsDomain,
  mentionsCompany,
  stripVia,
} from './ats';
import { fold } from '../job/discovery/normalize';

/**
 * Decide a qual candidatura um email pertence.
 *
 * Regras em camadas, e não pontuação com limiar. Um número mágico é
 * intestável e, quando algo não vincula, não dá para explicar por quê. Aqui
 * cada vínculo tem um motivo em texto, que volta no DTO para você julgar.
 *
 * O viés é conservador: vínculo errado é pior que vínculo nenhum. Ele suja o
 * histórico de uma candidatura com a conversa de outra, e você não tem como
 * desconfiar — enquanto um email não vinculado fica visível na caixa,
 * pedindo atenção.
 */

export interface Candidate {
  applicationId: string;
  company: string;
  title: string;
  jobUrl: string | null;
  createdAt: Date;
  appliedAt: Date | null;
}

export interface MailFacts {
  fromAddress: string;
  fromName: string | null;
  subject: string;
  bodyText: string | null;
  receivedAt: Date;
  /** Ids de mensagens citadas em `In-Reply-To` e `References`. */
  references: string[];
}

export interface Match {
  applicationId: string;
  reason: string;
}

/** Email anterior à candidatura por mais que isto não pode ser dela. */
const GRACE_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Camada 0 — exata, e por isso vem antes de qualquer heurística.
 *
 * Se a conversa cita um email que já está guardado e vinculado, este pertence
 * à mesma candidatura. Zero falso positivo, e cobre a maior parte do tráfego
 * real: agendamento, recusa e follow-up são sempre respostas.
 */
export function matchByThread(
  references: string[],
  knownByMessageId: Map<string, string>,
): Match | null {
  for (const reference of references) {
    const applicationId = knownByMessageId.get(reference);

    if (applicationId) {
      return {
        applicationId,
        reason: 'é resposta a um email já vinculado a esta candidatura',
      };
    }
  }

  return null;
}

/**
 * Camadas 1 e 2.
 *
 * Qualificam apenas: empresa no nome de exibição (sem o "via <ATS>"), domínio
 * do remetente que NÃO é de ATS, ou o slug do board na URL da vaga.
 *
 * O corpo do email não qualifica — rodapé, "powered by" e digest de alertas
 * citam dezenas de empresas, e usar o corpo como qualificador faria um email
 * casar com meia lista de candidaturas.
 */
export function matchByCompany(
  mail: MailFacts,
  candidates: Candidate[],
): Match | null {
  const senderDomain = domainOf(mail.fromAddress);
  const fromAts = isAtsDomain(senderDomain);
  const displayName = stripVia(mail.fromName) ?? '';

  const qualified = candidates
    .filter((candidate) => withinTime(mail, candidate))
    .map((candidate) => ({ candidate, reason: qualify(candidate) }))
    .filter((entry): entry is { candidate: Candidate; reason: string } =>
      Boolean(entry.reason),
    );

  if (qualified.length === 0) {
    return null;
  }

  if (qualified.length === 1) {
    return {
      applicationId: qualified[0].candidate.applicationId,
      reason: qualified[0].reason,
    };
  }

  // Empate entre empresas diferentes é defeito de sinal, não ambiguidade
  // legítima: nenhum email é de duas empresas. Quem chama registra e não
  // vincula nada.
  const companies = new Set(qualified.map((e) => fold(e.candidate.company)));

  if (companies.size > 1) {
    return null;
  }

  return breakTie(mail, qualified);

  function qualify(candidate: Candidate): string | null {
    if (displayName && mentionsCompany(displayName, candidate.company)) {
      return `o remetente se identifica como ${candidate.company}`;
    }

    // Só domínio próprio da empresa identifica. `greenhouse.io` é de todas.
    if (
      senderDomain &&
      !fromAts &&
      mentionsCompany(senderDomain.replace(/\./g, ' '), candidate.company)
    ) {
      return `o remetente é do domínio ${senderDomain}`;
    }

    const slug = boardSlugFromUrl(candidate.jobUrl);

    if (slug && mentionsCompany(slug.replace(/-/g, ' '), candidate.company)) {
      return `o board da vaga é de ${candidate.company}`;
    }

    return null;
  }
}

/**
 * Mesma empresa, mais de uma candidatura aberta. O cargo no assunto decide;
 * sem isso, a candidatura mais recente.
 */
function breakTie(
  mail: MailFacts,
  qualified: { candidate: Candidate; reason: string }[],
): Match | null {
  const byTitle = qualified.filter(({ candidate }) =>
    titleMatches(mail.subject, candidate.title),
  );

  if (byTitle.length === 1) {
    return {
      applicationId: byTitle[0].candidate.applicationId,
      reason: `${byTitle[0].reason}, e o assunto cita o cargo`,
    };
  }

  const pool = byTitle.length > 0 ? byTitle : qualified;
  const newest = pool.reduce((best, entry) =>
    when(entry.candidate) > when(best.candidate) ? entry : best,
  );

  return {
    applicationId: newest.candidate.applicationId,
    reason: `${newest.reason} — havia mais de uma candidatura nesta empresa, e esta é a mais recente`,
  };
}

/**
 * Termos distintivos do cargo no assunto. Palavras genéricas ficam de fora:
 * "engenheiro" e "developer" aparecem em quase todo assunto de ATS e não
 * distinguem uma candidatura da outra.
 */
const GENERIC = new Set([
  'de',
  'da',
  'do',
  'e',
  'a',
  'o',
  'para',
  'com',
  'senior',
  'pleno',
  'junior',
  'sr',
  'jr',
  'engenheiro',
  'engenheira',
  'engineer',
  'developer',
  'desenvolvedor',
  'desenvolvedora',
  'analista',
  'software',
  'pessoa',
]);

function titleMatches(subject: string, title: string): boolean {
  const terms = fold(title)
    .split(/[^a-z0-9+#.]+/)
    .filter((term) => term.length > 2 && !GENERIC.has(term));

  return (
    terms.length > 0 && terms.some((term) => mentionsCompany(subject, term))
  );
}

function withinTime(mail: MailFacts, candidate: Candidate): boolean {
  return mail.receivedAt.getTime() >= when(candidate).getTime() - GRACE_MS;
}

function when(candidate: Candidate): Date {
  return candidate.appliedAt ?? candidate.createdAt;
}
