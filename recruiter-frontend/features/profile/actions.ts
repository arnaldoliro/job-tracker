"use server";

import { revalidatePath } from "next/cache";
import { createProfileSchema } from "@recruit/shared";
import type { Profile } from "@recruit/shared";
import { ApiError, createProfile } from "@/features/profile/api";

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
