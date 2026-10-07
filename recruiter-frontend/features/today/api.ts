import "server-only";
import { todaySchema } from "@recruit/shared";
import type { FollowUpAction, Today } from "@recruit/shared";
import { env } from "@/lib/env";

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${env.API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = body as { message?: string } | null;

    throw new Error(detail?.message ?? `Falha na requisição (${response.status})`);
  }

  return body;
}

/** Revalida com o mesmo schema do Nest: o backend é sistema externo para o Next. */
export async function getToday(profileId: string): Promise<Today> {
  return todaySchema.parse(
    await request(`/today?profileId=${encodeURIComponent(profileId)}`),
  );
}

export async function recordFollowUp(
  applicationId: string,
  action: FollowUpAction,
): Promise<void> {
  await request(`/applications/${applicationId}/follow-up`, {
    method: "PATCH",
    body: JSON.stringify({ action }),
  });
}
