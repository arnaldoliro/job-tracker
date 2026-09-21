"use server";

import { revalidatePath } from "next/cache";
import { createApplicationFromEmailSchema } from "@recruit/shared";
import type { EmailSyncResult } from "@recruit/shared";
import {
  ApiError,
  createApplicationFromEmail,
  linkEmail,
  syncEmails,
} from "@/features/emails/api";

export type EmailActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success" };

export type SyncState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; result: EmailSyncResult };

function toError(error: unknown, fallback: string): { status: "error"; message: string } {
  if (error instanceof ApiError) {
    return { status: "error", message: error.message };
  }

  return { status: "error", message: fallback };
}

export async function syncEmailsAction(): Promise<SyncState> {
  try {
    const result = await syncEmails();

    revalidatePath("/emails");

    return { status: "success", result };
  } catch (error) {
    return toError(error, "Não consegui sincronizar os emails agora.");
  }
}

export async function linkEmailAction(
  id: string,
  applicationId: string,
): Promise<EmailActionState> {
  try {
    await linkEmail(id, applicationId);
    revalidatePath("/emails");
    revalidatePath("/");

    return { status: "success" };
  } catch (error) {
    return toError(error, "Não consegui vincular o email.");
  }
}

/**
 * Cria a candidatura que o email prova existir.
 *
 * Valida antes de chamar a API mesmo sabendo que o Nest revalida: é UX, dá o
 * erro no campo certo, e o §5 diz que isso não dispensa a borda.
 */
export async function createFromEmailAction(
  id: string,
  input: { profileId: string; company: string; title: string },
): Promise<EmailActionState> {
  const parsed = createApplicationFromEmailSchema.safeParse(input);

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Dados inválidos",
    };
  }

  try {
    await createApplicationFromEmail(id, parsed.data);
    revalidatePath("/emails");
    revalidatePath("/");

    return { status: "success" };
  } catch (error) {
    return toError(error, "Não consegui criar a candidatura.");
  }
}
