import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type { AiStatus, AiTaskStatus } from '@recruit/shared';
import type { Env } from '../config/env';
import { AiUnavailableError, classifyAnthropicError } from './ai-errors';
import {
  AI_TASKS,
  localModelOf,
  resolveTasks,
  taskStatus,
  unavailableMessage,
  type AiEnv,
  type AiProvider,
  type AiTask,
} from './ai-tasks';
import { hasModel, localTextBudget, OllamaClient } from './ollama';

/**
 * A porta única para a IA.
 *
 * Cada tarefa continua dona do seu prompt, do seu schema e da sua validação;
 * aqui só se decide QUEM responde — a API da Anthropic ou o modelo local no
 * Ollama, conforme o `.env` — e se monta a chamada do jeito de cada um.
 *
 * O caminho Anthropic é o de sempre, corpo por corpo: tool use com
 * `tool_choice` forçado e `input_schema` saído do Zod que valida a volta. O
 * caminho local manda o mesmo schema em `format` e as descrições dos campos
 * no prompt (ver `ollama.ts`). Nos dois, a resposta passa por
 * `schema.safeParse`, e o que não passa vira `null` — nunca um valor meio
 * certo.
 *
 * Nenhum log aqui carrega conteúdo: só tarefa, provedor, modelo, tempo e
 * contagem de tokens.
 */

export interface StructuredRequest<S extends z.ZodType> {
  /** Pronto, com os delimitadores de dado. Passa intocado. */
  system: string;
  /** Idem. */
  user: string;
  schema: S;
  /** O "formulário" que o modelo preenche: nome e descrição do tool use. */
  tool: { name: string; description: string };
  maxTokens: number;
  /** Só na Anthropic. O modelo local usa `AI_LOCAL_TIMEOUT_MS`, por chamada. */
  timeoutMs: number;
}

/** Sondagem do Ollama vale por este tempo: a tela pergunta a cada carga. */
const PROBE_TTL_MS = 30_000;
const PROBE_TIMEOUT_MS = 1_500;

/** Teto de saída no modelo local: um formulário não é uma redação. */
const LOCAL_MAX_PREDICT = 2_048;

interface Probe {
  at: number;
  reachable: boolean;
  models: string[];
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly env: AiEnv & {
    AI_LOCAL_URL: string;
    AI_LOCAL_NUM_CTX: number;
  };

  /**
   * Compartilhado com quem precisa da API por fora do `complete` — as
   * respostas de formulário usam saída estruturada, `fallbacks` e cache de
   * prompt, que são só da Anthropic. Timeout e tentativas vão por chamada.
   */
  readonly anthropic: Anthropic | null;

  private readonly ollama: OllamaClient;
  private probe: Probe | null = null;

  constructor(config: ConfigService<Env, true>) {
    const get = <K extends keyof Env>(key: K): Env[K] =>
      config.get(key, { infer: true });

    this.env = {
      ANTHROPIC_API_KEY: get('ANTHROPIC_API_KEY'),
      AI_LOCAL_MODEL: get('AI_LOCAL_MODEL'),
      AI_LOCAL_WRITING_MODEL: get('AI_LOCAL_WRITING_MODEL'),
      AI_EMAIL_PROVIDER: get('AI_EMAIL_PROVIDER'),
      AI_RESOLVE_PROVIDER: get('AI_RESOLVE_PROVIDER'),
      AI_EXTRACTION_PROVIDER: get('AI_EXTRACTION_PROVIDER'),
      AI_ANSWERS_PROVIDER: get('AI_ANSWERS_PROVIDER'),
      AI_LOCAL_URL: get('AI_LOCAL_URL'),
      AI_LOCAL_NUM_CTX: get('AI_LOCAL_NUM_CTX'),
    };

    this.anthropic = this.env.ANTHROPIC_API_KEY
      ? new Anthropic({ apiKey: this.env.ANTHROPIC_API_KEY })
      : null;

    this.ollama = new OllamaClient({
      baseUrl: this.env.AI_LOCAL_URL,
      timeoutMs: get('AI_LOCAL_TIMEOUT_MS'),
      numCtx: this.env.AI_LOCAL_NUM_CTX,
    });

    const tasks = resolveTasks(this.env);

    this.logger.log(
      `IA por tarefa: ${AI_TASKS.map((task) => {
        const status = tasks[task];

        return `${task}=${status.provider}${status.model ? ` (${status.model})` : ''}${status.configured ? '' : ' [não configurado]'}`;
      }).join(', ')}`,
    );
  }

