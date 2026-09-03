"use client";

import type { ReactNode } from "react";
import {
  IconBriefcase,
  IconChart,
  IconDocument,
  IconList,
  IconMail,
} from "@/components/icons";

interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
  /** Sem tela ainda. Fica visível e desabilitado, em vez de levar a lugar nenhum. */
  ready?: boolean;
}

/**
 * As seções vêm da lista de funcionalidades da seção 1 do CLAUDE.md — não são
 * placeholders inventados. Só "Candidaturas" está ativa; as outras aparecem
 * desabilitadas para a navegação não prometer o que ainda não existe.
 */
const items: NavItem[] = [
  { id: "candidaturas", label: "Candidaturas", icon: <IconList />, ready: true },
  { id: "vagas", label: "Vagas", icon: <IconBriefcase /> },
  { id: "curriculo", label: "Currículo", icon: <IconDocument /> },
  { id: "emails", label: "Emails", icon: <IconMail /> },
  { id: "metricas", label: "Métricas", icon: <IconChart /> },
];

export function MainNav() {
  return (
    <nav aria-label="Seções">
      <ul className="flex items-center gap-1">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              aria-current={item.ready ? "page" : undefined}
              disabled={!item.ready}
              title={item.ready ? undefined : "Em breve"}
              className={`group relative flex items-center gap-2 px-3 py-3 text-sm font-medium transition-colors duration-200 ${
                item.ready
                  ? "cursor-pointer text-zinc-900 dark:text-zinc-100"
                  : "cursor-not-allowed text-zinc-400 hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-400"
              }`}
            >
              <span className="transition-transform duration-200 ease-out group-hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
                {item.icon}
              </span>
              {item.label}
              <Underline active={item.ready} muted={!item.ready} />
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Sublinhado que cresce do centro no hover. `scale` é resolvido no compositor
 * — animar `width` dispararia layout a cada quadro.
 *
 * O item ativo já nasce com o sublinhado inteiro; os demais crescem no hover,
 * em tom apagado, para o movimento não prometer uma seção que ainda não existe.
 */
function Underline({ active, muted }: { active?: boolean; muted?: boolean }) {
  return (
    <span
      aria-hidden
      className={`absolute inset-x-2 bottom-0 h-0.5 origin-center rounded-full transition-transform duration-200 ease-out motion-reduce:transition-none ${
        muted ? "bg-zinc-300 dark:bg-zinc-700" : "bg-zinc-900 dark:bg-zinc-100"
      } ${active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"}`}
    />
  );
}
