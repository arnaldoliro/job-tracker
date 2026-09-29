"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useOptimistic,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { APPLICATION_STATUSES } from "@recruit/shared";
import type { ApplicationStatus } from "@recruit/shared";
import { changeStatusAction } from "@/features/applications/actions";
import { statusTone } from "@/features/applications/components/status-badge";

interface StatusSelectProps {
  applicationId: string;
  status: ApplicationStatus;
  onError: (message: string) => void;
}

/** Cor do ponto de cada status, na mesma ordem de cores do badge. */
const statusDot: Record<ApplicationStatus, string> = {
  rascunho: "bg-zinc-400 shadow-zinc-400/60",
  aplicado: "bg-sky-400 shadow-sky-400/60",
  triagem: "bg-indigo-400 shadow-indigo-400/60",
  entrevista: "bg-violet-400 shadow-violet-400/60",
  teste: "bg-amber-400 shadow-amber-400/60",
  oferta: "bg-emerald-400 shadow-emerald-400/60",
  rejeitado: "bg-red-400 shadow-red-400/60",
};

const statusHint: Record<ApplicationStatus, string> = {
  rascunho: "ainda não enviada",
  aplicado: "enviada, sem resposta",
  triagem: "em análise pela empresa",
  entrevista: "conversa marcada",
  teste: "desafio técnico",
  oferta: "proposta recebida",
  rejeitado: "processo encerrado",
};

const MENU_WIDTH = 232;
/** Altura aproximada do menu, só para decidir se ele abre para cima. */
const MENU_HEIGHT = 340;

/**
 * Troca de status direto no card.
 *
 * É a ação mais frequente do dia a dia — "moveu para entrevista" — e precisa
 * continuar custando um clique para abrir e um para escolher.
 *
 * Menu próprio, e não `<select>`: o nativo abre a lista do sistema, clara e
 * sem as cores do funil, no meio de uma tela escura. O que o nativo dava de
 * graça está reescrito aqui — setas, Home/End, Enter, Esc e busca por
 * digitação —, com os papéis `listbox`/`option` para leitor de tela.
 *
 * O menu vai para um portal no `body`. Dentro do card ele seria cortado pelo
 * `overflow-hidden` e ficaria por baixo do card vizinho, que tem o próprio
 * contexto de empilhamento por causa da inclinação 3D.
 */
