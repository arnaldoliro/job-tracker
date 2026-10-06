/**
 * Devolve a URL apenas se ela for http/https; caso contrário, `null`.
 *
 * Segunda camada de defesa. O schema em `packages/shared` já barra
 * `javascript:` e afins na entrada, mas uma linha gravada antes dessa regra —
 * ou por qualquer outro caminho — ainda chegaria à tela. Como o valor vira
 * `href`, a checagem no momento de renderizar é o que garante que nenhuma
 * origem consiga executar script com um clique.
 *
 * Falha em silêncio de propósito: o link some, a página continua inteira.
 */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);

    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? url
      : null;
  } catch {
    return null;
  }
}
