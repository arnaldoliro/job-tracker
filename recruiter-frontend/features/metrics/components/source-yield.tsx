"use client";

import { useState } from "react";
import type { SourceYield } from "@recruit/shared";

/**
 * Quanto cada fonte rende do que ela mostra.
 *
 * É a métrica mais acionável do painel: antes dava para saber quantas vagas
 * você salvou, nunca DE QUANTAS. Uma fonte que mostra 200 e rende 1 não vale o
 * ruído no filtro do Gmail — e esse número é o que diz isso.
 *
 * A barra é a proporção de cada fonte no total mostrado; dentro dela, o trecho
 * cheio é o que virou candidatura ou vaga salva. O hover expõe os três
 * números, que não cabem todos no rótulo.
 */

const sourceLabel: Record<string, string> = {
  "linkedin-alerts": "alerta LinkedIn",
  "portais-br": "portais BR",
  remoteok: "RemoteOK",
  remotive: "Remotive",
  greenhouse: "Greenhouse",
  ashby: "Ashby",
  lever: "Lever",
  gupy: "Gupy",
};

export function SourceYieldChart({ items }: { items: SourceYield[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const most = Math.max(1, ...items.map((item) => item.seen));
  const anyUse = items.some((item) => item.saved + item.applied > 0);

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-2.5">
        {items.map((item, index) => {
          const used = Math.min(item.seen, item.saved + item.applied);
          const active = hover === item.source;

          return (
            <li
              key={item.source}
              className="flex flex-col gap-1"
              onPointerEnter={() => setHover(item.source)}
              onPointerLeave={() => setHover(null)}
            >
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span>{sourceLabel[item.source] ?? item.source}</span>
                <span className="flex items-baseline gap-2 tabular-nums">
                  {active ? (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {item.saved} salvas · {item.applied} candidaturas
                    </span>
                  ) : null}
                  <span className="font-medium">{item.seen}</span>
                </span>
              </div>

              <div
                aria-hidden
                className={`h-2.5 w-full overflow-hidden rounded-full transition-colors ${
                  active
                    ? "bg-zinc-200 dark:bg-zinc-700"
                    : "bg-zinc-100 dark:bg-zinc-800"
                }`}
              >
                <div
                  className="metric-bar h-full rounded-full bg-zinc-300 dark:bg-zinc-600"
                  style={{
                    width: `${(item.seen / most) * 100}%`,
                    animationDelay: `${index * 60}ms`,
                  }}
                >
                  {/* O trecho cheio: o que a fonte de fato rendeu. */}
                  <div
                    className="h-full rounded-full bg-sky-500 dark:bg-sky-400"
                    style={{
                      width: `${item.seen === 0 ? 0 : (used / item.seen) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {!anyUse && (
        // Zero aqui tem uma causa específica, e sem dizê-la o gráfico parece
        // quebrado: as vagas salvas são anteriores a esta medição existir.
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Ainda nenhuma destas virou vaga salva ou candidatura. As 52 salvas são
          anteriores a esta medição — só entram no cálculo as vagas que a
          descoberta registrou ter te mostrado.
        </p>
      )}
    </div>
  );
}
