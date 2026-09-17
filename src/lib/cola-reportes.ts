/**
 * La cola del telefono para los reportes y las novedades.
 *
 * Igual que la de marcajes (cola-marcajes.ts): lo que el empleado hace se
 * guarda primero en el telefono y se sube despues. Puede hacer el reporte con
 * fotos dentro de la obra sin senal, o avisar que mañana llega tarde desde el
 * bus, y seguir con lo suyo: apenas vuelve la cobertura se sube solo.
 *
 * El reporte se sube por partes, y cada parte lleva su propia llave:
 *   1. el reporte (llave del reporte),
 *   2. cada foto (llave del reporte + numero de foto),
 *   3. el aviso de que ya esta completo.
 * Si la senal se corta a mitad, el siguiente intento sigue donde iba y el
 * servidor reconoce lo que ya habia recibido. Sin las llaves, un reporte con
 * mala senal llegaria tres veces con las fotos repetidas.
 */

const BASE = "ten_reportes";
const VERSION = 1;
const REPORTES = "pendientes";
const NOVEDADES = "novedades";

export type ReportePendiente = {
  clientKey: string;
  title: string;
  body: string;
  day: string;
  siteId: string | null;
  siteName: string | null;
  clientName: string;
  clientPhone: string;
  /** Las fotos ya achicadas, como data URL. */
  fotos: string[];
  creadoEn: string;
  /** El id que le dio el servidor, cuando ya se creo alla. */
  reportId: string | null;
  /** Cuantas fotos ya subieron, para seguir donde iba. */
  fotosSubidas: number;
  /** Si el servidor lo rechazo, por que. Ese no se reintenta solo. */
  error: string | null;
  /** La descripcion de cada foto, en el mismo orden. */
  leyendas?: string[];
  /** Observaciones y recomendaciones. */
  observaciones?: string;
  /** PDF de evidencia, como data URL. */
  adjuntos?: { name: string; data: string }[];
  /** Cuantos PDF ya subieron. */
  adjuntosSubidos?: number;
};

