import webpush from "web-push";
import { db } from "./db";
import { money } from "./format";

/**
 * Notificaciones push: las que le llegan al celular aunque la app este cerrada.
 *
 * Quien recibe que:
 *   - el dueño: todo lo del negocio (cada venta nueva, cada marcaje);
 *   - cada empleado: solo lo suyo (el carro que le asignaron, el recordatorio
 *     de marcar entrada o salida).
 *
 * Nunca lanza: si el envio falla, la venta o el marcaje ya quedaron guardados
 * y eso es lo que importa. Las suscripciones que el navegador da por muertas
 * (404/410) se borran para no seguir intentando.
 *
 * Necesita NEXT_PUBLIC_VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY (se generan una vez
 * con `npx web-push generate-vapid-keys`). Sin ellas no manda nada.
 */

export type AvisoPush = {
  title: string;
  body: string;
  /** A donde lleva al tocarla. */
  url?: string;
  /** Avisos con la misma etiqueta se reemplazan en vez de amontonarse. */
  tag?: string;
};

let configurado: boolean | null = null;

export function pushConfigurado(): boolean {
  if (configurado !== null) return configurado;
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  if (!publica || !privada) return (configurado = false);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:soporte@todoen1.app", publica, privada);
  return (configurado = true);
}

async function mandar(where: { staffId?: { in: string[] } | string; userId: string }, aviso: AvisoPush) {
  if (!pushConfigurado()) return 0;
  // A quien desactivaron no le sigue llegando lo del negocio.
  const subs = await db.pushSubscription.findMany({ where: { ...where, staff: { active: true } } });
  if (subs.length === 0) return 0;

  const payload = JSON.stringify({ url: "/panel", ...aviso });
  let enviados = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          TTL: 60 * 60 * 12,
        });
        enviados++;
      } catch (error) {
        const codigo = (error as { statusCode?: number }).statusCode;
        if (codigo === 404 || codigo === 410) {
          await db.pushSubscription.deleteMany({ where: { id: s.id } });
        } else {
          console.error("No se pudo mandar la notificación:", codigo ?? error);
        }
      }
    })
  );
  return enviados;
}

/** A una persona del equipo (solo lo suyo). */
export async function avisarAPersona(userId: string, staffId: string, aviso: AvisoPush) {
  try {
    return await mandar({ userId, staffId }, aviso);
  } catch (error) {
    console.error("Aviso push fallido:", error);
    return 0;
  }
}

/** Al dueño (o dueños) del negocio: lo que pasa en todo el negocio. */
export async function avisarAlDueno(userId: string, aviso: AvisoPush) {
  try {
    const duenos = await db.staff.findMany({ where: { userId, role: "DUENO" }, select: { id: true } });
    if (duenos.length === 0) return 0;
    return await mandar({ userId, staffId: { in: duenos.map((d) => d.id) } }, aviso);
  } catch (error) {
    console.error("Aviso push fallido:", error);
    return 0;
  }
}

/** Venta nueva, para el dueño: todas, tambien las que registro el mismo. */
export async function avisarVenta(
  user: { id: string; currency: string },
  venta: { total: number; detalle?: string | null; quien?: { name: string } | null }
) {
  return avisarAlDueno(user.id, {
    title: "Venta nueva · " + money(venta.total, user.currency),
    body: [venta.detalle, venta.quien ? "Registró " + venta.quien.name : null].filter(Boolean).join(" · ") || "Se registró una venta.",
    url: "/panel/ventas",
  });
}

/** Alguien marco entrada o salida, para el dueño. */
export async function avisarMarcaje(
  user: { id: string; timezone: string },
  marcaje: { nombre: string; kind: "ENTRADA" | "SALIDA"; markedAt: Date; sitio?: string | null }
) {
  const hora = marcaje.markedAt.toLocaleTimeString("es-CO", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: user.timezone,
  });
  return avisarAlDueno(user.id, {
    title: marcaje.nombre + (marcaje.kind === "ENTRADA" ? " marcó entrada" : " marcó salida"),
    body: hora + (marcaje.sitio ? " · " + marcaje.sitio : ""),
    url: "/panel/planilla",
    tag: "marcaje-" + marcaje.nombre,
  });
}

/** Resume los productos de la venta: "2x Lavado, 1x Aromatizante". */
function resumenItems(items: { name: string; qty: number }[]) {
  const texto = items.map((i) => i.qty + "x " + i.name).join(", ");
  return texto.length > 80 ? texto.slice(0, 77) + "..." : texto;
}

/**
 * Avisa una venta ya guardada, leyendola de la base: sirve para cualquier
 * camino (mostrador, cuenta, turno, lavado, abono). Una venta "en pendientes"
 * (a credito) se guarda como deuda y se avisa igual, diciendo que no se pagó.
 */
export async function avisarVentaGuardada(
  user: { id: string; currency: string },
  guardada: { tipo: "venta" | "deuda"; id: string },
  quien?: { name: string } | null
) {
  try {
    if (guardada.tipo === "deuda") {
      const deuda = await db.debt.findFirst({ where: { id: guardada.id, userId: user.id }, select: { amount: true, concept: true, clientName: true } });
      if (!deuda) return 0;
      return avisarAlDueno(user.id, {
        title: "Venta en pendientes · " + money(deuda.amount, user.currency),
        body: [deuda.concept, deuda.clientName, quien ? "Registró " + quien.name : null].filter(Boolean).join(" · "),
        url: "/panel/ventas",
      });
    }
    const venta = await db.sale.findFirst({
      where: { id: guardada.id, userId: user.id },
      select: { total: true, clientName: true, items: { select: { name: true, qty: true } } },
    });
    if (!venta) return 0;
    return avisarVenta(user, {
      total: venta.total,
      detalle: [resumenItems(venta.items), venta.clientName].filter(Boolean).join(" · "),
      quien,
    });
  } catch (error) {
    console.error("Aviso push fallido:", error);
    return 0;
  }
}
