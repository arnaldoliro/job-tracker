import "server-only";
import { createAvatar } from "@dicebear/core";
import { notionists } from "@dicebear/collection";

/**
 * Avatar determinístico a partir do id do perfil: mesmo id, sempre o mesmo
 * desenho. Sem isso o boneco mudaria a cada render e o usuário perderia a
 * referência visual do próprio perfil.
 *
 * Estilo `notionists` (CC0 1.0, por Zoish) — domínio público, sem exigência de
 * atribuição na UI. Vários outros estilos do DiceBear são CC BY 4.0 e
 * obrigariam a dar crédito visível.
 *
 * Roda só no servidor, então o DiceBear não entra no bundle do cliente.
 */
export function avatarSvg(seed: string): string {
  const svg = createAvatar(notionists, {
    seed,
    radius: 50,
    backgroundColor: ["b6e3f4", "c0aede", "d1d4f9", "ffd5dc", "ffdfbf"],
  }).toString();

  // O DiceBear embute um bloco <metadata> com o texto de licença. Ele é
  // invisível na tela, mas entra no textContent do card — atrapalha leitor de
  // tela e teste de DOM. A licença CC0 não exige atribuição, então remover é
  // legítimo; se um dia trocarmos para um estilo CC BY, o crédito precisa
  // aparecer na UI.
  return svg.replace(/<metadata[^>]*>[\s\S]*?<\/metadata>/, "");
}
