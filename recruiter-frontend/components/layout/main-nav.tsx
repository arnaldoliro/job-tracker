"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  /** Ausente = sem tela ainda: fica visível e desabilitado. */
  href?: string;
}

/**
 * As seções vêm da lista de funcionalidades da seção 1 do CLAUDE.md — não são
 * placeholders inventados. Só "Candidaturas" está ativa; as outras aparecem
 * desabilitadas para a navegação não prometer o que ainda não existe.
 */
const items: NavItem[] = [
  { id: "candidaturas", label: "Candidaturas", icon: <IconList />, href: "/" },
  { id: "vagas", label: "Vagas", icon: <IconBriefcase />, href: "/vagas" },
  { id: "curriculo", label: "Currículo", icon: <IconDocument />, href: "/curriculo" },
  { id: "emails", label: "Emails", icon: <IconMail /> },
  { id: "metricas", label: "Métricas", icon: <IconChart /> },
];

/** "/" só casa exato; as demais casam com as subrotas (/vagas/salvas, /vagas/x). */
function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function MainNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Seções">
      <ul className="flex items-center gap-1">
        {items.map((item) => {
          const active = item.href ? isActive(pathname, item.href) : false;
          const className = `group relative flex items-center gap-2 px-3 py-3 text-sm font-medium transition-colors duration-200 ${
            item.href
              ? active
                ? "cursor-pointer text-zinc-900 dark:text-zinc-100"
                : "cursor-pointer text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              : "cursor-not-allowed text-zinc-400 hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-400"
          }`;

          const content = (
            <>
              <span className="transition-transform duration-200 ease-out group-hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
                {item.icon}
              </span>
              {item.label}
              <Underline active={active} muted={!item.href} />
            </>
          );

          return (
            <li key={item.id}>
              {item.href ? (
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={className}
                >
                  {content}
                </Link>
              ) : (
                <button type="button" disabled title="Em breve" className={className}>
                  {content}
                </button>
              )}
            </li>
          );
        })}
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
