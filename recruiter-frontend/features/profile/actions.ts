"use server";

import { revalidatePath } from "next/cache";
import { createProfileSchema, updateProfileSchema } from "@recruit/shared";
import type { Profile, UpdateProfileInput } from "@recruit/shared";
import { ApiError, createProfile, updateProfile } from "@/features/profile/api";
import {
  ImportError,
  parseLinkedInExport,
  type ImportOutcome,
} from "@/features/profile/linkedin-import";

export type CreateProfileState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> }
  | { status: "success"; profile: Profile };

/**
 * Valida no servidor antes de chamar a API — e o Nest valida de novo do outro
 * lado. Não é redundância inútil: esta Server Action é um endpoint HTTP como
 * qualquer outro, e o Nest não tem como saber que a chamada veio daqui.
 */
export async function createProfileAction(
  _prev: CreateProfileState,
  formData: FormData,
): Promise<CreateProfileState> {
  const headline = formData.get("headline");

  const parsed = createProfileSchema.safeParse({
    name: formData.get("name"),
    headline: typeof headline === "string" && headline.trim() !== ""
      ? headline
      : undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};

    for (const issue of parsed.error.issues) {
      const field = issue.path.join(".") || "form";
      fieldErrors[field] ??= issue.message;
    }

    return { status: "error", message: "Confira os campos.", fieldErrors };
  }

  try {
    const profile = await createProfile(parsed.data);
    revalidatePath("/");

    return { status: "success", profile };
  } catch (error) {
    if (error instanceof ApiError) {
      return { status: "error", message: error.message };
    }

    return {
      status: "error",
      message: "Não foi possível falar com a API. Ela está no ar?",
    };
  }
}

export type SaveProfileState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> }
  | { status: "success" };

/**
 * O currículo inteiro sobe de uma vez. O Nest revalida com o mesmo Zod: esta
 * Server Action é um endpoint HTTP como qualquer outro, e o backend não tem
 * como saber que a chamada veio daqui.
 */
export async function saveProfileAction(
  id: string,
  input: UpdateProfileInput,
): Promise<SaveProfileState> {
  const parsed = updateProfileSchema.safeParse(input);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};

    for (const issue of parsed.error.issues) {
      const field = issue.path.join(".") || "form";
      fieldErrors[field] ??= issue.message;
    }

    return { status: "error", message: "Confira os campos.", fieldErrors };
  }

  try {
    await updateProfile(id, parsed.data);
    revalidatePath("/curriculo");
    revalidatePath("/");

    return { status: "success" };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        status: "error",
        message: error.message,
        fieldErrors: error.issues
          ? Object.fromEntries(error.issues.map((i) => [i.field, i.message]))
          : undefined,
      };
    }

    return {
      status: "error",
      message: "Não foi possível falar com a API. Ela está no ar?",
    };
  }
}

export type ImportState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; outcome: ImportOutcome };

/**
 * Lê o ZIP e DEVOLVE o resultado para revisão — não grava nada. Import que
 * sobrescreve currículo em silêncio é o tipo de coisa que se descobre tarde.
 */
export async function importLinkedInAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Escolha o arquivo .zip do LinkedIn." };
  }

  try {
    return { status: "success", outcome: await parseLinkedInExport(file) };
  } catch (error) {
    if (error instanceof ImportError) {
      return { status: "error", message: error.message };
    }

    return { status: "error", message: "Não consegui ler o arquivo." };
  }
}
