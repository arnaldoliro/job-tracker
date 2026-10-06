"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";

/**
 * Menu suspenso do app: uma lista de opções que abre a partir de um botão.
 *
 * Existe porque o `<select>` nativo abre a lista do sistema, clara, no meio
 * de uma tela escura. O que o nativo dava de graça está aqui — setas,
 * Home/End, Enter, Esc, busca por digitação e os papéis `listbox`/`option`
 * para leitor de tela.
 *
 * Duas decisões que valem para todo menu, e por isso moram aqui e não em cada
 * tela:
 *
 * - **Portal no `body`.** Dentro de um card ele seria cortado pelo
 *   `overflow-hidden` e ficaria por baixo do card vizinho.
 *
 * - **Nunca sai da tela.** O menu abre para o lado com mais espaço, e a
 *   altura dele é limitada ao espaço que existe; o que não couber rola por
 *   dentro. A primeira versão chutava uma altura fixa e só abria para cima
 *   quando sobrava muito espaço — num card do fim da página o menu
 *   atravessava a borda de baixo da janela.
 */

/** O que o botão que abre o menu precisa receber. Espalhe no `<button>`. */
export interface MenuTriggerProps {
  ref: React.RefObject<HTMLButtonElement | null>;
  type: "button";
  "aria-haspopup": "listbox";
  "aria-expanded": boolean;
  "aria-controls": string | undefined;
  onClick: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}

export interface MenuOptionState {
  selected: boolean;
  highlighted: boolean;
}

interface MenuProps<T> {
  options: T[];
  getKey: (option: T) => string;
  /** O texto que a busca por digitação (ou o campo de busca) compara. */
  getText: (option: T) => string;
  renderOption: (option: T, state: MenuOptionState) => React.ReactNode;
  renderTrigger: (props: MenuTriggerProps, open: boolean) => React.ReactNode;
  onChoose: (option: T) => void;
  /** Nome da lista para leitor de tela. */
  label: string;
  selectedKey?: string;
  /** Largura do menu em px. */
  width?: number;
  /**
   * Campo de busca no topo. Para listas que crescem — candidaturas —, onde
   * achar pela inicial deixa de bastar.
   */
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Desenha uma linha antes desta opção. */
  separatorBefore?: (option: T) => boolean;
  /** Altura aproximada de uma opção, só para escolher o lado de abertura. */
  rowHeight?: number;
}

/** Distância entre o botão e o menu, e entre o menu e a borda da janela. */
const GAP = 8;
/** Um menu mais alto que isto vira parede; rola por dentro. */
const MAX_HEIGHT = 420;
/** Abaixo disto não dá para ler nem duas opções: troca de lado. */
const MIN_HEIGHT = 140;

