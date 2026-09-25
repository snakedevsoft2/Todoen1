"use client";

import { createContext, useCallback, useContext, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  accionesPendientes,
  borrarAccion,
  guardarAccion,
  nuevaLlave,
  subirAcciones,
  type AccionPendiente,
} from "@/lib/cola-pendientes";
import { Icon } from "./Icon";
import { puedeHacer } from "@/lib/permisos-empleado";

/**
 * Guardar cambios del panel sin senal.
 *
 * Con senal, los formularios hacen lo de siempre. Sin senal (o si la red se
 * cae al enviar), lo que se iba a mandar queda en la cola del telefono con su
 * llave y se sube solo cuando vuelve la senal, ejecutando la misma accion del
 * servidor (ver lib/sin-senal). Arriba del panel se ve cuantos cambios estan
 * esperando.
 *
 * Tres piezas:
 *   - ProveedorSinSenal, en el layout: sube la cola y muestra lo pendiente.
 *   - FormSinSenal, en lugar de <form action={accion}>.
 *   - useAccionSinSenal, alrededor de la accion de un useActionState.
 */

const GUARDADO = "Sin señal: quedó guardado en este teléfono y se sube solo cuando vuelva.";

const ETIQUETA: Record<string, string> = {
  createExpenseAction: "Nuevo gasto",
  deleteExpenseAction: "Borrar un gasto",
  closeCashAction: "Cierre de caja",
  reopenCashAction: "Reabrir la caja",
  createOrderAction: "Nueva cuenta",
  addOrderItemAction: "Agregar a una cuenta",
  changeOrderItemQtyAction: "Cambiar cantidad en una cuenta",
  removeOrderItemAction: "Quitar de una cuenta",
  closeOrderAction: "Cobrar una cuenta",
  cancelOrderAction: "Cancelar una cuenta",
  deleteOrderAction: "Borrar una cuenta",
  createAppointmentAction: "Nuevo turno",
  setAppointmentStatusAction: "Cambiar un turno",
  updateAppointmentAction: "Editar un turno",
  setAppointmentStaffAction: "Cambiar quién atiende",
  deleteAppointmentAction: "Borrar un turno",
  closeAppointmentSaleAction: "Cobrar un turno",
  createDebtAction: "Nueva deuda",
  addPaymentAction: "Abono",
  updateDueDayAction: "Cambiar vencimiento",
  deletePaymentAction: "Borrar un abono",
  markCollectedAction: "Marcar cobrada",
  cancelDebtAction: "Anular una deuda",
  reopenDebtAction: "Reabrir una deuda",
  deleteDebtAction: "Borrar una deuda",
  guardarClienteAction: "Guardar cliente",
  borrarClienteAction: "Borrar cliente",
  crearEtiquetaAction: "Nueva etiqueta",
  alternarEtiquetaAction: "Etiqueta de cliente",
  borrarEtiquetaAction: "Borrar etiqueta",
  anotarInteraccionAction: "Anotar contacto",
  borrarInteraccionAction: "Borrar contacto",
  guardarOportunidadAction: "Guardar oportunidad",
  borrarOportunidadAction: "Borrar oportunidad",
  crearSeguimientoAction: "Nuevo seguimiento",
  completarSeguimientoAction: "Completar seguimiento",
  borrarSeguimientoAction: "Borrar seguimiento",
  saveVariantAction: "Guardar talla",
  createVariantsBulkAction: "Crear tallas",
  stockMoveAction: "Mover inventario",
  quickStockAction: "Ajustar inventario",
  toggleVariantAction: "Activar o pausar talla",
  deleteVariantAction: "Borrar talla",
  saveServiceAction: "Guardar producto",
  toggleServiceAction: "Activar o pausar producto",
  deleteServiceAction: "Borrar producto",
  saveSupplierAction: "Guardar proveedor",
  toggleSupplierAction: "Activar o pausar proveedor",
  deleteSupplierAction: "Borrar proveedor",
  updateSalePaymentAction: "Cambiar pago de una venta",
  updateSaleAction: "Editar una venta",
  deleteSaleAction: "Borrar una venta",
};

