import { resumeSchema, type Resume } from '@recruit/shared';

/**
 * Congelar o currículo que foi enviado numa candidatura.
 *
 * O §3 diz que `ResumeVersion` guarda o CONTEÚDO, não um ponteiro, "para
 * sobreviver a mudanças no CV base". É o que responde, seis meses e três
 * edições depois, qual versão você mandou para cada empresa.
 *
 * Puro e sem Prisma: a decisão que importa — reaproveitar a última versão ou
 * criar uma nova — é comparação de conteúdo, e comparação de conteúdo se testa
 * sem banco.
 */

/**
 * O currículo, em forma estável para comparar.
 *
 * `JSON.stringify` direto não serve: a ordem das chaves de um objeto vindo do
 * Prisma não é garantida, e uma diferença de ordem criaria uma versão nova a
 * cada candidatura mesmo sem você ter tocado no currículo.
 */
export function fingerprint(resume: Resume): string {
  return JSON.stringify(resume, Object.keys(resume).sort());
}

/**
 * O currículo do perfil, ou `null` quando não há nada que valha congelar.
 *
 * Currículo ausente ou corrompido devolve `null` em vez de gravar um snapshot
 * vazio: uma linha de `ResumeVersion` sem conteúdo afirmaria que você enviou
 * um currículo em branco, o que é pior que não afirmar nada.
 */
export function snapshotOf(stored: unknown): Resume | null {
  const parsed = resumeSchema.safeParse(stored);

  if (!parsed.success) {
    return null;
  }

  return isEmpty(parsed.data) ? null : parsed.data;
}

function isEmpty(resume: Resume): boolean {
  return (
    resume.summary === null &&
    resume.experiences.length === 0 &&
    resume.education.length === 0 &&
    resume.skills.length === 0 &&
    resume.projects.length === 0 &&
    resume.languages.length === 0 &&
    resume.certifications.length === 0
  );
}

/** "23/09/2026" — a data basta para você reconhecer a versão numa lista. */
export function labelFor(date: Date): string {
  return `Currículo de ${date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  })}`;
}
