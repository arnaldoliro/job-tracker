import { z } from 'zod';
import { aiProviderSchema, isLoopbackHost } from '@recruit/shared';

/** `FOO=` no .env chega como string vazia; para o schema, é ausente. */
const emptyToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

/**
 * Trata variável presente porém vazia (`FOO=` no .env) como ausente.
 * Sem isso, `ANTHROPIC_API_KEY=` passaria pela validação como string vazia.
 */
const optionalString = z.preprocess(
  emptyToUndefined,
  z.string().min(1).optional(),
);

/** `anthropic` ou `local`, por tarefa. Vazio é o padrão: Anthropic. */
const providerChoice = z.preprocess(
  (value) =>
    typeof value === 'string'
      ? emptyToUndefined(value.trim().toLowerCase())
      : value,
  aiProviderSchema.default('anthropic'),
);

/**
 * Onde o Ollama escuta. SÓ nesta máquina, e isso não é configurável.
 *
 * O app inteiro é loopback (§2): currículo, emails e vagas não saem daqui. Um
 * Ollama em outra máquina da rede receberia tudo isso em texto puro, e o
 * motivo de existir um modelo local é justamente não mandar nada para fora.
 */
const localUrl = z.preprocess(
  emptyToUndefined,
  z
    .url()
    .default('http://127.0.0.1:11434')
    .refine((value) => {
      const url = new URL(value);

      return (
        (url.protocol === 'http:' || url.protocol === 'https:') &&
        isLoopbackHost(url.host)
      );
    }, 'AI_LOCAL_URL precisa apontar para esta máquina (http://127.0.0.1, localhost ou [::1]): o modelo local existe para o currículo e os emails não saírem daqui.'),
);

/** Número inteiro com limites, tratando `FOO=` como ausente (vira o padrão). */
const boundedInt = (min: number, max: number, fallback: number) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(min).max(max).default(fallback),
  );

/**
 * Lista de slugs de board, separados por vírgula.
 *
 * O slug entra no caminho da URL da API de cada plataforma, então só passa
 * o formato que um slug de verdade tem: letras, números e hífen. Uma barra ou
 * um `?` mudaria o caminho ou a consulta da requisição.
 */
