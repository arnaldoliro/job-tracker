import "server-only";
import {
  applicationListSchema,
  applicationSchema,
  createApplicationSchema,
  timelineSchema,
  updateApplicationSchema,
} from "@recruit/shared";
import type {
  Application,
  CreateApplicationInput,
  TimelineEntry,
  UpdateApplicationInput,
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

/** A resposta é validada com o mesmo schema que o Nest usa na entrada. */
export async function listApplications(profileId: string): Promise<Application[]> {
  return applicationListSchema.parse(
    await request(`/applications?profileId=${encodeURIComponent(profileId)}`),
  );
}

export async function createApplication(
  input: CreateApplicationInput,
): Promise<Application> {
  return applicationSchema.parse(
    await request("/applications", {
      method: "POST",
      body: JSON.stringify(createApplicationSchema.parse(input)),
    }),
  );
}

export async function updateApplication(
  id: string,
  input: UpdateApplicationInput,
): Promise<Application> {
  return applicationSchema.parse(
    await request(`/applications/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updateApplicationSchema.parse(input)),
    }),
  );
}

export async function deleteApplication(id: string): Promise<void> {
  await request(`/applications/${id}`, { method: "DELETE" });
}

/** Eventos de status e emails da candidatura, já ordenados pelo servidor. */
export async function getTimeline(id: string): Promise<TimelineEntry[]> {
  return timelineSchema.parse(await request(`/applications/${id}/timeline`));
}
