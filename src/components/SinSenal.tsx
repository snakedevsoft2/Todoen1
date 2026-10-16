"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  accionesPendientes,
  borrarAccion,
  guardarAccion,
  nuevaLlave,
  subirAcciones,
  subirVentas,
  ventasPendientes,
  type AccionPendiente,
  type VentaPendiente,
} from "@/lib/cola-pendientes";
import { estaInstalada } from "@/lib/instalar";
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
 * Solo en la aplicacion instalada de una cuenta que la tiene (lib/plan.ts):
 * desde el navegador, sin senal, se avisa que hace falta internet y no se
 * guarda nada en el telefono. Lo que ya estaba en la cola se sube igual.
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
  addSaleItemAction: "Agregar a una venta",
  deleteSaleAction: "Borrar una venta",
  cambiarPrecioLavadoAction: "Cambiar el precio de un lavado",
  recibirVehiculoAction: "Recibir vehículo",
  recibirDesdeReservaAction: "Recibir vehículo reservado",
  asignarLavadorAction: "Asignar lavador",
  marcarListoAction: "Lavado listo",
  cerrarLavadoAction: "Cobrar un lavado",
  cancelWashJobAction: "Cancelar un lavado",
  deleteWashJobAction: "Borrar un vehículo del patio",
  updateWashJobAction: "Editar un vehículo",
};

/** Por que no se guarda en el telefono lo que se haga sin senal. */
const SOLO_INSTALADA =
  "Sin señal. Para guardar sin internet abre la aplicación instalada en el teléfono; desde el navegador se necesita señal.";
const SIN_PLAN = "Sin señal. Esto necesita internet: inténtalo cuando vuelva la señal.";

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

/**
 * cuenta vacia: no se guarda nada en la cola (la version gratis, o el
 * navegador en vez de la aplicacion instalada). `motivo` dice por que.
 */
type Contexto = {
  cuenta: string;
  avisar: () => void;
  sinConexion: boolean;
  role: string;
  motivo: string;
  /** Lo que espera senal en este telefono, para que la pantalla lo muestre como hecho. */
  pendientes: AccionPendiente[];
};
const ContextoSinSenal = createContext<Contexto>({
  cuenta: "",
  avisar: () => undefined,
  sinConexion: true,
  role: "DUENO",
  motivo: SIN_PLAN,
  pendientes: [],
});

/** Si quien esta en el panel es el dueño (el empleado no borra ni cambia lo registrado). */
export function useEsDueno(): boolean {
  return useContext(ContextoSinSenal).role === "DUENO";
}

/** Si esta cuenta puede usar la aplicacion sin senal (la version gratis no). */
export function useSinConexionPermitida(): boolean {
  return useContext(ContextoSinSenal).sinConexion;
}

/**
 * Si lo que se haga sin senal se puede guardar en este telefono: solo en la
 * aplicacion instalada de una cuenta que la tiene. Si no, `motivo` es lo que
 * se le dice a la persona.
 */
export function useGuardaSinSenal(): { puede: boolean; motivo: string } {
  const ctx = useContext(ContextoSinSenal);
  return { puede: Boolean(ctx.cuenta), motivo: ctx.motivo };
}

/** Los cambios que esperan senal (sin los rechazados), en el orden en que se hicieron. */
export function useCambiosPendientes(): AccionPendiente[] {
  return useContext(ContextoSinSenal).pendientes;
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
        (!ctx.cuenta
          ? { error: ctx.motivo }
          : (await encolar(ctx, nombre, formData))
            ? { ok: GUARDADO }
            : { error: "Sin señal y este navegador no deja guardarlo. Inténtalo cuando vuelva la señal." }) as S;
      if (!navigator.onLine) return aLaCola();
      try {
        return await accion(prev, formData);
      } catch (e) {
        if (esErrorDeRed(e)) return aLaCola();
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
  preparar,
  className,
  children,
}: {
  /** El nombre de la accion en el registro de lib/sin-senal. */
  accion: string;
  servidor: (formData: FormData) => Promise<unknown>;
  /** Completa los campos que se ponen al momento de enviar (el dia, una llave). */
  preparar?: (formData: FormData) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = useContext(ContextoSinSenal);
  const [pendiente, empezar] = useTransition();
  // Sin senal y sin poder guardarlo en el telefono se dice aqui mismo: antes
  // el error de red terminaba en la pantalla de error del panel.
  const [aviso, setAviso] = useState<string | null>(null);

  // Borrar o cambiar lo que ya esta registrado es del dueño (o del supervisor,
  // en lo que le toca): el empleado ni ve el boton.
  if (!puedeHacer(ctx.role, accion)) return null;

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAviso(null);
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const datos = new FormData(e.currentTarget, submitter ?? undefined);
    preparar?.(datos);
    const aLaCola = async () => {
      if (!ctx.cuenta) setAviso(ctx.motivo);
      else if (!(await encolar(ctx, accion, datos))) {
        setAviso("Sin señal y este navegador no deja guardarlo. Inténtalo cuando vuelva la señal.");
      }
    };
    if (!navigator.onLine) {
      void aLaCola();
      return;
    }
    empezar(async () => {
      try {
        await servidor(datos);
      } catch (err) {
        if (esErrorDeRed(err)) await aLaCola();
        else throw err;
      }
    });
  }

  return (
    <form onSubmit={enviar} className={className} aria-busy={pendiente || undefined}>
      <fieldset disabled={pendiente} className="contents">
        {children}
      </fieldset>
      {aviso && (
        <p role="alert" data-sin-senal-aviso className="basis-full text-xs font-semibold text-bad">
          {aviso}
        </p>
      )}
    </form>
  );
}

