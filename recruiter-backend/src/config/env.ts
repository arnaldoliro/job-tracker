import { z } from 'zod';

/**
 * Trata variável presente porém vazia (`FOO=` no .env) como ausente.
 * Sem isso, `ANTHROPIC_API_KEY=` passaria pela validação como string vazia.
 */
const optionalString = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().min(1).optional(),
);

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),

  // Infraestrutura: obrigatórias, o worker não funciona sem elas.
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),

  // Opcionais enquanto as features de IA e email não existem.
  ANTHROPIC_API_KEY: optionalString,
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
   * Sincronizar ao subir o processo. Desligado por padrão de propósito: em
   * `nest start --watch` o backend reinicia a cada arquivo salvo, e isso viraria
   * uma conexão IMAP por gravação.
   *
   * NÃO usar `z.coerce.boolean()`: ele converte a string "false" em `true`.
   */
  IMAP_SYNC_ON_BOOT: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() === 'true' : value),
    z.boolean().default(false),
  ),
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
