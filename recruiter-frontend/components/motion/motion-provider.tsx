"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";

/**
 * Quem pediu menos movimento no sistema recebe menos movimento.
 *
 * `reducedMotion="user"` faz o Motion trocar deslocamentos e rotações por
 * transições instantâneas quando o sistema pede — sem cada componente precisar
 * lembrar de conferir.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
