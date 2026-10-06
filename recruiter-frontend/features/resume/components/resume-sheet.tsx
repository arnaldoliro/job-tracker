import type { ProfileLinks, Resume } from "@recruit/shared";

/**
 * O currículo como folha, para ler e para imprimir.
 *
 * Mesmo componente para o currículo atual e para uma versão congelada numa
 * candidatura — o que muda é de onde vem o `resume`.
 *
 * O "PDF" é o do próprio navegador: `window.print()` abre o diálogo, e o CSS
 * de impressão daqui decide como a folha sai. Sem biblioteca, com texto
 * selecionável e fontes de verdade — uma lib de PDF desenharia tudo à mão e
 * sairia tipograficamente pior, além de trazer o Chromium junto no caso do
 * Playwright.
 */
export function ResumeSheet({
  name,
  headline,
  email,
  phone,
  location,
  links,
  resume,
}: {
  name: string;
  headline: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  links: ProfileLinks | null;
  resume: Resume;
}) {
  const contato = [email, phone, location].filter(Boolean) as string[];
  const web = links
    ? ([links.linkedin, links.github, links.website].filter(Boolean) as string[])
    : [];

  return (
    <article className="mx-auto flex w-full max-w-[210mm] flex-col gap-6 bg-white p-8 text-zinc-900 print:max-w-none print:p-0">
      <header className="flex flex-col gap-1 border-b border-zinc-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
        {headline && <p className="text-zinc-600">{headline}</p>}
        {contato.length > 0 && (
          <p className="text-sm text-zinc-500">{contato.join(" · ")}</p>
        )}
        {web.length > 0 && (
          <p className="text-sm text-zinc-500">{web.join(" · ")}</p>
        )}
      </header>

      {resume.summary && (
        <Section title="Resumo">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {resume.summary}
          </p>
        </Section>
      )}

      {resume.experiences.length > 0 && (
        <Section title="Experiência">
          {resume.experiences.map((item, index) => (
            <Entry
              key={`${item.company}-${index}`}
              title={item.role}
              subtitle={item.company}
              aside={period(item.startDate, item.endDate, item.current)}
              meta={item.location}
              body={item.description}
            />
          ))}
        </Section>
      )}

      {resume.education.length > 0 && (
        <Section title="Formação">
          {resume.education.map((item, index) => (
            <Entry
              key={`${item.school}-${index}`}
              title={[item.degree, item.field].filter(Boolean).join(" · ")}
              subtitle={item.school}
              aside={period(item.startDate, item.endDate, false)}
            />
          ))}
        </Section>
      )}

      {resume.skills.length > 0 && (
        <Section title="Skills">
          <p className="text-sm">{resume.skills.join(" · ")}</p>
        </Section>
      )}

      {resume.projects.length > 0 && (
        <Section title="Projetos">
          {resume.projects.map((item, index) => (
            <Entry
              key={`${item.name}-${index}`}
              title={item.name}
              subtitle={item.url}
              body={item.description}
            />
          ))}
        </Section>
      )}

      {resume.languages.length > 0 && (
        <Section title="Idiomas">
          <p className="text-sm">
            {resume.languages
              .map((item) =>
                item.level ? `${item.name} (${item.level})` : item.name,
              )
              .join(" · ")}
          </p>
        </Section>
      )}

      {resume.certifications.length > 0 && (
        <Section title="Certificações">
          {resume.certifications.map((item, index) => (
            <Entry
              key={`${item.name}-${index}`}
              title={item.name}
              subtitle={item.issuer}
              aside={item.date ? monthYear(item.date) : null}
            />
          ))}
        </Section>
      )}
    </article>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  // `break-inside-avoid` para uma seção curta não rachar no meio da página.
  return (
    <section className="flex flex-col gap-2 print:break-inside-avoid">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Entry({
  title,
  subtitle,
  aside,
  meta,
  body,
}: {
  title: string;
  subtitle?: string | null;
  aside?: string | null;
  meta?: string | null;
  body?: string | null;
}) {
  return (
    <div className="flex flex-col gap-0.5 print:break-inside-avoid">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium">{title}</span>
        {aside && (
          <span className="shrink-0 text-xs text-zinc-500">{aside}</span>
        )}
      </div>
      {subtitle && <span className="text-sm text-zinc-600">{subtitle}</span>}
      {meta && <span className="text-xs text-zinc-500">{meta}</span>}
      {body && (
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
          {body}
        </p>
      )}
    </div>
  );
}

function period(
  start: string | null,
  end: string | null,
  current: boolean,
): string | null {
  const from = start ? monthYear(start) : null;
  const to = current ? "atual" : end ? monthYear(end) : null;

  if (!from && !to) {
    return null;
  }

  return [from, to].filter(Boolean).join(" — ");
}

/** `2024-03` → `mar/2024`. Currículo não usa dia. */
function monthYear(value: string): string {
  const [year, month] = value.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);

  return date
    .toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
    .replace(".", "");
}
