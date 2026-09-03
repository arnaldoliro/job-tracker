import { z } from "zod";

const envSchema = z.object({
  API_URL: z.url(),
});

/**
 * `API_URL` e não `NEXT_PUBLIC_API_URL`: todo acesso à API do Nest acontece no
 * servidor Next (Server Component e Server Action). O navegador nunca fala com
 * a porta 3333, então não há motivo para embutir a URL no bundle.
 */
const parsed = envSchema.safeParse({
  API_URL: process.env.API_URL,
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
