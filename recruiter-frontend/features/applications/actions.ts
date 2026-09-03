"use server";

import { revalidatePath } from "next/cache";
import {
  createApplicationSchema,
  updateApplicationSchema,
} from "@recruit/shared";
import {
  ApiError,
  createApplication,
  deleteApplication,
  updateApplication,
} from "@/features/applications/api";
import type {
  ApplicationFormState,
  DeleteState,
} from "@/features/applications/types";

/** Campo vazio no formulário significa "não informado", não string vazia. */
function optional(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function toFieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};

  for (const issue of issues) {
    const field = issue.path.join(".") || "form";
    fieldErrors[field] ??= issue.message;
  }

  return fieldErrors;
}

function toErrorState(error: unknown): ApplicationFormState {
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

export async function createApplicationAction(
  _prev: ApplicationFormState,
  formData: FormData,
): Promise<ApplicationFormState> {
  const parsed = createApplicationSchema.safeParse({
    profileId: formData.get("profileId"),
    company: formData.get("company"),
    title: formData.get("title"),
    url: optional(formData.get("url")),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Confira os campos.",
      fieldErrors: toFieldErrors(parsed.error.issues),
    };
  }

  try {
    const application = await createApplication(parsed.data);
    revalidatePath("/");

    return { status: "success", application };
  } catch (error) {
    return toErrorState(error);
  }
}

export async function updateApplicationAction(
  _prev: ApplicationFormState,
  formData: FormData,
): Promise<ApplicationFormState> {
  const id = formData.get("id");

  if (typeof id !== "string" || id === "") {
    return { status: "error", message: "Candidatura não identificada." };
  }

  const url = optional(formData.get("url"));
  const notes = optional(formData.get("notes"));

  const parsed = updateApplicationSchema.safeParse({
    company: formData.get("company"),
    title: formData.get("title"),
    status: formData.get("status"),
    // `null` limpa o campo; o formulário vazio significa exatamente isso.
    url: url ?? null,
    notes: notes ?? null,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Confira os campos.",
      fieldErrors: toFieldErrors(parsed.error.issues),
    };
  }

  try {
    const application = await updateApplication(id, parsed.data);
    revalidatePath("/");

    return { status: "success", application };
  } catch (error) {
    return toErrorState(error);
  }
}

export async function deleteApplicationAction(id: string): Promise<DeleteState> {
  try {
    await deleteApplication(id);
    revalidatePath("/");

    return { status: "success" };
  } catch (error) {
    if (error instanceof ApiError) {
      return { status: "error", message: error.message };
    }

    return { status: "error", message: "Não foi possível excluir." };
  }
}
