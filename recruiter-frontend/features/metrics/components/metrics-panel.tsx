import type { Metrics } from "@recruit/shared";
import { FunnelChart } from "./funnel-chart";

/**
 * O painel.
 *
 * Componente de servidor, sem `"use client"`: a tela só lê, e nada aqui é
 * interativo.
 *
 * O trabalho de verdade desta tela não são os números — é explicar os zeros.
 * Com quatro candidaturas todas em `aplicado`, o funil é `4 → 0 → 0 → 0` e
 * isso está CERTO. Zero sem explicação parece defeito, e o risco real é você
 * "consertar" o que não está quebrado.
 */
export function MetricsPanel({ metrics }: { metrics: Metrics }) {
  const moved = metrics.funnel.slice(1).some((step) => step.reached > 0);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight">Métricas</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          O que aconteceu depois que você se candidatou.
        </p>
      </header>

      {metrics.active === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 px-6 py-14 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Sem candidaturas ativas. As métricas aparecem quando você registrar a
          primeira.
        </p>
      ) : (
        <>
          {metrics.active < metrics.minimumForRates && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              Base pequena: {metrics.active}{" "}
              {metrics.active === 1 ? "candidatura ativa" : "candidaturas ativas"}
              . Com poucos números, porcentagem vira ruído — por isso as taxas
              estão omitidas. Leia as contagens.
            </p>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">Funil</h2>

            <FunnelChart steps={metrics.funnel} />

            {!moved && (
              // "Sem dados" seria mentira: existe dado, e a resposta é zero.
              // A distinção é o ponto da tela inteira.
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Nenhuma candidatura ativa passou de &quot;aplicado&quot; ainda.
              </p>
            )}

            {metrics.excluded > 0 && (
              // Você lembra de oito candidaturas e a tela diz quatro. Sem esta
              // linha, a tela certa parece quebrada.
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Candidaturas excluídas não entram em nenhum número desta tela (
                {metrics.excluded}{" "}
                {metrics.excluded === 1 ? "excluída" : "excluídas"}).
              </p>
            )}
          </section>

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Ativas" value={metrics.active} />
            <Tile
              label="Responderam"
              value={metrics.answered}
              hint="saíram de aplicado"
            />
            <Tile label="Rejeitadas" value={metrics.rejected} />
            <Tile
              label="Em rascunho"
              value={metrics.drafts}
              hint="ainda não enviadas"
            />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">Vagas e emails</h2>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile
                label="Vagas recebidas"
                value={metrics.jobsSeen}
                hint={
                  metrics.jobsSeen === 0
                    ? "a contagem começa na primeira busca"
                    : "mostradas na descoberta"
                }
              />
              <Tile label="Salvas" value={metrics.jobsSaved} />
              <Tile label="Dispensadas" value={metrics.jobsDismissed} />
              <Tile
                label="Emails"
                value={metrics.emailsReceived}
                hint={`${metrics.emailsLinked} vinculados`}
              />
            </div>
          </section>

          {metrics.bySource.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-medium">
                De onde vieram suas candidaturas
              </h2>

              <SourceBars items={metrics.bySource} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-zinc-600 dark:text-zinc-400">{label}</span>
      {hint && (
        <span className="text-xs text-zinc-400 dark:text-zinc-500">{hint}</span>
      )}
    </div>
  );
}

/**
 * `manual` é o que o sistema grava quando você colou um link ou criou a partir
 * de um email — não é um portal. Listar "manual" ao lado de "gupy" convidaria
 * a ler como se fosse origem, e a conclusão sobre de onde vêm suas melhores
 * vagas sairia errada.
 */
const sourceLabel: Record<string, string> = {
  manual: "manual (origem não registrada)",
  desconhecido: "desconhecida",
  "linkedin-alerts": "alerta LinkedIn",
  "portais-br": "portais BR",
};

function SourceBars({ items }: { items: { source: string; count: number }[] }) {
  const top = items[0]?.count ?? 0;

  return (
    <ol className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.source} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span>{sourceLabel[item.source] ?? item.source}</span>
            <span className="font-medium tabular-nums">{item.count}</span>
          </div>
          <div
            aria-hidden
            className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
          >
            <div
              className="h-full rounded-full bg-zinc-400 dark:bg-zinc-500"
              style={{ width: `${top === 0 ? 0 : (item.count / top) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}
