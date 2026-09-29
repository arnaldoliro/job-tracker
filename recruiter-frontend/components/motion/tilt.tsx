"use client";

import { useRef, type ReactNode } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";

/**
 * Card que inclina em 3D na direção do cursor, com um reflexo que o segue.
 *
 * O cursor move um valor bruto; a rotação segue esse valor por uma MOLA. É a
 * mola que dá a fluidez: sem ela o card acompanharia o mouse quadro a quadro,
 * rígido e tremido. Com ela, ele tem inércia — chega atrasado e assenta.
 *
 * Nada aqui passa pelo React a cada movimento: `useMotionValue` escreve direto
 * no `style` do elemento. Um `useState` re-renderizaria o card a cada pixel.
 *
 * Desliga sozinho em toque (não há cursor para seguir) e para quem pediu menos
 * movimento. A inclinação é pequena de propósito — acima de uns 8 graus o
 * texto do card começa a ficar difícil de ler.
 */
export function Tilt({
  children,
  className = "",
  max = 7,
}: {
  children: ReactNode;
  className?: string;
  /** Inclinação máxima em graus. */
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  // 0,5 = centro. É o ponto de repouso para onde a mola volta.
  const x = useMotionValue(0.5);
  const y = useMotionValue(0.5);

  const spring = { stiffness: 180, damping: 18, mass: 0.5 };
  const sx = useSpring(x, spring);
  const sy = useSpring(y, spring);

  const rotateY = useTransform(sx, [0, 1], [-max, max]);
  const rotateX = useTransform(sy, [0, 1], [max, -max]);

  const glareX = useTransform(sx, [0, 1], [0, 100]);
  const glareY = useTransform(sy, [0, 1], [0, 100]);
  const glare = useMotionTemplate`radial-gradient(420px circle at ${glareX}% ${glareY}%, oklch(1 0 0 / 0.1), transparent 45%)`;

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      className={`relative ${className}`}
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      // Um leve avanço no eixo Z ao passar o mouse: o card "sai" da tela.
      whileHover={{ scale: 1.015 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      onPointerMove={(event) => {
        if (event.pointerType !== "mouse" || !ref.current) {
          return;
        }

        const box = ref.current.getBoundingClientRect();

        x.set((event.clientX - box.left) / box.width);
        y.set((event.clientY - box.top) / box.height);
      }}
      onPointerLeave={() => {
        x.set(0.5);
        y.set(0.5);
      }}
    >
      {children}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{ background: glare }}
      />
    </motion.div>
  );
}
