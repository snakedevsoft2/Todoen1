"use client";

import { money } from "@/lib/format";
import { resolverFondo } from "@/lib/fondos";
import { Icon } from "./Icon";

export type PreviewItem = {
  id: string;
  name: string;
  price: number;
  photo: string | null;
};

/**
 * Vista previa del portafolio, dentro de un celular.
 *
 * Se pinta con lo que la persona esta escribiendo en ese momento, sin guardar
 * ni recargar: es la unica forma de que alguien que no maneja computadores se
 * anime a cambiar su portada y su titular.
 *
 * Es una maqueta a proposito, no la pagina real metida en un iframe: mostrar
 * las cuatro cosas que importan (portada, marca, titular y lo que vende) se
 * entiende mejor que meter la pagina entera encogida.
 */
export function PortfolioPreview({
  cover,
  fondo: fondoKey = "claro",
  headline,
  about,
  orderNote,
  showPrices,
  open,
  businessName,
  tagline,
  logo,
  brandColor,
  phone,
  address,
  items,
  showBooking,
  currency,
}: {
  cover: string | null;
  /** Fondo elegido (lib/fondos.ts). */
  fondo?: string;
  headline: string;
  about: string;
  orderNote: string;
  showPrices: boolean;
  open: boolean;
  businessName: string;
  tagline: string | null;
  logo: string | null;
  brandColor: string;
  phone: string | null;
  address: string | null;
  items: PreviewItem[];
  showBooking: boolean;
  currency: string;
}) {
  const iniciales = businessName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  const fondo = resolverFondo(fondoKey, brandColor, cover);
  // Con la portada de fondo no se repite la franja: ya esta detras de todo.
  const franja = cover && fondo.key !== "foto";

  const contenido = (
    <>
      {franja && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt="" className="h-24 w-full border-b border-line object-cover" />
      )}

      <div className={"px-4 pb-4 text-center " + (franja ? "pt-0" : "pt-5")}>
        <div className={"flex justify-center " + (franja ? "-mt-7" : "")}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="h-14 w-14 rounded-xl border border-line bg-panel object-contain p-1" />
          ) : (
            <span
              className="flex h-14 w-14 items-center justify-center rounded-xl border border-line font-display text-white"
              style={{ backgroundColor: brandColor }}
            >
              {iniciales || "N"}
            </span>
          )}
        </div>

        <p className="mt-2.5 break-words font-display text-[17px] leading-tight text-strong">
          {headline.trim() || businessName}
        </p>

        {tagline && (
          <p className="mt-1 text-[10px] font-bold" style={{ color: brandColor }}>
            {tagline}
          </p>
        )}

        {about.trim() && <p className="mt-2 text-[10px] leading-relaxed text-body">{about.trim()}</p>}

        {(address || phone) && (
          <p className="mt-2 text-[9px] text-subtle">{[address, phone].filter(Boolean).join(" - ")}</p>
        )}

        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {showBooking && (
            <span
              className="rounded-lg border border-line px-2.5 py-1 text-[9px] font-bold text-white"
              style={{ backgroundColor: brandColor }}
            >
              Separar mi turno
            </span>
          )}
          <span className="rounded-lg border border-line bg-panel px-2.5 py-1 text-[9px] font-bold text-strong">
            Escribirnos
          </span>
        </div>
      </div>

      <div className="border-t border-line p-3">
        {items.length === 0 ? (
          <p className="py-6 text-center text-[10px] text-subtle">
            Marca tus items con <strong>Mostrar en mi portafolio</strong> para que salgan aqui.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {items.map((item) => (
              <div key={item.id} className="overflow-hidden rounded-lg border border-line bg-panel">
                <div
                  className={
                    "flex items-center justify-center border-b border-line bg-surface " +
                    (item.photo ? "aspect-[4/5]" : "h-8")
                  }
                >
                  {item.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.photo} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Icon name="image" className="h-3 w-3 text-subtle" />
                  )}
                </div>
                <div className="p-1.5">
                  <p className="truncate text-[9px] font-bold text-strong">{item.name}</p>
                  {showPrices && (
                    <p className="text-[9px] font-bold" style={{ color: brandColor }}>
                      {money(item.price, currency)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {orderNote.trim() && <p className="mt-2.5 text-center text-[9px] text-subtle">{orderNote.trim()}</p>}
      </div>
    </>
  );

  return (
    <div className="mx-auto w-full max-w-[300px]">
      {/* Marco de celular */}
      <div className="overflow-hidden rounded-[26px] border-[6px] border-strong bg-panel shadow-soft-lg">
        <div className="h-5 bg-edge" />

        <div
          className="relative max-h-[520px] overflow-y-auto"
          data-fondo={fondo.key}
          style={fondo.enTarjeta && !fondo.foto ? { backgroundColor: fondo.color } : undefined}
        >
          {fondo.foto && (
            <div aria-hidden="true" className="absolute inset-0 overflow-hidden" style={{ backgroundColor: fondo.color }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fondo.foto} alt="" className="h-full w-full scale-110 object-cover blur-xl" />
              <div className="absolute inset-0 bg-black/45" />
            </div>
          )}

          {!open ? (
            <div className="relative flex flex-col items-center justify-center px-5 py-16 text-center">
              <span
                className="flex h-14 w-14 items-center justify-center rounded-xl border border-line font-display text-white"
                style={{ backgroundColor: brandColor }}
              >
                {iniciales || "N"}
              </span>
              <p className={"mt-3 font-display text-sm " + (fondo.oscuro ? "text-white" : "text-strong")}>
                {businessName}
              </p>
              <p className={"mt-2 text-[11px] " + (fondo.oscuro ? "text-white/80" : "text-muted")}>
                El portafolio no esta disponible por ahora.
              </p>
            </div>
          ) : fondo.enTarjeta ? (
            <div className="relative p-2.5">
              <div className="overflow-hidden rounded-2xl bg-panel shadow-soft-lg">{contenido}</div>
            </div>
          ) : (
            contenido
          )}
        </div>
      </div>

      <p className="mt-2 text-center text-[11px] text-subtle">
        Asi se ve en el celular, que es por donde la va a abrir casi todo el mundo.
      </p>
    </div>
  );
}
