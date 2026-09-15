/**
 * La cola del telefono para las ventas y los documentos escaneados.
 *
 * Igual que la de reportes (cola-reportes.ts): lo que se hace sin senal se
 * guarda primero en el telefono y se sube solo cuando vuelve. Cada cosa lleva
 * su llave, asi que si la subida se corta a mitad y se reintenta, el servidor
 * reconoce lo que ya tenia: una venta no queda dos veces.
 *
 * Cada pendiente guarda de quien es (la persona del equipo que lo hizo). En un
 * telefono compartido, lo que dejo una persona no se sube con la sesion de la
 * siguiente: espera a que su dueña vuelva a entrar.
 */

import { enviar, nuevaLlave, parar, unaALaVez, type ResultadoSubida } from "./cola-reportes";

export { nuevaLlave };

const BASE = "ten_pendientes";
// Version 2: se sumaron las ubicaciones de la jornada y las llegadas.
// Version 3: las acciones del panel hechas sin senal.
const VERSION = 3;
const VENTAS = "ventas";
const DOCUMENTOS = "documentos";
const UBICACIONES = "ubicaciones";
const VISITAS = "visitas";
const ACCIONES = "acciones";

export type VentaPendiente = {
  clientKey: string;
  /** La persona del equipo que la registro. */
  cuenta: string;
  day: string;
  items: { serviceId: string | null; variantId: string | null; name: string; unitPrice: number; qty: number }[];
  manualTotal: string;
  concept: string;
  paymentMethod: string;
  clientName: string;
  /** Telefono del cliente: con el queda guardado en Clientes. */
  clientPhone?: string;
  /** A credito: el dia en que el cliente dijo que paga. */
  dueDay?: string;
  notes: string;
  staffId: string;
  /** El total que se vio en pantalla, para mostrarlo mientras espera. */
  total: number;
  creadoEn: string;
  /** Si el servidor la rechazo, por que. Esa no se reintenta sola. */
  error: string | null;
};

