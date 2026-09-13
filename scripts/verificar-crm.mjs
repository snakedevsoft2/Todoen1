/**
 * Comprueba el CRM en un navegador, de punta a punta.
 *
 * Lo que se prueba: que traiga los clientes que ya estaban en otros apartados,
 * que no deje crear dos fichas con el mismo telefono, etiquetas, anotaciones,
 * seguimientos que aparecen en el resumen del dia, el embudo arrastrando y con
 * el selector, los segmentos con su WhatsApp ya escrito, que un vendedor no
 * pueda borrar fichas, que la ficha de otro negocio no se abra y que en
 * celular nada se salga de la pantalla.
 *
 * Antes:   npm run build && npm start
 * Despues: npm run verificar:crm
 */
import "dotenv/config";
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

const S = "crm-" + Date.now();
const clave = bcrypt.hashSync("demo1234", 10);
const listo = { onboardingDoneAt: new Date(), tourDoneAt: new Date() };

const a = await db.user.create({
  data: {
    email: "duena-" + S + "@test.local",
    passwordHash: clave,
    ownerName: "Duena CRM",
    businessName: "Boutique " + S,
    businessType: "ROPA",
    slug: "boutique-" + S,
    staff: {
      create: [
        { name: "Duena CRM", role: "DUENO", ...listo },
        { name: "Vendedora CRM", role: "VENDEDOR", email: "vende-" + S + "@test.local", passwordHash: clave, ...listo },
      ],
    },
  },
});
const b = await db.user.create({
  data: {
    email: "otro-" + S + "@test.local",
    passwordHash: clave,
    ownerName: "Otro",
    businessName: "Otro " + S,
    businessType: "ROPA",
    slug: "otro-" + S,
    staff: { create: { name: "Otro", role: "DUENO", ...listo } },
  },
});
const ajeno = await db.customer.create({ data: { userId: b.id, name: "Cliente ajeno " + S } });
// Un fiado viejo, para que "Traer mis clientes" tenga a quien traer.
await db.debt.create({
  data: { userId: a.id, clientName: "Rosa Fiada", clientPhone: "311 222 3344", concept: "Blusa", amount: 40000, day: "2026-09-01" },
});

const errores = [];
const browser = await chromium.launch({ channel: "msedge" });

