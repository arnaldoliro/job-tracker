"use client";

import { useActionState } from "react";
import { IconUpload } from "@/components/icons";
import { extractJobAction, type ExtractState } from "@/features/jobs/actions";
import {
  ResultCard,
  type SearchResultItem,
} from "@/features/jobs/components/result-card";

/**
 * Cola o link, o Claude preenche. O resultado aparece como um card idêntico ao
 * da descoberta — é o mesmo formato, então segue pelo mesmo caminho de salvar e
 * preserva stack, salário e requisitos, que o formulário de candidatura não
 * carregaria.
 *
 * Fica recolhido: a lista da descoberta cresce sozinha, e um bloco aberto acima
 * dela empurraria as vagas para baixo a cada lote.
 */

const idle: ExtractState = { status: "idle" };

export function ExtractCard({ profileId }: { profileId: string }) {
  const [state, formAction, pending] = useActionState(extractJobAction, idle);

  return (
    <details
      className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700"
      open={state.status !== "idle"}
    >
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
        Já tem o link de uma vaga? Extrair de um link
      </summary>

      <div className="flex flex-col gap-3 px-4 pb-4">
        <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          Cole o endereço da vaga e o Claude preenche empresa, cargo, stack,
          salário e requisitos. Nada é gravado até você salvar.
        </p>

        <form action={formAction} className="flex flex-wrap gap-2">
          <input
            name="url"
            type="url"
            required
            placeholder="https://…"
            className="min-w-64 flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none transition focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100"
          />
          <button
            type="submit"
            disabled={pending}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            <IconUpload />
            {pending ? "Lendo a página…" : "Extrair"}
          </button>
        </form>

        {state.status === "error" && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.message}
          </p>
        )}

        {state.status === "success" && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              Extraído. Confira antes de salvar.
            </p>
            <ul>
              <ResultCard
                profileId={profileId}
                item={{ result: state.result, saved: false } as SearchResultItem}
              />
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