/** Un error por no poder hablar con el servidor (y no por lo que se mando). */
export function esErrorDeRed(e: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (e instanceof TypeError) return true;
  const texto = e instanceof Error ? e.message : String(e);
  return /failed to fetch|network|load failed|fetch failed|conexi/i.test(texto);
}

function camposDe(fd: FormData): [string, string][] {
  const campos: [string, string][] = [];
  for (const [k, v] of fd.entries()) {
    // Los archivos no viajan en la cola; los formularios del panel mandan las
    // fotos ya convertidas en texto.
    if (typeof v === "string" && !k.startsWith("$ACTION")) campos.push([k, v]);
  }
  return campos;
}

function resumenDe(accion: string, fd: FormData): string {
  const detalle = ["description", "name", "label", "concept", "clientName", "title", "notes"]
    .map((k) => fd.get(k))
    .find((v): v is string => typeof v === "string" && v.trim().length > 0);
  return (ETIQUETA[accion] ?? "Cambio") + (detalle ? ": " + detalle.trim().slice(0, 60) : "");
}

/** cuenta vacia: no se guarda nada en la cola (la version gratis no se usa sin senal). */
type Contexto = { cuenta: string; avisar: () => void; sinConexion: boolean; role: string };
const ContextoSinSenal = createContext<Contexto>({ cuenta: "", avisar: () => undefined, sinConexion: true, role: "DUENO" });

/** Si quien esta en el panel es el dueño (el empleado no borra ni cambia lo registrado). */
export function useEsDueno(): boolean {
  return useContext(ContextoSinSenal).role === "DUENO";
}

/** Si esta cuenta puede usar la aplicacion sin senal (la version gratis no). */
export function useSinConexionPermitida(): boolean {
  return useContext(ContextoSinSenal).sinConexion;
}

async function encolar(ctx: Contexto, accion: string, fd: FormData): Promise<boolean> {
  try {
    await guardarAccion({
      clientKey: nuevaLlave(),
      cuenta: ctx.cuenta,
      accion,
      campos: camposDe(fd),
      resumen: resumenDe(accion, fd),
      creadoEn: new Date().toISOString(),
      error: null,
    });
    ctx.avisar();
    return true;
  } catch {
    return false;
  }
}

/**
 * Envuelve la accion de un useActionState: sin senal devuelve el aviso de que
 * quedo guardado en el telefono, como si la accion hubiera respondido "ok".
 */
export function useAccionSinSenal<S>(nombre: string, accion: (prev: S, formData: FormData) => Promise<S>) {
  const ctx = useContext(ContextoSinSenal);
  return useCallback(
    async (prev: S, formData: FormData): Promise<S> => {
      const aLaCola = async () =>
        (ctx.cuenta && (await encolar(ctx, nombre, formData))
          ? { ok: GUARDADO }
          : { error: "Sin señal y este navegador no deja guardarlo. Inténtalo cuando vuelva la señal." }) as S;
      if (ctx.cuenta && !navigator.onLine) return aLaCola();
      try {
        return await accion(prev, formData);
      } catch (e) {
        if (ctx.cuenta && esErrorDeRed(e)) return aLaCola();
        throw e;
      }
    },
    [nombre, accion, ctx]
  );
}

/** En lugar de <form action={accion}>: igual con senal, a la cola sin ella. */
export function FormSinSenal({
  accion,
  servidor,
  className,
  children,
}: {
  /** El nombre de la accion en el registro de lib/sin-senal. */
  accion: string;
  servidor: (formData: FormData) => Promise<unknown>;
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = useContext(ContextoSinSenal);
  const [pendiente, empezar] = useTransition();

  // Borrar o cambiar lo que ya esta registrado es del dueño (o del supervisor,
  // en lo que le toca): el empleado ni ve el boton.
  if (!puedeHacer(ctx.role, accion)) return null;

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const datos = new FormData(e.currentTarget, submitter ?? undefined);
    if (ctx.cuenta && !navigator.onLine) {
      void encolar(ctx, accion, datos);
      return;
    }
    empezar(async () => {
      try {
        await servidor(datos);
      } catch (err) {
        if (ctx.cuenta && esErrorDeRed(err)) await encolar(ctx, accion, datos);
        else throw err;
      }
    });
  }

  return (
    <form onSubmit={enviar} className={className} aria-busy={pendiente || undefined}>
      <fieldset disabled={pendiente} className="contents">
        {children}
      </fieldset>
    </form>
  );
}

