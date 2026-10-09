import { z } from 'zod';
import { AiUnavailableError, classifyOllamaError } from './ai-errors';

/**
 * Cliente do Ollama, pela API nativa (`POST /api/chat`).
 *
 * Fora do Nest e com o `fetch` injetável, para o spec exercitar o corpo da
 * requisição, o parse da resposta e os erros sem um Ollama de verdade.
 *
 * NÃO passa pelo `safe-fetch`: aquele bloqueia loopback de propósito (é a
 * barreira contra SSRF), e o Ollama só pode estar em loopback — o `.env`
 * recusa qualquer outro endereço. Os dois lados da mesma regra.
 *
 * Duas coisas que o Ollama faz diferente da Anthropic, e que decidem o
 * desenho:
 *
 * 1. O `format` com JSON Schema restringe a GERAÇÃO, mas o modelo não vê o
 *    schema. As descrições dos campos (`.describe()`), que na Anthropic vão
 *    no `input_schema` e o modelo lê, aqui precisam ir no prompt — senão o
 *    modelo preenche "candidatura" sem saber que é o número da lista.
 * 2. Acima de `num_ctx` o prompt é cortado em silêncio. O único sinal é o
 *    `prompt_eval_count` encostar no teto; o app avisa quando isso acontece.
 */

export type JsonSchema = Record<string, unknown>;

export interface OllamaOptions {
  baseUrl: string;
  /** Por chamada, contado depois de sair da fila. */
  timeoutMs: number;
  numCtx: number;
  /** Quanto tempo o modelo fica carregado depois da chamada. */
  keepAlive?: string;
  fetch?: typeof globalThis.fetch;
}

export interface OllamaChatRequest<S extends z.ZodType> {
  model: string;
  /** Pronto, com os delimitadores de dado. Passa intocado. */
  system: string;
  /** Idem. */
  user: string;
  schema: S;
  /** O "nome do formulário" que o modelo preenche — o mesmo do tool use. */
  description: string;
  /** Teto de tokens de saída, na ordem do `max_tokens` da Anthropic. */
  numPredict: number;
}

export interface OllamaUsage {
  promptTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
}

export interface OllamaChatResult<S extends z.ZodType> {
  /** `null` quando a resposta não é o JSON pedido. Ver `issues`. */
  data: z.infer<S> | null;
  usage: OllamaUsage;
  /** O prompt encostou em `num_ctx`: parte dele pode ter sido cortada. */
  truncated: boolean;
  issues?: string[];
}

/** Sem cache de prompt no Ollama; manter o modelo carregado é o que há. */
const DEFAULT_KEEP_ALIVE = '10m';

/** Margem para o template do chat e para o sufixo de campos. */
const CONTEXT_OVERHEAD_TOKENS = 1024;

/** Português em tokenizadores de modelo aberto: ~3 caracteres por token. */
const CHARS_PER_TOKEN = 3;

/**
 * O JSON Schema que vai em `format`.
 *
 * É o mesmo `z.toJSONSchema` do tool use da Anthropic, sem o `$schema`: o
 * Ollama o ignora, mas é ruído num campo que ele converte em gramática.
 */
export function toOllamaFormat(schema: z.ZodType): JsonSchema {
  const json = { ...(z.toJSONSchema(schema) as JsonSchema) };

  delete json.$schema;

  return json;
}

/**
 * Os campos do schema, um por linha, para o modelo ler.
 *
 * "- candidatura (inteiro ou null): O número da candidatura na lista…" é o
 * que a Anthropic recebe pelo `input_schema`; aqui vai no texto.
 */
export function describeFields(jsonSchema: JsonSchema): string {
  const properties = (jsonSchema.properties ?? {}) as Record<
    string,
    JsonSchema
  >;
  const required = new Set((jsonSchema.required as string[] | undefined) ?? []);

  return Object.entries(properties)
    .map(([name, property]) => {
      const optional = required.has(name) ? '' : ', opcional';
      const description =
        typeof property.description === 'string'
          ? `: ${property.description}`
          : '';

      return `- ${name} (${describeType(property)}${optional})${description}`;
    })
    .join('\n');
}