  provider(task: AiTask): AiProvider {
    return taskStatus(task, this.env).provider;
  }

  isConfigured(task: AiTask): boolean {
    return taskStatus(task, this.env).configured;
  }

  model(task: AiTask): string | null {
    return taskStatus(task, this.env).model;
  }

  unavailableMessage(task: AiTask): string {
    return unavailableMessage(task, this.env);
  }

  /**
   * Quantos caracteres de texto de terceiros a tarefa pode mandar, ou `null`
   * quando não há teto (Anthropic). No modelo local o teto vem de `num_ctx`,
   * porque acima dele o Ollama corta o prompt em silêncio.
   */
  textBudget(task: AiTask, reservedOutput: number): number | null {
    return this.provider(task) === 'local'
      ? localTextBudget(this.env.AI_LOCAL_NUM_CTX, reservedOutput)
      : null;
  }

  /**
   * `null` quando a resposta veio fora do schema — é do conteúdo, e repetir
   * daria o mesmo. Lança `AiUnavailableError` quando o provedor não
   * respondeu, com o `kind` dizendo por quê.
   */
  async complete<S extends z.ZodType>(
    task: AiTask,
    request: StructuredRequest<S>,
  ): Promise<z.infer<S> | null> {
    const status = taskStatus(task, this.env);

    if (!status.configured || status.model === null) {
      throw new AiUnavailableError(
        'not_configured',
        status.provider,
        unavailableMessage(task, this.env),
      );
    }

    return status.provider === 'local'
      ? this.completeLocal(task, request, status.model)
      : this.completeAnthropic(task, request, status.model);
  }

  private async completeAnthropic<S extends z.ZodType>(
    task: AiTask,
    request: StructuredRequest<S>,
    model: string,
  ): Promise<z.infer<S> | null> {
    const started = Date.now();
    let message: Anthropic.Message;

    try {
      message = await this.anthropic!.messages.create(
        {
          model,
          max_tokens: request.maxTokens,
          system: request.system,
          tools: [
            {
              name: request.tool.name,
              description: request.tool.description,
              // O cast é estreitamento, não escape: z.toJSONSchema devolve um
              // JSON Schema genérico, e o SDK tipa input_schema como um objeto
              // com `type: 'object'` — que é o que um z.object produz.
              input_schema: z.toJSONSchema(
                request.schema,
              ) as Anthropic.Tool.InputSchema,
            },
          ],
          tool_choice: { type: 'tool', name: request.tool.name },
          messages: [{ role: 'user', content: request.user }],
        },
        // O padrão do SDK é 10 minutos. Aqui tem uma tela esperando: mais que
        // isso não é lentidão, é a requisição pendurada.
        { timeout: request.timeoutMs, maxRetries: 1 },
      );
    } catch (error) {
      const failure = classifyAnthropicError(error);

      this.logger.error(`[${task}] ${failure.detail}`);

      throw failure;
    }

    this.logger.log(
      `[${task}] anthropic ${model}: ${message.usage.input_tokens} entrada, ${message.usage.output_tokens} saída, ${Date.now() - started} ms`,
    );

    // O array pode ter um bloco de texto antes do tool_use; nunca indexar [0].
    const block = message.content.find((item) => item.type === 'tool_use');

    return this.validate(
      task,
      request.schema,
      block?.type === 'tool_use' ? block.input : undefined,
    );
  }

