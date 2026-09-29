"use client";

import { useEffect, useRef } from "react";
import { animate, useReducedMotion } from "motion/react";

/**
 * Número que conta até o valor ao aparecer.
 *
 * Escreve direto no texto do elemento em vez de guardar em estado: a contagem
 * roda por dezenas de quadros, e cada `setState` seria um render inteiro.
 *
 * O HTML do servidor já traz o número FINAL. A animação só existe depois que o
 * JavaScript carrega — sem ele, ou para quem pediu menos movimento, você vê o
 * valor certo de imediato, nunca um zero esperando o script.
 */
export function CountUp({
  value,
  decimals = 0,
  className = "",
}: {
  value: number;
  decimals?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const node = ref.current;

    if (!node || reduce || value === 0) {
      return;
    }

    const controls = animate(0, value, {
      duration: 1.1,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (current) => {
        node.textContent = format(current, decimals);
      },
    });

    return () => controls.stop();
  }, [value, decimals, reduce]);

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {format(value, decimals)}
    </span>
  );
}

function format(value: number, decimals: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
