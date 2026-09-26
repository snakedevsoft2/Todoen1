import type { NegocioSinImagenes } from "./auth";
import { db } from "./db";
import { todayIn } from "./dates";
import { money } from "./format";
import { isProvider, normalizePhone, sendWhatsapp } from "./whatsapp";
import { anotarCliente, type Origen } from "./clientes";
import { llaveTelefono } from "./crm";
import { emparejarProductos, resumenPedido, totalPedido } from "./agente-reglas";

/**
 * Lo que el agente hace de verdad en la aplicacion, fuera de la agenda.
 *
 * Todo pasa por aqui con validaciones propias: lo que llega viene de un modelo
 * de lenguaje que a su vez leyo lo que escribio un desconocido. Se trata como
 * se trata un formulario publico.
 */

export type Resultado = {
  /** Lo que se le devuelve al modelo para que le conteste al cliente. */
  respuesta: Record<string, unknown>;
  /** Lo que se le muestra al dueño que hizo el agente, si hizo algo. */
  accion?: string;
  customerId?: string | null;
};

/** Los negocios cuyo pedido tambien abre una cuenta en Cuentas abiertas. */
const ABREN_CUENTA = new Set(["RESTAURANTE", "COMIDAS_RAPIDAS"]);

const texto = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

/**
 * Le avisa al dueño por WhatsApp, igual que cuando alguien separa un turno.
 * Nunca lanza.
 */
async function avisarAlDueno(shop: NegocioSinImagenes, mensaje: string) {
  const destino = normalizePhone(shop.whatsappNumber);
  if (!shop.notifyOnBooking || !destino) return;
  const provider = isProvider(shop.whatsappProvider) ? shop.whatsappProvider : "enlace";
  try {
    const r = await sendWhatsapp({
      provider,
      to: destino,
      message: mensaje,
      apiKey: shop.whatsappApiKey,
      phoneId: shop.whatsappPhoneId,
    });
    await db.notification.create({
      data: { userId: shop.id, provider, toNumber: destino, message: mensaje, status: r.status, detail: r.detail },
    });
  } catch {
    // El pedido ya quedo guardado; el aviso es un extra.
  }
}

export async function registrarPedido(
  shop: NegocioSinImagenes,
  input: Record<string, unknown>,
  opciones: { origen: Origen; prueba: boolean }
): Promise<Resultado> {
  const error = (e: string, extra: Record<string, unknown> = {}): Resultado => ({
    respuesta: { ok: false, error: e, ...extra },
  });

  const nombre = texto(input.nombre, 80);
  if (nombre.length < 2) return error("Falta el nombre del cliente.");
  const telefono = texto(input.telefono, 40);
  if (!llaveTelefono(telefono)) return error("Falta un teléfono válido del cliente.");
  if (!Array.isArray(input.productos) || input.productos.length === 0) {
    return error("El pedido no tiene productos.");
  }

  const catalogo = await db.service.findMany({
    where: { userId: shop.id, active: true, showcase: true },
    select: { id: true, name: true, price: true },
  });
  const { lineas, faltan, dudosos } = emparejarProductos(input.productos as { nombre: unknown; cantidad: unknown }[], catalogo);
  if (faltan.length > 0 || dudosos.length > 0 || lineas.length === 0) {
    return error("Hay productos que no están en el catálogo o no son claros. Pregúntale al cliente.", {
      no_encontrados: faltan,
      dudosos,
    });
  }

  const domicilio = /domicilio/i.test(texto(input.entrega, 20));
  const direccion = texto(input.direccion, 200);
  if (domicilio && !direccion) return error("Falta la dirección para el domicilio.");
  const notas = texto(input.notas, 300);

  const total = totalPedido(lineas);
  const resumen = resumenPedido(lineas);
  const entrega = domicilio ? "Domicilio a " + direccion : "Para recoger";

  if (opciones.prueba) {
    return {
      respuesta: { ok: true, prueba: true, resumen, total: money(total, shop.currency), entrega },
      accion: "(Prueba) Pedido: " + resumen + " · " + money(total, shop.currency),
    };
  }

  const customerId = await anotarCliente(shop.id, { name: nombre, phone: telefono, source: opciones.origen });
  const hoy = todayIn(shop.timezone);
  const detalle = [resumen, entrega, "Tel: " + telefono, notas ? "Notas: " + notas : ""].filter(Boolean).join("\n");

  if (customerId) {
    const deal = await db.deal.create({
      data: {
        userId: shop.id,
        customerId,
        title: ("Pedido por chat: " + resumen).slice(0, 200),
        value: total,
        stage: "NUEVO",
      },
    });
    await db.followUp.create({
      data: { userId: shop.id, customerId, dealId: deal.id, title: "Confirmar pedido de " + nombre, dueDay: hoy },
    });
    await db.interaction.create({
      data: { userId: shop.id, customerId, kind: "CHAT", text: "Pedido tomado por el agente:\n" + detalle, staffName: "Agente IA" },
    });
    await db.customer.update({ where: { id: customerId }, data: { lastContactAt: new Date() } });
  }

  if (ABREN_CUENTA.has(shop.businessType)) {
    await db.order.create({
      data: {
        userId: shop.id,
        label: ("Chat · " + nombre).slice(0, 60),
        day: hoy,
        notes: detalle.slice(0, 500),
        items: {
          create: lineas.map((l) => ({
            userId: shop.id,
            serviceId: l.serviceId,
            name: l.name,
            unitPrice: l.unitPrice,
            qty: l.qty,
          })),
        },
      },
    });
  }

  await avisarAlDueno(
    shop,
    "Nuevo pedido por el chat de " + shop.businessName + "\n" + nombre + "\n" + detalle + "\nTotal: " + money(total, shop.currency)
  );

  return {
    respuesta: { ok: true, resumen, total: money(total, shop.currency), entrega, siguiente: "El negocio lo confirma pronto." },
    accion: "Pedido registrado: " + resumen + " · " + money(total, shop.currency),
    customerId,
  };
}

export async function dejarRecado(
  shop: NegocioSinImagenes,
  input: Record<string, unknown>,
  opciones: { origen: Origen; prueba: boolean }
): Promise<Resultado> {
  const nombre = texto(input.nombre, 80);
  const mensaje = texto(input.mensaje, 500);
  if (nombre.length < 2 || !mensaje) {
    return { respuesta: { ok: false, error: "Hacen falta el nombre del cliente y el recado." } };
  }
  const telefono = texto(input.telefono, 40);

  if (opciones.prueba) {
    return { respuesta: { ok: true, prueba: true }, accion: "(Prueba) Recado: " + mensaje.slice(0, 120) };
  }

  const customerId = llaveTelefono(telefono)
    ? await anotarCliente(shop.id, { name: nombre, phone: telefono, source: opciones.origen })
    : null;

  await db.followUp.create({
    data: {
      userId: shop.id,
      customerId,
      title: ("Responder a " + nombre + ": " + mensaje).slice(0, 200),
      dueDay: todayIn(shop.timezone),
    },
  });
  if (customerId) {
    await db.interaction.create({
      data: { userId: shop.id, customerId, kind: "CHAT", text: "Recado dejado con el agente:\n" + mensaje, staffName: "Agente IA" },
    });
  }

  return {
    respuesta: { ok: true, siguiente: "Una persona del negocio le responde pronto." },
    accion: "Recado para el negocio: " + mensaje.slice(0, 120),
    customerId,
  };
}