const boardList = z.preprocess(
  (value) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((slug) => slug.trim().toLowerCase())
          .filter(Boolean)
      : value,
  z
    .array(
      z
        .string()
        .regex(
          /^[a-z0-9][a-z0-9-]{0,62}$/,
          'Slug de board inválido: use só letras, números e hífen.',
        ),
    )
    .max(50)
    .default([]),
);

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3333),
    /**
     * Interface em que a API escuta. Padrão: SÓ a máquina local.
     *
     * A API não tem autenticação, e isso é decisão do §1 — um usuário, uma
     * máquina. O que torna essa decisão segura é ninguém mais alcançá-la. Sem
     * host, o Nest escuta em 0.0.0.0, e qualquer um na mesma rede Wi-Fi lia seu
     * perfil, alterava seus dados e fazia seu navegador logado abrir a URL que
     * quisesse. Mude só se souber por quê.
     *
     * `API_HOST` e não `HOST`: alguns shells — o zsh, por exemplo — definem
     * `HOST` sozinhos com o nome da máquina. Se vazasse para o processo, a API
     * escutaria no nome da máquina, que resolve para o IP da rede, e o buraco
     * reabriria em silêncio.
     */
    API_HOST: z.string().min(1).default('127.0.0.1'),
    WEB_ORIGIN: z.url().default('http://localhost:3000'),

    // Infraestrutura: obrigatória, o backend não funciona sem ela.
    //
    // Sem `REDIS_URL`: ela era obrigatória no boot e nenhum código a lia. O
    // Redis estava previsto para filas BullMQ que nunca foram necessárias.
    DATABASE_URL: z.url(),

    // Opcionais: sem elas, a feature correspondente fica desligada.
    ANTHROPIC_API_KEY: optionalString,

    /**
     * Quem atende cada tarefa de IA: a API da Anthropic ou um modelo local no
     * Ollama. Ver `ai/ai-tasks.ts`. Padrão Anthropic em todas — o comportamento
     * de sempre. `local` em alguma tarefa exige `AI_LOCAL_MODEL` (conferido no
     * `superRefine` abaixo).
     */
    AI_EMAIL_PROVIDER: providerChoice,
    AI_RESOLVE_PROVIDER: providerChoice,
    AI_EXTRACTION_PROVIDER: providerChoice,
    AI_ANSWERS_PROVIDER: providerChoice,
    AI_LOCAL_URL: localUrl,
    /** Nome do modelo no Ollama, como em `ollama pull <nome>`. */
    AI_LOCAL_MODEL: optionalString,
    /** Modelo só para as respostas de formulário (escrita). Cai no `AI_LOCAL_MODEL`. */
    AI_LOCAL_WRITING_MODEL: optionalString,
    /** Por chamada, já fora da fila. Modelo na CPU pode levar mais de um minuto. */
    AI_LOCAL_TIMEOUT_MS: boundedInt(5_000, 600_000, 120_000),
    /**
     * Janela de contexto pedida ao Ollama. Acima dela o prompt é CORTADO em
     * silêncio, então o app limita o texto que manda por esta conta. 8192
     * cabe numa GPU de 4 GB com um modelo de 3B; extração e respostas de
     * formulário ficam melhores com 16384.
     */
    AI_LOCAL_NUM_CTX: boundedInt(2_048, 131_072, 8_192),

    IMAP_HOST: optionalString,
    IMAP_PORT: z.coerce.number().int().positive().default(993),
    IMAP_USER: optionalString,
    IMAP_PASSWORD: optionalString,
    /**
     * O rótulo do Gmail que o app lê. Rótulo é pasta no IMAP.
     *
     * Ler um rótulo dedicado em vez da INBOX faz o "nunca mandar a caixa inteira
     * para fora" da seção 4 ser garantido pelo Gmail, antes de o código ver
     * qualquer coisa — e muda pelo filtro do Gmail, sem tocar em código.
     */
    IMAP_MAILBOX: z.preprocess(
      (value) =>
        typeof value === 'string' && value.trim() === '' ? undefined : value,
      z.string().min(1).default('job-tracker'),
    ),
    /**
     * Boards de empresas que a descoberta lê, separados por vírgula. Ver
     * `job/discovery/watchlist.ts`.
     */
    DISCOVERY_GREENHOUSE_BOARDS: boardList,
    DISCOVERY_ASHBY_BOARDS: boardList,
    DISCOVERY_LEVER_BOARDS: boardList,
    /**
     * Sincronizar ao subir o processo — a única sincronização que acontece sem
     * clique. Ligada por padrão; desligue com `false` se usar
     * `nest start --watch`, que reinicia a cada arquivo salvo e abriria uma
     * conexão IMAP por gravação.
     *
     * NÃO usar `z.coerce.boolean()`: ele converte a string "false" em `true`.
     */
    IMAP_SYNC_ON_BOOT: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim() === 'true' : value),
      z.boolean().default(true),
    ),
  })
  .superRefine((env, ctx) => {
    // Regra cruzada: tarefa no modelo local sem modelo é um boot que sobe e
    // falha no primeiro clique. Melhor falhar agora, com o nome da variável.
    const local = (
      [
        ['AI_EMAIL_PROVIDER', env.AI_EMAIL_PROVIDER],
        ['AI_RESOLVE_PROVIDER', env.AI_RESOLVE_PROVIDER],
        ['AI_EXTRACTION_PROVIDER', env.AI_EXTRACTION_PROVIDER],
        ['AI_ANSWERS_PROVIDER', env.AI_ANSWERS_PROVIDER],
      ] as const
    )
      .filter(([, provider]) => provider === 'local')
      .map(([name]) => name);

    if (local.length > 0 && !env.AI_LOCAL_MODEL) {
      ctx.addIssue({
        code: 'custom',
        path: ['AI_LOCAL_MODEL'],
        message: `obrigatória quando alguma tarefa usa o modelo local (${local.join(', ')}). Ex.: AI_LOCAL_MODEL=qwen2.5:3b`,
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Passada para `ConfigModule.forRoot({ validate })`. Lança no boot para que uma
 * variável faltando vire erro imediato, e não uma connection string com
 * "undefined" no meio.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(`Variáveis de ambiente inválidas:\n${issues}`);
  }

  return parsed.data;
}
