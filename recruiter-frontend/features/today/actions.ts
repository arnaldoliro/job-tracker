"use server";

import { revalidatePath } from "next/cache";
import type { FollowUpAction } from "@recruit/shared";
import { recordFollowUp } from "@/features/today/api";

export type FollowUpState = { status: "ok" } | { status: "error"; message: string };

export async function followUpAction(
  applicationId: string,
  action: FollowUpAction,
): Promise<FollowUpState> {
  try {
    await recordFollowUp(applicationId, action);
    revalidatePath("/hoje");

    return { status: "ok" };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Não consegui registrar o follow-up.",
    };
  }
}
