"use client";

import { useId, useMemo, useRef, useState } from "react";
import type { DayCount } from "@recruit/shared";

/**
 * Emails por dia.
 *
 * É a única série temporal real do projeto — 52 emails em 41 dias distintos —,
 * e por isso a única que merece linha. As outras métricas são contagem, e
 * contagem se lê melhor em barra.
 *
 * SVG à mão em vez de biblioteca: é um caminho e uma área. Uma dependência de
 * gráfico traria dezenas de kilobytes e um segundo sistema de cores para
 * resolver duas fórmulas.
 *
 * **A interação existe porque aqui ela é necessária**, diferente das barras:
 * são 60 pontos e não cabe rótulo em cada um. Sem o cruzamento, você vê o
 * formato e não consegue ler nenhum dia — o tooltip é o que devolve o número.
 */

const WIDTH = 720;
const HEIGHT = 180;
const PADDING = { top: 12, right: 4, bottom: 20, left: 4 };

export function AreaChart({ series }: { series: DayCount[] }) {
  const gradientId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const { points, line, area, max, length } = useMemo(
    () => geometry(series),
    [series],
  );

  if (series.length === 0) {
    return null;
  }

  const active = hover === null ? null : series[hover];
  const activePoint = hover === null ? null : points[hover];

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        // Altura fixa e largura fluida: o viewBox faz o resto escalar.
        className="h-44 w-full touch-none"
        role="img"
        aria-label={`Emails por dia nos últimos ${series.length} dias. Pico de ${max} num único dia.`}
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - box.left) / box.width;
          const index = Math.round(ratio * (series.length - 1));

          setHover(Math.min(series.length - 1, Math.max(0, index)));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="text-sky-500 dark:text-sky-400" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="100%" className="text-sky-500 dark:text-sky-400" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grade recessiva: referência, não conteúdo. */}
        {[0, 0.5, 1].map((fraction) => (
          <line
            key={fraction}
            x1={PADDING.left}
            x2={WIDTH - PADDING.right}
            y1={PADDING.top + fraction * (HEIGHT - PADDING.top - PADDING.bottom)}
            y2={PADDING.top + fraction * (HEIGHT - PADDING.top - PADDING.bottom)}
            className="stroke-zinc-200 dark:stroke-zinc-800"
            strokeWidth="1"
          />
        ))}

        <path d={area} fill={`url(#${gradientId})`} className="metric-area" />

        <path
          d={line}
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="metric-line stroke-sky-500 dark:stroke-sky-400"
          style={{ ["--metric-line-length" as string]: length }}
        />

        {activePoint && (
          <>
            <line
              x1={activePoint.x}
              x2={activePoint.x}
              y1={PADDING.top}
              y2={HEIGHT - PADDING.bottom}
              className="stroke-zinc-300 dark:stroke-zinc-600"
              strokeWidth="1"
            />
            {/* Anel da cor da superfície: separa o marcador da linha. */}
            <circle
              cx={activePoint.x}
              cy={activePoint.y}
              r="5"
              className="fill-sky-500 stroke-white dark:fill-sky-400 dark:stroke-zinc-950"
              strokeWidth="2"
            />
          </>
        )}
      </svg>

      {/* Extremos da janela, para a série ter âncora sem poluir o eixo. */}
      <div className="flex justify-between text-xs text-zinc-400 dark:text-zinc-500">
        <span>{shortDate(series[0].date)}</span>
        <span>{shortDate(series[series.length - 1].date)}</span>
      </div>

      {active && activePoint && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
          style={{ left: `${(activePoint.x / WIDTH) * 100}%` }}
        >
          <div className="font-medium tabular-nums">
            {active.count} {active.count === 1 ? "email" : "emails"}
          </div>
          <div className="text-zinc-500 dark:text-zinc-400">
            {longDate(active.date)}
          </div>
        </div>
      )}
    </div>
  );
}

function geometry(series: DayCount[]) {
  const inner = {
    width: WIDTH - PADDING.left - PADDING.right,
    height: HEIGHT - PADDING.top - PADDING.bottom,
  };

  // Teto mínimo 1: com a série toda zerada, dividir pelo máximo daria NaN e o
  // caminho sairia vazio — gráfico invisível, sem erro nenhum.
  const max = Math.max(1, ...series.map((day) => day.count));
  const step = series.length > 1 ? inner.width / (series.length - 1) : 0;

  const points = series.map((day, index) => ({
    x: PADDING.left + index * step,
    y: PADDING.top + inner.height * (1 - day.count / max),
  }));

  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
    .join(" ");

  const base = HEIGHT - PADDING.bottom;
  const area = `${line} L${points[points.length - 1]?.x ?? 0} ${base} L${points[0]?.x ?? 0} ${base} Z`;

  // Comprimento aproximado, só para o `stroke-dasharray` da animação.
  const length = points.reduce((total, point, index) => {
    if (index === 0) {
      return 0;
    }

    const previous = points[index - 1];

    return total + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);

  return { points, line, area, max, length: Math.ceil(length) };
}

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

function longDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}
