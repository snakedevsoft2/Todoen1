import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { enviarProgramados, fechaDeEnvio, programarMensaje } from "../src/lib/envios-crm";

/**
 * Mensajes y recordatorios automaticos a los clientes.
 *
 * WhatsApp y el correo se reemplazan por un fetch de mentira. Lo que se fija:
 * el orden de los canales, que Meta reciba plantilla cuando hace falta, que
 * lo que no sale solo quede para enviar a mano, que nunca salga dos veces y
 * que no se le programe a clientes de otro negocio.
 */
const db = new PrismaClient();
const S = "msj-" + Date.now();

type Llamada = { url: string; body: Record<string, unknown> };
function redFalsa(ok = true) {
  const llamadas: Llamada[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    llamadas.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(ok ? JSON.stringify({ messages: [{ id: "x" }], id: "mail" }) : "error", { status: ok ? 200 : 500 });
  });
  vi.stubGlobal("fetch", fn);
  return { fn, llamadas };
}

async function negocio(nombre: string, extra: Record<string, unknown> = {}) {
  return db.user.create({
    data: {
      email: nombre + "-" + S + "@test.local",
      passwordHash: "x",
      ownerName: nombre,
      businessName: "Tienda " + nombre,
      businessType: "ROPA",
      slug: nombre + "-" + S,
      whatsappNumber: "573000000000",
      staff: { create: { name: "Dueña " + nombre, role: "DUENO" } },
      ...extra,
    },
    include: { staff: true },
  });
}

let meta: Awaited<ReturnType<typeof negocio>>;
let enlace: Awaited<ReturnType<typeof negocio>>;
const sesion = (u: typeof meta) => ({ user: u, staff: u.staff[0] });

beforeAll(async () => {
  process.env.WHATSAPP_GRAPH_URL = "http://graph.prueba/";
  meta = await negocio("meta", {
    whatsappProvider: "meta",
    whatsappApiKey: "token",
    whatsappPhoneId: "pnid",
    whatsappTemplate: "mensaje_cliente",
  });
  enlace = await negocio("enlace");
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_BASE_URL;
});

afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: [meta.id, enlace.id] } } });
  await db.$disconnect();
});

