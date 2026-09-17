"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { abrirMesaAction } from "@/actions/mesas";
import { money } from "@/lib/format";
import { MacetaDecorativa, MesaMuneco, type EstadoMesa } from "./MesaMuneco";
import { Icon } from "./Icon";

export type MesaPiso = {
  id: string;
  number: number;
  qrToken: string;
  orden: { id: string; total: number; items: number; hasNewFromCustomer: boolean } | null;
};

/** Donde va cada matica: solo decoracion, para que el piso no se vea vacio en las esquinas. */
const MACETAS = [0, 5, 11];

/**
 * El piso del restaurante: una mesa de madera dibujada por cada mesa de
 * verdad, con sus sillas de colores, sobre un piso de tablones. Se toca la
 * mesa para entrar a su cuenta (se abre sola si estaba libre); el codigo QR
 * se descarga aparte, para pegarlo en la mesa.
 *
 * Se refresca solo cada pocos segundos: es la forma simple de que un pedido
 * hecho desde el celular de un cliente aparezca sin que nadie tenga que
 * recargar la pagina.
 */
export function PisoDeMesas({ mesas, currency }: { mesas: MesaPiso[]; currency: string }) {
  const router = useRouter();

  useEffect(() => {
    const reloj = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(reloj);
  }, [router]);

  if (mesas.length === 0) return null;

  return (
    <div
      className="rounded-2xl border border-line p-4"
      style={{
        backgroundColor: "#c99a63",
        backgroundImage:
          "repeating-linear-gradient(90deg, #00000012 0 2px, transparent 2px 64px), repeating-linear-gradient(180deg, #ffffff14 0 1px, transparent 1px 22px)",
      }}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {mesas.map((m, i) => {
          const estado: EstadoMesa = m.orden?.hasNewFromCustomer ? "nueva" : m.orden ? "ocupada" : "libre";
          const asientos = m.orden ? Math.max(2, Math.min(4, Math.ceil(m.orden.items / 2))) : 0;
          return (
            <div key={m.id} className="contents">
              {MACETAS.includes(i) && (
                <div className="hidden items-end justify-center pb-1 sm:flex" aria-hidden="true">
                  <MacetaDecorativa size={34} />
                </div>
              )}
              <div
                data-mesa={m.number}
                data-estado-mesa={estado}
                className={
                  "flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-center shadow-soft " +
                  (estado === "nueva"
                    ? "border-bad/50 bg-white animate-pulse"
                    : estado === "ocupada"
                      ? "border-warn-line bg-white"
                      : "border-white/70 bg-white/90")
                }
              >
                <MesaMuneco numero={m.number} estado={estado} ocupadas={asientos} />
                <span className="rounded-full bg-strong px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-on-brand">
                  Mesa {m.number}
                </span>
                {m.orden && <span className="text-xs font-semibold text-brand-600">{money(m.orden.total, currency)}</span>}
                {estado === "nueva" && <span className="text-[10px] font-bold uppercase text-bad">Pedido nuevo</span>}

                <form action={abrirMesaAction} className="w-full">
                  <input type="hidden" name="tableId" value={m.id} />
                  <button
                    type="submit"
                    className={"btn-sm w-full justify-center " + (m.orden ? "btn-primary" : "btn-success")}
                  >
                    {m.orden ? "Ver pedido" : "Asignar mesa"}
                  </button>
                </form>
                <a
                  href={"/qr/mesa/" + m.qrToken}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] text-muted hover:text-strong"
                >
                  <Icon name="scan" className="h-3.5 w-3.5" />
                  Ver QR
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