  private async completeLocal<S extends z.ZodType>(
    task: AiTask,
    request: StructuredRequest<S>,
    model: string,
  ): Promise<z.infer<S> | null> {
    let result: Awaited<ReturnType<OllamaClient['chat']>>;

    try {
      result = await this.ollama.chat({
        model,
        system: request.system,
        user: request.user,
        schema: request.schema,
        description: request.tool.description,
        numPredict: Math.min(request.maxTokens, LOCAL_MAX_PREDICT),
      });
    } catch (error) {
      if (error instanceof AiUnavailableError) {
        this.logger.error(`[${task}] ${error.detail ?? error.message}`);
      }

      throw error;
    }

    this.logger.log(
      `[${task}] local ${model}: ${result.usage.promptTokens ?? '?'} entrada, ${result.usage.outputTokens ?? '?'} saída, ${result.usage.durationMs} ms`,
    );

    if (result.truncated) {
      // O único sinal que o Ollama dá de que cortou o prompt. Sem este aviso,
      // uma vaga longa viraria resposta "incompleta" sem explicação.
      this.logger.warn(
        `[${task}] o prompt encostou em AI_LOCAL_NUM_CTX=${this.env.AI_LOCAL_NUM_CTX}: parte dele pode ter sido cortada. Aumente o valor ou use um texto menor.`,
      );
    }

    if (result.data === null) {
      this.logger.warn(
        `[${task}] resposta fora do schema: ${(result.issues ?? []).join(', ')}`,
      );

      return null;
    }

    return result.data as z.infer<S>;
  }

  /**
   * O `.input` chega como unknown de propósito: o JSON Schema orienta a
   * geração, não garante o formato. Quem garante é isto.
   */
  private validate<S extends z.ZodType>(
    task: AiTask,
    schema: S,
    value: unknown,
  ): z.infer<S> | null {
    const parsed = schema.safeParse(value);

    if (!parsed.success) {
      this.logger.warn(
        `[${task}] resposta fora do schema: ${parsed.error.issues
          .map((issue) => issue.path.join('.') || '(raiz)')
          .join(', ')}`,
      );

      return null;
    }

    return parsed.data;
  }

  /** O que a tela mostra. Nunca lança, nunca carrega modelo. */
  async status(): Promise<AiStatus> {
    const tasks = resolveTasks(this.env);
    const anyLocal = AI_TASKS.some((task) => tasks[task].provider === 'local');
    const local: AiStatus['local'] = {
      url: this.env.AI_LOCAL_URL,
      model: this.env.AI_LOCAL_MODEL ?? null,
      writingModel: this.env.AI_LOCAL_WRITING_MODEL ?? null,
      reachable: null,
      missingModels: null,
      checkedAt: null,
    };

    if (anyLocal) {
      const probe = await this.probeOllama();
      const needed = AI_TASKS.filter((task) => tasks[task].provider === 'local')
        .map((task) => localModelOf(task, this.env))
        .filter((name): name is string => Boolean(name));

      local.reachable = probe.reachable;
      local.missingModels = probe.reachable
        ? [...new Set(needed)].filter((name) => !hasModel(probe.models, name))
        : null;
      local.checkedAt = new Date(probe.at).toISOString();
    }

    return {
      tasks,
      anthropic: { configured: Boolean(this.env.ANTHROPIC_API_KEY) },
      local,
    };
  }

  /** `GET /api/tags`: lista os modelos baixados sem carregar nenhum. */
  private async probeOllama(): Promise<Probe> {
    if (this.probe && Date.now() - this.probe.at < PROBE_TTL_MS) {
      return this.probe;
    }

    try {
      const models = await this.ollama.tags(PROBE_TIMEOUT_MS);

      this.probe = { at: Date.now(), reachable: true, models };
    } catch {
      this.probe = { at: Date.now(), reachable: false, models: [] };
    }

    return this.probe;
  }

  /** Só para a tela: o status resumido de uma tarefa. */
  taskStatus(task: AiTask): AiTaskStatus {
    return taskStatus(task, this.env);
  }
}
