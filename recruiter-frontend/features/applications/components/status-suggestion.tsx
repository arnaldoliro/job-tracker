"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { StatusSuggestion } from "@recruit/shared";
import {
  acceptSuggestionAction,
  dismissSuggestionAction,
} from "@/features/applications/actions";
import { statusDot } from "@/features/applications/components/status-select";

/**
 * O que um email sugere para esta candidatura, esperando o seu clique.
 *
 * A seção 4 é o desenho inteiro: o modelo lê, você decide. Por isso a
 * sugestão ocupa espaço no card em vez de mudar o status sozinha, e mostra o
 * porquê — é o que deixa você discordar sem abrir o email.
 *
 * Some no clique, antes da resposta: confirmar é o gesto mais comum, e
 * esperar a volta do servidor para o card reagir pareceria travado. Se der
 * erro, ela volta.
 */
export function StatusSuggestionCard({
  suggestion,
  onError,
}: {
  suggestion: StatusSuggestion;
  onError: (message: string) => void;
}) {
  const [gone, setGone] = useState(false);
  const [, startTransition] = useTransition();

  const resolve = (accept: boolean) => {
    setGone(true);
    startTransition(async () => {
      const result = accept
        ? await acceptSuggestionAction(suggestion.emailId)
        : await dismissSuggestionAction(suggestion.emailId);

      if (result.status === "error") {
        setGone(false);
        onError(result.message);
      }
    });
  };

  return (
    <AnimatePresence initial={false}>
      {!gone && (
        <motion.div
          key={suggestion.emailId}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0, transition: { duration: 0.22 } }}
          transition={{ type: "spring", stiffness: 260, damping: 30 }}
          className="[perspective:700px]"
        >
          <motion.section
            aria-label="Sugestão de status a partir de um email"
            initial={{ rotateX: -24, y: -6 }}
            animate={{ rotateX: 0, y: 0 }}
            exit={{ rotateX: 18, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            style={{ transformOrigin: "50% 0%" }}
            className="relative overflow-hidden rounded-xl border border-accent/25 bg-accent/[0.07] p-3"
          >
            {/* Um brilho que atravessa a faixa uma vez: chama o olho para o
                que mudou sem piscar para sempre. */}
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent"
              initial={{ x: "-120%" }}
              animate={{ x: "320%" }}
              transition={{ duration: 1.4, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
            />

            <div className="relative flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-300">
                <SparkIcon />
                <span title={suggestion.subject}>
                  Email de {shortDate(suggestion.receivedAt)} indica
                </span>
                <span className="flex items-center gap-1.5 rounded-full bg-white/5 px-2 py-0.5 font-semibold capitalize text-zinc-50 ring-1 ring-white/10">
                  <span
                    className={`size-1.5 rounded-full shadow-[0_0_8px] ${statusDot[suggestion.toStatus]}`}
                  />
                  {suggestion.toStatus}
                </span>
              </div>

              {suggestion.note && (
                // Texto gerado a partir de email de terceiro: vai como texto.
                <p
                  className="line-clamp-2 text-xs leading-relaxed text-zinc-400"
                  title={suggestion.note}
                >
                  {suggestion.note}
                </p>
              )}

              <div className="flex items-center gap-2 pt-0.5">
                <motion.button
                  type="button"
                  onClick={() => resolve(true)}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.95 }}
                  className="cursor-pointer rounded-lg bg-gradient-to-r from-accent to-accent-2 px-3 py-1.5 text-xs font-semibold text-zinc-950 shadow-[0_6px_20px_-8px] shadow-accent/70 transition hover:brightness-110"
                >
                  Confirmar
                </motion.button>
                <button
                  type="button"
                  onClick={() => resolve(false)}
                  className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
                >
                  Ignorar
                </button>
              </div>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SparkIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-3.5 text-accent"
      fill="currentColor"
    >
      <path d="M8 1.5l1.3 3.9a1.5 1.5 0 0 0 .95.95L14.2 7.6l-3.95 1.3a1.5 1.5 0 0 0-.95.95L8 13.8l-1.3-3.95a1.5 1.5 0 0 0-.95-.95L1.8 7.6l3.95-1.25a1.5 1.5 0 0 0 .95-.95z" />
    </svg>
  );
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}
