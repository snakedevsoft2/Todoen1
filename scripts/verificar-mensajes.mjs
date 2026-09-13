/**
 * Comprueba los mensajes y recordatorios automaticos del CRM, en un navegador.
 *
 * WhatsApp (Meta) se reemplaza por un servidor de mentira que levanta este
 * script: la prueba no le escribe a nadie.
 *
 * Lo que se prueba: mandar ya un recordatorio desde la ficha (sale con la
 * plantilla), programarlo para mañana y cancelarlo, que sin envio automatico
 * quede para mandar a mano con un toque, programar para un segmento entero, y
 * que la direccion del cron pida la clave.
 *
 * Antes:
 *   npm run build
 *   WHATSAPP_GRAPH_URL=http://localhost:3999/whatsapp/ CRON_SECRET=cron-123 TZ=UTC npm start
 * Despues: npm run verificar:mensajes
 */
import "dotenv/config";
import http from "node:http";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const BASE = "http://localhost:3000";
const DIR = process.env.SHOT;
const db = new PrismaClient();
let fallos = 0;
const ok = (c, t, extra = "") => {
  if (c) console.log("  OK   " + t);
  else {
    fallos++;
    console.log("  MAL  " + t + (extra ? "  <- " + extra : ""));
  }
};
const esperarHasta = async (fn, ms = 20000) => {
  const fin = Date.now() + ms;
  let v = await fn();
  while (!v && Date.now() < fin) {
    await new Promise((r) => setTimeout(r, 500));
    v = await fn();
  }
  return v;
};

const envios = [];
const falso = http.createServer((req, res) => {
  let cuerpo = "";
  req.on("data", (c) => (cuerpo += c));
  req.on("end", () => {
    envios.push({ url: req.url, body: JSON.parse(cuerpo || "{}") });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ messages: [{ id: "wamid.prueba" }] }));
  });
});
await new Promise((r) => falso.listen(3999, r));

const S = "msj-" + Date.now();
const cuenta = await db.user.create({
  data: {
    email: "msj-" + S + "@test.local",
    passwordHash: bcrypt.hashSync("demo1234", 10),
    ownerName: "Duena Mensajes",
    businessName: "Boutique " + S,
    businessType: "ROPA",
    slug: "boutique-" + S,
    whatsappNumber: "573000000000",
    whatsappProvider: "meta",
    whatsappApiKey: "token-de-mentira",
    whatsappPhoneId: "pnid-" + S,
    whatsappTemplate: "mensaje_cliente",
    notifyOnBooking: false,
    staff: { create: { name: "Duena Mensajes", role: "DUENO", onboardingDoneAt: new Date(), tourDoneAt: new Date() } },
  },
});
const ana = await db.customer.create({ data: { userId: cuenta.id, name: "Ana Gómez", phone: "3001112233" } });
const carla = await db.customer.create({ data: { userId: cuenta.id, name: "Carla Ruiz", phone: "3004445566" } });
const vip = await db.customerTag.create({ data: { userId: cuenta.id, name: "VIP" } });
await db.customerTagLink.createMany({
  data: [
    { customerId: ana.id, tagId: vip.id, userId: cuenta.id },
    { customerId: carla.id, tagId: vip.id, userId: cuenta.id },
  ],
});

const errores = [];
const browser = await chromium.launch({ channel: "msedge" });