describe("mensajes programados", () => {
  it("convierte la hora del negocio a la hora real", () => {
    expect(fechaDeEnvio("2026-09-14T09:00", "America/Bogota")?.toISOString()).toBe("2026-09-14T14:00:00.000Z");
    expect(fechaDeEnvio("2026-02-30T09:00", "America/Bogota")).toBeNull();
    expect(fechaDeEnvio("ayer", "America/Bogota")).toBeNull();
  });

  it("sale por WhatsApp con la plantilla cuando el cliente no ha escrito", async () => {
    const ana = await db.customer.create({ data: { userId: meta.id, name: "Ana María", phone: "3001112233" } });
    const r = await programarMensaje(sesion(meta), { customerIds: [ana.id], text: "Hola {nombre}, pagas hoy en {negocio}.", channel: "auto", cuando: "ahora" });
    expect(r.ok && r.datos.inmediato).toBe(true);

    const { llamadas } = redFalsa();
    const res = await enviarProgramados({ userId: meta.id });
    expect(res.enviados).toBe(1);
    expect(llamadas[0].url).toBe("http://graph.prueba/pnid/messages");
    const tpl = llamadas[0].body.template as { name: string; components: { parameters: { text: string }[] }[] };
    expect(llamadas[0].body.type).toBe("template");
    expect(tpl.name).toBe("mensaje_cliente");
    expect(tpl.components[0].parameters.map((p) => p.text)).toEqual(["Ana", "Hola Ana, pagas hoy en Tienda meta."]);

    const m = await db.scheduledMessage.findFirstOrThrow({ where: { customerId: ana.id } });
    expect(m.status).toBe("ENVIADO");
    expect(m.via).toBe("whatsapp");
    expect(await db.interaction.count({ where: { customerId: ana.id, kind: "WHATSAPP" } })).toBe(1);
  });

  it("si el cliente escribio hace poco, sale como texto normal", async () => {
    const beto = await db.customer.create({ data: { userId: meta.id, name: "Beto", phone: "3004445566" } });
    await db.agentConversation.create({ data: { userId: meta.id, channel: "whatsapp", contactKey: "573004445566", lastMessageAt: new Date() } });
    await programarMensaje(sesion(meta), { customerIds: [beto.id], text: "Hola {nombre}", channel: "auto", cuando: "ahora" });
    const { llamadas } = redFalsa();
    await enviarProgramados({ userId: meta.id });
    expect(llamadas[0].body.type).toBe("text");
    expect((llamadas[0].body.text as { body: string }).body).toBe("Hola Beto");
  });

  it("sin WhatsApp automatico sale por correo, y si no, queda para mandar a mano", async () => {
    process.env.RESEND_API_KEY = "re_prueba";
    process.env.RESEND_BASE_URL = "http://correo.prueba/emails";
    const conCorreo = await db.customer.create({ data: { userId: enlace.id, name: "Carla", email: "carla@correo.test", phone: "3007778899" } });
    const soloTel = await db.customer.create({ data: { userId: enlace.id, name: "Dario", phone: "3001231234" } });
    const nada = await db.customer.create({ data: { userId: enlace.id, name: "Eva" } });
    await programarMensaje(sesion(enlace), { customerIds: [conCorreo.id, soloTel.id, nada.id], text: "Promo para {nombre}", channel: "auto", cuando: "ahora" });

    const { llamadas } = redFalsa();
    const res = await enviarProgramados({ userId: enlace.id });
    expect(res).toEqual({ enviados: 1, fallidos: 1, manuales: 1 });
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].url).toBe("http://correo.prueba/emails");
    expect((await db.scheduledMessage.findFirstOrThrow({ where: { customerId: conCorreo.id } })).via).toBe("correo");
    expect((await db.scheduledMessage.findFirstOrThrow({ where: { customerId: soloTel.id } })).status).toBe("MANUAL");
    expect((await db.scheduledMessage.findFirstOrThrow({ where: { customerId: nada.id } })).status).toBe("FALLIDO");
  });

  it("nunca sale dos veces aunque dos envios corran a la vez", async () => {
    const fer = await db.customer.create({ data: { userId: meta.id, name: "Fer", phone: "3009990001" } });
    await programarMensaje(sesion(meta), { customerIds: [fer.id], text: "Una sola vez", channel: "whatsapp", cuando: "ahora" });
    const { fn } = redFalsa();
    await Promise.all([enviarProgramados({ userId: meta.id }), enviarProgramados({ userId: meta.id }), enviarProgramados()]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("lo programado para despues no sale antes", async () => {
    const gabi = await db.customer.create({ data: { userId: meta.id, name: "Gabi", phone: "3009990002" } });
    const r = await programarMensaje(sesion(meta), { customerIds: [gabi.id], text: "Mañana", channel: "auto", cuando: "2099-01-01T09:00" });
    expect(r.ok).toBe(false);
    const r2 = await programarMensaje(sesion(meta), {
      customerIds: [gabi.id],
      text: "La otra semana",
      channel: "auto",
      cuando: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10) + "T09:00",
    });
    expect(r2.ok && !r2.datos.inmediato).toBe(true);
    const { fn } = redFalsa();
    await enviarProgramados({ userId: meta.id });
    expect(fn).not.toHaveBeenCalled();
  });

  it("no programa mensajes a clientes de otro negocio", async () => {
    const ajeno = await db.customer.create({ data: { userId: enlace.id, name: "Ajeno", phone: "3009990003" } });
    const r = await programarMensaje(sesion(meta), { customerIds: [ajeno.id], text: "Hola", channel: "auto", cuando: "ahora" });
    expect(r.ok).toBe(false);
    expect(await db.scheduledMessage.count({ where: { customerId: ajeno.id } })).toBe(0);
  });
});
