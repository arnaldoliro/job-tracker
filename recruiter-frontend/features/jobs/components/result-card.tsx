"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { IconBookmark, IconExternalLink } from "@/components/icons";
import { saveJobAction } from "@/features/jobs/actions";
import {
  JobTags,
  StackTags,
  formatSalary,
} from "@/features/jobs/components/job-meta";
import type { JobSearchResult } from "@/features/jobs/types";
import { safeExternalUrl } from "@/lib/safe-url";

/**
 * O card de uma vaga externa.
 *
 * Vive fora do `job-search` porque tem três consumidores: a descoberta, a
 * extração por link e, na fase 2, a revisão de descartadas. Os três recebem o
 * mesmo `JobSearchResult`, e é isso que faz uma vaga extraída seguir pelo
 * mesmo caminho de salvar que uma vaga descoberta.
 */

export interface SearchResultItem {
  result: JobSearchResult;
  /** Já está em "Minhas vagas" — casado por URL no servidor. */
  saved: boolean;
}

export function ResultCard({
  profileId,
  item,
}: {
  profileId: string;
  item: SearchResultItem;
}) {
  const { result } = item;
  // Estado local, e não só a prop: depois de salvar, o card confirma na hora,
  // sem depender de a página inteira revalidar.
  const [saved, setSaved] = useState(item.saved);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const salary = formatSalary(result);
  const portalUrl = safeExternalUrl(result.url);

  const save = () => {
    setError(null);
    startTransition(async () => {
      const outcome = await saveJobAction(profileId, result);

      if (outcome.status === "error") {
        setError(outcome.message);

        return;
      }

      setSaved(true);
    });
  };

  return (
    <li className="flex h-full flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-sm font-medium" title={result.company}>
            {result.company}
          </span>
          {/* Duas linhas no máximo: sem isto cada card da grade tem uma altura
              diferente, porque os títulos variam de 3 a 12 palavras. */}
          <span
            className="line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400"
            title={result.title}
          >
            {result.title}
          </span>
        </div>
        <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          {result.source}
        </span>
      </div>

      <JobTags job={result} />
      <StackTags stack={result.stack} max={4} />

      {salary && (
        <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
          {salary}
        </span>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {/* mt-auto: as ações encostam no rodapé, então os cards da linha
          terminam alinhados mesmo com conteúdos de tamanhos diferentes. */}
      <div className="mt-auto flex flex-wrap items-center gap-2">
        {portalUrl && (
          <a
            href={portalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            <IconExternalLink />
            Ver no portal
          </a>
        )}

        {saved ? (
          <Link
            href="/vagas/salvas"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-emerald-700 underline underline-offset-4 transition hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
          >
            <IconBookmark />
            Salva — ver em Minhas vagas
          </Link>
        ) : (
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            <IconBookmark />
            {pending ? "Salvando…" : "Salvar"}
          </button>
        )}
      </div>
    </li>
  );
}
