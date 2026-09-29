import type { ReactNode } from "react";

/**
 * Transição entre páginas.
 *
 * O Next dá ao template uma chave nova a cada navegação, então ele remonta — e
 * a animação de entrada em `.cine-page` roda de novo em cada troca de tela.
 * O layout, com o cabeçalho, não remonta: só o conteúdo "pousa".
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="cine-page flex flex-1 flex-col">{children}</div>;
}
