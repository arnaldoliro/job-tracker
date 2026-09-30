"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { APPLICATION_STATUSES } from "@recruit/shared";
import type { Application, ApplicationStatus } from "@recruit/shared";
import {
  Menu,
  MenuCheck,
  MenuChevron,
  type MenuTriggerProps,
} from "@/components/menu";
import { IconX } from "@/components/icons";
import { statusDot } from "@/features/applications/components/status-select";
import {
  EMPTY_FILTERS,
  isFiltering,
  type ApplicationFilters,
  type DatePreset,
  type SortKey,
} from "@/features/applications/filtering";

const DATE_OPTIONS: { key: DatePreset; label: string }[] = [
  { key: "any", label: "Qualquer data" },
  { key: "7", label: "Últimos 7 dias" },
  { key: "30", label: "Últimos 30 dias" },
  { key: "90", label: "Últimos 90 dias" },
  { key: "custom", label: "Escolher período…" },
];

const SORT_OPTIONS: { key: SortKey; label: string; hint: string }[] = [
  { key: "newest", label: "Mais recentes", hint: "cadastradas por último primeiro" },
  { key: "oldest", label: "Mais antigas", hint: "cadastradas primeiro no topo" },
  {
    key: "status-advanced",
    label: "Mais avançadas",
    hint: "oferta primeiro, recusadas no fim",
  },
  {
    key: "status-early",
    label: "Começo do funil",
    hint: "rascunho primeiro, recusadas no fim",
  },
];

/**
 * A barra que filtra a lista de candidaturas.
 *
 * Os números de cada status contam a lista inteira, não a filtrada: servem
 * para você saber quantas existem antes de clicar, e mudariam debaixo do
 * cursor a cada tecla da busca se contassem o resultado.
 */
