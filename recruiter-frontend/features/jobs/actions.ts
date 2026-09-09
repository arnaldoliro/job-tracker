"use server";

import { revalidatePath } from "next/cache";
import type { JobSearchResult } from "@recruit/shared";
import { createApplication } from "@/features/applications/api";
import { ApiError, extractJob, saveJob, unsaveJob } from "@/features/jobs/api";
import type { JobActionState } from "@/features/jobs/types";

function toError(error: unknown, fallback: string): JobActionState {
  if (error instanceof ApiError) {
    return { status: "error", message: error.message };
  }

  return { status: "error", message: fallback };
}

export async function saveJobAction(
  profileId: string,
  result: JobSearchResult,
): Promise<JobActionState> {
  try {
    await saveJob(profileId, result);
    revalidatePath("/vagas");
    revalidatePath("/vagas/salvas");

    return { status: "success" };
  } catch (error) {
    return toError(error, "Não foi possível salvar a vaga.");
  }
}

export async function unsaveJobAction(
  profileId: string,
  jobId: string,
): Promise<JobActionState> {
  try {
    await unsaveJob(profileId, jobId);
    revalidatePath("/vagas/salvas");

    return { status: "success" };
  } catch (error) {
    return toError(error, "Não foi possível remover a vaga.");
  }
}

/**
 * Aplicar a partir de uma vaga já registrada manda `jobId`, e não empresa e
 * cargo. É o que faz a candidatura apontar para a MESMA vaga salva — mandando
 * os textos, o backend criaria um Job novo e a vaga salva nunca se
 * reconheceria como aplicada.
 */
export async function applyToJobAction(
  profileId: string,
  jobId: string,
): Promise<JobActionState> {
  try {
    await createApplication({ profileId, jobId });
    revalidatePath("/");
    revalidatePath("/vagas");
    revalidatePath("/vagas/salvas");

    return { status: "success" };
  } catch (error) {
    return toError(error, "Não foi possível registrar a candidatura.");
  }
}

export type ExtractState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; result: JobSearchResult };

/**
 * Extrai e devolve para revisão. Como a busca, não grava nada — quem grava é o
 * botão Salvar.
 */
export async function extractJobAction(
  _prev: ExtractState,
  formData: FormData,
): Promise<ExtractState> {
  const url = formData.get("url");

  if (typeof url !== "string" || url.trim() === "") {
    return { status: "error", message: "Cole o link da vaga." };
  }

  try {
    return { status: "success", result: await extractJob(url.trim()) };
  } catch (error) {
    if (error instanceof ApiError) {
      return { status: "error", message: error.message };
    }

    return { status: "error", message: "Não consegui extrair a vaga." };
  }
}
