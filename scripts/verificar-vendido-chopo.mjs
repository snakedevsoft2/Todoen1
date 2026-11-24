/**
 * Comprueba en un navegador lo vendido del dia en Ventas de Chopo Snacks:
 * el total suma lo de contado y lo fiado (tambien el fiado anotado en
 * Cuentas por cobrar), los productos de los fiados salen en "Lo más vendido"
 * y en "Ventas por producto", y un abono no aparece como producto ni suma al
 * vendido (sale aparte). Otro negocio sigue viendo lo de siempre.
 *
 * Antes: docker start ten-pg, y la app en localhost:3000 (npm run dev).
 * Despues: node scripts/verificar-vendido-chopo.mjs   (SHOT=carpeta para capturas)
 *
 * Crea dos cuentas desechables y las borra al final. Solo contra la base local.
 */
import "dotenv/config";
import { chromium } from "./navegador.mjs";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
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

const S = "vendido-" + Date.now();
const CLAVE = "demo1234";
const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" }).format(new Date());
const ABONO = "Abono - 10x Papa natural grande, 3x Chicharrón grande, 2x Mixto, 1x Gomas";

/** En centavos: USD. */
async function cuenta(nombre, businessName) {
  const u = await db.user.create({
    data: {
      email: nombre + "-" + S + "@test.local",
      passwordHash: bcrypt.hashSync(CLAVE, 10),
      ownerName: "Juliana Intriago",
      businessName,
      businessType: "OTRO",
      slug: nombre + "-" + S,
      currency: "USD",
      timezone: "America/Guayaquil",
      staff: { create: { name: "Juliana Intriago", role: "DUENO", onboardingDoneAt: new Date(), tourDoneAt: new Date() } },
    },
    include: { staff: true },
  });
  const duena = u.staff[0].id;
  for (const [name, price] of [
    ["Papa natural grande", 90],
    ["Chicharrón grande", 90],
    ["Mixto", 90],
    ["Gomas", 50],
  ]) {
    await db.service.create({ data: { userId: u.id, name, price, category: "SNACKS" } });
  }
  // De contado: 5 papas.
  await db.sale.create({
    data: {
      userId: u.id,
      day: hoy,
      total: 450,
      staffId: duena,
      items: { create: [{ userId: u.id, name: "Papa natural grande", unitPrice: 90, qty: 5 }] },
    },
  });
  // El abono de un fiado de otro dia: plata que entra, no un producto.
  await db.sale.create({
    data: {
      userId: u.id,
      day: hoy,
      total: 5325,
      staffId: duena,
      origin: "CARTERA",
      clientName: "Villa Encantada",
      notes: ABONO,
      items: { create: [{ userId: u.id, name: ABONO, unitPrice: 5325, qty: 1 }] },
    },
  });
  // Un fiado desde Ventas y otro anotado en Cuentas por cobrar.
  await db.debt.create({
    data: { userId: u.id, clientName: "Rosa Vizcaino", concept: "10x Papa natural grande, 2x Mixto", amount: 1080, day: hoy, staffId: duena, clientKey: "k-" + nombre + S },
  });
  await db.debt.create({
    data: { userId: u.id, clientName: "Viveres Carlitos", concept: "3x Chicharrón grande", amount: 270, day: hoy, staffId: duena },
  });
  return u;
}

const chopo = await cuenta("chopo", "Chopo Snacks");
const otro = await cuenta("otro", "Tienda " + S);
const browser = await chromium.launch({ channel: "msedge" });
const errores = [];

async function entrar(u) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errores.push(e.message));
  page.on("response", (r) => r.status() >= 500 && errores.push(r.status() + " " + r.url()));
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', u.email);
  await page.fill('input[name="password"]', CLAVE);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel/, { timeout: 60000 });
  return page;
}
const sinDesborde = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const tarjeta = (page, titulo) => page.locator(".card-tight").filter({ has: page.locator(".eyebrow", { hasText: new RegExp("^" + titulo + "$", "i") }) }).first();

