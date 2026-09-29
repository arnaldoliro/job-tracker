"use client";

import { Tilt } from "@/components/motion";

import { useCallback, useState, useTransition } from "react";
import { IconEye, IconPencil, IconPlus, IconTrash } from "@/components/icons";
import { deleteApplicationAction } from "@/features/applications/actions";
import {
  ApplicationModal,
  type ModalEntry,
} from "@/features/applications/components/application-modal";
import { StatusSelect } from "@/features/applications/components/status-select";
import { StatusSuggestionCard } from "@/features/applications/components/status-suggestion";
import type { Application } from "@/features/applications/types";
import type { StatusSuggestion } from "@recruit/shared";

interface ApplicationsPanelProps {
  profileId: string;
  applications: Application[];
  /** No máximo uma por candidatura — o backend já escolheu. */
  suggestions: StatusSuggestion[];
}

export function ApplicationsPanel({
  profileId,
  applications,
  suggestions,
}: ApplicationsPanelProps) {
  const suggestionFor = new Map(
    suggestions.map((suggestion) => [suggestion.applicationId, suggestion]),
  );

  // O entry não é limpo ao fechar: manter o último conteúdo evita o modal
  // esvaziar no meio da animação de saída.
  const [entry, setEntry] = useState<ModalEntry | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const show = useCallback((next: ModalEntry) => {
    setEntry(next);
    setOpen(true);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  const remove = (id: string) => {
    setError(null);
    startTransition(async () => {
      const result = await deleteApplicationAction(id);

      if (result.status === "error") {
        setError(result.message);
      }

      setConfirmingId(null);
    });
  };

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold">Candidaturas</h1>
          <p className="text-sm text-zinc-400">
            {applications.length === 1
              ? "1 processo em andamento"
              : `${applications.length} processos em andamento`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => show({ mode: "create" })}
          className="flex cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-accent-2 px-4 py-2.5 text-sm font-semibold text-zinc-950 shadow-[0_8px_30px_-8px] shadow-accent/70 transition hover:brightness-110 active:scale-[0.98]"
        >
          <IconPlus />
          Nova candidatura
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {applications.length === 0 ? (
        <EmptyState onCreate={() => show({ mode: "create" })} />
      ) : (
        // Grade e não lista: numa tela larga a lista deixava dois terços da
        // largura vazios. Cada card entra em cascata (`cine-reveal`, no <li>)
        // e inclina com o cursor (`Tilt`, dentro dele) — em elementos
        // separados porque os dois animam `transform`, e no mesmo elemento um
        // sobrescreveria o outro.
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {applications.map((application, index) => (
            <li
              key={application.id}
              className="cine-reveal"
              style={{ ["--i" as string]: index }}
            >
              <Tilt className="h-full rounded-2xl">
                <article className="cine-glass flex h-full flex-col gap-4 overflow-hidden rounded-2xl p-5">
                  <span
                    aria-hidden
                    className={`-mx-5 -mt-5 h-1 ${statusStripe[application.status]}`}
                  />

                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate font-[family-name:var(--font-display)] text-lg font-semibold">
                      {application.job.company}
                    </span>
                    <span className="line-clamp-2 text-sm text-zinc-400">
                      {application.job.title}
                    </span>
                  </div>

                  <Meta application={application} />

                  {suggestionFor.has(application.id) && (
                    <StatusSuggestionCard
                      suggestion={suggestionFor.get(application.id)!}
                      onError={setError}
                    />
                  )}

                  <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/5 pt-4">
                    <StatusSelect
                      applicationId={application.id}
                      status={application.status}
                      onError={setError}
                    />

                    <div className="flex items-center gap-1">
                      <IconButton
                        label="Ver detalhes"
                        onClick={() => show({ mode: "view", application })}
                      >
                        <IconEye />
                      </IconButton>
                      <IconButton
                        label="Editar"
                        onClick={() => show({ mode: "edit", application })}
                      >
                        <IconPencil />
                      </IconButton>

                      {confirmingId === application.id ? (
                        // Confirmação em dois passos no próprio botão, em vez
                        // de um segundo modal por cima do primeiro.
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => remove(application.id)}
                          className="cursor-pointer rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
                        >
                          {pending ? "Excluindo…" : "Confirmar?"}
                        </button>
                      ) : (
                        <IconButton
                          label="Excluir"
                          danger
                          onClick={() => setConfirmingId(application.id)}
                        >
                          <IconTrash />
                        </IconButton>
                      )}
                    </div>
                  </div>
                </article>
              </Tilt>
            </li>
          ))}
        </ul>
      )}

      <ApplicationModal
        entry={entry}
        open={open}
        profileId={profileId}
        onClose={close}
        onEdit={(application) => show({ mode: "edit", application })}
      />
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-zinc-300 px-6 py-14 text-center dark:border-zinc-700">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Nenhuma candidatura ainda. Empresa e cargo bastam para registrar a
        primeira.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="cursor-pointer text-sm font-medium text-zinc-900 underline underline-offset-4 dark:text-zinc-100"
      >
        Registrar candidatura
      </button>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`cursor-pointer rounded-lg p-2 transition-colors ${
        danger
          ? "text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:text-zinc-600 dark:hover:bg-red-950 dark:hover:text-red-400"
          : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Faixa no topo do card, na cor da etapa — a mesma linguagem dos crachás de
 * status, para o olho achar "quais estão em entrevista" sem ler.
 *
 * Classes literais: o Tailwind lê o texto do fonte, e uma classe montada por
 * template não geraria CSS nenhum.
 */
const statusStripe: Record<Application["status"], string> = {
  rascunho: "bg-zinc-500",
  aplicado: "bg-gradient-to-r from-sky-500 to-sky-300",
  triagem: "bg-gradient-to-r from-indigo-500 to-indigo-300",
  entrevista: "bg-gradient-to-r from-violet-500 to-fuchsia-400",
  teste: "bg-gradient-to-r from-amber-500 to-yellow-300",
  oferta: "bg-gradient-to-r from-emerald-500 to-teal-300",
  rejeitado: "bg-gradient-to-r from-red-600 to-rose-400",
};

/** O que a vaga declara e ajuda a lembrar qual era: modalidade, local, nível. */
function Meta({ application }: { application: Application }) {
  const facts = [
    application.job.workModel,
    application.job.location,
    application.job.seniority,
  ].filter((fact): fact is string => Boolean(fact));

  const sent = application.appliedAt ?? application.createdAt;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {facts.map((fact) => (
        <span
          key={fact}
          className="rounded-md border border-white/5 bg-white/5 px-2 py-0.5 capitalize text-zinc-300"
        >
          {fact}
        </span>
      ))}
      <span className="text-zinc-500">
        {application.appliedAt ? "enviada" : "registrada"} em{" "}
        {new Date(sent).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "short",
        })}
      </span>
    </div>
  );
}
