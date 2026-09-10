import { CANALES } from "@/lib/canales";

/**
 * Los canales oficiales, con el logo de cada uno.
 *
 * Vienen en dos formas porque se usan en dos sitios distintos: en el pie de
 * las paginas publicas basta la fila de iconos, y en Soporte la persona esta
 * buscando por donde escribir, asi que ahi va el nombre y el usuario.
 *
 * Todos los enlaces salen a otro sitio: `noopener noreferrer` para que la
 * pagina de destino no pueda tocar la nuestra.
 */
export function CanalesOficiales({
  variant = "fila",
  className = "",
}: {
  variant?: "fila" | "lista";
  className?: string;
}) {
  if (variant === "lista") {
    return (
      <ul className={"space-y-2 " + className}>
        {CANALES.map((c) => (
          <li key={c.key}>
            <a
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg border border-line bg-panel px-3 py-2.5 transition-colors hover:border-line-strong hover:bg-surface"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.logo} alt="" className="h-7 w-7 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-strong">{c.label}</span>
                <span className="block truncate text-xs text-muted">{c.handle}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className={"flex flex-wrap items-center justify-center gap-2 " + className}>
      {CANALES.map((c) => (
        <a
          key={c.key}
          href={c.url}
          target="_blank"
          rel="noopener noreferrer"
          // El nombre del canal va en el aria-label y no debajo del icono: en
          // celular la fila tiene que caber de una sola linea.
          aria-label={c.label + " - " + c.handle}
          title={c.label + " - " + c.handle}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-panel transition-colors hover:border-line-strong hover:bg-surface"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.logo} alt="" className="h-5 w-5" />
        </a>
      ))}
    </div>
  );
}