/**
 * Sube lo pendiente cuando hay senal y muestra cuantos cambios esperan. Va en
 * el layout del panel, alrededor de las pantallas.
 */
export function ProveedorSinSenal({
  cuenta,
  sinConexion = true,
  role = "DUENO",
  children,
}: {
  cuenta: string;
  /** El rol de quien entro: decide que botones de borrar o cambiar se muestran. */
  role?: string;
  /** Falso en la version gratis: no se guarda nada nuevo en la cola, pero lo que ya habia se sube. */
  sinConexion?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pendientes, setPendientes] = useState<AccionPendiente[]>([]);
  const [enLinea, setEnLinea] = useState(true);
  const [vuelta, setVuelta] = useState(0);

  const refrescar = useCallback(async () => {
    try {
      setPendientes(await accionesPendientes(cuenta));
    } catch {
      // Sin IndexedDB no hay cola.
    }
  }, [cuenta]);

  const subir = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const r = await subirAcciones(cuenta);
      await refrescar();
      if (r.enviados > 0) router.refresh();
    } catch {
      // Se reintenta en el proximo evento.
    }
  }, [cuenta, refrescar, router]);

  useEffect(() => {
    setEnLinea(navigator.onLine);
    void refrescar().then(() => subir());
    const volvio = () => {
      setEnLinea(true);
      void subir();
    };
    const cayo = () => setEnLinea(false);
    const alVolver = () => {
      if (document.visibilityState === "visible") void subir();
    };
    window.addEventListener("online", volvio);
    window.addEventListener("offline", cayo);
    document.addEventListener("visibilitychange", alVolver);
    const reloj = setInterval(() => void subir(), 30_000);
    return () => {
      window.removeEventListener("online", volvio);
      window.removeEventListener("offline", cayo);
      document.removeEventListener("visibilitychange", alVolver);
      clearInterval(reloj);
    };
  }, [refrescar, subir, vuelta]);

  const avisar = useCallback(() => {
    void refrescar().then(() => subir());
    setVuelta((v) => v + 1);
  }, [refrescar, subir]);

  const esperando = pendientes.filter((p) => !p.error);
  const rechazados = pendientes.filter((p) => p.error);

  return (
    <ContextoSinSenal.Provider value={{ cuenta: sinConexion ? cuenta : "", avisar, sinConexion, role }}>
      {pendientes.length > 0 && (
        <div data-acciones-pendientes className="mb-3 rounded-xl border border-warn-line bg-warn-soft p-3 text-[13px]">
          {esperando.length > 0 && (
            <p className="flex items-center gap-2 font-bold text-warn">
              <Icon name="clock" className="h-4 w-4" />
              {esperando.length === 1 ? "1 cambio" : esperando.length + " cambios"}{" "}
              {enLinea ? "subiendo…" : "esperando señal"}
            </p>
          )}
          {esperando.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-[12px] text-body">
              {esperando.slice(0, 5).map((p) => (
                <li key={p.clientKey}>• {p.resumen}</li>
              ))}
              {esperando.length > 5 && <li>• y {esperando.length - 5} más</li>}
            </ul>
          )}
          {rechazados.length > 0 && (
            <ul className="mt-2 space-y-1">
              {rechazados.map((p) => (
                <li key={p.clientKey} className="flex flex-wrap items-center gap-2 text-[12px]">
                  <span className="min-w-0 flex-1 text-bad">
                    No se pudo guardar «{p.resumen}»: {p.error}
                  </span>
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={async () => {
                      await borrarAccion(p.clientKey);
                      await refrescar();
                    }}
                  >
                    Descartar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {children}
    </ContextoSinSenal.Provider>
  );
}
