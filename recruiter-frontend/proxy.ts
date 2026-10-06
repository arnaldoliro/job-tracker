import { NextResponse, type NextRequest } from "next/server";
import { isLoopbackHost } from "@recruit/shared";

/**
 * Só atende quem chamou esta máquina pelo nome desta máquina.
 *
 * O servidor do Next renderiza as páginas já com perfil, currículo e emails
 * dentro, e escuta em `127.0.0.1` — que não protege de DNS rebinding: um site
 * aberto no navegador faz o próprio domínio resolver para cá e lê as páginas
 * como se fossem dele. A proteção de Server Actions do Next compara `Origin`
 * com `Host`, e no rebinding os dois são o domínio do atacante. O `Host`
 * é o que denuncia; ver `isLoopbackHost` em `@recruit/shared`.
 *
 * Sem `matcher`, de propósito: roda em tudo, páginas, Server Actions e
 * estáticos. Uma rota esquecida numa lista seria uma rota aberta.
 */
export function proxy(request: NextRequest) {
  if (isLoopbackHost(request.headers.get("host"))) {
    return NextResponse.next();
  }

  return new NextResponse(
    "Este app só atende em 127.0.0.1 ou localhost.",
    { status: 403 },
  );
}