export function ApplicationFiltersBar({
  applications,
  filters,
  onChange,
  shown,
}: {
  applications: Application[];
  filters: ApplicationFilters;
  onChange: (filters: ApplicationFilters) => void;
  /** Quantas passaram pelos filtros. */
  shown: number;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<ApplicationFilters>) =>
    onChange({ ...filters, ...patch });

  // "/" leva à busca, como em quase todo app de lista — sem roubar a tecla
  // de quem está digitando em outro campo.
  useEffect(() => {
    const focus = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.closest("input, textarea, select, [contenteditable='true']") !==
        null;

      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };

    window.addEventListener("keydown", focus);

    return () => window.removeEventListener("keydown", focus);
  }, []);

  const count = (status: ApplicationStatus) =>
    applications.filter((application) => application.status === status)
      .length;

  const toggleStatus = (status: ApplicationStatus) =>
    set({
      statuses: filters.statuses.includes(status)
        ? filters.statuses.filter((value) => value !== status)
        : [...filters.statuses, status],
    });

  const dateLabel =
    DATE_OPTIONS.find((option) => option.key === filters.date)?.label ??
    "Qualquer data";
  const sortLabel =
    SORT_OPTIONS.find((option) => option.key === filters.sort)?.label ??
    "Mais recentes";
  const filtering = isFiltering(filters);

  return (
    <section
      aria-label="Buscar e filtrar candidaturas"
      className="cine-glass flex flex-col gap-3 rounded-2xl p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="group flex min-w-64 flex-1 items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 transition focus-within:border-accent/50 focus-within:bg-white/[0.05]">
          <SearchIcon />
          <input
            ref={searchRef}
            type="search"
            value={filters.query}
            onChange={(event) => set({ query: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                set({ query: "" });
              }
            }}
            placeholder="Buscar por empresa, cargo, local, anotações…"
            aria-label="Buscar candidaturas"
            className="w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500 [&::-webkit-search-cancel-button]:hidden"
          />
          {filters.query ? (
            <button
              type="button"
              onClick={() => {
                set({ query: "" });
                searchRef.current?.focus();
              }}
              aria-label="Limpar busca"
              className="shrink-0 cursor-pointer rounded-md p-0.5 text-zinc-500 transition hover:text-zinc-200"
            >
              <IconX />
            </button>
          ) : (
            <kbd className="hidden shrink-0 rounded-md border border-white/10 px-1.5 text-[0.65rem] text-zinc-500 sm:block">
              /
            </kbd>
          )}
        </label>

        <Menu
          options={DATE_OPTIONS}
          getKey={(option) => option.key}
          getText={(option) => option.label}
          selectedKey={filters.date}
          onChoose={(option) => set({ date: option.key })}
          label="Data de cadastro"
          width={220}
          rowHeight={40}
          renderTrigger={(trigger, open) => (
            <ToolbarButton trigger={trigger} open={open} active={filters.date !== "any"}>
              <CalendarIcon />
              <span className="text-zinc-400">Cadastro:</span>
              {dateLabel}
            </ToolbarButton>
          )}
          renderOption={(option, { selected }) => (
            <div className="flex items-center justify-between gap-3">
              <span className={selected ? "font-semibold text-zinc-50" : "text-zinc-200"}>
                {option.label}
              </span>
              {selected && <MenuCheck />}
            </div>
          )}
        />

        <Menu
          options={SORT_OPTIONS}
          getKey={(option) => option.key}
          getText={(option) => option.label}
          selectedKey={filters.sort}
          onChoose={(option) => set({ sort: option.key })}
          label="Ordenar por"
          width={260}
          renderTrigger={(trigger, open) => (
            <ToolbarButton trigger={trigger} open={open} active={false}>
              <SortIcon />
              <span className="text-zinc-400">Ordem:</span>
              {sortLabel}
            </ToolbarButton>
          )}
          renderOption={(option, { selected }) => (
            <div className="flex items-center gap-3">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={selected ? "font-semibold text-zinc-50" : "text-zinc-200"}>
                  {option.label}
                </span>
                <span className="text-xs text-zinc-500">{option.hint}</span>
              </span>
              {selected && <MenuCheck />}
            </div>
          )}
        />
      </div>

      {filters.date === "custom" && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-2 text-sm text-zinc-400"
        >
          <span>Cadastradas de</span>
          <input
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(event) => set({ from: event.target.value })}
            aria-label="Cadastradas a partir de"
            className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-sm text-zinc-100 outline-none transition focus:border-accent/50"
          />
          <span>até</span>
          <input
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(event) => set({ to: event.target.value })}
            aria-label="Cadastradas até"
            className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-sm text-zinc-100 outline-none transition focus:border-accent/50"
          />
        </motion.div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {APPLICATION_STATUSES.map((status) => {
          const on = filters.statuses.includes(status);
          const total = count(status);

          return (
            <motion.button
              key={status}
              type="button"
              aria-pressed={on}
              onClick={() => toggleStatus(status)}
              whileTap={{ scale: 0.95 }}
              className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium capitalize outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 ${
                on
                  ? "border-accent/50 bg-accent/15 text-zinc-50"
                  : total === 0
                    ? "border-white/5 text-zinc-600 hover:text-zinc-400"
                    : "border-white/10 text-zinc-300 hover:border-white/20 hover:bg-white/[0.04]"
              }`}
            >
              <span
                className={`size-1.5 rounded-full shadow-[0_0_8px] ${statusDot[status]}`}
              />
              {status}
              <span className="tabular-nums text-zinc-500">{total}</span>
            </motion.button>
          );
        })}

        <span className="ml-auto flex items-center gap-3 text-xs text-zinc-400">
          <span role="status" className="tabular-nums">
            {filtering
              ? `${shown} de ${applications.length}`
              : `${applications.length} ${applications.length === 1 ? "candidatura" : "candidaturas"}`}
          </span>
          {filtering && (
            <button
              type="button"
              onClick={() => onChange({ ...EMPTY_FILTERS, sort: filters.sort })}
              className="cursor-pointer font-medium text-zinc-200 underline underline-offset-4 transition hover:text-white"
            >
              Limpar filtros
            </button>
          )}
        </span>
      </div>
    </section>
  );
}

function ToolbarButton({
  trigger,
  open,
  active,
  children,
}: {
  trigger: MenuTriggerProps;
  open: boolean;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      {...trigger}
      whileTap={{ scale: 0.97 }}
      className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 ${
        open || active
          ? "border-accent/40 bg-accent/10 text-zinc-50"
          : "border-white/10 bg-white/[0.03] text-zinc-200 hover:border-white/20 hover:bg-white/[0.06]"
      }`}
    >
      {children}
      <MenuChevron open={open} />
    </motion.button>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0 text-zinc-500 transition group-focus-within:text-accent" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="2.5" y="3.5" width="11" height="10" rx="2" />
      <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
    </svg>
  );
}

function SortIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 3v10M2.5 10.5L5 13l2.5-2.5M11 13V3M8.5 5.5L11 3l2.5 2.5" />
    </svg>
  );
}