try {
  console.log("\n1. Chopo: contado + fiado, abonos aparte");
  const p = await entrar(chopo);
  await p.goto(BASE + "/panel/ventas", { waitUntil: "networkidle" });
  const total = await tarjeta(p, "Total vendido").innerText();
  ok(total.includes("18,00"), "total vendido = 4,50 de contado + 10,80 + 2,70 fiados", total.replace(/\n/g, " "));
  ok(/Contado US\$\s4,50 · Fiado US\$\s13,50/.test(total), "dice cuánto fue de contado y cuánto fiado", total.replace(/\n/g, " "));
  const abonos = await tarjeta(p, "Abonos cobrados").innerText().catch(() => "");
  ok(abonos.includes("53,25"), "el abono sale aparte, en Abonos cobrados", abonos.replace(/\n/g, " "));

  console.log("\n2. Chopo: lo más vendido en lista, con los productos de los fiados");
  const mas = await tarjeta(p, "Lo más vendido").innerText();
  const filas = await tarjeta(p, "Lo más vendido").locator("li").allInnerTexts();
  ok(filas[0]?.replace(/\s+/g, " ") === "15 Papa natural grande", "primero: 15 papas (5 de contado + 10 fiadas)", filas[0]);
  ok(filas.some((f) => f.replace(/\s+/g, " ") === "3 Chicharrón grande"), "sale el producto del fiado anotado en Cuentas por cobrar", filas.join(" | "));
  ok(filas.some((f) => f.replace(/\s+/g, " ") === "2 Mixto"), "sale el Mixto fiado", filas.join(" | "));
  ok(!mas.includes("Abono"), "el abono no es un producto", mas.replace(/\n/g, " "));
  const caja = await tarjeta(p, "Lo más vendido").boundingBox();
  ok(caja && caja.height < 260, "la tarjeta no se estira por toda la pantalla", String(caja?.height));

  console.log("\n3. Chopo: Ventas por producto y la lista del día");
  // Los renglones de Ventas por producto: "<nombre> <n> vendidos <plata>".
  const renglones = (await p.locator("li").filter({ hasText: / vendidos/ }).allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
  ok(renglones.length > 0 && !renglones.some((t) => t.includes("Abono")), "el abono no sale en Ventas por producto", renglones.join(" | "));
  ok(renglones.some((t) => /Papa natural grande 15 vendidos US\$ 13,50$/.test(t)), "papas: 15 por 13,50", renglones.join(" | "));
  ok(renglones.some((t) => /Chicharrón grande 3 vendidos US\$ 2,70$/.test(t)), "chicharrón fiado: 3 por 2,70", renglones.join(" | "));
  const dia = await p.locator("body").innerText();
  ok(dia.includes("Viveres Carlitos"), "el fiado de Cuentas por cobrar sale en la lista del día");
  ok(await sinDesborde(p), "en el celular nada se sale de la pantalla");
  if (DIR) await p.screenshot({ path: DIR + "/vendido-chopo.png", fullPage: true });

  console.log("\n4. Otro negocio sigue igual");
  const o = await entrar(otro);
  await o.goto(BASE + "/panel/ventas", { waitUntil: "networkidle" });
  const totalOtro = await tarjeta(o, "Total vendido").innerText();
  ok(totalOtro.includes("57,75"), "su total sigue siendo lo que entró (venta + abono)", totalOtro.replace(/\n/g, " "));
  ok((await tarjeta(o, "Lo más vendido").count()) === 0 && (await tarjeta(o, "Abonos cobrados").count()) === 0, "no le salen las tarjetas nuevas");
  ok(!(await o.locator("body").innerText()).includes("Viveres Carlitos"), "no ve en Ventas el fiado anotado en Cuentas por cobrar");
  if (DIR) await o.screenshot({ path: DIR + "/vendido-otro.png", fullPage: true });

  ok(errores.length === 0, "sin errores en la página", errores.join(" | "));
} finally {
  await browser.close();
  for (const u of [chopo, otro]) await db.user.delete({ where: { id: u.id } }).catch((e) => console.log("No se borro " + u.email + ": " + e.message));
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
