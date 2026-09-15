"use client";

import { startTransition, useActionState, useRef } from "react";
import { quitarControlPagoAction, registrarPagoAction } from "@/actions/admin";

/**
 * Registrar el pago de una cuenta desde el panel de la plataforma.
 *
 * Los botones suman tiempo desde el vencimiento (o desde hoy si ya vencio).
 * La fecha a mano sirve para acuerdos distintos o para corregir.
 */
export function PagosCuenta({
  userId,
  estado,
  tono,
  paidUntil,
  conPrueba = false,
  nota,
}: {
  userId: string;
  /** "Pagada hasta el 14 de octubre de 2026 · faltan 30 días", ya armado. */
  estado: string;
  tono: "ok" | "aviso" | "mal" | "neutro";
  /** YYYY-MM-DD, para la fecha a mano. */
  paidUntil: string | null;
  /** Cuenta nueva con prueba gratis (en curso o vencida). */
  conPrueba?: boolean;
  nota: string;
}) {
  const [state, formAction, pending] = useActionState(registrarPagoAction, undefined);
  const form = useRef<HTMLFormElement>(null);

  // Cada boton manda su propio "modo": React no envia el nombre del boton que se toca.
  const enviar = (modo: string) => {
    if (!form.current) return;
    const datos = new FormData(form.current);
    datos.set("modo", modo);
    startTransition(() => formAction(datos));
  };

  const color = { ok: "text-emerald-300", aviso: "text-amber-300", mal: "text-rose-300", neutro: "text-slate-300" }[tono];
  const boton =
    "rounded-lg border border-slate-700 px-3 py-2 text-sm font-bold text-slate-200 transition hover:border-emerald-600 disabled:opacity-40";

  return (
    <div className="space-y-3" data-pagos-cuenta>
      <p className={"text-sm font-bold " + color}>{estado}</p>

      {state?.error && <p className="rounded-lg bg-rose-500/15 px-3 py-2 text-xs text-rose-300">{state.error}</p>}
      {state?.ok && <p className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs text-emerald-300">{state.ok}</p>}

      <form ref={form} onSubmit={(e) => e.preventDefault()} className="space-y-3">
        <input type="hidden" name="userId" value={userId} />
        <p className="text-[11px] uppercase tracking-wide text-slate-500">Registrar pago</p>
        <div className="grid grid-cols-3 gap-2">
          <button type="button" className={boton} disabled={pending} onClick={() => enviar("1")}>
            +1 mes
          </button>
          <button type="button" className={boton} disabled={pending} onClick={() => enviar("3")}>
            +3 meses
          </button>
          <button type="button" className={boton} disabled={pending} onClick={() => enviar("12")}>
            +1 año
          </button>
        </div>
        <div className="flex gap-2">
          <input
            type="date"
            name="hasta"
            aria-label="Pagada hasta"
            defaultValue={paidUntil ?? ""}
            className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 focus:border-slate-600 focus:outline-none"
          />
          <button type="button" className={boton} disabled={pending} onClick={() => enviar("fecha")}>
            Poner fecha
          </button>
        </div>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">Nota del plan</span>
          <input
            name="nota"
            defaultValue={nota}
            maxLength={300}
            placeholder="Ej: $50.000 al mes por Nequi"
            className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-slate-600 focus:outline-none"
          />
        </label>
      </form>

      {(paidUntil || conPrueba) && (
        <form action={quitarControlPagoAction}>
          <input type="hidden" name="userId" value={userId} />
          <button type="submit" className="text-[11px] font-semibold text-slate-500 underline hover:text-slate-300">
            {paidUntil ? "Quitar el control de pago (cortesía, sin app instalable)" : "Darle acceso gratis (cortesía, sin app instalable)"}
          </button>
        </form>
      )}

      <p className="text-[11px] leading-snug text-slate-500">
        Solo las cuentas con pago registrado instalan la aplicación en el celular y la usan sin internet. Las cuentas nuevas tienen 7 días de prueba con todo lo demás; después quedan en la versión gratis hasta que registres el pago. Se le avisa al dueño 7 días antes de vencer. Si vence, tiene 5 días de gracia y después la cuenta se suspende sola. Al registrar el
        pago vuelve a quedar activa.
      </p>
    </div>
  );
}
