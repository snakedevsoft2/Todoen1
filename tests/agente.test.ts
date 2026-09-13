import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  emparejarProductos,
  esLlaveWeb,
  limpiarMensaje,
  MAX_POR_CONVERSACION_DIA,
  normalizarHora,
  resumenPedido,
  totalPedido,
} from "../src/lib/agente-reglas";
import { extraerMensajes, firmaValida } from "../src/lib/whatsapp-entrante";
import { horariosLibres, reservarTurno } from "../src/lib/reservas";
import { responderAgente } from "../src/lib/agente";
import { addDays, todayIn } from "../src/lib/dates";

/**
 * El agente que contesta solo.
 *
 * El modelo se reemplaza por respuestas fijas: lo que se prueba no es que el
 * modelo sea listo, sino que lo que pida pase por las mismas validaciones que
 * un formulario, que no se salte los topes y que nada toque otro negocio.
 */
const db = new PrismaClient();
const S = "agente-" + Date.now();

type Parte = Record<string, unknown>;
/** Un modelo de mentira que responde lo que se le diga, en orden. */
function modeloFalso(respuestas: Parte[][]) {
  const pedidos: { contents: { role: string; parts: Parte[] }[] }[] = [];
  const fn = vi.fn(async (_url: string, init?: RequestInit) => {
    pedidos.push(JSON.parse(String(init?.body ?? "{}")));
    const parts = respuestas.shift() ?? [{ text: "Listo." }];
    return new Response(JSON.stringify({ candidates: [{ content: { parts } }] }), { status: 200 });
  });
  vi.stubGlobal("fetch", fn);
  return { fn, pedidos };
}

async function negocio(tipo: "ROPA" | "BARBERIA", nombre: string) {
  return db.user.create({
    data: {
      email: nombre + "-" + S + "@test.local",
      passwordHash: "x",
      ownerName: nombre,
      businessName: "Negocio " + nombre,
      businessType: tipo,
      slug: nombre + "-" + S,
      workDays: "1,2,3,4,5,6,7",
      openHour: 8,
      closeHour: 12,
      slotMinutes: 60,
      notifyOnBooking: false,
      staff: { create: { name: "Dueño " + nombre, role: "DUENO", bookable: true } },
    },
  });
}

let tienda: Awaited<ReturnType<typeof negocio>>;
let barberia: Awaited<ReturnType<typeof negocio>>;
let otra: Awaited<ReturnType<typeof negocio>>;

beforeAll(async () => {
  process.env.GEMINI_API_KEY = "prueba";
  tienda = await negocio("ROPA", "tienda");
  barberia = await negocio("BARBERIA", "barberia");
  otra = await negocio("BARBERIA", "otra");
  await db.service.createMany({
    data: [
      { userId: tienda.id, name: "Camisa Oxford", price: 65000 },
      { userId: tienda.id, name: "Jean Clásico", price: 90000 },
      { userId: tienda.id, name: "Jean Slim", price: 95000 },
      { userId: barberia.id, name: "Corte clásico", price: 20000, durationMin: 60 },
    ],
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: [tienda.id, barberia.id, otra.id] } } });
  await db.$disconnect();
});