async function entrar(ctx, email) {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errores.push("pageerror: " + e.message));
  page.on("response", (r) => {
    if (r.status() >= 500) errores.push(r.status() + " " + r.url());
  });
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel/, { timeout: 25000 });
  return page;
}

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await entrar(ctx, a.email);

  console.log("\n1. El apartado esta en el menu");
  ok((await page.locator('a[href="/panel/clientes"]').count()) > 0, "Clientes aparece en el menu");

  console.log("\n2. Traer los clientes que ya estaban");
  await page.goto(BASE + "/panel/clientes", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Traer mis clientes/ }).click();
  await page.getByText(/1 cliente nuevo/).waitFor({ timeout: 10000 }).catch(() => {});
  const rosa = await db.customer.findFirst({ where: { userId: a.id, name: "Rosa Fiada" } });
  ok(rosa?.phoneKey === "3112223344", "creo la ficha de Rosa con su telefono", String(rosa?.phoneKey));
  await page.getByRole("button", { name: /Traer mis clientes/ }).click();
  await page.waitForTimeout(1500);
  ok((await db.customer.count({ where: { userId: a.id, name: "Rosa Fiada" } })) === 1, "repetirlo no la duplica");

  console.log("\n3. Crear un cliente y no duplicarlo por telefono");
  await page.goto(BASE + "/panel/clientes", { waitUntil: "networkidle" });
  const alta = page.locator("form", { has: page.getByRole("button", { name: "Agregar cliente" }) });
  await alta.locator('input[name="name"]').fill("Valentina Ruiz");
  await alta.locator('input[name="phone"]').fill("300 777 0001");
  await alta.getByRole("button", { name: "Agregar cliente" }).click();
  await page.waitForURL(/\/panel\/clientes\/c[a-z0-9]+$/, { timeout: 15000 });
  const vale = await db.customer.findFirst({ where: { userId: a.id, name: "Valentina Ruiz" } });
  ok(Boolean(vale), "se guarda y abre su ficha");
  ok((await page.getByRole("heading", { name: "Valentina Ruiz" }).count()) > 0, "la ficha muestra su nombre");

  await page.goto(BASE + "/panel/clientes", { waitUntil: "networkidle" });
  await alta.locator('input[name="name"]').fill("Otra Persona");
  await alta.locator('input[name="phone"]').fill("+57 300 777 0001");
  await alta.getByRole("button", { name: "Agregar cliente" }).click();
  await page.getByText(/Ya tienes a Valentina Ruiz/).waitFor({ timeout: 10000 }).catch(() => {});
  ok((await page.getByText(/Ya tienes a Valentina Ruiz/).count()) > 0, "avisa que ese telefono ya es de Valentina");

  console.log("\n4. Etiqueta y anotacion en la ficha");
  await page.goto(BASE + "/panel/clientes/" + vale.id, { waitUntil: "networkidle" });
  await page.fill('input[placeholder="Nueva etiqueta"]', "VIP");
  await page.getByRole("button", { name: "Crear", exact: true }).click();
  await page.waitForTimeout(1800);
  const vip = await db.customerTag.findFirst({ where: { userId: a.id, name: "VIP" } });
  const puesta = vip && (await db.customerTagLink.findFirst({ where: { customerId: vale.id, tagId: vip.id } }));
  ok(Boolean(puesta), "la etiqueta se crea y queda puesta");

  await page.getByRole("radio", { name: "WhatsApp" }).click();
  await page.fill('textarea[name="text"]', "Preguntó por el vestido azul");
  await page.getByRole("button", { name: "Anotar", exact: true }).click();
  await page.getByText("Preguntó por el vestido azul").first().waitFor({ timeout: 10000 }).catch(() => {});
  ok((await page.getByText("Preguntó por el vestido azul").count()) > 0, "la anotacion sale en el historial");
  const tras = await db.customer.findUnique({ where: { id: vale.id } });
  ok(Boolean(tras.lastContactAt), "un WhatsApp cuenta como contacto");
  if (DIR) await page.screenshot({ path: DIR + "/crm-ficha.png", fullPage: true });

  console.log("\n5. Seguimiento para hoy en el resumen");
  const agenda = page.locator("details", { hasText: "Agendar seguimiento" });
  await agenda.locator("summary").click();
  await agenda.locator('input[name="title"]').fill("Llamarla para confirmar talla");
  await agenda.getByRole("button", { name: "Hoy", exact: true }).click();
  await agenda.locator('button[type="submit"]').click();
  await page.waitForTimeout(1800);
  const seg = await db.followUp.findFirst({ where: { userId: a.id, customerId: vale.id } });
  ok(Boolean(seg), "se agenda");
  await page.goto(BASE + "/panel", { waitUntil: "networkidle" });
  const cuadro = page.locator("[data-seguimientos-hoy]");
  ok((await cuadro.getByText("Llamarla para confirmar talla").count()) > 0, "el resumen del dia lo muestra");

  console.log("\n6. Oportunidad y embudo");
  await page.goto(BASE + "/panel/clientes/" + vale.id, { waitUntil: "networkidle" });
  const nueva = page.locator("details", { hasText: "Nueva oportunidad" });
  await nueva.locator("summary").click();
  await nueva.locator('input[name="title"]').fill("Vestido de fiesta");
  await nueva.locator('input[name="value"]').fill("450000");
  await nueva.getByRole("button", { name: "Agregar oportunidad" }).click();
  await page.waitForTimeout(1800);
  const deal = await db.deal.findFirst({ where: { userId: a.id, customerId: vale.id } });
  ok(deal?.stage === "NUEVO" && deal?.value === 450000, "se guarda en Nuevo con su valor", JSON.stringify(deal && { s: deal.stage, v: deal.value }));

  await page.goto(BASE + "/panel/clientes/embudo", { waitUntil: "networkidle" });
  const tarjeta = page.locator('[data-etapa="NUEVO"] [data-oportunidad="' + deal.id + '"]');
  ok((await tarjeta.count()) === 1, "la tarjeta esta en la columna Nuevo");

  const asa = tarjeta.getByRole("button", { name: /Arrastrar/ });
  const desde = await asa.boundingBox();
  const hacia = await page.locator('[data-etapa="PROPUESTA"]').boundingBox();
  await page.mouse.move(desde.x + desde.width / 2, desde.y + desde.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    const x = desde.x + ((hacia.x + hacia.width / 2 - desde.x) * i) / 12;
    const y = desde.y + ((hacia.y + 120 - desde.y) * i) / 12;
    await page.mouse.move(x, y);
    await page.waitForTimeout(25);
  }
  await page.mouse.up();
  await page.waitForTimeout(1800);
  ok((await db.deal.findUnique({ where: { id: deal.id } })).stage === "PROPUESTA", "arrastrarla a Propuesta la guarda");
  if (DIR) await page.screenshot({ path: DIR + "/crm-embudo.png" });

  await page.locator('[data-oportunidad="' + deal.id + '"] select').selectOption("GANADO");
  await page.waitForTimeout(1800);
  const ganada = await db.deal.findUnique({ where: { id: deal.id } });
  ok(ganada.stage === "GANADO" && Boolean(ganada.closedAt), "con el selector pasa a Ganado y queda cerrada");
  await page.reload({ waitUntil: "networkidle" });
  ok((await page.locator('[data-etapa="GANADO"] [data-oportunidad="' + deal.id + '"]').count()) === 1, "al recargar sigue en Ganado");

  console.log("\n7. Marcar el seguimiento hecho");
  await page.goto(BASE + "/panel/clientes/seguimientos", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Marcar como hecho" }).first().click();
  await page.waitForTimeout(1800);
  ok(Boolean((await db.followUp.findUnique({ where: { id: seg.id } })).doneAt), "queda hecho");
  await page.goto(BASE + "/panel", { waitUntil: "networkidle" });
  ok((await page.locator("[data-seguimientos-hoy]").count()) === 0, "y sale del resumen del dia");

  console.log("\n8. Segmento por etiqueta con WhatsApp");
  await page.goto(BASE + "/panel/clientes/segmentos?t=" + vip.id, { waitUntil: "networkidle" });
  const enviar = page.getByRole("link", { name: "Enviar" });
  ok((await enviar.count()) === 1, "sale solo Valentina", String(await enviar.count()));
  const href = await enviar.first().getAttribute("href");
  ok(/3007770001/.test(href) && decodeURIComponent(href).includes("Hola Valentina"), "el enlace lleva su numero y su nombre", href);
  const [popup] = await Promise.all([ctx.waitForEvent("page"), enviar.first().click()]);
  await popup.close();
  await page.waitForTimeout(1500);
  ok(
    (await db.interaction.count({ where: { customerId: vale.id, kind: "WHATSAPP" } })) === 2,
    "el envio queda anotado en la ficha"
  );

  console.log("\n9. La ficha de otro negocio");
  const r = await page.goto(BASE + "/panel/clientes/" + ajeno.id, { waitUntil: "networkidle" });
  ok(r.status() === 404, "responde que no existe", String(r.status()));
  ok((await page.getByText("Cliente ajeno").count()) === 0, "y no deja ver nada");

  console.log("\n10. Una vendedora usa el CRM pero no borra fichas");
  const ctxV = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const vende = await entrar(ctxV, "vende-" + S + "@test.local");
  await vende.goto(BASE + "/panel/clientes/" + vale.id, { waitUntil: "networkidle" });
  ok((await vende.getByRole("heading", { name: "Valentina Ruiz" }).count()) > 0, "abre la ficha");
  ok((await vende.getByRole("button", { name: /Borrar ficha/ }).count()) === 0, "no ve Borrar ficha");
  await ctxV.close();

  console.log("\n11. En celular nada se sale");
  const cel = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const movil = await entrar(cel, a.email);
  for (const ruta of ["/panel/clientes", "/panel/clientes/" + vale.id, "/panel/clientes/embudo", "/panel/clientes/seguimientos", "/panel/clientes/segmentos"]) {
    await movil.goto(BASE + ruta, { waitUntil: "networkidle" });
    const ancho = await movil.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(ancho <= 1, "sin desborde en " + ruta, ancho + "px");
  }
  if (DIR) await movil.screenshot({ path: DIR + "/crm-celular.png", fullPage: true });
  await cel.close();

  console.log("\n12. Errores durante el recorrido");
  ok(errores.length === 0, "ninguna excepcion ni error 500", errores.slice(0, 3).join(" | "));

  await ctx.close();
} finally {
  await browser.close();
  await db.user.deleteMany({ where: { id: { in: [a.id, b.id] } } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
