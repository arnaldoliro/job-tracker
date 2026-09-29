/**
 * O cabeçalho `Host` de uma requisição aponta para esta máquina?
 *
 * Os dois apps escutam só em `127.0.0.1` (§2 do CLAUDE.md), mas isso não
 * basta sozinho. Com DNS rebinding, um site aberto no seu navegador faz o
 * próprio domínio passar a resolver para `127.0.0.1`: o navegador então fala
 * com a sua API achando que fala com o site, e o CORS não reclama, porque
 * para ele a origem é a mesma. A única coisa que denuncia o truque é o
 * `Host`, que continua com o domínio do atacante.
 *
 * Compara só o nome, não a porta: o ataque troca o nome, e a porta muda
 * entre API e frontend.
 *
 * Vive em `packages/shared` porque os dois apps precisam da MESMA regra — o
 * Nest na API, o `proxy.ts` no Next —, e duas cópias divergiriam.
 */
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);

export function isLoopbackHost(host: string | null | undefined): boolean {
  if (!host) {
    return false;
  }

  const value = host.trim().toLowerCase();

  // IPv6 vem entre colchetes: `[::1]:3000`.
  const name = value.startsWith('[')
    ? value.slice(1, value.indexOf(']'))
    : value.split(':')[0];

  return LOOPBACK.has(name);
}
