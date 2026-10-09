import type { AiStatus, AiTask } from "@recruit/shared";
import { aiModelLabel } from "@/features/ai/model-label";

/**
 * Quem vai ler os seus dados nesta ação: a API da Anthropic ou o modelo
 * local. Discreto de propósito — é informação, não controle; o controle é o
 * `.env` do backend.
 *
 * Âmbar quando a tarefa está no modelo local e o Ollama não respondeu ou o
 * modelo não foi baixado: o clique vai falhar, melhor saber antes.
 */
export function AiBadge({
  status,
  task,
}: {
  status: AiStatus | null;
  task: AiTask;
}) {
  const { text, tone } = describe(status, task);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${
        tone === "warn"
          ? "border-amber-400/25 bg-amber-500/10 text-amber-200"
          : tone === "muted"
            ? "border-white/5 text-zinc-500"
            : "border-white/10 bg-white/[0.03] text-zinc-400"
      }`}
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${
          tone === "warn"
            ? "bg-amber-400"
            : tone === "muted"
              ? "bg-zinc-600"
              : "bg-accent shadow-[0_0_6px] shadow-accent/70"
        }`}
      />
      {text}
    </span>
  );
}

function describe(
  status: AiStatus | null,
  task: AiTask,
): { text: string; tone: "ok" | "warn" | "muted" } {
  if (!status) {
    return { text: "IA: desconhecido", tone: "muted" };
  }

  const own = status.tasks[task];

  if (!own.configured) {
    return { text: "IA não configurada", tone: "muted" };
  }

  if (own.provider === "anthropic") {
    return { text: `IA: ${aiModelLabel(own.model ?? "Claude")}`, tone: "ok" };
  }

  const base = `IA: local · ${own.model ?? "?"}`;

  if (status.local.reachable === false) {
    return { text: `${base} · Ollama fora do ar`, tone: "warn" };
  }

  if (own.model && status.local.missingModels?.includes(own.model)) {
    return { text: `${base} · modelo não baixado`, tone: "warn" };
  }

  return { text: base, tone: "ok" };
}
