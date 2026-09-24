import type { Metrics } from "@recruit/shared";
import { AreaChart } from "./area-chart";
import { FunnelChart } from "./funnel-chart";
import { SourceYieldChart } from "./source-yield";

/**
 * O painel.
 *
 * Servidor, e os gráficos são os únicos clientes: só eles precisam de hover.
 * A fronteira fica neles e não aqui para o JSON das métricas não atravessar
 * para o bundle — a página continua sendo HTML pronto.
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

          <ResponseTime
            medianDays={metrics.responseTime.medianDays}
            sample={metrics.responseTime.sample}
          />

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Ativas" value={metrics.active} delay={0} />
            <Tile
              label="Responderam"
              value={metrics.answered}
              hint="saíram de aplicado"
              delay={60}
            />
            <Tile label="Rejeitadas" value={metrics.rejected} delay={120} />
            <Tile
              label="Em rascunho"
              value={metrics.drafts}
              hint="ainda não enviadas"
              delay={180}
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
                delay={0}
              />
              <Tile label="Salvas" value={metrics.jobsSaved} delay={60} />
              <Tile
                label="Dispensadas"
                value={metrics.jobsDismissed}
                delay={120}
              />
              <Tile
                label="Emails"
                value={metrics.emailsReceived}
                hint={`${metrics.emailsLinked} vinculados`}
                delay={180}
              />
            </div>
          </section>

          {metrics.sourceYield.length > 0 && (
            <section className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-sm font-medium">
                  O que cada fonte rendeu
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  De quantas vagas mostradas você aproveitou alguma. Passe o
                  mouse para ver a quebra.
                </p>
              </div>

              <SourceYieldChart items={metrics.sourceYield} />
            </section>
          )}

          {metrics.emailsReceived > 0 && (
            <section className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-sm font-medium">Emails por dia</h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  O ritmo com que processo seletivo te procura.
                </p>
              </div>

              <AreaChart series={metrics.emailsByDay} />
            </section>
          )}

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

/**
 * Tempo até a primeira resposta.
 *
 * O número vem SEMPRE com a amostra ao lado. "5 dias" sobre uma resposta é um
 * caso, não um padrão — sem dizer de quantas saiu, a mediana aparenta uma
 * precisão que não tem.
 */
function ResponseTime({
  medianDays,
  sample,
}: {
  medianDays: number | null;
  sample: number;
}) {
  return (
    <section className="metric-tile flex flex-col gap-1 rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <span className="text-xs text-zinc-600 dark:text-zinc-400">
        Tempo até a primeira resposta
      </span>

      {medianDays === null ? (
        // Nulo e não zero: zero afirmaria uma resposta instantânea.
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          Nenhuma empresa respondeu ainda.
        </span>
      ) : (
        <span className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">
            {medianDays.toLocaleString("pt-BR")}
          </span>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {medianDays === 1 ? "dia" : "dias"}
          </span>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            mediana de {sample} {sample === 1 ? "resposta" : "respostas"}
          </span>
        </span>
      )}

      <span className="text-xs text-zinc-400 dark:text-zinc-500">
        Conta a partir da data real de cada mudança. Registrou atrasado? Corrija a
        data no histórico da candidatura.
      </span>
    </section>
  );
}

function Tile({
  label,
  value,
  hint,
  delay = 0,
}: {
  label: string;
  value: number;
  hint?: string;
  delay?: number;
}) {
  return (
    <div
      className="metric-tile flex flex-col gap-0.5 rounded-xl border border-zinc-200 px-4 py-3 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700"
      style={{ animationDelay: `${delay}ms` }}
    >
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
