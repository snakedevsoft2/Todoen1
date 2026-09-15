import { db } from "../db";
import { LLAVE_VALIDA, type Sesion } from "../informes";
import { SOLO_DUENO, puedeHacer } from "../permisos-empleado";

/**
 * Ejecuta las acciones del panel que se hicieron sin senal.
 *
 * No hay una version "sin senal" de cada accion: se ejecuta la MISMA accion
 * del servidor que usa la pantalla con senal, con los mismos campos del
 * formulario. Asi las reglas (permisos, validaciones, inventario, caja) son
 * una sola y no pueden quedar distintas.
 *
 * Lo que se agrega aqui es que ninguna se haga dos veces: cada una trae la
 * llave que le puso el telefono, y esa llave queda anotada antes de ejecutar.
 */

export type EntradaRegistro =
  | { kind: "estado"; fn: (prev: never, formData: FormData) => Promise<unknown> }
  | { kind: "simple"; fn: (formData: FormData) => Promise<unknown> };

export type Registro = Record<string, EntradaRegistro>;

export type ResultadoAccion = {
  clientKey: string;
  /** "reintentar": algo fallo en el servidor; el telefono la conserva. */
  estado: "guardado" | "repetido" | "rechazado" | "reintentar";
  motivo?: string;
};

export const MAX_ACCIONES = 25;
const MAX_CAMPOS = 300;
const MAX_TEXTO = 3_000_000;
/** Una accion que quedo "procesando" mas de esto se da por caida y se retoma. */
const CAIDA_MS = 2 * 60_000;

/** A donde manda un redirect() de Next, o null si el error no es un redirect. */
function destinoDeRedireccion(e: unknown): string | null {
  const digest = (e as { digest?: unknown })?.digest;
  if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) return digest.split(";")[2] ?? "";
  return null;
}

function leerCampos(v: unknown): [string, string][] | null {
  if (!Array.isArray(v) || v.length > MAX_CAMPOS) return null;
  let total = 0;
  const campos: [string, string][] = [];
  for (const par of v) {
    if (!Array.isArray(par) || typeof par[0] !== "string" || typeof par[1] !== "string") return null;
    total += par[0].length + par[1].length;
    if (total > MAX_TEXTO) return null;
    campos.push([par[0], par[1]]);
  }
  return campos;
}

export async function ejecutarAcciones(
  s: Sesion,
  lote: unknown[],
  registro: Registro
): Promise<{ resultados: ResultadoAccion[]; sinSesion: boolean }> {
  const resultados: ResultadoAccion[] = [];

  for (const crudo of lote.slice(0, MAX_ACCIONES)) {
    const a = (crudo ?? {}) as Record<string, unknown>;
    const clientKey = typeof a.clientKey === "string" && LLAVE_VALIDA.test(a.clientKey) ? a.clientKey : null;
    if (!clientKey) continue;
    const rechazar = (motivo: string) => resultados.push({ clientKey, estado: "rechazado", motivo });

    const nombre = typeof a.accion === "string" ? a.accion : "";
    const entrada = Object.prototype.hasOwnProperty.call(registro, nombre) ? registro[nombre] : null;
    if (!entrada) {
      rechazar("Esa acción no se puede hacer sin señal.");
      continue;
    }
    const campos = leerCampos(a.campos);
    if (!campos) {
      rechazar("Los datos no son válidos.");
      continue;
    }
    // El empleado no borra ni cambia lo registrado, tampoco desde la cola.
    if (!puedeHacer(s.staff.role, nombre, campos)) {
      rechazar(SOLO_DUENO);
      continue;
    }

    // Se aparta la llave antes de ejecutar: si la subida se repite, no se hace dos veces.
    const previa = await db.offlineAction.findUnique({ where: { clientKey } });
    if (previa) {
      if (previa.staffId !== s.staff.id) {
        rechazar("Esa acción no se puede recibir.");
        continue;
      }
      if (previa.estado === "HECHO") {
        resultados.push({ clientKey, estado: "repetido" });
        continue;
      }
      if (previa.estado === "RECHAZADO") {
        rechazar(previa.mensaje ?? "No se pudo guardar.");
        continue;
      }
      if (Date.now() - previa.updatedAt.getTime() < CAIDA_MS) {
        // Otra subida la esta haciendo en este momento.
        resultados.push({ clientKey, estado: "reintentar" });
        continue;
      }
      await db.offlineAction.update({ where: { clientKey }, data: { estado: "PROCESANDO" } });
    } else {
      try {
        await db.offlineAction.create({ data: { userId: s.user.id, staffId: s.staff.id, clientKey, accion: nombre } });
      } catch (e) {
        if ((e as { code?: string })?.code === "P2002") {
          resultados.push({ clientKey, estado: "reintentar" });
          continue;
        }
        throw e;
      }
    }

    const datos = new FormData();
    for (const [k, v] of campos) datos.append(k, v);

    try {
      const r = entrada.kind === "estado" ? await entrada.fn(undefined as never, datos) : await entrada.fn(datos);
      const error = r && typeof r === "object" && typeof (r as { error?: unknown }).error === "string" ? (r as { error: string }).error : null;
      if (error) {
        await db.offlineAction.update({ where: { clientKey }, data: { estado: "RECHAZADO", mensaje: error.slice(0, 500) } });
        rechazar(error);
      } else {
        await db.offlineAction.update({ where: { clientKey }, data: { estado: "HECHO" } });
        resultados.push({ clientKey, estado: "guardado" });
      }
    } catch (e) {
      const destino = destinoDeRedireccion(e);
      if (destino !== null && !/^\/(salir|login)(\/|$|\?)/.test(destino)) {
        // La accion termino y mando a otra pantalla (crear un cliente abre su ficha).
        await db.offlineAction.update({ where: { clientKey }, data: { estado: "HECHO" } });
        resultados.push({ clientKey, estado: "guardado" });
        continue;
      }
      // La llave se suelta: no se hizo, y se tiene que poder intentar otra vez.
      await db.offlineAction.delete({ where: { clientKey } }).catch(() => undefined);
      if (destino !== null) {
        // La sesion se cerro (o la cuenta se suspendio): lo demas tampoco va a pasar.
        return { resultados, sinSesion: true };
      }
      console.error("No se pudo ejecutar la accion sin senal", nombre, e);
      resultados.push({ clientKey, estado: "reintentar" });
    }
  }

  return { resultados, sinSesion: false };
}
