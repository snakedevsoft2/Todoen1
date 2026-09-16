"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { abrirMesaAction } from "@/actions/mesas";
import { money } from "@/lib/format";
import { MesaMuneco, type EstadoMesa } from "./MesaMuneco";
import { Icon } from "./Icon";

export type MesaPiso = {
  id: string;
  number: number;
  qrToken: string;
  orden: { id: string; total: number; items: number; hasNewFromCustomer: boolean } | null;
};

/**
 * El piso del restaurante: una mesa dibujada por cada mesa de verdad, para
 * verlo de un vistazo en vez de leer una lista. Se toca la mesa para entrar a
 * su cuenta (se abre sola si estaba libre); el codigo QR se descarga aparte,
 * para pegarlo en la mesa.
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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {mesas.map((m) => {
        const estado: EstadoMesa = m.orden?.hasNewFromCustomer ? "nueva" : m.orden ? "ocupada" : "libre";
        const asientos = m.orden ? Math.max(2, Math.min(4, Math.ceil(m.orden.items / 2))) : 0;
        return (
          <div
            key={m.id}
            data-mesa={m.number}
            data-estado-mesa={estado}
            className={
              "flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-center transition " +
              (estado === "nueva"
                ? "border-bad/40 bg-bad-soft animate-pulse"
                : estado === "ocupada"
                  ? "border-warn-line bg-warn-soft"
                  : "border-line bg-surface")
            }
          >
            <form action={abrirMesaAction} className="contents">
              <input type="hidden" name="tableId" value={m.id} />
              <button type="submit" className="flex flex-col items-center gap-1" aria-label={"Abrir Mesa " + m.number}>
                <MesaMuneco numero={m.number} estado={estado} ocupadas={asientos} />
                <span className="text-[13px] font-bold text-strong">Mesa {m.number}</span>
                {m.orden ? (
                  <span className="text-xs font-semibold text-brand-600">{money(m.orden.total, currency)}</span>
                ) : (
                  <span className="text-[11px] text-subtle">Libre</span>
                )}
                {estado === "nueva" && <span className="text-[10px] font-bold uppercase text-bad">Pedido nuevo</span>}
              </button>
            </form>
            <a
              href={"/qr/mesa/" + m.qrToken}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 flex items-center gap-1 text-[11px] text-muted hover:text-strong"
            >
              <Icon name="scan" className="h-3.5 w-3.5" />
              Ver QR
            </a>
          </div>
        );
      })}
    </div>
  );
}
