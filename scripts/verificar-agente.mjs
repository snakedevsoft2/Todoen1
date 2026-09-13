/**
 * Comprueba el agente de IA en un navegador, de punta a punta.
 *
 * El modelo y la API de Meta se reemplazan por un servidor de mentira que
 * levanta este mismo script: asi la prueba no gasta cuota, no depende de
 * internet y no le escribe a nadie por WhatsApp.
 *
 * Lo que se prueba: que el dueño lo prenda y le enseñe algo, que la prueba del
 * panel no guarde pedidos, que la burbuja de la pagina publica tome un pedido
 * de verdad que queda en Clientes, que el dueño vea la conversacion, que el
 * webhook de WhatsApp rechace lo no firmado y conteste lo firmado, y que en
 * celular el chat no se salga de la pantalla.
 *
 * Antes:
 *   npm run build
 *   GEMINI_API_KEY=prueba GEMINI_BASE_URL=http://localhost:3999/models/ \
 *   WHATSAPP_GRAPH_URL=http://localhost:3999/whatsapp/ \
 *   WHATSAPP_VERIFY_TOKEN=verif-123 WHATSAPP_APP_SECRET=secreto-123 npm start
 * Despues: npm run verificar:agente
 */
import "dotenv/config";
import http from "node:http";
import { createHmac } from "node:crypto";
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
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------ el servidor de mentira
const enviosWhatsapp = [];
const falso = http.createServer((req, res) => {
  let cuerpo = "";
  req.on("data", (c) => (cuerpo += c));
  req.on("end", () => {
    const json = (o) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(o));
    };
    if (req.url.startsWith("/whatsapp/")) {
      enviosWhatsapp.push({ url: req.url, body: JSON.parse(cuerpo || "{}") });
      return json({ messages: [{ id: "wamid.respuesta" }] });
    }
    const pedido = JSON.parse(cuerpo || "{}");
    const sistema = pedido.system_instruction?.parts?.[0]?.text ?? "";
    const ultimo = pedido.contents?.at(-1)?.parts ?? [];
    const texto = (t) => json({ candidates: [{ content: { parts: [{ text: t }] } }] });

    const resultado = ultimo.find((p) => p.functionResponse)?.functionResponse?.response;
    if (resultado) {
      return texto(resultado.ok ? "¡Listo! Tu pedido quedó registrado. Total " + resultado.total + "." : "No se pudo: " + resultado.error);
    }
    const dijo = ultimo.map((p) => p.text ?? "").join(" ");
    if (/confirmo/i.test(dijo)) {
      return json({
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: "registrar_pedido",
                    args: {
                      nombre: "Ana Chat",
                      telefono: "300 444 5566",
                      productos: [{ nombre: "camisa oxford", cantidad: 2 }],
                      entrega: "recoger",
                    },
                  },
                },
              ],
            },
          },
        ],
      });
    }
    // Deja ver si las instrucciones traen lo publicado y lo que enseño el dueño.
    const sabe = sistema.includes("Camisa Oxford") && sistema.includes("Nequi");
    return texto("Hola, tenemos Camisa Oxford. " + (sabe ? "[catalogo ok]" : "[sin datos]"));
  });
});
await new Promise((r) => falso.listen(3999, r));

// ------------------------------------------------------------- los datos
const S = "agente-" + Date.now();
const clave = bcrypt.hashSync("demo1234", 10);
const listo = { onboardingDoneAt: new Date(), tourDoneAt: new Date() };

const tienda = await db.user.create({
  data: {
    email: "tienda-" + S + "@test.local",
    passwordHash: clave,
    ownerName: "Duena Agente",
    businessName: "Boutique " + S,
    businessType: "ROPA",
    slug: "boutique-" + S,
    notifyOnBooking: false,
    staff: { create: { name: "Duena Agente", role: "DUENO", ...listo } },
    services: { create: { name: "Camisa Oxford", price: 65000 } },
  },
});
const conWhatsapp = await db.user.create({
  data: {
    email: "wa-" + S + "@test.local",
    passwordHash: clave,
    ownerName: "Dueno WA",
    businessName: "Tienda WA " + S,
    businessType: "ROPA",
    slug: "wa-" + S,
    notifyOnBooking: false,
    whatsappProvider: "meta",
    whatsappApiKey: "token-de-mentira",
    whatsappPhoneId: "pnid-" + S,
    staff: { create: { name: "Dueno WA", role: "DUENO", ...listo } },
    agentConfig: { create: { whatsappOn: true } },
  },
});

