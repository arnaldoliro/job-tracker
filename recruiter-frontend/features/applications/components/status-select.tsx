"use client";

import { useTransition } from "react";
import { APPLICATION_STATUSES } from "@recruit/shared";
import type { ApplicationStatus } from "@recruit/shared";
import { changeStatusAction } from "@/features/applications/actions";
import { statusTone } from "@/features/applications/components/status-badge";

interface StatusSelectProps {
  applicationId: string;
  status: ApplicationStatus;
  onError: (message: string) => void;
}

/**
 * Troca de status direto na linha.
 *
 * É a ação mais frequente do dia a dia — "moveu para entrevista" — e pelo modal
 * custava quatro cliques: abrir, editar, escolher, salvar. Aqui é um.
 *
 * `<select>` nativo em vez de menu próprio: dá navegação por teclado, busca por
 * digitação e o seletor do sistema no celular, sem nada disso precisar ser
 * escrito. A aparência de pílula vem do `appearance-none` com as mesmas cores
 * do badge.
 */
export function StatusSelect({
  applicationId,
  status,
  onError,
}: StatusSelectProps) {
  const [pending, startTransition] = useTransition();

  const change = (next: ApplicationStatus) => {
    if (next === status) {
      return;
    }

    startTransition(async () => {
      const result = await changeStatusAction(applicationId, next);

      if (result.status === "error") {
        onError(result.message);
      }
    });
  };

  return (
    <span className="relative shrink-0">
      <select
        value={status}
        disabled={pending}
        aria-label="Status da candidatura"
        onChange={(event) => change(event.target.value as ApplicationStatus)}
        className={`cursor-pointer appearance-none rounded-full py-0.5 pl-2.5 pr-6 text-xs font-medium capitalize outline-none transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-60 dark:focus-visible:outline-zinc-100 ${statusTone[status]}`}
      >
        {APPLICATION_STATUSES.map((option) => (
          <option key={option} value={option} className="capitalize">
            {option}
          </option>
        ))}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[0.6rem] opacity-60"
      >
        ▾
      </span>
    </span>
  );
}