export function Menu<T>({
  options,
  getKey,
  getText,
  renderOption,
  renderTrigger,
  onChoose,
  label,
  selectedKey,
  width = 232,
  searchable = false,
  searchPlaceholder = "Buscar…",
  emptyText = "Nada encontrado.",
  separatorBefore,
  rowHeight = 52,
}: MenuProps<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<Position | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const listId = useId();
  const client = useIsClient();

  const visible = useMemo(() => {
    const needle = fold(query);

    return needle === ""
      ? options
      : options.filter((option) => fold(getText(option)).includes(needle));
  }, [options, query, getText]);

  const close = (refocus: boolean) => {
    setOpen(false);

    if (refocus) {
      triggerRef.current?.focus();
    }
  };

  const openMenu = () => {
    const selected = options.findIndex(
      (option) => getKey(option) === selectedKey,
    );

    setQuery("");
    setActive(Math.max(0, selected));
    setOpen(true);
  };

  const choose = (option: T) => {
    close(true);
    onChoose(option);
  };

  // A altura desejada sai de uma conta, não de uma medição: medir exigiria
  // desenhar o menu no lugar errado primeiro. Se a conta errar, o teto de
  // altura e a rolagem interna seguram.
  const wanted = Math.min(
    MAX_HEIGHT,
    Math.max(1, visible.length) * rowHeight + 12 + (searchable ? 52 : 0),
  );

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const place = (event?: Event) => {
      // A rolagem da própria lista não muda onde o botão está.
      if (event && panelRef.current?.contains(event.target as Node)) {
        return;
      }

      if (triggerRef.current) {
        setPosition(measure(triggerRef.current, width, wanted));
      }
    };

    place();

    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);

    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, width, wanted]);

  // O foco só vai para o menu depois de ele existir: no efeito de cima a
  // posição ainda não foi medida e o menu não está na tela.
  const placed = open && position !== null;

  useEffect(() => {
    if (!placed) {
      return;
    }

    const target = searchable ? searchRef.current : listRef.current;

    target?.focus({ preventScroll: true });
  }, [placed, searchable]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const outside = (event: PointerEvent) => {
      const target = event.target as Node;

      if (
        !panelRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", outside);

    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const activeOption = visible[Math.min(active, visible.length - 1)];
  const activeId = activeOption
    ? `${listId}-${getKey(activeOption)}`
    : undefined;

  // Com a lista rolando por dentro, a opção destacada pelo teclado precisa
  // acompanhar — senão as setas andam para fora da área visível.
  useEffect(() => {
    if (placed && activeId) {
      document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
    }
  }, [placed, activeId]);

  const move = (to: number) => {
    const last = visible.length - 1;

    setActive(to < 0 ? last : to > last ? 0 : to);
  };

  const onKey = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(active + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        move(active - 1);
        return;
      case "Home":
        // No campo de busca, Home e End são do cursor do texto.
        if (!searchable) {
          event.preventDefault();
          setActive(0);
        }
        return;
      case "End":
        if (!searchable) {
          event.preventDefault();
          setActive(visible.length - 1);
        }
        return;
      case "Enter":
        event.preventDefault();

        if (activeOption) {
          choose(activeOption);
        }
        return;
      case " ":
        // No campo de busca, espaço é texto.
        if (!searchable && activeOption) {
          event.preventDefault();
          choose(activeOption);
        }
        return;
      case "Escape":
      case "Tab":
        event.preventDefault();
        close(true);
        return;
    }

    // Busca por digitação, como no `<select>`. Letras em sequência rápida
    // formam um prefixo. Com campo de busca, quem filtra é ele.
    if (!searchable && event.key.length === 1 && /\S/.test(event.key)) {
      const now = event.timeStamp;
      const text =
        (now - typed.current.at < 700 ? typed.current.text : "") +
        event.key.toLowerCase();

      typed.current = { text, at: now };

      const match = visible.findIndex((option) =>
        fold(getText(option)).startsWith(fold(text)),
      );

      if (match !== -1) {
        setActive(match);
      }
    }
  };

  const triggerProps: MenuTriggerProps = {
    ref: triggerRef,
    type: "button",
    "aria-haspopup": "listbox",
    "aria-expanded": open,
    "aria-controls": open ? listId : undefined,
    onClick: () => (open ? close(false) : openMenu()),
    onKeyDown: (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        openMenu();
      }
    },
  };

  const above = position?.above ?? false;

  return (
    <>
      {renderTrigger(triggerProps, open)}

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
                  width: position.width,
                }}
              >
                <motion.div
                  ref={panelRef}
                  onKeyDown={onKey}
                  initial={{
                    opacity: 0,
                    rotateX: above ? 16 : -16,
                    scale: 0.94,
                    y: above ? 10 : -10,
                  }}
                  animate={{ opacity: 1, rotateX: 0, scale: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    rotateX: above ? 10 : -10,
                    scale: 0.96,
                    y: above ? 6 : -6,
                    transition: { duration: 0.14, ease: "easeIn" },
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 420,
                    damping: 30,
                    mass: 0.7,
                  }}
                  style={{
                    transformOrigin: above ? "50% 100%" : "50% 0%",
                    maxHeight: position.maxHeight,
                  }}
                  className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/90 shadow-[0_30px_60px_-20px_rgb(0_0_0/0.8),0_0_0_1px_rgb(255_255_255/0.03)_inset] backdrop-blur-xl"
                >
                  {searchable && (
                    <div className="flex shrink-0 items-center gap-2 border-b border-white/5 px-3 py-2.5">
                      <SearchIcon />
                      <input
                        ref={searchRef}
                        role="combobox"
                        aria-expanded
                        aria-controls={listId}
                        aria-activedescendant={activeId}
                        aria-label={searchPlaceholder}
                        value={query}
                        onChange={(event) => {
                          setQuery(event.target.value);
                          setActive(0);
                        }}
                        placeholder={searchPlaceholder}
                        className="w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
                      />
                    </div>
                  )}

                  <ul
                    ref={listRef}
                    id={listId}
                    role="listbox"
                    tabIndex={-1}
                    aria-label={label}
                    aria-activedescendant={searchable ? undefined : activeId}
                    className="menu-scroll flex min-h-0 flex-col gap-0.5 overflow-y-auto overscroll-contain p-1.5 outline-none"
                  >
                    {visible.length === 0 && (
                      <li className="px-3 py-4 text-center text-sm text-zinc-500">
                        {emptyText}
                      </li>
                    )}

                    {visible.map((option, index) => {
                      const key = getKey(option);
                      const selected = key === selectedKey;
                      const highlighted = option === activeOption;
                      const separated = separatorBefore?.(option) ?? false;

                      return (
                        <motion.li
                          key={key}
                          id={`${listId}-${key}`}
                          role="option"
                          aria-selected={selected}
                          onPointerMove={() => setActive(index)}
                          onClick={() => choose(option)}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{
                            // Cascata com teto: numa lista longa a última
                            // opção não pode esperar meio segundo.
                            delay: 0.02 + Math.min(index, 8) * 0.025,
                            duration: 0.22,
                            ease: [0.16, 1, 0.3, 1],
                          }}
                          className={`relative shrink-0 cursor-pointer rounded-xl px-3 py-2 text-sm ${
                            separated ? "mt-1.5" : ""
                          }`}
                        >
                          {separated && (
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
                              transition={{
                                type: "spring",
                                stiffness: 520,
                                damping: 38,
                              }}
                            />
                          )}

                          <div className="relative">
                            {renderOption(option, { selected, highlighted })}
                          </div>
                        </motion.li>
                      );
                    })}
                  </ul>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

