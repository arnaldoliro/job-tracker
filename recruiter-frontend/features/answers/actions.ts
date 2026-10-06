"use server";

import { draftAnswerSchema } from "@recruit/shared";
import type { AnswerDraft } from "@recruit/shared";
import { ApiError, draftAnswer } from "@/features/answers/api";

export type DraftState =
  | { status: "error"; message: string }
  | { status: "success"; draft: AnswerDraft };

/**
 * Valida antes de chamar a API mesmo sabendo que o Nest revalida: é UX, dá o
 * erro certo sem gastar uma chamada paga, e o §5 diz que isso não dispensa a
 * borda.
 */
export async function draftAnswerAction(input: unknown): Promise<DraftState> {
  const parsed = draftAnswerSchema.safeParse(input);

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }

  try {
    return { status: "success", draft: await draftAnswer(parsed.data) };
  } catch (error) {
    if (error instanceof ApiError) {
      return { status: "error", message: error.message };
    }

    return { status: "error", message: "Não consegui gerar a resposta agora." };
  }
}