describe("reglas", () => {
  it("entiende las horas como las dice la gente", () => {
    expect(normalizarHora("15:00")).toBe("15:00");
    expect(normalizarHora("3:00 p.m.")).toBe("15:00");
    expect(normalizarHora("3 pm")).toBe("15:00");
    expect(normalizarHora("12 am")).toBe("00:00");
    expect(normalizarHora("12:30 p. m.")).toBe("12:30");
    expect(normalizarHora("25:00")).toBeNull();
    expect(normalizarHora("13 pm")).toBeNull();
    expect(normalizarHora("mañana")).toBeNull();
  });

  it("empareja productos sin adivinar cuando hay dos parecidos", () => {
    const catalogo = [
      { id: "1", name: "Camisa Oxford", price: 65000 },
      { id: "2", name: "Jean Clásico", price: 90000 },
      { id: "3", name: "Jean Slim", price: 95000 },
    ];
    const r = emparejarProductos(
      [
        { nombre: "camisa oxford", cantidad: 2 },
        { nombre: "CAMISA", cantidad: "1" },
        { nombre: "jean", cantidad: 1 },
        { nombre: "zapatos", cantidad: 1 },
        { nombre: "jean clasico", cantidad: 500 },
      ],
      catalogo
    );
    expect(r.lineas).toEqual([
      { serviceId: "1", name: "Camisa Oxford", unitPrice: 65000, qty: 3 },
      { serviceId: "2", name: "Jean Clásico", unitPrice: 90000, qty: 99 },
    ]);
    expect(r.faltan).toEqual(["zapatos"]);
    expect(r.dudosos[0].opciones).toEqual(["Jean Clásico", "Jean Slim"]);
    expect(totalPedido(r.lineas)).toBe(65000 * 3 + 90000 * 99);
    expect(resumenPedido(r.lineas)).toBe("3 × Camisa Oxford, 99 × Jean Clásico");
  });

  it("limpia el mensaje y valida la llave del navegador", () => {
    expect(limpiarMensaje("  hola" + String.fromCharCode(0) + "\nmundo  ")).toBe("hola\nmundo");
    expect(limpiarMensaje("x".repeat(5000))).toHaveLength(600);
    expect(esLlaveWeb("a".repeat(32))).toBe(true);
    expect(esLlaveWeb("corta")).toBe(false);
    expect(esLlaveWeb("../../etc/passwd-aaaaaaaaaaaa")).toBe(false);
  });
});

describe("mensajes de WhatsApp", () => {
  const cuerpo = JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: "PNID1" },
              contacts: [{ wa_id: "573001112233", profile: { name: "Ana" } }],
              messages: [
                { from: "573001112233", id: "wamid.1", type: "text", text: { body: "Hola" } },
                { from: "573001112233", id: "wamid.2", type: "image" },
              ],
            },
          },
          { value: { metadata: { phone_number_id: "PNID1" }, statuses: [{ id: "wamid.0" }] } },
        ],
      },
    ],
  });

  it("solo acepta avisos firmados por Meta", () => {
    const firma = "sha256=" + createHmac("sha256", "secreto").update(cuerpo).digest("hex");
    expect(firmaValida(cuerpo, firma, "secreto")).toBe(true);
    expect(firmaValida(cuerpo + " ", firma, "secreto")).toBe(false);
    expect(firmaValida(cuerpo, firma, "otro")).toBe(false);
    expect(firmaValida(cuerpo, null, "secreto")).toBe(false);
    expect(firmaValida(cuerpo, firma, "")).toBe(false);
    expect(firmaValida(cuerpo, "sha256=zz", "secreto")).toBe(false);
  });

  it("saca los mensajes e ignora las confirmaciones de entrega", () => {
    expect(extraerMensajes(JSON.parse(cuerpo))).toEqual([
      { phoneNumberId: "PNID1", from: "573001112233", id: "wamid.1", text: "Hola", name: "Ana" },
      { phoneNumberId: "PNID1", from: "573001112233", id: "wamid.2", text: null, name: "Ana" },
    ]);
    expect(extraerMensajes({ basura: true })).toEqual([]);
    expect(extraerMensajes(null)).toEqual([]);
  });
});

