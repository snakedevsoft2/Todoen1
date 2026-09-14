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
const VERSION = 1;
const VENTAS = "ventas";
const DOCUMENTOS = "documentos";

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
      for (const t of [VENTAS, DOCUMENTOS]) {
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
