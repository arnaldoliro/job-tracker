import type { Job, JobSearchResult, SavedJob } from "@recruit/shared";

export type { Job, JobSearchResult, SavedJob };

export type JobActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success" };
