"use client";

import type { ReactNode } from "react";
import { IconPlus, IconTrash } from "@/components/icons";

interface SectionListProps<T> {
  title: string;
  description?: string;
  items: T[];
  emptyItem: () => T;
  onChange: (items: T[]) => void;
  renderItem: (item: T, update: (patch: Partial<T>) => void) => ReactNode;
  addLabel: string;
  emptyLabel: string;
}

/**
 * Lista editável genérica. Experiências, formação, projetos e certificações têm
 * a mesma mecânica — adicionar, editar, remover — e quatro implementações da
 * mesma coisa divergiriam na primeira correção feita em só uma delas.
 */
export function SectionList<T>({
  title,
  description,
  items,
  emptyItem,
  onChange,
  renderItem,
  addLabel,
  emptyLabel,
}: SectionListProps<T>) {
  const update = (index: number, patch: Partial<T>) => {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const remove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <section className="flex flex-col gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onChange([...items, emptyItem()])}
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          <IconPlus />
          {addLabel}
        </button>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          {emptyLabel}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((item, index) => (
            <li
              key={index}
              className="flex gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="flex flex-1 flex-col gap-3">
                {renderItem(item, (patch) => update(index, patch))}
              </div>
              <button
                type="button"
                onClick={() => remove(index)}
                title="Remover"
                aria-label="Remover"
                className="h-fit cursor-pointer rounded-lg p-2 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-zinc-600 dark:hover:bg-red-950 dark:hover:text-red-400"
              >
                <IconTrash />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
