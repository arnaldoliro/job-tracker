"use client";

import { useEffect, useState } from "react";

/**
 * Cronômetro da busca, dentro do botão.
 *
 * Componente próprio de propósito: ele redesenha a cada segundo, e com 200
 * cards montados na grade isso reprocessaria a lista inteira de segundo em
 * segundo. Isolado, só ele redesenha.
 *
 * Zera a cada partida — quem para a busca perde o número da corrida anterior,
 * e é por isso que o total fica registrado na linha de status.
 */
export function SearchTimer({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());

  // Só o intervalo: o valor inicial vem do useState, e reiniciar a contagem é
  // feito remontando o componente (`key={startedAt}` no pai). Chamar setState
  // aqui dispararia render em cascata.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(id);
  }, []);

  return <span className="tabular-nums">{format(now - startedAt)}</span>;
}

export function format(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