export type DocumentoPendiente = {
  clientKey: string;
  cuenta: string;
  title: string;
  /** El PDF armado, como data URL. */
  pdf: string;
  pages: number;
  text: string;
  creadoEn: string;
  error: string | null;
};

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BASE, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const t of [VENTAS, DOCUMENTOS, UBICACIONES, VISITAS, ACCIONES]) {
        if (!db.objectStoreNames.contains(t)) db.createObjectStore(t, { keyPath: "clientKey" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function conTienda<T>(tienda: string, modo: IDBTransactionMode, fn: (t: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await abrir();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(tienda, modo);
    const req = fn(tx.objectStore(tienda));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function todos<T extends { creadoEn: string; cuenta: string }>(tienda: string, cuenta: string): Promise<T[]> {
  const lista = await conTienda<T[]>(tienda, "readonly", (t) => t.getAll());
  return (lista ?? []).filter((x) => x.cuenta === cuenta).sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
}

export async function guardarVenta(v: VentaPendiente): Promise<void> {
  await conTienda(VENTAS, "readwrite", (t) => t.put(v));
}

export function ventasPendientes(cuenta: string): Promise<VentaPendiente[]> {
  return todos<VentaPendiente>(VENTAS, cuenta);
}

export async function borrarVenta(clientKey: string): Promise<void> {
  await conTienda(VENTAS, "readwrite", (t) => t.delete(clientKey));
}

export async function guardarDocumentoPendiente(d: DocumentoPendiente): Promise<void> {
  await conTienda(DOCUMENTOS, "readwrite", (t) => t.put(d));
}

export function documentosPendientes(cuenta: string): Promise<DocumentoPendiente[]> {
  return todos<DocumentoPendiente>(DOCUMENTOS, cuenta);
}

export async function borrarDocumentoPendiente(clientKey: string): Promise<void> {
  await conTienda(DOCUMENTOS, "readwrite", (t) => t.delete(clientKey));
}

/** Lo que se le manda al servidor: la venta, sin los datos de la cola. */
export function cuerpoDeVenta(v: VentaPendiente): Record<string, unknown> {
  return {
    clientKey: v.clientKey,
    day: v.day,
    items: v.items,
    manualTotal: v.manualTotal,
    concept: v.concept,
    paymentMethod: v.paymentMethod,
    clientName: v.clientName,
    clientPhone: v.clientPhone ?? "",
    dueDay: v.dueDay ?? "",
    notes: v.notes,
    staffId: v.staffId,
  };
}

export function cuerpoDeDocumento(d: DocumentoPendiente): Record<string, unknown> {
  return { clientKey: d.clientKey, title: d.title, pdf: d.pdf, pages: d.pages, text: d.text };
}

export const subirVentas = unaALaVez(async (cuenta: string, alAvanzar?: () => void): Promise<ResultadoSubida> => {
  const cola = (await ventasPendientes(cuenta)).filter((v) => !v.error);
  let enviados = 0;
  for (const v of cola) {
    const p = await enviar("/api/ventas", cuerpoDeVenta(v));
    if (!p.ok) {
      if (p.reintentar) return parar(enviados, p);
      await guardarVenta({ ...v, error: p.motivo });
      alAvanzar?.();
      continue;
    }
    await borrarVenta(v.clientKey);
    enviados += 1;
    alAvanzar?.();
  }
  return { enviados, huboRed: true, aviso: null };
});

export const subirDocumentos = unaALaVez(async (cuenta: string, alAvanzar?: () => void): Promise<ResultadoSubida> => {
  const cola = (await documentosPendientes(cuenta)).filter((d) => !d.error);
  let enviados = 0;
  for (const d of cola) {
    const p = await enviar("/api/documentos", cuerpoDeDocumento(d));
    if (!p.ok) {
      if (p.reintentar) return parar(enviados, p);
      await guardarDocumentoPendiente({ ...d, error: p.motivo });
      alAvanzar?.();
      continue;
    }
    await borrarDocumentoPendiente(d.clientKey);
    enviados += 1;
    alAvanzar?.();
  }
  return { enviados, huboRed: true, aviso: null };
});

// ------------------------------------------------ ubicacion y llegadas

/** Una ubicacion de la jornada, esperando para subir. */
export type UbicacionPendiente = {
  clientKey: string;
  cuenta: string;
  at: string;
  lat: number;
  lng: number;
  accuracyM: number | null;
  creadoEn: string;
};

/** Un "Llegue" esperando para subir. */
export type VisitaPendiente = {
  clientKey: string;
  cuenta: string;
  arrivedAt: string;
  siteId: string | null;
  place: string;
  note: string;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  creadoEn: string;
};

export async function guardarUbicacion(u: UbicacionPendiente): Promise<void> {
  await conTienda(UBICACIONES, "readwrite", (t) => t.put(u));
}

export async function guardarVisita(v: VisitaPendiente): Promise<void> {
  await conTienda(VISITAS, "readwrite", (t) => t.put(v));
}

export function visitasPendientes(cuenta: string): Promise<VisitaPendiente[]> {
  return todos<VisitaPendiente>(VISITAS, cuenta);
}

export function ubicacionesPendientes(cuenta: string): Promise<UbicacionPendiente[]> {
  return todos<UbicacionPendiente>(UBICACIONES, cuenta);
}

type ResultadoItem = { clientKey: string; estado: "guardado" | "repetido" | "rechazado"; motivo?: string };
export type ResultadoLote = { enviados: number; rechazados: ResultadoItem[]; huboRed: boolean };

/**
 * Manda de a lotes, igual que los marcajes: el servidor responde por cada uno
 * y todo lo que respondio (guardado, repetido o rechazado) sale de la cola.
 * Sin red no se toca nada.
 */
async function subirLote<T extends { clientKey: string; creadoEn: string; cuenta: string }>(
  tienda: string,
  cuenta: string,
  url: string,
  campo: string,
  cuerpoDe: (x: T) => Record<string, unknown>
): Promise<ResultadoLote> {
  const cola = (await todos<T>(tienda, cuenta)).slice(0, 100);
  if (cola.length === 0) return { enviados: 0, rechazados: [], huboRed: true };
  let r: Response;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [campo]: cola.map(cuerpoDe) }),
    });
  } catch {
    return { enviados: 0, rechazados: [], huboRed: false };
  }
  if (!r.ok) return { enviados: 0, rechazados: [], huboRed: true };
  const datos = (await r.json().catch(() => ({}))) as { resultados?: ResultadoItem[] };
  let enviados = 0;
  const rechazados: ResultadoItem[] = [];
  for (const x of datos.resultados ?? []) {
    await conTienda(tienda, "readwrite", (t) => t.delete(x.clientKey));
    if (x.estado === "rechazado") rechazados.push(x);
    else enviados += 1;
  }
  return { enviados, rechazados, huboRed: true };
}

