/**
 * Lo que devuelve un proveedor al emitir o consultar una factura, igual para
 * Factus y Datil, para que el resto de la app no tenga que saber cual es.
 */
export type ResultadoProveedor =
  | {
      estado: "AUTORIZADA";
      numero: string;
      /** CUFE o clave de acceso. */
      codigo: string;
      qr: string | null;
      publicUrl: string | null;
      providerId: string | null;
      fecha: Date | null;
    }
  /** Recibida, esperando la autorizacion de la entidad. Se consulta despues. */
  | { estado: "ENVIANDO"; numero: string | null; codigo: string | null; providerId: string | null; mensaje: string | null }
  /** La entidad o el proveedor la rechazaron: no se reintenta sola. */
  | { estado: "RECHAZADA"; mensaje: string }
  /** No se pudo hablar con el proveedor: se reintenta. */
  | { estado: "ERROR"; mensaje: string };

export type Ambiente = "pruebas" | "produccion";

/** Hasta cuanto se espera al proveedor antes de dejarlo para un reintento. */
export const ESPERA_MS = 25_000;

/** Los mensajes que vienen en listas u objetos, en una sola frase corta. */
export function juntarMensajes(valor: unknown): string {
  const partes: string[] = [];
  const recorrer = (v: unknown) => {
    if (partes.length >= 6 || v === null || v === undefined) return;
    if (typeof v === "string") {
      if (v.trim()) partes.push(v.trim());
    } else if (Array.isArray(v)) {
      v.forEach(recorrer);
    } else if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.mensaje === "string") {
        partes.push([o.mensaje, o.informacion_adicional].filter((x) => typeof x === "string" && x).join(": "));
      } else if (typeof o.message === "string") {
        partes.push(o.message);
      } else {
        Object.values(o).forEach(recorrer);
      }
    }
  };
  recorrer(valor);
  return partes.join(" · ").slice(0, 900);
}