function describeType(property: JsonSchema): string {
  if (Array.isArray(property.anyOf)) {
    const variants = property.anyOf as JsonSchema[];
    const nullable = variants.some((variant) => variant.type === 'null');
    const others = variants
      .filter((variant) => variant.type !== 'null')
      .map(describeType);

    return nullable ? `${others.join(' ou ')} ou null` : others.join(' ou ');
  }

  // `z.string().nullable()` sai como `type: ['string', 'null']`, sem anyOf.
  if (Array.isArray(property.type)) {
    const types = property.type as string[];
    const others = types
      .filter((type) => type !== 'null')
      .map((type) => describeType({ ...property, type }));

    return types.includes('null')
      ? `${others.join(' ou ')} ou null`
      : others.join(' ou ');
  }

  if (Array.isArray(property.enum)) {
    return (property.enum as unknown[]).map(String).join('|');
  }

  switch (property.type) {
    case 'string':
      return typeof property.maxLength === 'number'
        ? `texto, até ${property.maxLength} caracteres`
        : 'texto';
    case 'integer':
      return 'inteiro';
    case 'number':
      return 'número';
    case 'boolean':
      return 'verdadeiro ou falso';
    case 'array': {
      const items = property.items as JsonSchema | undefined;

      return items ? `lista de ${describeType(items)}` : 'lista';
    }
    case 'object': {
      const inner = (property.properties ?? {}) as Record<string, JsonSchema>;
      const fields = Object.entries(inner)
        .map(([name, value]) => `${name}: ${describeType(value)}`)
        .join(', ');

      return fields ? `objeto com { ${fields} }` : 'objeto';
    }
    default:
      return 'valor';
  }
}

/**
 * O prompt de sistema do modelo local: o de sempre, mais o formulário.
 *
 * O `system` entra intocado — delimitadores e regras são os mesmos da
 * Anthropic. Só acrescenta o que lá vai pelo `input_schema`.
 */
export function localSystemPrompt(
  system: string,
  description: string,
  jsonSchema: JsonSchema,
): string {
  return [
    system,
    '',
    `Responda SOMENTE com o JSON do formulário "${description}", sem texto antes ou depois, com estes campos:`,
    describeFields(jsonSchema),
  ].join('\n');
}

export interface OllamaChatBody {
  model: string;
  messages: { role: 'system' | 'user'; content: string }[];
  format: JsonSchema;
  stream: false;
  keep_alive: string;
  options: { temperature: number; num_ctx: number; num_predict: number };
}

export function buildChatBody<S extends z.ZodType>(
  request: OllamaChatRequest<S>,
  options: Pick<OllamaOptions, 'numCtx' | 'keepAlive'>,
): OllamaChatBody {
  const format = toOllamaFormat(request.schema);

  return {
    model: request.model,
    messages: [
      {
        role: 'system',
        content: localSystemPrompt(request.system, request.description, format),
      },
      { role: 'user', content: request.user },
    ],
    format,
    stream: false,
    keep_alive: options.keepAlive ?? DEFAULT_KEEP_ALIVE,
    options: {
      // Determinístico: a resposta é um formulário, não uma redação. Também
      // reduz a chance de o modelo "enfeitar" um campo que deveria ser null.
      temperature: 0,
      num_ctx: options.numCtx,
      num_predict: request.numPredict,
    },
  };
}

export const ollamaChatResponseSchema = z.object({
  message: z.object({ content: z.string() }),
  done: z.boolean(),
  prompt_eval_count: z.number().optional(),
  eval_count: z.number().optional(),
  /** Nanossegundos. */
  total_duration: z.number().optional(),
});

export type ParsedStructured<S extends z.ZodType> =
  | { ok: true; data: z.infer<S> }
  | { ok: false; reason: 'invalid-json' | 'off-schema'; issues: string[] };

/**
 * O `message.content` é uma string com JSON. O `format` garante a forma, mas
 * não limites como `maxLength` — por isso o Zod confere de novo, e o que não
 * passa vira `null` para quem chamou, nunca um valor meio certo.
 */
export function parseStructured<S extends z.ZodType>(
  content: string,
  schema: S,
): ParsedStructured<S> {
  let json: unknown;

  try {
    json = JSON.parse(content);
  } catch {
    return { ok: false, reason: 'invalid-json', issues: [] };
  }

  const parsed = schema.safeParse(json);

  if (!parsed.success) {
    return {
      ok: false,
      reason: 'off-schema',
      issues: parsed.error.issues.map(
        (issue) => issue.path.join('.') || '(raiz)',
      ),
    };
  }

  return { ok: true, data: parsed.data };
}

/**
 * Quantos caracteres de texto de terceiros cabem numa chamada, tirando o
 * que o template, o sufixo de campos e a resposta ocupam.
 *
 * Conta por baixo de propósito: cortar o texto da vaga 20% antes é melhor do
 * que o Ollama cortar o começo do prompt — que é onde estão as regras.
 */
