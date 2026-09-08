"use client";

import { useCallback, useState, useTransition } from "react";
import { IconEye, IconPencil, IconPlus, IconTrash } from "@/components/icons";
import { deleteApplicationAction } from "@/features/applications/actions";
import {
  ApplicationModal,
  type ModalEntry,
} from "@/features/applications/components/application-modal";
import { StatusSelect } from "@/features/applications/components/status-select";
import type { Application } from "@/features/applications/types";

interface ApplicationsPanelProps {
  profileId: string;
  applications: Application[];
}

export function ApplicationsPanel({
  profileId,
  applications,
}: ApplicationsPanelProps) {
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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Candidaturas</h1>
        <button
          type="button"
          onClick={() => show({ mode: "create" })}
          className="flex cursor-pointer items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
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
        <ul className="flex flex-col divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {applications.map((application) => (
            <li
              key={application.id}
              className="flex items-center gap-4 px-4 py-3"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">
                  {application.job.company}
                </span>
                <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {application.job.title}
                </span>
              </div>

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
                  // Confirmação em dois passos no próprio botão, em vez de um
                  // segundo modal por cima do primeiro.
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