try {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errores.push("pageerror: " + e.message));
  page.on("response", (r) => r.status() >= 500 && errores.push(r.status() + " " + r.url()));
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', cuenta.email);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel/, { timeout: 25000 });

  console.log("\n1. Recordatorio ahora desde la ficha");
  await page.goto(BASE + "/panel/clientes/" + ana.id, { waitUntil: "networkidle" });
  const caja = page.locator("[data-programar-mensaje]");
  await caja.getByRole("button", { name: "Recordatorio de pago" }).click();
  await caja.getByRole("button", { name: "Enviar ahora" }).click();
  const salio = await esperarHasta(() => envios.find((e) => e.body.to === "573001112233"));
  ok(Boolean(salio), "le llega a Meta");
  ok(salio?.body.type === "template" && salio?.body.template?.name === "mensaje_cliente", "con la plantilla aprobada");
  const params = salio?.body.template?.components?.[0]?.parameters?.map((p) => p.text) ?? [];
  ok(params[0] === "Ana" && /Hola Ana, te recordamos que tienes un pago pendiente con Boutique/.test(params[1] ?? ""), "con el nombre y el texto llenos", JSON.stringify(params));
  await page.reload({ waitUntil: "networkidle" });
  ok((await page.locator("[data-mensajes-cliente]").getByText("Enviado", { exact: true }).count()) === 1, "la ficha lo muestra enviado");
  ok((await page.getByText(/Mensaje automático: Hola Ana/).count()) > 0, "y queda en el historial del cliente");

  console.log("\n2. Programar para mañana y cancelar");
  await caja.getByRole("button", { name: "Seguimiento" }).click();
  await caja.getByRole("button", { name: /Mañana 9/ }).click();
  await caja.getByRole("button", { name: "Programar", exact: true }).click();
  const programado = await esperarHasta(() => db.scheduledMessage.findFirst({ where: { customerId: ana.id, status: "PENDIENTE" } }));
  ok(Boolean(programado), "queda programado");
  const horaBogota = programado ? new Date(programado.sendAt.getTime() - 5 * 3600000).toISOString().slice(11, 16) : "";
  ok(horaBogota === "09:00", "para las 9 de la mañana en la hora del negocio", horaBogota);
  await page.goto(BASE + "/panel/clientes/mensajes", { waitUntil: "networkidle" });
  ok((await page.locator("[data-mensajes-programados]").getByText("Ana Gómez").count()) === 1, "aparece en Mensajes › Programados");
  await page.locator("[data-mensajes-programados]").getByRole("button", { name: "Cancelar" }).click();
  ok(Boolean(await esperarHasta(() => db.scheduledMessage.findUnique({ where: { id: programado.id } }).then((m) => m.status === "CANCELADO"))), "se cancela");

  console.log("\n3. Sin envío automático queda para mandar a mano");
  await db.user.update({ where: { id: cuenta.id }, data: { whatsappProvider: "enlace" } });
  await page.goto(BASE + "/panel/clientes/" + carla.id, { waitUntil: "networkidle" });
  ok((await page.getByText(/quedará listo para mandarlo con un toque/).count()) > 0, "la ficha avisa que no saldrá solo");
  await page.locator("[data-programar-mensaje] textarea").fill("Hola {nombre}, llegó tu pedido.");
  await page.locator("[data-programar-mensaje]").getByRole("button", { name: "Enviar ahora" }).click();
  const manual = await esperarHasta(() => db.scheduledMessage.findFirst({ where: { customerId: carla.id, status: "MANUAL" } }));
  ok(Boolean(manual), "queda para enviar a mano");
  await page.goto(BASE + "/panel/clientes/mensajes", { waitUntil: "networkidle" });
  const boton = page.locator("[data-mensajes-a-mano]").getByRole("link", { name: "Enviar" });
  const href = await boton.getAttribute("href");
  ok(/wa\.me\/573004445566/.test(href ?? "") && decodeURIComponent(href ?? "").includes("Hola Carla, llegó tu pedido."), "con el WhatsApp listo", href);
  const [popup] = await Promise.all([ctx.waitForEvent("page"), boton.click()]);
  await popup.close();
  ok(Boolean(await esperarHasta(() => db.scheduledMessage.findUnique({ where: { id: manual.id } }).then((m) => m.status === "ENVIADO" && m.via === "enlace"))), "al tocarlo queda enviado");
  if (DIR) await page.screenshot({ path: DIR + "/mensajes.png", fullPage: true });

  console.log("\n4. Programar para todo un segmento");
  await db.user.update({ where: { id: cuenta.id }, data: { whatsappProvider: "meta" } });
  await page.goto(BASE + "/panel/clientes/segmentos?t=" + vip.id, { waitUntil: "networkidle" });
  await page.locator("[data-programar-segmento] summary").click();
  await page.locator("[data-programar-segmento]").getByRole("button", { name: "En una semana" }).click();
  await page.locator("[data-programar-segmento]").getByRole("button", { name: "Programar para 2" }).click();
  await page.getByText(/Programado para 2 clientes/).waitFor({ timeout: 10000 }).catch(() => {});
  const lote = await db.scheduledMessage.findMany({ where: { userId: cuenta.id, status: "PENDIENTE", batchId: { not: null } } });
  ok(lote.length === 2 && new Set(lote.map((m) => m.batchId)).size === 1, "crea un mensaje por cliente, en un mismo lote", String(lote.length));

  console.log("\n5. La direccion del cron");
  const sin = await page.request.get(BASE + "/api/crm/envios");
  ok(sin.status() === 401, "sin clave no deja", String(sin.status()));
  const con = await page.request.get(BASE + "/api/crm/envios", { headers: { Authorization: "Bearer cron-123" } });
  ok(con.status() === 200 && "enviados" in (await con.json()), "con la clave corre el envío");

  console.log("\n6. Errores durante el recorrido");
  ok(errores.length === 0, "ninguna excepción ni error 500", errores.slice(0, 3).join(" | "));
  await ctx.close();
} finally {
  await browser.close();
  falso.close();
  await db.user.delete({ where: { id: cuenta.id } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