export function StatusSelect({
  applicationId,
  status,
  onError,
}: StatusSelectProps) {
  const [pending, startTransition] = useTransition();
  // O status novo aparece no clique; se o backend recusar, volta sozinho
  // quando a transição termina.
  const [shown, setShown] = useOptimistic(status);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<Position | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const listId = useId();
  const client = useIsClient();

  const choose = (next: ApplicationStatus) => {
    setOpen(false);
    triggerRef.current?.focus();

    if (next === status) {
      return;
    }

    startTransition(async () => {
      setShown(next);
      const result = await changeStatusAction(applicationId, next);

      if (result.status === "error") {
        onError(result.message);
      }
    });
  };

  const openMenu = () => {
    setActive(APPLICATION_STATUSES.indexOf(shown));
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      return;
    }

    const place = () => {
      if (triggerRef.current) {
        setPosition(measure(triggerRef.current));
      }
    };

    place();

    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);

    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  // O foco vai para a lista só depois de ela existir: no efeito de cima a
  // posição ainda não foi medida e o menu não está na tela.
  const placed = open && position !== null;

  useEffect(() => {
    if (placed) {
      listRef.current?.focus({ preventScroll: true });
    }
  }, [placed]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const close = (event: PointerEvent) => {
      const target = event.target as Node;

      if (
        !listRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", close);

    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const onListKey = (event: React.KeyboardEvent) => {
    const last = APPLICATION_STATUSES.length - 1;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((index) => (index === last ? 0 : index + 1));
        return;
      case "ArrowUp":
        event.preventDefault();
        setActive((index) => (index === 0 ? last : index - 1));
        return;
      case "Home":
        event.preventDefault();
        setActive(0);
        return;
      case "End":
        event.preventDefault();
        setActive(last);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(APPLICATION_STATUSES[active]);
        return;
      case "Escape":
      case "Tab":
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
    }

    // Busca por digitação, como no `<select>`: "e" vai para entrevista, "o"
    // para oferta. Letras em sequência rápida formam um prefixo.
    if (event.key.length === 1 && /\S/.test(event.key)) {
      const now = event.timeStamp;
      const text =
        (now - typed.current.at < 700 ? typed.current.text : "") +
        event.key.toLowerCase();

      typed.current = { text, at: now };

      const match = APPLICATION_STATUSES.findIndex((option) =>
        option.startsWith(text),
      );

      if (match !== -1) {
        setActive(match);
      }
    }
  };

  return (
    <>
      <motion.button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`Status da candidatura: ${shown}`}
        disabled={pending}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openMenu();
          }
        }}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.96 }}
        className={`group relative flex shrink-0 cursor-pointer items-center gap-2 overflow-hidden rounded-full border border-white/10 py-1 pl-2.5 pr-2 text-xs font-medium capitalize shadow-[0_6px_20px_-10px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 disabled:cursor-wait ${statusTone[shown]}`}
      >
        <span className="relative flex size-2">
          {pending && (
            <span
              className={`absolute inset-0 animate-ping rounded-full opacity-75 ${statusDot[shown]}`}
            />
          )}
          <span
            className={`relative size-2 rounded-full shadow-[0_0_8px] ${statusDot[shown]}`}
          />
        </span>

        {/* O rótulo troca com um giro curto no eixo X: o status "vira a
            página", e o olho percebe que mudou mesmo sem ler. */}
        <span className="relative inline-grid [perspective:200px]">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={shown}
              initial={{ rotateX: -90, opacity: 0, y: 6 }}
              animate={{ rotateX: 0, opacity: 1, y: 0 }}
              exit={{ rotateX: 90, opacity: 0, y: -6 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              className="block [backface-visibility:hidden]"
            >
              {shown}
            </motion.span>
          </AnimatePresence>
        </span>

        <motion.svg
          aria-hidden
          viewBox="0 0 16 16"
          className="size-3 opacity-70"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 26 }}
        >
          <path
            d="M4 6l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </motion.svg>
      </motion.button>

      {client &&
        createPortal(
          <AnimatePresence>
            {open && position && (
              <motion.div
                key="menu"
                className="fixed z-50 [perspective:900px]"
                style={{
                  left: position.left,
                  top: position.top,
                  bottom: position.bottom,
                  width: MENU_WIDTH,
                }}
              >
                <motion.ul
                  ref={listRef}
                  id={listId}
                  role="listbox"
                  tabIndex={-1}
                  aria-label="Mudar status"
                  aria-activedescendant={`${listId}-${APPLICATION_STATUSES[active]}`}
                  onKeyDown={onListKey}
                  initial={{
                    opacity: 0,
                    rotateX: position.above ? 16 : -16,
                    scale: 0.94,
                    y: position.above ? 10 : -10,
                  }}
                  animate={{ opacity: 1, rotateX: 0, scale: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    rotateX: position.above ? 10 : -10,
                    scale: 0.96,
                    y: position.above ? 6 : -6,
                    transition: { duration: 0.14, ease: "easeIn" },
                  }}
                  transition={{ type: "spring", stiffness: 420, damping: 30, mass: 0.7 }}
                  style={{ transformOrigin: position.above ? "50% 100%" : "50% 0%" }}
                  className="flex flex-col gap-0.5 rounded-2xl border border-white/10 bg-zinc-900/85 p-1.5 shadow-[0_30px_60px_-20px_rgb(0_0_0/0.8),0_0_0_1px_rgb(255_255_255/0.03)_inset] outline-none backdrop-blur-xl"
                >
                  {APPLICATION_STATUSES.map((option, index) => {
                    const selected = option === shown;
                    const highlighted = index === active;

                    return (
                      <motion.li
                        key={option}
                        id={`${listId}-${option}`}
                        role="option"
                        aria-selected={selected}
                        onPointerMove={() => setActive(index)}
                        onClick={() => choose(option)}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.02 + index * 0.025, duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                        className={`relative flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm ${
                          // Rejeição não é um degrau do funil: uma linha a
                          // separa das etapas, como no painel.
                          option === "rejeitado" ? "mt-1.5" : ""
                        }`}
                      >
                        {option === "rejeitado" && (
                          <span
                            aria-hidden
                            className="absolute -top-1 left-3 right-3 h-px bg-white/5"
                          />
                        )}

                        {highlighted && (
                          <motion.span
                            layoutId={`${listId}-highlight`}
                            aria-hidden
                            className="absolute inset-0 rounded-xl bg-white/[0.07] ring-1 ring-white/10"
                            transition={{ type: "spring", stiffness: 520, damping: 38 }}
                          />
                        )}

                        <span
                          className={`relative size-2 shrink-0 rounded-full shadow-[0_0_10px] ${statusDot[option]}`}
                        />

                        <span className="relative flex min-w-0 flex-1 flex-col">
                          <span
                            className={`capitalize ${selected ? "font-semibold text-zinc-50" : "text-zinc-200"}`}
                          >
                            {option}
                          </span>
                          <span className="text-xs text-zinc-500">
                            {statusHint[option]}
                          </span>
                        </span>

                        {selected && (
                          <motion.svg
                            aria-hidden
                            viewBox="0 0 16 16"
                            className="relative size-4 text-accent"
                            initial={{ scale: 0.4, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: "spring", stiffness: 500, damping: 24, delay: 0.1 }}
                          >
                            <path
                              d="M3.5 8.5l3 3 6-7"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </motion.svg>
                        )}
                      </motion.li>
                    );
                  })}
                </motion.ul>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

interface Position {
  left: number;
  /** Um dos dois: ancorar pela base é o que deixa o menu colado ao botão
      quando abre para cima, seja qual for a altura real dele. */
  top?: number;
  bottom?: number;
  /** Sem espaço embaixo, o menu abre para cima do botão. */
  above: boolean;
}

function measure(trigger: HTMLElement): Position {
  const box = trigger.getBoundingClientRect();
  const gap = 8;
  const above =
    window.innerHeight - box.bottom < MENU_HEIGHT && box.top > MENU_HEIGHT;
  const left = Math.min(
    Math.max(gap, box.left),
    window.innerWidth - MENU_WIDTH - gap,
  );

  return {
    left,
    ...(above
      ? { bottom: window.innerHeight - box.top + gap }
      : { top: box.bottom + gap }),
    above,
  };
}

const noop = () => () => {};

/**
 * O portal só existe no navegador. Sem isto, o primeiro render do cliente
 * divergiria do HTML do servidor, que não tem `document.body`.
 */
function useIsClient(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
