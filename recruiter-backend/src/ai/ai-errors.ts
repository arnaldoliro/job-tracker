import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  PermissionDeniedError,
  RateLimitError,
} from '@anthropic-ai/sdk';
import type { AiProvider, AiTask } from '@recruit/shared';

/**
 * Um tipo de erro só para "a IA não respondeu", venha de onde vier.
 *
 * Quem chama (serviço de email, extração, respostas) não precisa saber se a
 * tarefa está na Anthropic ou no Ollama: olha o `kind`, mostra a mensagem.
 * O `detail` é para o log e NUNCA vai para a tela — na Anthropic ele carrega
 * a mensagem crua da API, que pode citar o corpo da requisição.
 */

export type AiFailureKind =
  | 'not_configured'
  | 'not_running'
  | 'model_missing'
  | 'timeout'
  | 'connection'
  | 'auth'
  | 'permission'
  | 'rate_limit'
  | 'no_credit'
  | 'upstream'
  | 'unknown';

export class AiUnavailableError extends Error {
  constructor(
    readonly kind: AiFailureKind,
    readonly provider: AiProvider,
    message: string,
    /** Só para o log. */
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

/**
 * Erro do SDK da Anthropic → `AiUnavailableError`.
 *
 * As checagens vêm do antigo `failFromAnthropic` da extração, na mesma ordem:
 * timeout antes de conexão (um é subclasse do outro), e saldo zerado lido do
 * texto do 400, que é o único sinal que a API dá.
 */
export function classifyAnthropicError(error: unknown): AiUnavailableError {
  const detail = `Anthropic [${readStatus(error)}]: ${apiMessage(error).slice(0, 200)}`;
  const make = (kind: AiFailureKind, message: string) =>
    new AiUnavailableError(kind, 'anthropic', message, detail);

  if (error instanceof APIConnectionTimeoutError) {
    return make(
      'timeout',
      'A IA demorou demais para responder. Tente de novo.',
    );
  }

  if (error instanceof APIConnectionError) {
    return make(
      'connection',
      'Não consegui falar com a API da Anthropic. Verifique a conexão.',
    );
  }

  if (error instanceof AuthenticationError) {
    return make(
      'auth',
      'A API recusou a chave. Confira ANTHROPIC_API_KEY no .env do backend.',
    );
  }

  if (error instanceof PermissionDeniedError) {
    return make(
      'permission',
      'A chave não tem permissão para usar este modelo.',
    );
  }

  if (error instanceof RateLimitError) {
    return make(
      'rate_limit',
      'A Anthropic está limitando as chamadas. Espere um pouco.',
    );
  }

  if (
    error instanceof BadRequestError &&
    /credit balance/i.test(apiMessage(error))
  ) {
    return make(
      'no_credit',
      'Sem crédito na conta da Anthropic. Adicione créditos em console.anthropic.com.',
    );
  }

  if (error instanceof InternalServerError) {
    return make(
      'upstream',
      'A API da Anthropic está instável agora. Tente de novo em instantes.',
    );
  }

  return make('unknown', 'A IA não respondeu agora. Tente de novo.');
}

export interface OllamaErrorContext {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  /** Quando o Ollama respondeu, mas com erro HTTP. */
  status?: number;
  body?: string;
}

/**
 * Falha ao falar com o Ollama → `AiUnavailableError`, com a mensagem dizendo
 * o que fazer: subir o Ollama, baixar o modelo, trocar o modelo por um menor.
 */
export function classifyOllamaError(
  error: unknown,
  context: OllamaErrorContext,
): AiUnavailableError {
  const make = (kind: AiFailureKind, message: string, detail: string) =>
    new AiUnavailableError(kind, 'local', message, detail.slice(0, 200));

  if (context.status !== undefined) {
    const body = context.body ?? '';

    if (context.status === 404 && /not found/i.test(body)) {
      return make(
        'model_missing',
        `Modelo ${context.model} não baixado no Ollama: rode \`docker compose --profile ai exec ollama ollama pull ${context.model}\` (ou \`ollama pull ${context.model}\`, se ele estiver instalado na máquina).`,
        `Ollama [404]: ${body}`,
      );
    }

    return make(
      'upstream',
      `O Ollama respondeu ${context.status}. Veja o log do backend.`,
      `Ollama [${context.status}]: ${body}`,
    );
  }

  if (isTimeout(error)) {
    return make(
      'timeout',
      `O modelo local demorou mais que ${Math.round(context.timeoutMs / 1000)} s. Use um modelo menor ou aumente AI_LOCAL_TIMEOUT_MS.`,
      'Ollama: timeout',
    );
  }

  if (isConnectionRefused(error)) {
    return make(
      'not_running',
      `Ollama não está rodando em ${context.baseUrl}. Suba com \`docker compose --profile ai up -d ollama\` (ou \`ollama serve\`, se ele estiver instalado na máquina).`,
      `Ollama: ${causeCode(error) ?? 'conexão recusada'}`,
    );
  }

  return make(
    'unknown',
    'O Ollama falhou ao responder. Veja o log do backend.',
    `Ollama: ${error instanceof Error ? error.message : String(error)}`,
  );
}

/** Os textos por tarefa que a tela já conhece, agora num lugar só. */
const TASK_TEXT: Record<
  AiTask,
  { timeout: string; noCredit: string; unknown: string }
> = {
  email: {
    timeout: 'A IA demorou demais para responder. Tente de novo.',
    noCredit:
      'Sem crédito na conta da Anthropic. Adicione créditos em console.anthropic.com.',
    unknown: 'A IA não respondeu agora. Tente de novo.',
  },
  resolve: {
    timeout: 'A IA demorou demais para responder. Tente de novo.',
    noCredit:
      'Sem crédito na conta da Anthropic. Adicione créditos em console.anthropic.com.',
    unknown: 'A IA não respondeu agora. Tente de novo.',
  },
  extraction: {
    timeout: 'A extração demorou demais. Tente de novo.',
    noCredit:
      'Sem crédito na conta da Anthropic. Adicione créditos em console.anthropic.com para extrair vagas.',
    unknown: 'Não consegui extrair a vaga agora. Tente de novo.',
  },
  answers: {
    timeout: 'A IA demorou demais para responder. Tente de novo.',
    noCredit:
      'Sem crédito na conta da Anthropic. Adicione créditos em console.anthropic.com.',
    unknown: 'Não consegui gerar a resposta agora. Tente de novo.',
  },
};

/**
 * Status HTTP e texto para a tela.
 *
 * Timeout é 504, limite de chamadas é 429, o resto é 503 — os mesmos códigos
 * de antes. Os textos da Anthropic são os de antes, por tarefa; os do modelo
 * local já vêm prontos no erro.
 */
export function httpMessage(
  error: AiUnavailableError,
  task: AiTask,
): { status: 429 | 503 | 504; message: string } {
  const status =
    error.kind === 'timeout' ? 504 : error.kind === 'rate_limit' ? 429 : 503;

  if (error.provider === 'local') {
    return { status, message: error.message };
  }

  switch (error.kind) {
    case 'timeout':
      return { status, message: TASK_TEXT[task].timeout };
    case 'no_credit':
      return { status, message: TASK_TEXT[task].noCredit };
    case 'permission':
      return {
        status,
        message:
          task === 'extraction'
            ? 'A chave não tem permissão para usar o modelo de extração.'
            : error.message,
      };
    case 'unknown':
      return { status, message: TASK_TEXT[task].unknown };
    default:
      return { status, message: error.message };
  }
}

/**
 * O texto que a própria API mandou, sem o prefixo de status nem o JSON cru.
 * As classes de erro do SDK são genéricas no corpo, então ele chega como
 * `any` — daí a narrowing manual em vez de acessar `.error.error.message`.
 */
function apiMessage(error: unknown): string {
  const body: unknown = error instanceof APIError ? error.error : undefined;

  if (typeof body === 'object' && body !== null && 'error' in body) {
    const detail: unknown = body.error;

    if (typeof detail === 'object' && detail !== null && 'message' in detail) {
      const text: unknown = detail.message;

      if (typeof text === 'string') {
        return text;
      }
    }
  }

  return error instanceof Error ? error.message : String(error);
}

function readStatus(error: unknown): string {
  const status: unknown = (error as { status?: unknown } | null)?.status;

  return typeof status === 'number' ? String(status) : 'sem status';
}

/** `AbortSignal.timeout` rejeita o `fetch` com um `TimeoutError`. */
function isTimeout(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  );
}

/**
 * O `fetch` do Node falha com `TypeError: fetch failed` e a causa de verdade
 * em `cause` — às vezes um erro só, às vezes um `AggregateError` com um por
 * endereço tentado (IPv4 e IPv6).
 */
function causeCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('cause' in error)) {
    return undefined;
  }

  const cause: unknown = error.cause;

  if (typeof cause !== 'object' || cause === null) {
    return undefined;
  }

  if ('code' in cause && typeof cause.code === 'string') {
    return cause.code;
  }

  if ('errors' in cause && Array.isArray(cause.errors)) {
    const first: unknown = cause.errors[0];

    if (
      typeof first === 'object' &&
      first !== null &&
      'code' in first &&
      typeof first.code === 'string'
    ) {
      return first.code;
    }
  }

  return undefined;
}

function isConnectionRefused(error: unknown): boolean {
  const code = causeCode(error);

  return (
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'ECONNRESET' ||
    code === 'EHOSTUNREACH'
  );
}
