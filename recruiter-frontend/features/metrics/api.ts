import "server-only";
import { metricsSchema } from "@recruit/shared";
import type { Metrics } from "@recruit/shared";
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

async function request(path: string): Promise<unknown> {
  const response = await fetch(`${env.API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
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

  return body;
}

/**
 * Revalida a resposta com o MESMO schema que o Nest usou.
 *
 * Aqui isso vale mais que nas outras telas: um `NaN` de divisão vira `null` no
 * JSON e passaria despercebido como "sem dado", quando é defeito de cálculo.
 */
export async function getMetrics(profileId: string): Promise<Metrics> {
  return metricsSchema.parse(
    await request(`/metrics?profileId=${encodeURIComponent(profileId)}`),
  );
}