describe("reservas compartidas", () => {
  it("una hora tomada deja de estar libre y no se puede volver a tomar", async () => {
    const manana = addDays(todayIn(barberia.timezone), 1);
    const antes = await horariosLibres(barberia, manana);
    expect(antes.abierto).toBe(true);
    expect(antes.libres).toContain("09:00");

    const datos = { day: manana, startTime: "09:00", clientName: "Luis", clientPhone: "3001234567", wantsReminder: false };
    const uno = await reservarTurno(barberia, datos, "chat");
    expect(uno.ok).toBe(true);
    const dos = await reservarTurno(barberia, { ...datos, clientName: "Otro" }, "chat");
    expect(dos.ok).toBe(false);

    const despues = await horariosLibres(barberia, manana);
    expect(despues.libres).not.toContain("09:00");
    // El turno de una barberia no ocupa la agenda de otra.
    expect((await horariosLibres(otra, manana)).libres).toContain("09:00");
    // Y la reserva deja al cliente en el CRM.
    expect(await db.customer.count({ where: { userId: barberia.id, phoneKey: "3001234567" } })).toBe(1);
  });

  it("una tienda no separa turnos", async () => {
    const r = await reservarTurno(
      tienda,
      { day: addDays(todayIn(), 1), startTime: "09:00", clientName: "X", clientPhone: "3001234567", wantsReminder: false },
      "chat"
    );
    expect(r).toEqual({ ok: false, error: "Este negocio no recibe reservas por hora." });
  });
});

