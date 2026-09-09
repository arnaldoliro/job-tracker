"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Exhaustion } from "@recruit/shared";
import { discoverAction } from "@/features/jobs/actions";
import { ExtractCard } from "@/features/jobs/components/extract-card";
import { JobsTabs } from "@/features/jobs/components/jobs-tabs";
import {
  ResultCard,
  type SearchResultItem,
} from "@/features/jobs/components/result-card";
import type { JobSearchResult } from "@/features/jobs/types";

/**
 * A busca em estilo fila de partida: liga, e as vagas vão chegando.
 *
 * O ritmo NÃO vem de relógio. Medido, buscar em todas as fontes leva ~3s na
 * primeira vez e sai da memória depois — um laço por tempo despejaria as 800
 * vagas em segundos. Então o próximo lote é pedido quando você chega perto do
 * fim da lista: quem dita o ritmo é a triagem, não um timer.
 */

interface JobDiscoveryProps {
  profileId: string;
  query: string;
  savedUrls: string[];
  savedCount: number;
}

/** Trava contra laço infinito se o cursor parar de avançar por um defeito. */
const MAX_BATCHES = 60;

export function JobDiscovery({
  profileId,
  query,
  savedUrls,
  savedCount,
}: JobDiscoveryProps) {
  const [items, setItems] = useState<SearchResultItem[]>([]);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [exhausted, setExhausted] = useState<Exhaustion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [demand, setDemand] = useState(0);

  // Cursor em ref, não em state: ele muda a cada lote, e como state entraria
  // nas dependências do efeito e dispararia o lote seguinte sozinho — o
  // despejo que a pausa por rolagem existe para evitar.
  const cursor = useRef<string | null>(null);
  const batches = useRef(0);
  const runId = useRef(0);
  const sentinel = useRef<HTMLDivElement>(null);

  const saved = useRef(new Set(savedUrls));

  // Derivado, e não um state próprio: chamar setPending dentro do efeito
  // dispara render em cascata (react-hooks/set-state-in-effect). Um lote está
  // em voo enquanto houver mais pedidos do que lotes concluídos.
  const pending = running && demand > completed;

  const askForMore = useCallback(() => setDemand((value) => value + 1), []);

  const toggle = () => {
    if (running) {
      setRunning(false);

      return;
    }

    setError(null);
    setExhausted(null);
    setRunning(true);
    askForMore();
  };

  // Busca um lote. `runId` é o que sobrevive ao efeito duplo do StrictMode em
  // desenvolvimento: sem ele, o primeiro clique dispara dois lotes.
  useEffect(() => {
    if (!running || demand === 0 || exhausted) {
      return;
    }

    const id = runId.current + 1;

    runId.current = id;

    let cancelled = false;
    const alive = () => !cancelled && runId.current === id;

    void (async () => {
      const outcome = await discoverAction({
        profileId,
        cursor: cursor.current ?? undefined,
        q: query || undefined,
      });

      if (!alive()) {
        return;
      }

      setCompleted((value) => value + 1);

      if (outcome.status === "error") {
        setError(outcome.message);
        setRunning(false);

        return;
      }

      const result = outcome.result;

      batches.current += 1;
      cursor.current = result.nextCursor;
      setTotal(result.total);
      setFailed(result.failedSources);

      setItems((previous) => merge(previous, result.items, saved.current));

      if (
        result.exhausted ||
        !result.nextCursor ||
        batches.current >= MAX_BATCHES
      ) {
        setExhausted(result.exhausted ?? "fim");
        setRunning(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [demand, running, exhausted, profileId, query]);

  // Pede o próximo lote quando o fim da lista aparece na tela.
  useEffect(() => {
    const node = sentinel.current;

    if (!node || !running || pending || exhausted) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        askForMore();
      }
    });

    observer.observe(node);

    return () => observer.disconnect();
  }, [running, pending, exhausted, items.length, askForMore]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <JobsTabs savedCount={savedCount} />

      <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold">Procurar vagas</h2>
            <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              Enquanto ligado, traz vagas de Gupy, Greenhouse, Ashby, Lever e
              agregadores de remoto. Nada é gravado até você salvar.
            </p>
          </div>

          <button
            type="button"
            onClick={toggle}
            aria-pressed={running}
            className={`flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              running
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            }`}
          >
            <span
              className={`size-2 rounded-full ${
                running ? "animate-pulse bg-white" : "bg-white/60 dark:bg-zinc-900/60"
              }`}
            />
            {running ? "Procurando… parar" : "Procurar vagas"}
          </button>
        </div>

        {/* GET puro: o filtro fica na URL, é compartilhável e não precisa de JS. */}
        <form action="/vagas" className="flex gap-2">
          <input
            name="q"
            defaultValue={query}
            placeholder="Filtrar por cargo ou tecnologia"
            className="flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none transition focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100"
          />
          <button
            type="submit"
            className="cursor-pointer rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Filtrar
          </button>
        </form>

        <Status
          items={items.length}
          total={total}
          pending={pending}
          exhausted={exhausted}
          failed={failed}
          error={error}
        />
      </section>

      <ExtractCard profileId={profileId} />

      {items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <ResultCard
              key={item.result.url}
              profileId={profileId}
              item={item}
            />
          ))}
        </ul>
      )}

      {items.length === 0 && !running && (
        <p className="rounded-xl border border-dashed border-zinc-300 px-6 py-14 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Ligue a busca para começar.
        </p>
      )}

      <div ref={sentinel} aria-hidden className="h-px" />
    </div>
  );
}

function Status({
  items,
  total,
  pending,
  exhausted,
  failed,
  error,
}: {
  items: number;
  total: number | null;
  pending: boolean;
  exhausted: Exhaustion | null;
  failed: string[];
  error: string | null;
}) {
  if (error) {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        {error}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
      {pending && items === 0 && <span>Consultando os portais…</span>}

      {items > 0 && (
        <span>
          {items} {items === 1 ? "vaga" : "vagas"} na tela
          {total !== null && ` — ${total} passam no seu filtro`}
        </span>
      )}

      {/* As duas mensagens são diferentes de propósito: uma pede para afrouxar
          o filtro, a outra diz que você está em dia. */}
      {exhausted === "fim" && (
        <span className="text-zinc-700 dark:text-zinc-300">
          Acabaram as vagas que passam no seu filtro.
        </span>
      )}

      {exhausted === "nada-novo" && (
        <span className="text-zinc-700 dark:text-zinc-300">
          Você já viu todas as vagas disponíveis. Nada novo por enquanto.
        </span>
      )}

      {failed.length > 0 && (
        <span>
          Sem resposta de {failed.join(", ")} nesta busca — a lista está
          incompleta.
        </span>
      )}
    </div>
  );
}

/**
 * Junta o lote novo ao que já está na tela, sem repetir.
 *
 * Necessário mesmo com cursor estável: o cache do servidor pode expirar no meio
 * da sessão e trazer de volta uma vaga que já estava aqui.
 */
function merge(
  previous: SearchResultItem[],
  incoming: JobSearchResult[],
  saved: Set<string>,
): SearchResultItem[] {
  const seen = new Set(previous.map((item) => item.result.url));
  const added = incoming
    .filter((result) => !seen.has(result.url))
    .map((result) => ({ result, saved: saved.has(result.url) }));

  return added.length > 0 ? [...previous, ...added] : previous;
}
