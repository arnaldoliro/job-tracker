"use client";

import { useState } from "react";
import type { FunnelStep } from "@recruit/shared";

/**
 * O funil, em barras horizontais.
 *
 * Sem biblioteca de gráfico: são cinco barras, e uma dependência para isso não
 * se paga. Sem SVG também — largura percentual num `div` resolve.
 *
 * **A largura vai em `style`, nunca em classe.** O Tailwind v4 varre o texto do
 * fonte, então `w-[${pct}%]` não gera CSS nenhum e também não gera erro: toda
 * barra sairia com a largura padrão, silenciosamente. Pela mesma razão as
 * cores são literais num `Record`, não montadas com template.
 *
 * **Todo valor aparece como texto.** Sem tooltip: o número já está na tela, e
 * esconder dado atrás de hover só o tornaria menos acessível.
 */

/**
 * Preenchimento das barras, nos mesmos tons do `statusTone` dos crachás — é a
 * mesma linguagem que você já lê na lista de candidaturas.
 *
 * Passo 500/400 e não 100/950: o tom de crachá é fundo de texto e some contra
 * a trilha da barra.
 */
const stageFill: Record<FunnelStep["stage"], string> = {
  aplicado: "bg-sky-500 dark:bg-sky-400",
  triagem: "bg-indigo-500 dark:bg-indigo-400",
  entrevista: "bg-violet-500 dark:bg-violet-400",
  teste: "bg-amber-500 dark:bg-amber-400",
  oferta: "bg-emerald-500 dark:bg-emerald-400",
};

/**
 * Por que a taxa de uma etapa não aparece. Dito por etapa porque o corte vale
 * para a etapa ANTERIOR de cada conversão: "entrevista" pode ficar sem taxa
 * enquanto "triagem" tem a sua, e um aviso geral não explicaria isso.
 */
export function omittedReason(
  steps: FunnelStep[],
  index: number,
  minimumForRates: number,
): string | null {
  if (index === 0 || steps[index].conversion !== null) {
    return null;
  }

  const previous = steps[index - 1];

  if (previous.reached === 0) {
    return `sem taxa: ninguém em ${previous.stage}`;
  }

  return `sem taxa: ${previous.reached} em ${previous.stage}, mínimo ${minimumForRates}`;
}

export function FunnelChart({
  steps,
  minimumForRates,
}: {
  steps: FunnelStep[];
  minimumForRates: number;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const entry = steps[0]?.reached ?? 0;
  // "% do topo" é uma conversão também, com o topo de denominador: segue o
  // mesmo corte de amostra das taxas, ou mostraria em hover o que a tela
  // acabou de omitir por ser ruído.
  const showFromTop = entry >= Math.max(1, minimumForRates);

  return (
    <ol className="flex flex-col gap-3">
      {steps.map((step, index) => (
        <li
          key={step.stage}
          className="flex flex-col gap-1.5"
          onPointerEnter={() => setHover(step.stage)}
          onPointerLeave={() => setHover(null)}
        >
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="capitalize">{step.stage}</span>
            <span className="flex items-baseline gap-2">
              {/* Tinta neutra, não a cor da série: a barra ao lado já carrega
                  a identidade, e número colorido compete com ela. */}
              <span className="font-medium tabular-nums">{step.reached}</span>
              {step.conversion !== null ? (
                <span className="text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                  {Math.round(step.conversion * 100)}%
                </span>
              ) : (
                omittedReason(steps, index, minimumForRates) && (
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">
                    {omittedReason(steps, index, minimumForRates)}
                  </span>
                )
              )}
              {hover === step.stage && showFromTop && index > 0 && (
                <span className="text-xs text-zinc-400 tabular-nums dark:text-zinc-500">
                  {Math.round((step.reached / entry) * 100)}% do topo
                </span>
              )}
            </span>
          </div>

          <div
            aria-hidden
            className={`h-2 w-full overflow-hidden rounded-full transition-colors ${
              hover === step.stage
                ? "bg-zinc-200 dark:bg-zinc-700"
                : "bg-zinc-100 dark:bg-zinc-800"
            }`}
          >
            <div
              className={`metric-bar h-full rounded-full ${stageFill[step.stage]}`}
              // Contagem não nula nunca desaparece: 1 em 200 daria 0,5% e
              // sumiria, parecendo zero.
              style={{
                width: `${width(step.reached, entry)}%`,
                // Escada: cada degrau entra depois do anterior, no sentido em
                // que o funil é lido.
                animationDelay: `${index * 80}ms`,
              }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

function width(reached: number, entry: number): number {
  if (entry === 0 || reached === 0) {
    return 0;
  }

  return Math.max(2, (reached / entry) * 100);
}
