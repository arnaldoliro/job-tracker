/**
 * A busca do Gmail que acha emails de recrutamento fora do rótulo do IMAP.
 *
 * Só monta o texto: quem abre é você, no seu navegador. Não amplia o que o
 * app lê, e por isso a lista vem do .env (`RECRUITING_RESCUE_SENDERS`), já
 * validada lá com formato fechado.
 *
 * `null` sem remetentes: uma busca vazia traria a caixa inteira.
 */
export function rescueQuery(senders: readonly string[]): string | null {
  const unique = [...new Set(senders)];

  if (unique.length === 0) {
    return null;
  }

  return `newer_than:90d {${unique.map((sender) => `from:${sender}`).join(' ')}}`;
}
