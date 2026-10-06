import "server-only";
import {
  applicationSchema,
  applyResolutionsResultSchema,
  applyResolutionsSchema,
  emailMessageListSchema,
  emailResolutionListSchema,
  resolveEmailsSchema,
  emailStatusSchema,
  emailSyncResultSchema,
} from "@recruit/shared";
import type {
  Application,
  ApplyResolutionsInput,
  ApplyResolutionsResult,
  CreateApplicationFromEmailInput,
  EmailResolution,
  ResolveEmailsInput,
  EmailMessage,
  EmailStatus,
  EmailSyncResult,
} from "@recruit/shared";
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
    const detail = body as { message?: string } | null;

    throw new ApiError(
      detail?.message ?? `Falha na requisição (${response.status})`,
      response.status,
    );
  }

  return body;
}

/** A caixa não é por perfil: há uma conta de email e vários perfis. */
export async function listUnlinkedEmails(): Promise<EmailMessage[]> {
  return emailMessageListSchema.parse(await request("/emails"));
}

export async function getEmailStatus(): Promise<EmailStatus> {
  return emailStatusSchema.parse(await request("/emails/status"));
}

export async function syncEmails(): Promise<EmailSyncResult> {
  return emailSyncResultSchema.parse(
    await request("/emails/sync", { method: "POST" }),
  );
}

export async function linkEmail(
  id: string,
  applicationId: string,
): Promise<void> {
  await request(`/emails/${id}/link`, {
    method: "POST",
    body: JSON.stringify({ applicationId }),
  });
}

export async function createApplicationFromEmail(
  id: string,
  input: CreateApplicationFromEmailInput,
): Promise<Application> {
  return applicationSchema.parse(
    await request(`/emails/${id}/application`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
}

/** Tira o email da tela de pendentes. Não apaga: dá para desfazer. */
export async function dismissEmail(id: string): Promise<void> {
  await request(`/emails/${encodeURIComponent(id)}/dismiss`, {
    method: "POST",
  });
}

export async function undismissEmail(id: string): Promise<void> {
  await request(`/emails/${encodeURIComponent(id)}/dismiss`, {
    method: "DELETE",
  });
}

/** Pede o plano ao modelo. Não grava nada. */
export async function resolveEmails(
  input: ResolveEmailsInput,
): Promise<EmailResolution[]> {
  return emailResolutionListSchema.parse(
    await request("/emails/resolve", {
      method: "POST",
      body: JSON.stringify(resolveEmailsSchema.parse(input)),
    }),
  );
}

/** Executa os itens do plano que você aprovou. */
export async function applyResolutions(
  input: ApplyResolutionsInput,
): Promise<ApplyResolutionsResult> {
  return applyResolutionsResultSchema.parse(
    await request("/emails/resolve/apply", {
      method: "POST",
      body: JSON.stringify(applyResolutionsSchema.parse(input)),
    }),
  );
}
