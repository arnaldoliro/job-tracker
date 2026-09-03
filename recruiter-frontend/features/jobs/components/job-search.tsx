"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { IconBookmark, IconExternalLink } from "@/components/icons";
import { saveJobAction } from "@/features/jobs/actions";
import { JobsTabs } from "@/features/jobs/components/jobs-tabs";
import {
  JobTags,
  StackTags,
  formatSalary,
} from "@/features/jobs/components/job-meta";
import type { JobSearchResult } from "@/features/jobs/types";
import { safeExternalUrl } from "@/lib/safe-url";

export interface SearchResultItem {
  result: JobSearchResult;
  /** Já está em "Minhas vagas" — casado por URL no servidor. */
  saved: boolean;
}

interface JobSearchProps {
  profileId: string;
  query: string;
  items: SearchResultItem[];
  savedCount: number;
}

export function JobSearch({
  profileId,
  query,
  items,
  savedCount,
}: JobSearchProps) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <JobsTabs savedCount={savedCount} />

      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Resultados de portais. Nada aqui está no seu banco até você salvar.
      </p>

      {/* GET puro: a busca fica na URL, é compartilhável e não precisa de JS. */}
      <form action="/vagas" className="flex gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="Empresa, cargo ou tecnologia"
          className="flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none transition focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100"
        />
        <button
          type="submit"
          className="cursor-pointer rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Buscar
        </button>
      </form>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 px-6 py-14 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Nenhuma vaga encontrada para esta busca.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <ResultCard key={item.result.url} profileId={profileId} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ResultCard({
  profileId,
  item,
}: {
  profileId: string;
  item: SearchResultItem;
}) {
  const { result, saved } = item;
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
      }
    });
  };

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-sm font-medium">{result.company}</span>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {result.title}
          </span>
        </div>
        <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          {result.source}
        </span>
      </div>

      <JobTags job={result} />
      <StackTags stack={result.stack} />

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

      <div className="flex items-center gap-2">
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
