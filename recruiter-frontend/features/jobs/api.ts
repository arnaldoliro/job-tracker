import "server-only";
import {
  discoverResultSchema,
  jobSchema,
  jobSearchResultSchema,
  savedJobListSchema,
  savedJobSchema,
} from "@recruit/shared";
import type {
  DiscoverResult,
  Job,
  JobSearchResult,
  SavedJob,
} from "@recruit/shared";
import { env } from "@/lib/env";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly issues?: { field: string; message: string }[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${env.API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });

  if (response.status === 204) {
    return null;
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = body as {
      message?: string;
      issues?: { field: string; message: string }[];
    } | null;

    throw new ApiError(
      detail?.message ?? `Falha na requisição (${response.status})`,
      response.status,
      detail?.issues,
    );
  }

  return body;
}

/** Um lote da descoberta. O cursor é opaco: vem do lote anterior, sem ser lido. */
export async function discoverJobs(params: {
  profileId: string;
  cursor?: string;
  q?: string;
  expanded?: boolean;
}): Promise<DiscoverResult> {
  const search = new URLSearchParams({ profileId: params.profileId });

  if (params.cursor) search.set("cursor", params.cursor);
  if (params.q) search.set("q", params.q);
  // Só quando ligado: z.coerce.boolean() trata "false" como verdadeiro, então
  // o parâmetro ausente é a única forma segura de dizer "não".
  if (params.expanded) search.set("expanded", "true");

  return discoverResultSchema.parse(
    await request(`/jobs/discover?${search.toString()}`),
  );
}

export async function listSavedJobs(profileId: string): Promise<SavedJob[]> {
  return savedJobListSchema.parse(
    await request(`/jobs/saved?profileId=${encodeURIComponent(profileId)}`),
  );
}

export async function saveJob(
  profileId: string,
  result: JobSearchResult,
): Promise<SavedJob> {
  return savedJobSchema.parse(
    await request("/jobs/saved", {
      method: "POST",
      body: JSON.stringify({ profileId, result }),
    }),
  );
}

export async function unsaveJob(
  profileId: string,
  jobId: string,
): Promise<void> {
  await request(
    `/jobs/saved/${jobId}?profileId=${encodeURIComponent(profileId)}`,
    { method: "DELETE" },
  );
}

export async function getJob(id: string): Promise<Job> {
  return jobSchema.parse(await request(`/jobs/${id}`));
}

/**
 * Extrai uma vaga a partir da URL. Não persiste: devolve o mesmo formato de um
 * resultado de busca, que só vira `Job` quando salvo.
 */
export async function extractJob(url: string): Promise<JobSearchResult> {
  return jobSearchResultSchema.parse(
    await request("/jobs/extract", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
  );
}