/**
 * Sube lo pendiente cuando hay senal y muestra cuantos cambios esperan. Va en
 * el layout del panel, alrededor de las pantallas.
 *
 * Sube tambien las ventas que quedaron en el telefono: antes solo se subian
 * con la pantalla de Ventas abierta, y quien vendia sin senal y se iba al
 * patio las dejaba esperando aunque ya hubiera internet. Primero las ventas y
 * despues los cambios, para que un cierre de caja hecho sin senal las cuente.
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
  const ruta = usePathname();
  const [pendientes, setPendientes] = useState<AccionPendiente[]>([]);
  const [ventas, setVentas] = useState<VentaPendiente[]>([]);
  const [enLinea, setEnLinea] = useState(true);
  const [vuelta, setVuelta] = useState(0);
  // Se sabe en el navegador, despues de cargar: hasta entonces no se guarda nada.
  const [instalada, setInstalada] = useState(false);
  const [subidas, setSubidas] = useState(0);

  useEffect(() => {
    setInstalada(estaInstalada());
  }, []);

  // Un rato despues se quita el "ya se subio".
  useEffect(() => {
    if (subidas === 0) return;
    const reloj = setTimeout(() => setSubidas(0), 8000);
    return () => clearTimeout(reloj);
  }, [subidas]);

  const refrescar = useCallback(async () => {
    try {
      const [acciones, deVentas] = await Promise.all([accionesPendientes(cuenta), ventasPendientes(cuenta)]);
      setPendientes(acciones);
      setVentas(deVentas);
    } catch {
      // Sin IndexedDB no hay cola.
    }
  }, [cuenta]);

  const subir = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const v = await subirVentas(cuenta);
      const r = await subirAcciones(cuenta);
      await refrescar();
      const enviados = v.enviados + r.enviados;
      if (enviados > 0) {
        setSubidas(enviados);
        router.refresh();
      }
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
  // En Ventas no: esa pantalla ya muestra sus ventas pendientes, con su recibo.
  const enVentas = ruta === "/panel/ventas";
  const ventasEsperando = enVentas ? 0 : ventas.filter((v) => !v.error).length;
  const ventasRechazadas = enVentas ? 0 : ventas.filter((v) => v.error).length;
  const hayAlgo = esperando.length + rechazados.length + ventasEsperando + ventasRechazadas > 0;

  const guarda = sinConexion && instalada;
  const valor = {
    cuenta: guarda ? cuenta : "",
    avisar,
    sinConexion,
    role,
    motivo: sinConexion ? SOLO_INSTALADA : SIN_PLAN,
    pendientes: esperando,
  };

  return (
    <ContextoSinSenal.Provider value={valor}>
      {subidas > 0 && !hayAlgo && (
        <p data-pendientes-subidos className="mb-3 rounded-xl border border-line bg-good-soft px-3 py-2 text-[13px] font-semibold text-good">
          Volvió la señal: {subidas === 1 ? "lo que quedó guardado en el teléfono ya se subió." : "las " + subidas + " cosas guardadas en el teléfono ya se subieron."}
        </p>
      )}
      {hayAlgo && (
        <div data-acciones-pendientes className="mb-3 rounded-xl border border-warn-line bg-warn-soft p-3 text-[13px]">
          {esperando.length + ventasEsperando > 0 && (
            <p className="flex items-center gap-2 font-bold text-warn">
              <Icon name="clock" className="h-4 w-4" />
              {[
                ventasEsperando > 0 ? (ventasEsperando === 1 ? "1 venta" : ventasEsperando + " ventas") : "",
                esperando.length > 0 ? (esperando.length === 1 ? "1 cambio" : esperando.length + " cambios") : "",
              ]
                .filter(Boolean)
                .join(" y ")}{" "}
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
          {ventasRechazadas > 0 && (
            <p className="mt-2 text-[12px] text-bad">
              {ventasRechazadas === 1 ? "Una venta guardada en el teléfono no se pudo subir." : ventasRechazadas + " ventas guardadas en el teléfono no se pudieron subir."}{" "}
              <Link href="/panel/ventas" className="font-semibold underline">
                Revisar en Ventas
              </Link>
            </p>
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
