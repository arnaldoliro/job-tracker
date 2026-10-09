import { AI_TASKS } from '@recruit/shared';
import type { AiProvider, AiTask, AiTaskStatus } from '@recruit/shared';

/**
 * O roteamento de IA por tarefa, em função pura do `.env`.
 *
 * Fora do `AiService` para ser testável sem subir o Nest, e porque é aqui que
 * mora a decisão que a tela mostra: quem atende cada tarefa e se está pronto.
 */

export { AI_TASKS };
export type { AiProvider, AiTask };

/**
 * Modelos da Anthropic por tarefa — seção 4 do CLAUDE.md: Haiku para ler
 * (resposta fechada), Sonnet para escrever.
 */
export const ANTHROPIC_MODEL: Record<AiTask, string> = {
  email: 'claude-haiku-4-5-20251001',
  resolve: 'claude-haiku-4-5-20251001',
  extraction: 'claude-haiku-4-5-20251001',
  answers: 'claude-sonnet-5-5',
};

/** A variável do `.env` que escolhe o provedor de cada tarefa. */
export const TASK_PROVIDER_VAR = {
  email: 'AI_EMAIL_PROVIDER',
  resolve: 'AI_RESOLVE_PROVIDER',
  extraction: 'AI_EXTRACTION_PROVIDER',
  answers: 'AI_ANSWERS_PROVIDER',
} as const satisfies Record<AiTask, string>;

/** O recorte do `Env` que o roteamento lê. */
export interface AiEnv {
  ANTHROPIC_API_KEY?: string;
  AI_LOCAL_MODEL?: string;
  AI_LOCAL_WRITING_MODEL?: string;
  AI_EMAIL_PROVIDER: AiProvider;
  AI_RESOLVE_PROVIDER: AiProvider;
  AI_EXTRACTION_PROVIDER: AiProvider;
  AI_ANSWERS_PROVIDER: AiProvider;
}

export function providerOf(task: AiTask, env: AiEnv): AiProvider {
  return env[TASK_PROVIDER_VAR[task]];
}

/**
 * O modelo local de uma tarefa. Escrita pode ter o seu próprio: um modelo
 * maior só para as respostas de formulário, sem pesar na leitura de emails.
 */
export function localModelOf(task: AiTask, env: AiEnv): string | undefined {
  return task === 'answers'
    ? (env.AI_LOCAL_WRITING_MODEL ?? env.AI_LOCAL_MODEL)
    : env.AI_LOCAL_MODEL;
}

export function taskStatus(task: AiTask, env: AiEnv): AiTaskStatus {
  const provider = providerOf(task, env);

  if (provider === 'local') {
    const model = localModelOf(task, env) ?? null;

    return { provider, model, configured: model !== null };
  }

  return {
    provider,
    model: ANTHROPIC_MODEL[task],
    configured: Boolean(env.ANTHROPIC_API_KEY),
  };
}

export function resolveTasks(env: AiEnv): Record<AiTask, AiTaskStatus> {
  return {
    email: taskStatus('email', env),
    resolve: taskStatus('resolve', env),
    extraction: taskStatus('extraction', env),
    answers: taskStatus('answers', env),
  };
}

/** Como cada tarefa se chama numa mensagem de erro. */
const UNAVAILABLE_PREFIX: Record<AiTask, string> = {
  email: 'Leitura de emails por IA indisponível',
  resolve: 'Resolver por IA indisponível',
  extraction: 'Extração indisponível',
  answers: 'Respostas por IA indisponíveis',
};

/**
 * O que falta para a tarefa funcionar, dito com o nome da variável. Os
 * textos da Anthropic são os de sempre; os do modelo local são novos.
 */
export function unavailableMessage(task: AiTask, env: AiEnv): string {
  const prefix = UNAVAILABLE_PREFIX[task];

  if (providerOf(task, env) === 'local') {
    return `${prefix}: defina AI_LOCAL_MODEL no .env do backend com o modelo do Ollama (ex.: qwen2.5:3b).`;
  }

  return `${prefix}: defina ANTHROPIC_API_KEY no .env do backend.`;
}
