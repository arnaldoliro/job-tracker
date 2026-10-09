import { validateEnv } from './env';

/** O mínimo que o schema exige; o resto tem padrão. */
const base = {
  DATABASE_URL: 'postgresql://recruit:recruit@localhost:5432/recruit',
};

describe('validateEnv — modelo local', () => {
  it('sem nada, tudo na Anthropic e o Ollama no padrão', () => {
    const env = validateEnv(base);

    expect(env.AI_EMAIL_PROVIDER).toBe('anthropic');
    expect(env.AI_ANSWERS_PROVIDER).toBe('anthropic');
    expect(env.AI_LOCAL_URL).toBe('http://127.0.0.1:11434');
    expect(env.AI_LOCAL_TIMEOUT_MS).toBe(120_000);
    expect(env.AI_LOCAL_NUM_CTX).toBe(8192);
    expect(env.AI_LOCAL_MODEL).toBeUndefined();
  });

  it('variável vazia no .env é o padrão, não erro', () => {
    const env = validateEnv({
      ...base,
      AI_EMAIL_PROVIDER: '',
      AI_LOCAL_URL: '',
      AI_LOCAL_TIMEOUT_MS: '',
      AI_LOCAL_MODEL: '',
    });

    expect(env.AI_EMAIL_PROVIDER).toBe('anthropic');
    expect(env.AI_LOCAL_URL).toBe('http://127.0.0.1:11434');
    expect(env.AI_LOCAL_TIMEOUT_MS).toBe(120_000);
  });

  it('aceita o provedor em qualquer caixa e com espaço em volta', () => {
    expect(
      validateEnv({
        ...base,
        AI_EMAIL_PROVIDER: ' Local ',
        AI_LOCAL_MODEL: 'qwen2.5:3b',
      }).AI_EMAIL_PROVIDER,
    ).toBe('local');
  });

  it('tarefa local sem modelo falha no boot, citando a variável e a tarefa', () => {
    expect(() =>
      validateEnv({ ...base, AI_RESOLVE_PROVIDER: 'local' }),
    ).toThrow(/AI_LOCAL_MODEL: obrigatória.*AI_RESOLVE_PROVIDER/);
  });

  it('provedor inválido falha', () => {
    expect(() => validateEnv({ ...base, AI_EMAIL_PROVIDER: 'openai' })).toThrow(
      /AI_EMAIL_PROVIDER/,
    );
  });

  it.each([
    'http://127.0.0.1:11434',
    'http://localhost:11434/',
    'http://[::1]:11434',
  ])('aceita o Ollama em %s', (url) => {
    expect(validateEnv({ ...base, AI_LOCAL_URL: url }).AI_LOCAL_URL).toBe(url);
  });

  it.each([
    'http://192.168.0.10:11434',
    'http://ollama.example:11434',
    'ftp://127.0.0.1:11434',
  ])(
    'recusa o Ollama em %s: o modelo local existe para nada sair da máquina',
    (url) => {
      expect(() => validateEnv({ ...base, AI_LOCAL_URL: url })).toThrow(
        /AI_LOCAL_URL/,
      );
    },
  );

  it('limites numéricos', () => {
    expect(() => validateEnv({ ...base, AI_LOCAL_TIMEOUT_MS: '100' })).toThrow(
      /AI_LOCAL_TIMEOUT_MS/,
    );
    expect(() => validateEnv({ ...base, AI_LOCAL_NUM_CTX: '512' })).toThrow(
      /AI_LOCAL_NUM_CTX/,
    );
  });
});