export type NovedadPendiente = {
  clientKey: string;
  kind: string;
  fromDay: string;
  toDay: string;
  fromTime: string | null;
  toTime: string | null;
  reason: string;
  /** Foto del soporte, achicada, como data URL. */
  photo: string | null;
  creadoEn: string;
  error: string | null;
};

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BASE, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const t of [REPORTES, NOVEDADES]) {
        if (!db.objectStoreNames.contains(t)) db.createObjectStore(t, { keyPath: "clientKey" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function conTienda<T>(
  tienda: string,
  modo: IDBTransactionMode,
  fn: (t: IDBObjectStore) => IDBRequest
): Promise<T> {
  const db = await abrir();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(tienda, modo);
    const req = fn(tx.objectStore(tienda));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

/** Una llave que no se repite aunque dos telefonos guarden en el mismo segundo. */
export function nuevaLlave(): string {
  const c = globalThis.crypto;
  if (c && "randomUUID" in c) return c.randomUUID();
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8);
}

export async function guardarReporte(r: ReportePendiente): Promise<void> {
  await conTienda(REPORTES, "readwrite", (t) => t.put(r));
}

export async function reportesPendientes(): Promise<ReportePendiente[]> {
  const todos = await conTienda<ReportePendiente[]>(REPORTES, "readonly", (t) => t.getAll());
  return (todos ?? []).sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
}

export async function borrarReporte(clientKey: string): Promise<void> {
  await conTienda(REPORTES, "readwrite", (t) => t.delete(clientKey));
}

export async function guardarNovedad(n: NovedadPendiente): Promise<void> {
  await conTienda(NOVEDADES, "readwrite", (t) => t.put(n));
}

export async function novedadesPendientes(): Promise<NovedadPendiente[]> {
  const todas = await conTienda<NovedadPendiente[]>(NOVEDADES, "readonly", (t) => t.getAll());
  return (todas ?? []).sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
}

export async function borrarNovedad(clientKey: string): Promise<void> {
  await conTienda(NOVEDADES, "readwrite", (t) => t.delete(clientKey));
}

export type Paso =
  | { ok: true; datos: Record<string, unknown> }
  | { ok: false; conRed: boolean; motivo: string; reintentar: boolean };

/**
 * Cuanto se espera antes de darla por caida.
 *
 * El celular muchas veces dice "conectado" (a un wifi sin internet de
 * verdad, o con una señal que no pasa datos) aunque no haya como llegar al
 * servidor. Sin este tope, ese fetch se queda colgado y la persona ve el
 * boton de guardar pegado, como si la aplicacion no dejara vender. Con el
 * tope, a los 15 segundos se da por sin señal y la venta se va a la cola del
 * telefono, igual que si nunca hubiera habido conexion.
 */
const TIMEOUT_MS = 15000;

export async function enviar(url: string, cuerpo: Record<string, unknown>): Promise<Paso> {
  let r: Response;
  try {
    const vencido = new AbortController();
    const reloj = setTimeout(() => vencido.abort(), TIMEOUT_MS);
    try {
      r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
        signal: vencido.signal,
      });
    } finally {
      clearTimeout(reloj);
    }
  } catch {
    return { ok: false, conRed: false, motivo: "Sin señal.", reintentar: true };
  }
  const datos = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (r.ok) return { ok: true, datos };
  // Sesion caida o servidor con problemas: no es culpa de lo que se manda, se
  // reintenta despues sin marcarlo como malo.
  if (r.status === 401) {
    return { ok: false, conRed: true, motivo: "Tu sesión se cerró. Vuelve a entrar para enviar lo pendiente.", reintentar: true };
  }
  if (r.status >= 500) return { ok: false, conRed: true, motivo: "El servidor no respondió. Se reintenta solo.", reintentar: true };
  return { ok: false, conRed: true, motivo: String(datos.error ?? "No se pudo enviar."), reintentar: false };
}

export type ResultadoSubida = {
  enviados: number;
  /** False si no hubo red: la cola quedo intacta para el proximo intento. */
  huboRed: boolean;
  /** Algo que decirle a la persona, si hace falta. */
  aviso: string | null;
};

export const parar = (enviados: number, p: Extract<Paso, { ok: false }>): ResultadoSubida => ({
  enviados,
  huboRed: p.conRed,
  aviso: p.conRed ? p.motivo : null,
});

/**
 * Nunca corren dos subidas iguales a la vez: el evento de "volvio la senal" y
 * el de "volvio a la pantalla" pueden llegar juntos, y dos subidas en paralelo
 * pelearian por el mismo reporte.
 */
export function unaALaVez<A extends unknown[]>(fn: (...args: A) => Promise<ResultadoSubida>) {
  let enCurso: Promise<ResultadoSubida> | null = null;
  return (...args: A) => {
    if (!enCurso) {
      enCurso = fn(...args).finally(() => {
        enCurso = null;
      });
    }
    return enCurso;
  };
}

export const subirReportes = unaALaVez(async (alAvanzar?: () => void) => {
  const cola = (await reportesPendientes()).filter((r) => !r.error);
  let enviados = 0;

  for (const r of cola) {
    if (!r.reportId) {
      const p = await enviar("/api/informes", {
        clientKey: r.clientKey,
        title: r.title,
        body: r.body,
        day: r.day,
        siteId: r.siteId,
        clientName: r.clientName,
        clientPhone: r.clientPhone,
        observations: r.observaciones ?? "",
      });
      if (!p.ok) {
        if (p.reintentar) return parar(enviados, p);
        await guardarReporte({ ...r, error: p.motivo });
        alAvanzar?.();
        continue;
      }
      r.reportId = String(p.datos.id);
      await guardarReporte(r);
      alAvanzar?.();
    }

    for (let i = r.fotosSubidas; i < r.fotos.length; i++) {
      const p = await enviar("/api/informes/" + r.reportId + "/fotos", {
        clientKey: r.clientKey + ":" + i,
        image: r.fotos[i],
        caption: r.leyendas?.[i] ?? "",
      });
      // Una foto que el servidor no acepta (formato raro, se paso del maximo)
      // no frena el resto del reporte: se sigue con la siguiente.
      if (!p.ok && p.reintentar) return parar(enviados, p);
      r.fotosSubidas = i + 1;
      await guardarReporte(r);
      alAvanzar?.();
    }

    const adjuntos = r.adjuntos ?? [];
    for (let i = r.adjuntosSubidos ?? 0; i < adjuntos.length; i++) {
      const p = await enviar("/api/informes/" + r.reportId + "/adjuntos", {
        clientKey: r.clientKey + ":a" + i,
        name: adjuntos[i].name,
        data: adjuntos[i].data,
      });
      // Igual que con las fotos: uno rechazado no frena lo demas.
      if (!p.ok && p.reintentar) return parar(enviados, p);
      r.adjuntosSubidos = i + 1;
      await guardarReporte(r);
      alAvanzar?.();
    }

    const fin = await enviar("/api/informes/" + r.reportId + "/enviar", {});
    if (!fin.ok) {
      if (fin.reintentar) return parar(enviados, fin);
      await guardarReporte({ ...r, error: fin.motivo });
      alAvanzar?.();
      continue;
    }
    await borrarReporte(r.clientKey);
    enviados += 1;
    alAvanzar?.();
  }

  return { enviados, huboRed: true, aviso: null };
});

export const subirNovedades = unaALaVez(async (alAvanzar?: () => void) => {
  const cola = (await novedadesPendientes()).filter((n) => !n.error);
  let enviados = 0;

  for (const n of cola) {
    const p = await enviar("/api/novedades", {
      clientKey: n.clientKey,
      kind: n.kind,
      fromDay: n.fromDay,
      toDay: n.toDay,
      fromTime: n.fromTime,
      toTime: n.toTime,
      reason: n.reason,
      photo: n.photo,
    });
    if (!p.ok) {
      if (p.reintentar) return parar(enviados, p);
      await guardarNovedad({ ...n, error: p.motivo });
      alAvanzar?.();
      continue;
    }
    await borrarNovedad(n.clientKey);
    enviados += 1;
    alAvanzar?.();
  }

  return { enviados, huboRed: true, aviso: null };
});
