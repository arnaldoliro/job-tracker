"use client";

import { useEffect, useState, useTransition } from "react";
import type { TimelineEntry } from "@recruit/shared";
import {
  loadTimelineAction,
  setEventDateAction,
} from "@/features/applications/actions";
import { StatusBadge } from "@/features/applications/components/status-badge";

/**
 * O histórico da candidatura: transições de status e emails, na mesma ordem.
 *
 * Componente próprio, com o seu próprio estado de erro, e não um trecho dentro
 * do `ViewMode`: se o histórico falhar, os detalhes que você abriu o modal
 * para ver continuam na tela.
 *
 * Os `StatusEvent` já eram gravados desde o começo do projeto e nunca lidos —
 * é a primeira vez que eles aparecem em algum lugar.
 */
export function ApplicationTimeline({ applicationId }: { applicationId: string }) {
  const [entries, setEntries] = useState<TimelineEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Só a busca: zerar o estado aqui dispara render em cascata
  // (react-hooks/set-state-in-effect). Trocar de candidatura remonta o
  // componente, porque o pai passa `key` — e remontar já zera tudo.
  useEffect(() => {
    startTransition(async () => {
      const outcome = await loadTimelineAction(applicationId);

      if (outcome.status === "error") {
        setError(outcome.message);

        return;
      }

      setEntries(outcome.entries);
    });
  }, [applicationId]);

  return (
    <section className="flex flex-col gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
      <h3 className="text-sm font-medium">Histórico</h3>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {!error && pending && entries === null && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Carregando…</p>
      )}

      {!error && entries !== null && entries.length === 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Nada registrado ainda.
        </p>
      )}

      {entries !== null && entries.length > 0 && (
        <ol className="flex flex-col gap-3">
          {entries.map((entry) => (
            <li key={`${entry.kind}-${entry.id}`} className="flex flex-col gap-1">
              {entry.kind === "status" ? (
                <EventDate
                  applicationId={applicationId}
                  eventId={entry.id}
                  at={entry.at}
                  onSaved={(at) =>
                    // Reordena na hora: corrigir a data pode mover o evento
                    // para antes de outro, e a linha do tempo é cronológica.
                    setEntries((current) =>
                      (current ?? [])
                        .map((item) =>
                          item.kind === "status" && item.id === entry.id
                            ? { ...item, at }
                            : item,
                        )
                        .sort((a, b) => a.at.localeCompare(b.at)),
                    )
                  }
                />
              ) : (
                <time className="text-xs text-zinc-400 dark:text-zinc-500">
                  {formatDate(entry.at)}
                </time>
              )}

              {entry.kind === "status" ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {entry.fromStatus && (
                    <>
                      <StatusBadge status={entry.fromStatus} />
                      <span className="text-zinc-400">→</span>
                    </>
                  )}
                  <StatusBadge status={entry.toStatus} />
                  {entry.source !== "manual" && (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      por {entry.source === "email" ? "email" : "sugestão de IA"}
                    </span>
                  )}
                </div>
              ) : (
                <EmailEntry entry={entry} />
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * A data de uma transição, com correção.
 *
 * Trocar o status na lista registra "agora" — e tem que continuar sendo um
 * clique, senão a ação mais frequente do dia passa dos 30 segundos do §1. A
 * data certa vem aqui, quando você lembra que a entrevista foi marcada na
 * segunda e não na quarta em que registrou. É ela que alimenta "tempo até a
 * primeira resposta" no painel.
 *
 * Email não tem este controle: a data dele vem do servidor de email, e não é
 * sua para corrigir.
 */
function EventDate({
  applicationId,
  eventId,
  at,
  onSaved,
}: {
  applicationId: string;
  eventId: string;
  at: string;
  onSaved: (at: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [day, setDay] = useState(at.slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // O dia de hoje no fuso de quem está usando: `max` impede escolher o futuro
  // já no seletor, e o backend recusa do mesmo jeito se passar.
  const today = new Date().toLocaleDateString("en-CA");

  if (!editing) {
    return (
      <span className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
        <time>{formatDate(at)}</time>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="cursor-pointer underline underline-offset-2 hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          corrigir data
        </button>
      </span>
    );
  }

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await setEventDateAction(applicationId, eventId, day);

      if (result.status === "error") {
        setError(result.message);

        return;
      }

      onSaved(`${day}T12:00:00.000Z`);
      setEditing(false);
    });
  };

  return (
    <span className="flex flex-wrap items-center gap-2 text-xs">
      <input
        type="date"
        value={day}
        max={today}
        onChange={(event) => setDay(event.target.value)}
        aria-label="Quando aconteceu"
        className="rounded border border-zinc-300 bg-transparent px-1.5 py-0.5 dark:border-zinc-700"
      />
      <button
        type="button"
        disabled={pending || day === ""}
        onClick={save}
        className="cursor-pointer rounded bg-zinc-900 px-2 py-0.5 font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Salvando…" : "Salvar"}
      </button>
      <button
        type="button"
        onClick={() => {
          setDay(at.slice(0, 10));
          setEditing(false);
        }}
        className="cursor-pointer text-zinc-500 underline underline-offset-2"
      >
        cancelar
      </button>
      {error && (
        <span role="alert" className="text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </span>
  );
}

/**
 * Assunto, remetente e corpo são conteúdo escrito por terceiros (§5). Vão para
 * a tela como TEXTO — o React escapa, e em nenhum momento isso vira HTML.
 */
function EmailEntry({
  entry,
}: {
  entry: Extract<TimelineEntry, { kind: "email" }>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <span className="text-sm font-medium">{entry.subject}</span>
      <span className="text-xs text-zinc-500 dark:text-zinc-400">
        {entry.fromName ? `${entry.fromName} · ` : ""}
        {entry.fromAddress}
      </span>

      {entry.body && (
        <>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="cursor-pointer self-start text-xs font-medium text-zinc-600 underline underline-offset-4 dark:text-zinc-400"
          >
            {open ? "Recolher" : "Ler o email"}
          </button>

          {open && (
            <p className="max-h-64 overflow-y-auto whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
              {entry.body}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
