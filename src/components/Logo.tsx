import { APP_LOGO_ICON, APP_NAME } from "@/lib/brand";

/**
 * Marca de la aplicacion.
 *
 * Es el logo de verdad, el mismo archivo que se usa en el icono de la pestana
 * (`src/app/icon.png`), asi que la marca se ve igual en todos lados.
 *
 * Antes iba dibujada con formas en un SVG. Se cambio por la imagen para que
 * haya un solo logo y no dos parecidos; a cambio ya no toma el color de marca
 * del negocio, pero esto sale solo en las pantallas de entrada, donde el color
 * es siempre el de la aplicacion.
 *
 * La imagen viene recortada a cuadrado a proposito: el archivo grande
 * (`logo.png`) trae mucho margen transparente a los lados y, dentro de una
 * caja cuadrada, se encogia hasta casi no verse.
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
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={APP_LOGO_ICON}
      // Con el nombre al lado, repetirlo aqui se lo lee dos veces a quien usa
      // lector de pantalla.
      alt={withName ? "" : APP_NAME}
      className={"object-contain " + className}
    />
  );

  if (!withName) return marca;

  return (
    <span className="inline-flex items-center gap-3">
      {marca}
      <span className="font-display text-[30px] leading-none tracking-tight text-strong">
        {APP_NAME.slice(0, -1)}
        <span className="text-brand-600">{APP_NAME.slice(-1)}</span>
      </span>
    </span>
  );
}
