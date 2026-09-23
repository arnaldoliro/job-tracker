import type { ReactNode } from "react";
import { MainNav } from "@/components/layout/main-nav";

interface AppShellProps {
  /** SVG já renderizado no servidor. */
  avatar: string;
  name: string;
  headline: string | null;
  onSwitch: () => void;
  children: ReactNode;
}

/**
 * Casca do app: identidade ativa, navegação e área de conteúdo.
 *
 * Recebe strings, não um `Profile`. É o que a mantém em `components/` sem
 * quebrar a regra: componente que *recebe* dado de domínio continua genérico;
 * o que *busca* dado de domínio pertence a uma feature.
 */
export function AppShell({
  avatar,
  name,
  headline,
  onSwitch,
  children,
}: AppShellProps) {
  return (
    <div data-shell className="flex flex-1 flex-col">
      {/* Fora do PDF: o cabeçalho do app não pertence a um currículo. */}
      <header
        data-print-hide
        className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="h-9 w-9 overflow-hidden rounded-full [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: avatar }}
          />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-medium">{name}</span>
            {headline && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {headline}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onSwitch}
          className="cursor-pointer rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Trocar perfil
        </button>
      </header>

      <div
        data-print-hide
        className="border-b border-zinc-200 px-6 dark:border-zinc-800"
      >
        <MainNav />
      </div>

      <main className="flex flex-1 flex-col p-6 print:p-0">
        {children}
      </main>
    </div>
  );
}