function unoALaVez<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  let enCurso: Promise<R> | null = null;
  return (...args: A) => {
    if (!enCurso) {
      enCurso = fn(...args).finally(() => {
        enCurso = null;
      });
    }
    return enCurso;
  };
}

export const subirUbicaciones = unoALaVez((cuenta: string) =>
  subirLote<UbicacionPendiente>(UBICACIONES, cuenta, "/api/asistencia/ubicaciones", "ubicaciones", (u) => ({
    clientKey: u.clientKey,
    at: u.at,
    lat: u.lat,
    lng: u.lng,
    accuracyM: u.accuracyM,
  }))
);

export const subirVisitas = unoALaVez((cuenta: string) =>
  subirLote<VisitaPendiente>(VISITAS, cuenta, "/api/asistencia/visitas", "visitas", (v) => ({
    clientKey: v.clientKey,
    arrivedAt: v.arrivedAt,
    siteId: v.siteId,
    place: v.place,
    note: v.note,
    lat: v.lat,
    lng: v.lng,
    accuracyM: v.accuracyM,
  }))
);

// ------------------------------------------------ acciones del panel

/** Una accion del panel (un gasto, un abono...) hecha sin senal. */
export type AccionPendiente = {
  clientKey: string;
  cuenta: string;
  /** El nombre de la accion del servidor, del registro de lib/sin-senal. */
  accion: string;
  /** Los campos del formulario, tal cual. */
  campos: [string, string][];
  /** Lo que se le muestra a la persona mientras espera. */
  resumen: string;
  creadoEn: string;
  /** Si el servidor la rechazo, por que. Esa no se reintenta sola. */
  error: string | null;
};

export async function guardarAccion(a: AccionPendiente): Promise<void> {
  await conTienda(ACCIONES, "readwrite", (t) => t.put(a));
}

export function accionesPendientes(cuenta: string): Promise<AccionPendiente[]> {
  return todos<AccionPendiente>(ACCIONES, cuenta);
}

export async function borrarAccion(clientKey: string): Promise<void> {
  await conTienda(ACCIONES, "readwrite", (t) => t.delete(clientKey));
}

export type ResultadoAcciones = { enviados: number; rechazados: number; huboRed: boolean; sinSesion: boolean };

/**
 * Sube las acciones pendientes, en el orden en que se hicieron. Las que el
 * servidor rechaza quedan con el motivo para mostrarlas; las que tienen que
 * reintentarse se quedan como estaban.
 */
export const subirAcciones = unoALaVez(async (cuenta: string): Promise<ResultadoAcciones> => {
  const cola = (await accionesPendientes(cuenta)).filter((a) => !a.error).slice(0, 25);
  if (cola.length === 0) return { enviados: 0, rechazados: 0, huboRed: true, sinSesion: false };
  let r: Response;
  try {
    r = await fetch("/api/sin-senal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acciones: cola.map((a) => ({ clientKey: a.clientKey, accion: a.accion, campos: a.campos })) }),
    });
  } catch {
    return { enviados: 0, rechazados: 0, huboRed: false, sinSesion: false };
  }
  const datos = (await r.json().catch(() => ({}))) as { resultados?: ResultadoItem[] | { clientKey: string; estado: string; motivo?: string }[] };
  let enviados = 0;
  let rechazados = 0;
  for (const x of (datos.resultados ?? []) as { clientKey: string; estado: string; motivo?: string }[]) {
    const accion = cola.find((a) => a.clientKey === x.clientKey);
    if (!accion) continue;
    if (x.estado === "guardado" || x.estado === "repetido") {
      await borrarAccion(x.clientKey);
      enviados += 1;
    } else if (x.estado === "rechazado") {
      await guardarAccion({ ...accion, error: x.motivo ?? "No se pudo guardar." });
      rechazados += 1;
    }
  }
  return { enviados, rechazados, huboRed: true, sinSesion: r.status === 401 };
});

