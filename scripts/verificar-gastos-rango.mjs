/**
 * Comprueba en un navegador el "desde / hasta" de Gastos que pidio Chopo
 * Snacks: los totales, la lista por dia y la reparticion por categoria son
 * los del rango, en el celular nada se sale de la pantalla, y otro negocio
 * sigue viendo un solo dia.
 *
 * Antes: docker start ten-pg, y la app en localhost:3000 (npm run dev).
 * Despues: node scripts/verificar-gastos-rango.mjs
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

const S = "gastos-" + Date.now();
const CLAVE = "demo1234";

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
  });
  // Gastos en tres dias del rango y uno por fuera. En centavos: USD.
  const gastos = [
    ["2026-11-02", "Aceite", "Insumos", 2500],
    ["2026-11-02", "Fundas", "Empaques", 800],
    ["2026-11-05", "Gasolina", "Transporte", 1500],
    ["2026-11-09", "Papas", "Insumos", 4000],
    ["2026-10-30", "Fuera del rango", "Otros", 99900],
  ];
  for (const [day, description, category, amount] of gastos) {
    await db.expense.create({ data: { userId: u.id, day, description, category, amount } });
  }
  await db.sale.create({ data: { userId: u.id, day: "2026-11-03", total: 20000 } });
  await db.sale.create({ data: { userId: u.id, day: "2026-11-09", total: 5000 } });
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

try {
  console.log("\n1. Chopo filtra desde / hasta");
  const page = await entrar(chopo);
  await page.goto(BASE + "/panel/gastos", { waitUntil: "networkidle" });
  const filtro = page.locator("[data-rango-gastos]");
  ok((await filtro.locator('input[name="desde"]').count()) === 1 && (await filtro.locator('input[name="hasta"]').count()) === 1, "ve Desde y Hasta");
  ok(await sinDesborde(page), "en el celular nada se sale");
  await filtro.locator('input[name="desde"]').fill("2026-11-01");
  await filtro.locator('input[name="hasta"]').fill("2026-11-10");
  await filtro.getByRole("button", { name: "Ver" }).click();
  await page.waitForURL(/desde=2026-11-01&hasta=2026-11-10/);
  await page.waitForLoadState("networkidle");
  const cuerpo = await page.textContent("body");
  ok(/Del 01\/11\/2026 al 10\/11\/2026/.test(cuerpo), "dice el rango arriba");
  ok(/Gasto del periodo/.test(cuerpo) && /88,00/.test(cuerpo), "gasto del periodo: 88,00 (sin el de fuera del rango)");
  ok(/Ventas del periodo/.test(cuerpo) && /250,00/.test(cuerpo), "ventas del periodo: 250,00");
  ok(/162,00/.test(cuerpo), "te queda limpio: 162,00");
  ok(!/Fuera del rango/.test(cuerpo), "no sale el gasto de octubre");
  const grupos = page.locator("[data-gastos-por-dia] section");
  ok((await grupos.count()) === 3, "agrupados en los tres días con gastos", String(await grupos.count()));
  ok(/lunes 9 de noviembre/i.test((await grupos.first().textContent()) ?? ""), "el más reciente arriba");
  ok(/Insumos/.test(cuerpo) && /Cómo se reparte el gasto del periodo/.test(cuerpo), "y por categoría, del periodo");
  ok(await sinDesborde(page), "en el celular nada se sale con el rango");
  if (DIR) await page.screenshot({ path: DIR + "/gastos-rango.png", fullPage: true });

  console.log("\n2. Un solo día sigue como antes");
  await page.goto(BASE + "/panel/gastos?desde=2026-11-02&hasta=2026-11-02", { waitUntil: "networkidle" });
  const dia = await page.textContent("body");
  ok(/Gastos del día/.test(dia) && /Dia anterior/.test(dia) && /33,00/.test(dia), "el 2 de noviembre: 33,00, con día anterior y siguiente");

  console.log("\n3. Otro negocio no cambia");
  const otra = await entrar(otro);
  await otra.goto(BASE + "/panel/gastos?desde=2026-11-01&hasta=2026-11-10", { waitUntil: "networkidle" });
  const suya = await otra.textContent("body");
  ok((await otra.locator("[data-rango-gastos]").count()) === 0, "no tiene Desde / Hasta");
  ok(/Gastos del día/.test(suya) && !/Gasto del periodo/.test(suya), "y sigue viendo un solo día");
} finally {
  await browser.close();
  await db.user.deleteMany({ where: { slug: { contains: S } } }).catch((e) => console.log("No se borraron las cuentas: " + e.message));
  await db.$disconnect();
}

if (errores.length) console.log("\nErrores en el navegador:\n  " + errores.slice(0, 10).join("\n  "));
console.log(fallos === 0 && errores.length === 0 ? "\nTodo bien.\n" : "\n" + (fallos + errores.length) + " fallo(s).\n");
process.exit(fallos === 0 && errores.length === 0 ? 0 : 1);
