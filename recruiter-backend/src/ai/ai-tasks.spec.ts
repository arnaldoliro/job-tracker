import { aiStatusSchema } from '@recruit/shared';
import {
  localModelOf,
  resolveTasks,
  unavailableMessage,
  type AiEnv,
} from './ai-tasks';

function env(extra: Partial<AiEnv> = {}): AiEnv {
  return {
    AI_EMAIL_PROVIDER: 'anthropic',
    AI_RESOLVE_PROVIDER: 'anthropic',
    AI_EXTRACTION_PROVIDER: 'anthropic',
    AI_ANSWERS_PROVIDER: 'anthropic',
    ...extra,
  };
}

describe('resolveTasks', () => {
  it('padrão: tudo na Anthropic, não configurado sem chave', () => {
    const tarefas = resolveTasks(env());

    expect(tarefas.email).toEqual({
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      configured: false,
    });
    expect(tarefas.answers.model).toBe('claude-sonnet-5-5');
  });

  it('com chave, a Anthropic está configurada', () => {
    expect(
      resolveTasks(env({ ANTHROPIC_API_KEY: 'k' })).resolve.configured,
    ).toBe(true);
  });

  it('tarefa local com modelo está configurada, mesmo sem chave', () => {
    const tarefas = resolveTasks(
      env({ AI_EMAIL_PROVIDER: 'local', AI_LOCAL_MODEL: 'qwen2.5:3b' }),
    );

    expect(tarefas.email).toEqual({
      provider: 'local',
      model: 'qwen2.5:3b',
      configured: true,
    });
    // As outras continuam na Anthropic, sem chave: não configuradas.
    expect(tarefas.extraction).toMatchObject({
      provider: 'anthropic',
      configured: false,
    });
  });

  it('respostas de formulário usam o modelo de escrita, com fallback', () => {
    const base = env({
      AI_ANSWERS_PROVIDER: 'local',
      AI_LOCAL_MODEL: 'qwen2.5:3b',
    });

    expect(localModelOf('answers', base)).toBe('qwen2.5:3b');
    expect(
      localModelOf('answers', {
        ...base,
        AI_LOCAL_WRITING_MODEL: 'qwen2.5:7b',
      }),
    ).toBe('qwen2.5:7b');
    // O modelo de escrita não vaza para a leitura de emails.
    expect(
      localModelOf('email', { ...base, AI_LOCAL_WRITING_MODEL: 'qwen2.5:7b' }),
    ).toBe('qwen2.5:3b');
  });

  it('o resultado é o que o contrato da tela espera', () => {
    const status = {
      tasks: resolveTasks(env({ ANTHROPIC_API_KEY: 'k' })),
      anthropic: { configured: true },
      local: {
        url: 'http://127.0.0.1:11434',
        model: null,
        writingModel: null,
        reachable: null,
        missingModels: null,
        checkedAt: null,
      },
    };

    expect(aiStatusSchema.safeParse(status).success).toBe(true);
  });
});

describe('unavailableMessage', () => {
  it('cita a variável que falta, conforme o provedor', () => {
    expect(unavailableMessage('resolve', env())).toBe(
      'Resolver por IA indisponível: defina ANTHROPIC_API_KEY no .env do backend.',
    );
    expect(
      unavailableMessage(
        'extraction',
        env({ AI_EXTRACTION_PROVIDER: 'local' }),
      ),
    ).toContain('defina AI_LOCAL_MODEL');
  });
});
