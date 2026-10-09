import "server-only";
import { aiStatusSchema } from "@recruit/shared";
import type { AiStatus } from "@recruit/shared";
import { env } from "@/lib/env";

/** A sondagem do Ollama no backend leva até 1,5 s; um pouco mais que isso. */
const TIMEOUT_MS = 2_000;

/**
 * Quem atende cada tarefa de IA agora.
 *
 * `null` quando não deu para saber — API fora, tempo esgotado, resposta fora
 * do contrato. A tela mostra "desconhecido" e segue: o selo é informação, e
 * nenhuma página pode deixar de carregar por causa dele.
 */
export async function getAiStatus(): Promise<AiStatus | null> {
  try {
    const response = await fetch(`${env.API_URL}/ai/status`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      return null;
    }

    const parsed = aiStatusSchema.safeParse(await response.json());

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
