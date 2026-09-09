/**
 * Empresas cujo board é lido a cada rodada.
 *
 * Constante, e não tabela: uma tabela pediria migration, endpoints e uma tela
 * de CRUD para resolver um problema que hoje é editar uma lista. Vira tabela
 * quando você quiser mexer nela sem abrir o editor.
 *
 * Todos os slugs abaixo foram verificados contra o endpoint real — slug errado
 * devolve 404 em silêncio, e uma empresa que some da lista sem aviso é pior que
 * uma que nunca esteve.
 *
 * Critério: metade com presença real no Brasil, metade remoto-amigável no
 * exterior. Boards gigantes ficaram de fora de propósito — Anthropic (596
 * vagas), Stripe (616), Databricks (867) e OpenAI (780, 12,9 MB) inundariam a
 * fila com vaga presencial nos EUA, que é o oposto do que a ordenação deveria
 * trazer primeiro.
 */

export const GREENHOUSE_BOARDS = [
  // Brasil
  'quintoandar',
  'wildlifestudios',
  'ebanx',
  'vtex',
  'rdstation',
  // Exterior, remoto-amigável
  'vercel',
  'figma',
  'dropbox',
  'discord',
  'gitlab',
] as const;

export const ASHBY_BOARDS = [
  'nubank',
  'linear',
  'ramp',
  'vanta',
  'replit',
  'cursor',
] as const;

// Palantir saiu: 5,68 MB num board só, e quase tudo presencial nos EUA.
export const LEVER_BOARDS = ['spotify'] as const;
