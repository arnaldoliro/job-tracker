/**
 * A cena atrás do app: aurora, horizonte em perspectiva e vinheta.
 *
 * Componente de servidor, sem JavaScript nenhum: é CSS puro, e anima só por
 * transform e opacity. Ver "Cena de fundo" em globals.css.
 */
export function Backdrop() {
  return (
    <div aria-hidden data-print-hide className="cine-backdrop">
      <div className="cine-aurora cine-aurora--violet" />
      <div className="cine-aurora cine-aurora--cyan" />
      <div className="cine-aurora cine-aurora--rose" />
      <div className="cine-horizon">
        <div className="cine-grid" />
      </div>
      <div className="cine-vignette" />
    </div>
  );
}
