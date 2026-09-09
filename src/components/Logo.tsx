/**
 * Marca de la aplicacion: un bloque con el 1 adentro.
 *
 * Va dibujada con formas y no con una fuente, asi que se ve igual en el icono
 * de la pestana, en el celular y en el ingreso, sin depender de que la
 * tipografia haya cargado.
 *
 * El mismo dibujo esta en `src/app/icon.svg` para el icono del navegador.
 */
export function Logo({
  className = "h-12 w-12",
  withName = false,
}: {
  className?: string;
  /** Si ademas escribe "Todoen1" al lado. */
  withName?: boolean;
}) {
  const marca = (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Todoen1">
      <rect
        x="3"
        y="3"
        width="58"
        height="58"
        rx="14"
        className="fill-brand-600 stroke-edge"
        strokeWidth="4"
      />
      {/* El 1, en bloques: asta, bandera y base. */}
      <g className="fill-on-brand">
        <rect x="28" y="16" width="10" height="32" rx="2" />
        <rect x="19" y="16" width="10" height="8" rx="2" />
        <rect x="21" y="44" width="24" height="8" rx="2" />
      </g>
    </svg>
  );

  if (!withName) return marca;

  return (
    <span className="inline-flex items-center gap-3">
      {marca}
      <span className="font-display text-[30px] leading-none tracking-tight text-strong">
        Todoen
        <span className="text-brand-600">1</span>
      </span>
    </span>
  );
}