/** A seta do botão, que gira quando o menu abre. */
export function MenuChevron({ open }: { open: boolean }) {
  return (
    <motion.svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-3 shrink-0 opacity-70"
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
  );
}

/** O ✓ da opção escolhida. */
export function MenuCheck() {
  return (
    <motion.svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-4 shrink-0 text-accent"
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
  );
}

function SearchIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-4 shrink-0 text-zinc-500"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  );
}

interface Position {
  left: number;
  width: number;
  /** Um dos dois: ancorar pela base é o que deixa o menu colado ao botão
      quando abre para cima, seja qual for a altura real dele. */
  top?: number;
  bottom?: number;
  maxHeight: number;
  above: boolean;
}

/**
 * Onde o menu cabe.
 *
 * Abre para baixo se couber inteiro; senão, para o lado com mais espaço. A
 * altura máxima é o espaço que existe desse lado — é isso, e não a escolha
 * do lado, que garante que ele nunca atravessa a borda da janela.
 */
function measure(trigger: HTMLElement, width: number, wanted: number): Position {
  const box = trigger.getBoundingClientRect();
  const below = window.innerHeight - box.bottom - GAP * 2;
  const over = box.top - GAP * 2;
  const above = below < wanted && over > below;
  const room = Math.max(MIN_HEIGHT, above ? over : below);
  const fit = Math.min(width, window.innerWidth - GAP * 2);

  return {
    width: fit,
    left: Math.min(
      Math.max(GAP, box.left),
      window.innerWidth - fit - GAP,
    ),
    ...(above
      ? { bottom: window.innerHeight - box.top + GAP }
      : { top: box.bottom + GAP }),
    maxHeight: Math.min(MAX_HEIGHT, room),
    above,
  };
}

/** Minúsculas e sem acento: "São Paulo" acha "sao paulo". */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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
