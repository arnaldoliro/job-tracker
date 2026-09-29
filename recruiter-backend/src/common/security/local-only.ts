import { isLoopbackHost } from '@recruit/shared';

/**
 * As duas barreiras na frente de uma API sem autenticação.
 *
 * 1. `Host` desta máquina — bloqueia DNS rebinding, ver `isLoopbackHost`.
 *
 * 2. Escrita só com `Content-Type: application/json`. Qualquer site pode
 *    mandar um POST "simples" para `127.0.0.1` sem pedir licença: o navegador
 *    não deixa ler a resposta, mas a requisição chega e executa — e
 *    `POST /emails/sync` gasta Gmail e chamada paga ao Claude. Exigir JSON
 *    força o navegador a perguntar antes (preflight), e o CORS recusa.
 *
 * O frontend fala com a API pelo servidor do Next, e todo cliente dele já
 * manda JSON. Quem chama à mão, com curl, passa o cabeçalho.
 *
 * Função pura, e o middleware em `main.ts` só a aplica: é aqui que um erro
 * abriria a API, então é aqui que o teste mora.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface Rejection {
  status: 403 | 415;
  error: string;
  message: string;
}

export function rejectNonLocal(request: {
  host: string | undefined;
  method: string;
  contentType: string | undefined;
}): Rejection | null {
  if (!isLoopbackHost(request.host)) {
    return {
      status: 403,
      error: 'Forbidden',
      message: 'Esta API só atende requisições para 127.0.0.1 ou localhost.',
    };
  }

  if (
    !SAFE_METHODS.has(request.method.toUpperCase()) &&
    !/^application\/json\b/i.test(request.contentType ?? '')
  ) {
    return {
      status: 415,
      error: 'Unsupported Media Type',
      message: 'Envie Content-Type: application/json.',
    };
  }

  return null;
}
