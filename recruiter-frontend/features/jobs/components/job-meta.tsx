import type { Job, JobSearchResult } from "@/features/jobs/types";

type JobLike = Job | JobSearchResult;

/**
 * Faixa numérica em vez de texto livre é o que permite formatar assim — e, mais
 * adiante, é o que a tela de métricas vai precisar para calcular média.
 */
export function formatSalary(job: JobLike): string | null {
  const currency = job.salaryCurrency ?? "BRL";
  const format = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);

  if (job.salaryMin && job.salaryMax) {
    return `${format(job.salaryMin)} – ${format(job.salaryMax)}`;
  }

  if (job.salaryMin) return `a partir de ${format(job.salaryMin)}`;
  if (job.salaryMax) return `até ${format(job.salaryMax)}`;

  return null;
}

export function JobTags({ job }: { job: JobLike }) {
  const tags = [
    job.workModel,
    job.contractType?.toUpperCase(),
    job.seniority,
    job.weeklyHours ? `${job.weeklyHours}h/semana` : null,
    job.location,
  ].filter(Boolean) as string[];

  if (tags.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs capitalize text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

export function StackTags({
  stack,
  max,
}: {
  stack: string[];
  /** Corta a lista e resume o resto. Necessário no card estreito da grade. */
  max?: number;
}) {
  if (stack.length === 0) {
    return null;
  }

  const shown = max ? stack.slice(0, max) : stack;
  const hidden = stack.length - shown.length;

  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((item) => (
        <span
          key={item}
          className="rounded-md border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
        >
          {item}
        </span>
      ))}
      {hidden > 0 && (
        <span className="px-1 py-0.5 text-xs text-zinc-400 dark:text-zinc-500">
          +{hidden}
        </span>
      )}
    </div>
  );
}
