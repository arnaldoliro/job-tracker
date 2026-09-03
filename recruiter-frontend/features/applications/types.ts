import type { Application } from "@recruit/shared";

export type { Application };

export type ApplicationFormState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> }
  | { status: "success"; application: Application };

export type DeleteState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success" };
