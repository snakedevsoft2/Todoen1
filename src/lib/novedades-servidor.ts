import { db } from "./db";
import { todayIn } from "./dates";
import { prettyDay } from "./format";
import { etiquetaNovedad, validarNovedad } from "./novedades";
import { FOTO_VALIDA, LLAVE_VALIDA, MAX_LARGO_FOTO, falla, type Resultado, type Sesion } from "./informes";
import { avisarAlAdministrador } from "./avisos-admin";

/**
 * Recibe una novedad del empleado.
 *
 * Llega por la cola del telefono, asi que trae su llave: si el envio se corta
 * y se reintenta, no queda repetida ni se le avisa dos veces al administrador.
 */
export async function crearNovedad(s: Sesion, d: Record<string, unknown>): Promise<Resultado<{ id: string; repetido: boolean }>> {
  const clientKey = typeof d.clientKey === "string" && LLAVE_VALIDA.test(d.clientKey) ? d.clientKey : null;
  if (d.clientKey !== undefined && d.clientKey !== null && !clientKey) return falla("Llave inválida.");

  const yaEsta = async () => {
    if (!clientKey) return null;
    const ya = await db.novelty.findUnique({ where: { clientKey }, select: { id: true, staffId: true } });
    if (!ya) return null;
    return ya.staffId === s.staff.id
      ? { ok: true as const, datos: { id: ya.id, repetido: true } }
      : falla("Esa novedad no se puede recibir.", 409);
  };
  const previa = await yaEsta();
  if (previa) return previa;

  const v = validarNovedad(d, todayIn(s.user.timezone));
  if (!v.ok) return falla(v.error);

  const photo = typeof d.photo === "string" && d.photo ? d.photo : null;
  if (photo && (photo.length > MAX_LARGO_FOTO || !FOTO_VALIDA.test(photo))) {
    return falla("La foto del soporte no es válida o pesa demasiado.");
  }

  const pendientes = await db.novelty.count({ where: { staffId: s.staff.id, status: "PENDIENTE" } });
  if (pendientes >= 50) return falla("Tienes demasiadas novedades sin revisar. Habla con el administrador.");

  let novedad;
  try {
    novedad = await db.novelty.create({
      data: { userId: s.user.id, staffId: s.staff.id, ...v.datos, photo, clientKey },
      select: { id: true },
    });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") {
      const carrera = await yaEsta();
      if (carrera) return carrera;
    }
    throw e;
  }

  if (s.staff.role !== "DUENO") {
    const dias = v.datos.fromDay === v.datos.toDay ? prettyDay(v.datos.fromDay) : prettyDay(v.datos.fromDay) + " al " + prettyDay(v.datos.toDay);
    const horas = v.datos.fromTime ? " (" + v.datos.fromTime + (v.datos.toTime ? " a " + v.datos.toTime : "") + ")" : "";
    await avisarAlAdministrador(s.user, {
      asunto: "Novedad de " + s.staff.name + ": " + etiquetaNovedad(v.datos.kind),
      texto: s.staff.name + " avisó: " + etiquetaNovedad(v.datos.kind) + " — " + dias + horas + ".\nMotivo: " + v.datos.reason,
      ruta: "/panel/novedades",
    });
  }

  return { ok: true, datos: { id: novedad.id, repetido: false } };
}