export function localTextBudget(
  numCtx: number,
  reservedOutput: number,
): number {
  return Math.max(
    2_000,
    (numCtx - CONTEXT_OVERHEAD_TOKENS - reservedOutput) * CHARS_PER_TOKEN,
  );
}

/** O modelo configurado está na lista do Ollama? `qwen2.5` vale como `qwen2.5:latest`. */
export function hasModel(names: string[], model: string): boolean {
  return names.includes(model) || names.includes(`${model}:latest`);
}

const tagsResponseSchema = z.object({
  models: z.array(z.object({ name: z.string() })),
});

export class OllamaClient {
  private readonly fetchFn: typeof globalThis.fetch;

  /** Fila: uma chamada por vez. Ver `chat`. */
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly options: OllamaOptions) {
    this.fetchFn = options.fetch ?? globalThis.fetch;
  }

  get baseUrl(): string {
    return this.options.baseUrl;
  }

  /**
   * Uma chamada de cada vez.
   *
   * O Ollama atende poucas requisições em paralelo, conforme a memória, e o
   * "Resolver por IA" dispara lotes. Sem a fila, o timeout de cada chamada
   * contaria o tempo esperando na fila DO OLLAMA, e um lote inteiro
   * estouraria junto. Com ela, o timeout mede só o modelo.
   */
  async chat<S extends z.ZodType>(
    request: OllamaChatRequest<S>,
  ): Promise<OllamaChatResult<S>> {
    const previous = this.tail;
    let release!: () => void;

    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;

    try {
      return await this.send(request);
    } finally {
      release();
    }
  }

  /** Os modelos baixados. Barato: não carrega modelo nenhum. */
  async tags(timeoutMs: number): Promise<string[]> {
    const context = {
      baseUrl: this.options.baseUrl,
      model: '',
      timeoutMs,
    };
    let response: Response;

    try {
      response = await this.fetchFn(
        new URL('/api/tags', this.options.baseUrl),
        {
          redirect: 'error',
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
    } catch (error) {
      throw classifyOllamaError(error, context);
    }

    if (!response.ok) {
      throw classifyOllamaError(undefined, {
        ...context,
        status: response.status,
        body: await response.text().catch(() => ''),
      });
    }

    const parsed = tagsResponseSchema.safeParse(
      await response.json().catch(() => undefined),
    );

    return parsed.success ? parsed.data.models.map((item) => item.name) : [];
  }

  private async send<S extends z.ZodType>(
    request: OllamaChatRequest<S>,
  ): Promise<OllamaChatResult<S>> {
    const context = {
      baseUrl: this.options.baseUrl,
      model: request.model,
      timeoutMs: this.options.timeoutMs,
    };
    const started = Date.now();
    let response: Response;

    try {
      response = await this.fetchFn(
        new URL('/api/chat', this.options.baseUrl),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildChatBody(request, this.options)),
          // O corpo leva currículo e emails. Um redirecionamento os levaria
          // para outro endereço, por cima da regra do loopback do `.env`.
          redirect: 'error',
          // Criado aqui, depois da fila: mede o modelo, não a espera.
          signal: AbortSignal.timeout(this.options.timeoutMs),
        },
      );
    } catch (error) {
      throw classifyOllamaError(error, context);
    }

    if (!response.ok) {
      throw classifyOllamaError(undefined, {
        ...context,
        status: response.status,
        body: await response.text().catch(() => ''),
      });
    }

    const parsed = ollamaChatResponseSchema.safeParse(
      await response.json().catch(() => undefined),
    );

    if (!parsed.success || !parsed.data.done) {
      throw new AiUnavailableError(
        'upstream',
        'local',
        'O Ollama devolveu uma resposta inesperada. Veja o log do backend.',
        parsed.success
          ? 'Ollama: resposta com done=false'
          : 'Ollama: resposta fora do formato esperado',
      );
    }

    const body = parsed.data;
    const usage: OllamaUsage = {
      promptTokens: body.prompt_eval_count ?? null,
      outputTokens: body.eval_count ?? null,
      durationMs:
        body.total_duration !== undefined
          ? Math.round(body.total_duration / 1_000_000)
          : Date.now() - started,
    };
    const truncated =
      usage.promptTokens !== null &&
      usage.promptTokens >= this.options.numCtx - 64;
    const result = parseStructured(body.message.content, request.schema);

    if (!result.ok) {
      return {
        data: null,
        usage,
        truncated,
        issues: [result.reason, ...result.issues],
      };
    }

    return { data: result.data, usage, truncated };
  }
}
