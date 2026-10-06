/**
 * O que a tela de emails mostra de um email, derivado sem modelo.
 */

/**
 * Um trecho legível do corpo.
 *
 * O texto puro de um email de ATS começa com lixo: "profile picture
 * [https://…/logo.png]", uma imagem embutida em base64, links de
 * rastreamento de trezentos caracteres. Cortar os primeiros N caracteres
 * mostrava só isso, e o card não dizia do que o email tratava.
 */
export function excerpt(bodyText: string | null, max: number): string | null {
  if (!bodyText) {
    return null;
  }

  const clean = bodyText
    // Imagem embutida: megabytes de base64 numa linha só.
    .replace(/\[?data:[^\s\]]+\]?/gi, ' ')
    // Endereços entre colchetes ou parênteses — é como o conversor de HTML
    // para texto escreve o destino de um link ou de uma imagem.
    .replace(/[[(<]\s*https?:\/\/[^\s\])>]*[\])>]/gi, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    // Texto alternativo de logo, sem o logo.
    .replace(/\bprofile picture\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (clean === '') {
    return null;
  }

  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
}

/**
 * O endereço que abre este email no Gmail.
 *
 * A origem é FIXA e o `Message-ID`, que é texto de terceiro, entra só como
 * valor codificado de uma busca. Não existe entrada que transforme isto num
 * link para outro site: o pior que um `Message-ID` hostil consegue é uma
 * busca no Gmail que não acha nada.
 *
 * `authuser` escolhe a conta certa quando o navegador tem mais de uma
 * logada — sem ele o Gmail abre a primeira, e a busca volta vazia.
 */
export function gmailUrl(
  messageId: string,
  account: { host: string; user: string } | null,
): string | null {
  // Fora do Gmail não há endereço que abra uma mensagem pelo id.
  if (!account || !/(^|\.)gmail\.com$/i.test(account.host)) {
    return null;
  }

  // Id sintetizado pelo app (email sem `Message-ID`): o Gmail não o conhece.
  if (messageId.startsWith('synth:')) {
    return null;
  }

  const id = messageId.replace(/^<|>$/g, '').trim();

  if (id === '') {
    return null;
  }

  const search = encodeURIComponent(`rfc822msgid:${id}`);

  return `https://mail.google.com/mail/?authuser=${encodeURIComponent(account.user)}#search/${search}`;
}