const errores = [];
const browser = await chromium.launch({ channel: "msedge" });
const vigilar = (page) => {
  page.on("pageerror", (e) => errores.push("pageerror: " + e.message));
  page.on("response", (r) => r.status() >= 500 && errores.push(r.status() + " " + r.url()));
};

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();
  vigilar(page);
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', tienda.email);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel/, { timeout: 25000 });

  console.log("\n1. Prenderlo y enseñarle algo");
  ok((await page.locator('a[href="/panel/agente"]').count()) > 0, "Agente IA aparece en el menu");
  await page.goto(BASE + "/panel/agente", { waitUntil: "networkidle" });
  await page.getByText("Contestar en mi página", { exact: true }).click();
  await page.fill('textarea[name="notes"]', "Recibimos Nequi y efectivo.");
  await page.getByRole("button", { name: "Guardar agente" }).click();
  await page.getByText(/el agente quedó guardado/).waitFor({ timeout: 10000 }).catch(() => {});
  const config = await db.agentConfig.findUnique({ where: { userId: tienda.id } });
  ok(config?.webOn === true && config?.notes?.includes("Nequi"), "queda prendido en la pagina y con lo que debe saber");

  ok(await page.locator('input[name="whatsappOn"]').isDisabled(), "WhatsApp no se puede prender sin conectar Meta");
  ok((await db.agentConfig.findUnique({ where: { userId: tienda.id } })).whatsappOn === false, "y queda apagado");

  console.log("\n2. El chat de prueba del panel no guarda pedidos");
  const prueba = page.locator("[data-chat-agente]");
  await prueba.getByLabel("Tu mensaje").fill("confirmo 2 camisas");
  await prueba.getByRole("button", { name: "Enviar" }).click();
  await prueba.getByText(/Listo/).waitFor({ timeout: 20000 }).catch(() => {});
  ok((await prueba.getByText(/Listo/).count()) > 0, "responde en el panel");
  ok((await db.deal.count({ where: { userId: tienda.id } })) === 0, "y no crea ningun pedido de verdad");
  const accionPrueba = await db.agentMessage.findFirst({ where: { userId: tienda.id, action: { not: null } } });
  ok(accionPrueba?.action?.startsWith("(Prueba)"), "la accion queda marcada como prueba", String(accionPrueba?.action));

  console.log("\n3. Un cliente en la pagina publica");
  const visitante = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pub = await visitante.newPage();
  vigilar(pub);
  await pub.goto(BASE + "/catalogo/" + tienda.slug, { waitUntil: "networkidle" });
  await pub.getByRole("button", { name: /Abrir chat con/ }).click();
  const chat = pub.locator("[data-chat-agente]");
  ok((await chat.getByText(/Soy el asistente de/).count()) > 0, "saluda al abrir");
  await chat.getByLabel("Tu mensaje").fill("hola");
  await chat.getByLabel("Tu mensaje").press("Enter");
  await chat.getByText(/tenemos Camisa Oxford/).waitFor({ timeout: 20000 }).catch(() => {});
  ok((await chat.getByText("[catalogo ok]").count()) > 0, "sabe lo que vende el negocio y lo que enseñó el dueño");

  await chat.getByLabel("Tu mensaje").fill("confirmo, 2 camisas, soy Ana");
  await chat.getByRole("button", { name: "Enviar" }).click();
  await chat.getByText(/Listo/).waitFor({ timeout: 20000 }).catch(() => {});
  ok((await chat.getByText(/130\.000/).count()) > 0, "confirma el total calculado por la aplicacion");
  const ana = await db.customer.findFirst({ where: { userId: tienda.id, phoneKey: "3004445566" } });
  ok(ana?.source === "chat", "la clienta queda en Clientes", String(ana?.source));
  const deal = ana && (await db.deal.findFirst({ where: { customerId: ana.id } }));
  ok(deal?.value === 130000 && deal?.stage === "NUEVO", "con el pedido en el embudo");
  ok(Boolean(ana && (await db.followUp.findFirst({ where: { customerId: ana.id, doneAt: null } }))), "y un seguimiento para confirmarlo");
  if (DIR) await pub.screenshot({ path: DIR + "/agente-chat.png" });

  await pub.reload({ waitUntil: "networkidle" });
  await pub.getByRole("button", { name: /Abrir chat con/ }).click();
  ok((await pub.locator('[data-chat-agente] [data-rol="cliente"]').count()) === 2, "al recargar sigue la conversacion");

  console.log("\n4. El dueño ve la conversacion");
  await page.goto(BASE + "/panel/agente", { waitUntil: "networkidle" });
  const conv = page.locator("[data-conversacion]", { hasText: "Página" }).first();
  ok((await conv.count()) === 1, "aparece la conversacion de la pagina");
  await conv.locator("summary").click();
  ok((await conv.getByText(/Pedido registrado/).count()) > 0, "con lo que hizo el agente");
  ok((await conv.getByRole("link", { name: /Ver ficha del cliente/ }).count()) === 1, "y el enlace a la ficha");

  console.log("\n5. El chat publico no acepta cualquier cosa");
  let r = await page.request.post(BASE + "/api/agente/" + tienda.slug, { data: { conversacion: "../x", mensaje: "hola" } });
  ok(r.status() === 400, "rechaza una conversacion invalida", String(r.status()));
  r = await page.request.post(BASE + "/api/agente/" + conWhatsapp.slug, { data: { conversacion: "a".repeat(32), mensaje: "hola" } });
  ok(r.status() === 404, "un negocio con el chat apagado no contesta", String(r.status()));
  const anon = await visitante.request.post(BASE + "/api/agente/prueba", { data: { conversacion: "a".repeat(32), mensaje: "hola" } });
  ok(anon.status() === 401, "la prueba del panel pide sesion", String(anon.status()));

  console.log("\n6. WhatsApp");
  r = await page.request.get(BASE + "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verif-123&hub.challenge=reto42");
  ok(r.status() === 200 && (await r.text()) === "reto42", "Meta puede verificar la direccion");
  r = await page.request.get(BASE + "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=otra&hub.challenge=x");
  ok(r.status() === 403, "con otra palabra secreta no", String(r.status()));

  const aviso = JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: "pnid-" + S },
              contacts: [{ wa_id: "573006667788", profile: { name: "Pedro WA" } }],
              messages: [{ from: "573006667788", id: "wamid.prueba-" + S, type: "text", text: { body: "hola" } }],
            },
          },
        ],
      },
    ],
  });
  r = await page.request.post(BASE + "/api/whatsapp/webhook", { data: aviso, headers: { "Content-Type": "application/json" } });
  ok(r.status() === 403, "rechaza un aviso sin firma", String(r.status()));

  const firma = "sha256=" + createHmac("sha256", "secreto-123").update(aviso).digest("hex");
  const enviar = () =>
    page.request.post(BASE + "/api/whatsapp/webhook", {
      data: aviso,
      headers: { "Content-Type": "application/json", "X-Hub-Signature-256": firma },
    });
  r = await enviar();
  ok(r.status() === 200, "acepta el aviso firmado", String(r.status()));
  for (let i = 0; i < 20 && enviosWhatsapp.length === 0; i++) await esperar(500);
  ok(enviosWhatsapp.length === 1, "le contesta por WhatsApp", String(enviosWhatsapp.length));
  ok(enviosWhatsapp[0]?.body?.to === "573006667788" && /Camisa|Hola/.test(enviosWhatsapp[0]?.body?.text?.body ?? ""), "al numero que escribio", JSON.stringify(enviosWhatsapp[0]?.body));
  const pedro = await db.customer.findFirst({ where: { userId: conWhatsapp.id, phoneKey: "3006667788" } });
  ok(pedro?.name === "Pedro WA" && pedro?.source === "whatsapp", "y lo anota en Clientes con su nombre de WhatsApp");

  await enviar();
  await esperar(3000);
  ok(enviosWhatsapp.length === 1, "si Meta repite el aviso no contesta dos veces", String(enviosWhatsapp.length));

  console.log("\n7. En celular");
  const cel = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const movil = await cel.newPage();
  vigilar(movil);
  await movil.goto(BASE + "/catalogo/" + tienda.slug, { waitUntil: "networkidle" });
  await movil.getByRole("button", { name: /Abrir chat con/ }).click();
  const caja = await movil.locator("[data-chat-agente]").boundingBox();
  ok(caja && caja.x >= 0 && caja.x + caja.width <= 390, "el chat cabe en la pantalla", JSON.stringify(caja));
  ok(await movil.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "nada desborda a lo ancho");
  if (DIR) await movil.screenshot({ path: DIR + "/agente-celular.png" });
  await cel.close();

  console.log("\n8. Apagarlo quita la burbuja");
  await page.getByText("Contestar en mi página", { exact: true }).click();
  await page.getByRole("button", { name: "Guardar agente" }).click();
  await page.waitForTimeout(1500);
  await pub.goto(BASE + "/catalogo/" + tienda.slug, { waitUntil: "networkidle" });
  ok((await pub.getByRole("button", { name: /Abrir chat con/ }).count()) === 0, "la pagina publica ya no muestra el chat");

  console.log("\n9. Errores durante el recorrido");
  ok(errores.length === 0, "ninguna excepcion ni error 500", errores.slice(0, 3).join(" | "));

  await visitante.close();
  await ctx.close();
} finally {
  await browser.close();
  falso.close();
  await db.user.deleteMany({ where: { id: { in: [tienda.id, conWhatsapp.id] } } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