describe("responderAgente", () => {
  it("toma un pedido, lo deja en el CRM y guarda la conversacion", async () => {
    const { pedidos } = modeloFalso([
      [
        {
          functionCall: {
            name: "registrar_pedido",
            args: {
              nombre: "Ana Pérez",
              telefono: "300 111 2233",
              productos: [{ nombre: "camisa oxford", cantidad: 2 }],
              entrega: "recoger",
            },
          },
        },
      ],
      [{ text: "¡Listo Ana! Tu pedido de 2 camisas quedó registrado." }],
    ]);

    const r = await responderAgente({ shop: tienda, canal: "web", contactKey: "k".repeat(32), mensaje: "Confirmo 2 camisas" });
    expect(r).toEqual({ ok: true, texto: "¡Listo Ana! Tu pedido de 2 camisas quedó registrado." });

    // El modelo recibio el resultado de verdad, con el total calculado aqui.
    const devuelto = pedidos[1].contents.at(-1)!.parts[0] as { functionResponse: { response: { ok: boolean; total: string } } };
    expect(devuelto.functionResponse.response.ok).toBe(true);
    expect(devuelto.functionResponse.response.total).toContain("130.000");

    const ana = await db.customer.findFirst({ where: { userId: tienda.id, phoneKey: "3001112233" } });
    expect(ana?.source).toBe("chat");
    const deal = await db.deal.findFirst({ where: { userId: tienda.id, customerId: ana!.id } });
    expect(deal?.value).toBe(130000);
    expect(await db.followUp.count({ where: { userId: tienda.id, dealId: deal!.id } })).toBe(1);

    const msgs = await db.agentMessage.findMany({ where: { userId: tienda.id }, orderBy: { createdAt: "asc" } });
    expect(msgs.map((m) => m.role)).toEqual(["cliente", "agente"]);
    expect(msgs[1].action).toContain("Pedido registrado");
    const conv = await db.agentConversation.findFirst({ where: { userId: tienda.id, channel: "web" } });
    expect(conv?.customerId).toBe(ana!.id);
  });

  it("si el producto no existe, no inventa el pedido", async () => {
    modeloFalso([
      [{ functionCall: { name: "registrar_pedido", args: { nombre: "Ana", telefono: "3001112233", productos: [{ nombre: "zapatos", cantidad: 1 }], entrega: "recoger" } } }],
      [{ text: "No tenemos zapatos." }],
    ]);
    const antes = await db.deal.count({ where: { userId: tienda.id } });
    const r = await responderAgente({ shop: tienda, canal: "web", contactKey: "z".repeat(32), mensaje: "quiero zapatos" });
    expect(r.ok).toBe(true);
    expect(await db.deal.count({ where: { userId: tienda.id } })).toBe(antes);
  });

  it("agenda un turno en la barberia con la hora como la dijo el cliente", async () => {
    const pasado = addDays(todayIn(barberia.timezone), 2);
    modeloFalso([
      [{ functionCall: { name: "agendar_turno", args: { nombre: "Carlos", telefono: "3105556677", dia: pasado, hora: "10 am", servicio: "corte" } } }],
      [{ text: "Quedaste para las 10." }],
    ]);
    const r = await responderAgente({ shop: barberia, canal: "web", contactKey: "c".repeat(32), mensaje: "sí, confirmo" });
    expect(r.ok).toBe(true);
    const cita = await db.appointment.findFirst({ where: { userId: barberia.id, day: pasado, startTime: "10:00" } });
    expect(cita?.serviceName).toBe("Corte clásico");
    expect(cita?.clientName).toBe("Carlos");
  });

  it("la tienda no puede agendar turnos aunque el modelo lo pida", async () => {
    const { pedidos } = modeloFalso([
      [{ functionCall: { name: "agendar_turno", args: { nombre: "X", telefono: "3001112233", dia: addDays(todayIn(), 1), hora: "09:00" } } }],
      [{ text: "No puedo." }],
    ]);
    await responderAgente({ shop: tienda, canal: "web", contactKey: "t".repeat(32), mensaje: "agéndame" });
    const devuelto = pedidos[1].contents.at(-1)!.parts[0] as { functionResponse: { response: { ok: boolean } } };
    expect(devuelto.functionResponse.response.ok).toBe(false);
    expect(await db.appointment.count({ where: { userId: tienda.id } })).toBe(0);
  });

  it("en prueba no guarda nada de verdad", async () => {
    modeloFalso([
      [{ functionCall: { name: "registrar_pedido", args: { nombre: "Prueba", telefono: "3009990000", productos: [{ nombre: "Jean Slim", cantidad: 1 }], entrega: "recoger" } } }],
      [{ text: "Listo (prueba)." }],
    ]);
    const antes = await db.deal.count({ where: { userId: tienda.id } });
    await responderAgente({ shop: tienda, canal: "prueba", contactKey: "p".repeat(32), mensaje: "confirmo" });
    expect(await db.deal.count({ where: { userId: tienda.id } })).toBe(antes);
    expect(await db.customer.count({ where: { userId: tienda.id, phoneKey: "3009990000" } })).toBe(0);
  });

  it("no contesta dos veces el mismo mensaje de WhatsApp y anota al cliente", async () => {
    const { fn } = modeloFalso([[{ text: "Hola, ¿en qué te ayudo?" }]]);
    const datos = { shop: tienda, canal: "whatsapp" as const, contactKey: "573007778899", contactName: "Beto", mensaje: "hola", externalId: "wamid.X" + S };
    const uno = await responderAgente(datos);
    const dos = await responderAgente(datos);
    expect(uno).toEqual({ ok: true, texto: "Hola, ¿en qué te ayudo?" });
    expect(dos).toMatchObject({ ok: true, repetido: true });
    expect(fn).toHaveBeenCalledTimes(1);
    const beto = await db.customer.findFirst({ where: { userId: tienda.id, phoneKey: "3007778899" } });
    expect(beto?.name).toBe("Beto");
    expect(beto?.source).toBe("whatsapp");
  });

  it("respeta el tope por conversacion sin gastar consultas", async () => {
    const llave = "l".repeat(32);
    const conv = await db.agentConversation.create({ data: { userId: tienda.id, channel: "web", contactKey: llave } });
    await db.agentMessage.createMany({
      data: Array.from({ length: MAX_POR_CONVERSACION_DIA }, (_, i) => ({
        userId: tienda.id,
        conversationId: conv.id,
        role: "cliente",
        text: "spam " + i,
      })),
    });
    const { fn } = modeloFalso([]);
    const r = await responderAgente({ shop: tienda, canal: "web", contactKey: llave, mensaje: "otro más" });
    expect(r.ok && r.texto).toMatch(/muchos mensajes/);
    expect(fn).not.toHaveBeenCalled();
  });

  it("si el modelo falla, se disculpa en vez de dejar al cliente hablando solo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    const r = await responderAgente({ shop: tienda, canal: "web", contactKey: "f".repeat(32), mensaje: "hola" });
    expect(r.ok && r.texto).toMatch(/Disculpa/);
  });
});
