import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url(),
});

/**
 * Cada `NEXT_PUBLIC_*` precisa aparecer aqui escrito por extenso.
 * O Next substitui essas referências em build time; uma leitura dinâmica
 * (`process.env[nome]`) não é inlined e chegaria como `undefined` no browser.
 */
const parsed = envSchema.safeParse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
});

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");

  throw new Error(
    `Variáveis de ambiente inválidas:\n${issues}\n\nCopie o .env.example para .env.local.`,
  );
}

export const env = parsed.data;
