import "server-only";
import { answerDraftSchema, draftAnswerSchema } from "@recruit/shared";
import type { AnswerDraft, DraftAnswerInput } from "@recruit/shared";
import { env } from "@/lib/env";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Pede o rascunho de uma resposta. A saída é revalidada com o mesmo schema
 * que o Nest usa: é texto gerado a partir de conteúdo de terceiros, e a tela
 * só confia no formato que conferiu.
 */
export async function draftAnswer(input: DraftAnswerInput): Promise<AnswerDraft> {
  const response = await fetch(`${env.API_URL}/answers/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draftAnswerSchema.parse(input)),
    cache: "no-store",
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = body as { message?: string } | null;

    throw new ApiError(
      detail?.message ?? `Falha na requisição (${response.status})`,
      response.status,
    );
  }

  return answerDraftSchema.parse(body);
}
