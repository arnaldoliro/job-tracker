import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
} from '@anthropic-ai/sdk';
import {
  AiUnavailableError,
  classifyAnthropicError,
  classifyOllamaError,
  httpMessage,
} from './ai-errors';

/** Os erros com status o SDK fabrica pela própria fábrica dele. */
function erroDaApi(status: number, message: string) {
  return APIError.generate(
    status,
    { error: { message } },
    message,
    new Headers(),
  );
}

describe('classifyAnthropicError', () => {
  it('timeout vem antes de conexão: um é subclasse do outro', () => {
    expect(classifyAnthropicError(new APIConnectionTimeoutError({})).kind).toBe(
      'timeout',
    );
    expect(classifyAnthropicError(new APIConnectionError({})).kind).toBe(
      'connection',
    );
  });

  it('mapeia os status da API', () => {
    expect(
      classifyAnthropicError(erroDaApi(401, 'invalid x-api-key')).kind,
    ).toBe('auth');
    expect(classifyAnthropicError(erroDaApi(403, 'forbidden')).kind).toBe(
      'permission',
    );
    expect(classifyAnthropicError(erroDaApi(429, 'rate limited')).kind).toBe(
      'rate_limit',
    );
    expect(classifyAnthropicError(erroDaApi(500, 'boom')).kind).toBe(
      'upstream',
    );
  });

  it('saldo zerado é um 400 reconhecido pelo texto', () => {
    const erro = classifyAnthropicError(
      erroDaApi(
        400,
        'Your credit balance is too low to access the Anthropic API.',
      ),
    );

    expect(erro.kind).toBe('no_credit');
    expect(erro.message).toContain('console.anthropic.com');
  });

  it('um 400 qualquer é desconhecido', () => {
    expect(classifyAnthropicError(erroDaApi(400, 'bad request')).kind).toBe(
      'unknown',
    );
  });

  it('o detalhe carrega status e texto da API, para o log', () => {
    const erro = classifyAnthropicError(erroDaApi(429, 'slow down'));

    expect(erro.detail).toBe('Anthropic [429]: slow down');
    expect(erro.provider).toBe('anthropic');
  });
});

describe('classifyOllamaError', () => {
  const contexto = {
    baseUrl: 'http://127.0.0.1:11434',
    model: 'qwen2.5:3b',
    timeoutMs: 120_000,
  };

  it('timeout sugere modelo menor e cita a variável', () => {
    const erro = classifyOllamaError(
      new DOMException('timeout', 'TimeoutError'),
      contexto,
    );

    expect(erro.kind).toBe('timeout');
    expect(erro.message).toContain('120 s');
  });

  it('5xx é instabilidade do Ollama, com o corpo só no detalhe', () => {
    const erro = classifyOllamaError(undefined, {
      ...contexto,
      status: 500,
      body: 'cuda out of memory',
    });

    expect(erro.kind).toBe('upstream');
    expect(erro.message).not.toContain('cuda');
    expect(erro.detail).toContain('cuda out of memory');
  });

  it('AggregateError como causa (IPv4 e IPv6 recusados) ainda é Ollama parado', () => {
    const erro = classifyOllamaError(
      Object.assign(new TypeError('fetch failed'), {
        cause: new AggregateError([
          Object.assign(new Error('x'), { code: 'ECONNREFUSED' }),
        ]),
      }),
      contexto,
    );

    expect(erro.kind).toBe('not_running');
  });
});

describe('httpMessage', () => {
  it('códigos: timeout 504, limite 429, resto 503', () => {
    expect(
      httpMessage(new AiUnavailableError('timeout', 'anthropic', 'x'), 'email')
        .status,
    ).toBe(504);
    expect(
      httpMessage(
        new AiUnavailableError('rate_limit', 'anthropic', 'x'),
        'email',
      ).status,
    ).toBe(429);
    expect(
      httpMessage(
        new AiUnavailableError('no_credit', 'anthropic', 'x'),
        'email',
      ).status,
    ).toBe(503);
  });

  it('mantém os textos por tarefa que a tela já conhecia', () => {
    const timeout = new AiUnavailableError('timeout', 'anthropic', 'x');

    expect(httpMessage(timeout, 'extraction').message).toBe(
      'A extração demorou demais. Tente de novo.',
    );
    expect(httpMessage(timeout, 'answers').message).toBe(
      'A IA demorou demais para responder. Tente de novo.',
    );

    const desconhecido = new AiUnavailableError('unknown', 'anthropic', 'x');

    expect(httpMessage(desconhecido, 'extraction').message).toBe(
      'Não consegui extrair a vaga agora. Tente de novo.',
    );
    expect(httpMessage(desconhecido, 'answers').message).toBe(
      'Não consegui gerar a resposta agora. Tente de novo.',
    );
  });

  it('no modelo local a mensagem já vem pronta no erro', () => {
    const erro = new AiUnavailableError(
      'not_running',
      'local',
      'Ollama não está rodando em X.',
    );

    expect(httpMessage(erro, 'extraction')).toEqual({
      status: 503,
      message: 'Ollama não está rodando em X.',
    });
  });
});
