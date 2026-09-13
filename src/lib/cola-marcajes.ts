/**
 * La cola de marcajes del telefono.
 *
 * Es lo que hace que se pueda marcar sin senal. El marcaje se guarda primero
 * en el telefono y se envia despues; mientras tanto se ve como "pendiente".
 * Nada se pierde porque el sotano no tenia cobertura.
 *
 * Va en IndexedDB y no en localStorage a proposito: localStorage se borra con
 * mas facilidad, no aguanta mucho, y escribe bloqueando el hilo de la
 * pantalla. Aqui hay plata y horas de trabajo de por medio.
 *
 * REGLA QUE SOSTIENE TODO: cada marcaje lleva una llave unica que genera el
 * telefono, y esa llave viaja al servidor. Si el envio se corta despues de
 * guardar pero antes de confirmar, el telefono reintenta y el servidor
 * reconoce que ese marcaje ya entro. Sin eso, una mala senal convierte una
 * entrada en cinco.
 */

const BASE = "ten_marcajes";
const TIENDA = "pendientes";
const VERSION = 1;

export type MarcajePendiente = {
  /** La llave unica. Es la misma que recibe el servidor. */
  clientKey: string;
  kind: "ENTRADA" | "SALIDA";
  /** Cuando toco el boton, en ISO. El reloj del telefono. */
  markedAt: string;
  siteId: string | null;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  note: string | null;
  /** Cuantas veces se intento mandar. Sirve para no reintentar para siempre. */
  intentos: number;
};

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BASE, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(TIENDA)) {
        db.createObjectStore(TIENDA, { keyPath: "clientKey" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function conTienda<T>(
  modo: IDBTransactionMode,
  fn: (tienda: IDBObjectStore) => IDBRequest
): Promise<T> {
  const db = await abrir();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(TIENDA, modo);
    const req = fn(tx.objectStore(TIENDA));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

/** Una llave que no se repite aunque dos telefonos marquen en el mismo segundo. */
export function nuevaLlave(): string {
  const c = globalThis.crypto;
  if (c && "randomUUID" in c) return c.randomUUID();
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
}

export async function guardar(m: MarcajePendiente): Promise<void> {
  await conTienda("readwrite", (t) => t.put(m));
}

export async function pendientes(): Promise<MarcajePendiente[]> {
  const todos = await conTienda<MarcajePendiente[]>("readonly", (t) => t.getAll());
  return (todos ?? []).sort((a, b) => a.markedAt.localeCompare(b.markedAt));
}

export async function borrar(clientKey: string): Promise<void> {
  await conTienda("readwrite", (t) => t.delete(clientKey));
}

export async function contar(): Promise<number> {
  const n = await conTienda<number>("readonly", (t) => t.count());
  return n ?? 0;
}

/** Lo que responde el servidor por cada marcaje del lote. */
export type ResultadoLote = {
  clientKey: string;
  /** "guardado", "repetido" (ya estaba) o "rechazado". */
  estado: "guardado" | "repetido" | "rechazado";
  motivo?: string;
};

/**
 * Intenta mandar todo lo pendiente.
 *
 * Los que el servidor acepta y los que reconoce como repetidos se borran de la
 * cola: en los dos casos el marcaje ya esta a salvo. Los rechazados tambien se
 * borran, porque reintentarlos daria el mismo error para siempre; se devuelven
 * para poder decirselo a la persona.
 *
 * Si no hay red, no se toca nada: la cola queda intacta para el proximo
 * intento.
 */
export async function sincronizar(): Promise<{
  enviados: number;
  rechazados: ResultadoLote[];
  huboRed: boolean;
}> {
  const cola = await pendientes();
  if (cola.length === 0) return { enviados: 0, rechazados: [], huboRed: true };

  let respuesta: Response;
  try {
    respuesta = await fetch("/api/asistencia/lote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marcajes: cola }),
    });
  } catch {
    // Sin red. La cola se queda como esta.
    return { enviados: 0, rechazados: [], huboRed: false };
  }

  if (!respuesta.ok) {
    // El servidor esta, pero algo salio mal. Se reintenta luego, salvo que la
    // sesion se haya caido: ahi tampoco sirve insistir en silencio.
    return { enviados: 0, rechazados: [], huboRed: true };
  }

  const datos = (await respuesta.json()) as { resultados: ResultadoLote[] };
  const rechazados: ResultadoLote[] = [];
  let enviados = 0;

  for (const r of datos.resultados ?? []) {
    await borrar(r.clientKey);
    if (r.estado === "rechazado") rechazados.push(r);
    else enviados += 1;
  }

  return { enviados, rechazados, huboRed: true };
}
