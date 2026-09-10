"use client";

import { money } from "@/lib/format";
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

  return (
    <div className="mx-auto w-full max-w-[300px]">
      {/* Marco de celular */}
      <div className="overflow-hidden rounded-[26px] border-[6px] border-strong bg-panel shadow-soft-lg">
        <div className="h-5 bg-edge" />

        <div className="max-h-[520px] overflow-y-auto">
          {!open ? (
            <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
              <span
                className="flex h-14 w-14 items-center justify-center rounded-xl border border-line font-display text-white"
                style={{ backgroundColor: brandColor }}
              >
                {iniciales || "N"}
              </span>
              <p className="mt-3 font-display text-sm text-strong">{businessName}</p>
              <p className="mt-2 text-[11px] text-muted">
                El portafolio no esta disponible por ahora.
              </p>
            </div>
          ) : (
            <>
              {cover && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover} alt="" className="h-24 w-full border-b border-line object-cover" />
              )}

              <div className={"px-4 pb-4 text-center " + (cover ? "pt-0" : "pt-5")}>
                <div className={"flex justify-center " + (cover ? "-mt-7" : "")}>
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logo}
                      alt=""
                      className="h-14 w-14 rounded-xl border border-line bg-panel object-contain p-1"
                    />
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

                {about.trim() && (
                  <p className="mt-2 text-[10px] leading-relaxed text-body">{about.trim()}</p>
                )}

                {(address || phone) && (
                  <p className="mt-2 text-[9px] text-subtle">
                    {[address, phone].filter(Boolean).join(" - ")}
                  </p>
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
                    Marca tus items con <strong>Mostrar en mi portafolio</strong> para que salgan
                    aqui.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="overflow-hidden rounded-lg border border-line bg-panel"
                      >
                        <div
                          className={
                            "flex items-center justify-center border-b border-line bg-surface " +
                            (item.photo ? "aspect-[4/5]" : "h-8")
                          }
                        >
                          {item.photo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.photo}
                              alt=""
                              className="h-full w-full object-cover"
                            />
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

                {orderNote.trim() && (
                  <p className="mt-2.5 text-center text-[9px] text-subtle">{orderNote.trim()}</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <p className="mt-2 text-center text-[11px] text-subtle">
        Asi se ve en el celular, que es por donde la va a abrir casi todo el mundo.
      </p>
    </div>
  );
}
