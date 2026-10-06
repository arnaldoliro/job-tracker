"use client";

import { motion } from "motion/react";
import type { Application } from "@recruit/shared";
import { Menu, MenuChevron } from "@/components/menu";
import { statusDot } from "@/features/applications/components/status-select";

/**
 * Escolher a candidatura à qual um email pertence.
 *
 * Com campo de busca, diferente do menu de status: a lista de candidaturas
 * cresce, e com trinta delas achar a certa rolando custa mais que os 30
 * segundos que o §1 dá para registrar uma vaga. Digitar o começo da empresa
 * resolve em duas teclas.
 *
 * Cada opção mostra empresa, cargo e status — duas candidaturas na mesma
 * empresa só se distinguem pelo cargo, e o status ajuda a reconhecer qual
 * processo o email está respondendo.
 */
export function LinkMenu({
  applications,
  disabled,
  onChoose,
}: {
  applications: Application[];
  disabled: boolean;
  onChoose: (applicationId: string) => void;
}) {
  return (
    <Menu
      options={applications}
      getKey={keyOf}
      getText={textOf}
      onChoose={(application) => onChoose(application.id)}
      label="Candidaturas"
      width={360}
      rowHeight={56}
      searchable
      searchPlaceholder="Buscar empresa ou cargo"
      emptyText="Nenhuma candidatura com esse nome."
      renderTrigger={(trigger, open) => (
        <motion.button
          {...trigger}
          disabled={disabled}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.97 }}
          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 disabled:cursor-wait disabled:opacity-50 ${
            open
              ? "border-accent/40 bg-accent/10 text-zinc-50"
              : "border-white/10 bg-white/[0.04] text-zinc-200 hover:border-white/20 hover:bg-white/[0.07]"
          }`}
        >
          <LinkIcon />
          Vincular a uma candidatura
          <MenuChevron open={open} />
        </motion.button>
      )}
      renderOption={(application) => (
        <div className="flex items-center gap-3">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium text-zinc-100">
              {application.job.company}
            </span>
            <span className="truncate text-xs text-zinc-500">
              {application.job.title}
            </span>
          </span>

          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/5 px-2 py-0.5 text-xs capitalize text-zinc-300 ring-1 ring-white/10">
            <span
              className={`size-1.5 rounded-full shadow-[0_0_8px] ${statusDot[application.status]}`}
            />
            {application.status}
          </span>
        </div>
      )}
    />
  );
}

function keyOf(application: Application): string {
  return application.id;
}

function textOf(application: Application): string {
  return `${application.job.company} ${application.job.title}`;
}

function LinkIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-3.5 shrink-0 text-accent"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6.5 9.5a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-.7.7" />
      <path d="M9.5 6.5a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l.7-.7" />
    </svg>
  );
}
