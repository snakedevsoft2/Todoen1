/**
 * Comprueba en un navegador que los productos se encuentren sin bajar por toda
 * la lista.
 *
 * Lo que se prueba, con 30 productos en 4 categorias:
 *   - En Catálogo las categorias arrancan cerradas; al tocar una se ve solo esa,
 *     y el buscador encuentra sin tildes. Ordenar por precio cambia el orden.
 *   - En Ventas tocar una categoria deja solo sus productos y se pueden agregar.
 *   - En el portafolio publico se ven los titulos por categoria, el buscador y
 *     el filtro por categoria, en un celular.
 *
 * Antes:   npm run build && npm start
 * Después: npm run verificar:categorias
 */
import "dotenv/config";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const BASE = "http://localhost:3000";
const db = new PrismaClient();
let fallos = 0;
const ok = (c, t, extra = "") => {
  if (c) console.log("  OK   " + t);
  else {
    fallos++;
    console.log("  MAL  " + t + (extra ? "  <- " + extra : ""));
  }
};
const esperarHasta = async (fn, ms = 15000) => {
  const fin = Date.now() + ms;
  let v = await fn();
  while (!v && Date.now() < fin) {
    await new Promise((r) => setTimeout(r, 300));
    v = await fn();
  }
  return v;
};

const S = "categorias-" + Date.now();
const productos = [];
for (let n = 1; n <= 12; n++) productos.push({ name: "Bebida " + n, price: 1000 * n, category: "Bebidas" });
for (let n = 1; n <= 10; n++) productos.push({ name: "Postre " + n, price: 3000 + n, category: "Postres" });
for (let n = 1; n <= 6; n++) productos.push({ name: "Combo " + n, price: 20000 + n, category: "Combos" });
productos.push({ name: "Piña colada", price: 9000, category: "Bebidas" });
productos.push({ name: "Bolsa", price: 200, category: "General" });

const cuenta = await db.user.create({
  data: {
    email: "duena-" + S + "@test.local",
    passwordHash: bcrypt.hashSync("demo1234", 10),
    ownerName: "Dueña",
    businessName: "Snacks " + S,
    businessType: "COMIDAS_RAPIDAS",
    slug: "snacks-" + S,
    staff: { create: { name: "Dueña", role: "DUENO", onboardingDoneAt: new Date(), tourDoneAt: new Date() } },
    services: { create: productos.map((p) => ({ ...p, bookable: false, showcase: true })) },
  },
});

const errores = [];
const browser = await chromium.launch({ channel: "msedge" });
const vigilar = (page) => page.on("response", (r) => r.status() >= 500 && r.status() !== 503 && errores.push(r.status() + " " + r.url()));
const visibles = (page, sel) => page.locator(sel).evaluateAll((els) => els.filter((e) => e.offsetParent !== null).length);

try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  vigilar(page);
  await page.goto(BASE + "/login", { waitUntil: "load" });
  await page.fill('input[name="email"]', cuenta.email);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel/, { timeout: 25000 });

  console.log("\n1. Catálogo del panel");
  await page.goto(BASE + "/panel/catalogo", { waitUntil: "load" });
  const barra = page.locator("[data-barra-catalogo]");
  ok((await barra.locator("[data-categoria]").count()) === 5, "sale Todo y las 4 categorías");
  ok((await barra.locator('[data-categoria="Bebidas"]').innerText()).includes("13"), "cada categoría con su cantidad");
  ok((await visibles(page, "[data-producto]")) === 0, "con muchos productos arrancan cerradas");
  ok((await page.locator("[data-grupo-categoria]").last().getAttribute("data-grupo-categoria")) === "General", "General queda de última");

  await barra.locator('[data-categoria="Postres"]').click();
  ok(Boolean(await esperarHasta(async () => (await visibles(page, "[data-producto]")) === 10)), "al tocar Postres se ven solo sus 10");

  await barra.locator('[data-categoria=""]').click();
  await page.locator("[data-buscar-catalogo]").fill("pina");
  ok(Boolean(await esperarHasta(async () => (await visibles(page, "[data-producto]")) === 1)), "buscar «pina» encuentra la Piña colada");
  await page.locator("[data-buscar-catalogo]").fill("nada-parecido");
  ok(Boolean(await esperarHasta(() => page.locator("[data-sin-resultados]").isVisible())), "sin resultados lo dice y ofrece ver todos");
  await page.locator("[data-buscar-catalogo]").fill("");

  await page.locator('[data-grupo-categoria="Bebidas"] button').first().click();
  await page.locator("[data-orden-catalogo]").selectOption("precio-mayor");
  const primera = await page.locator('[data-grupo-categoria="Bebidas"] [data-producto]').first().getAttribute("data-producto");
  ok(primera === "Bebida 12", "ordenar por precio pone la más cara primero", primera);

  console.log("\n2. Ventas");
  await page.goto(BASE + "/panel/ventas", { waitUntil: "load" });
  const barraVenta = page.locator("[data-barra-catalogo]").first();
  await barraVenta.locator('[data-categoria="Combos"]').click();
  ok(Boolean(await esperarHasta(async () => (await page.getByRole("button", { name: /^Combo \d/ }).count()) === 6 && (await page.getByRole("button", { name: /^Bebida \d/ }).count()) === 0)), "tocar Combos deja solo los 6 combos");
  await barraVenta.locator('[data-categoria=""]').click();
  await barraVenta.locator("[data-buscar-catalogo]").fill("postre 1");
  ok(Boolean(await esperarHasta(async () => (await page.getByRole("button", { name: /^Postre 10?\b/ }).count()) === 2)), "el buscador de la venta encuentra Postre 1 y 10");
  await page.getByRole("button", { name: /^Postre 10\b/ }).click();
  ok((await page.getByText(/Postre 10/).count()) >= 2, "y se agrega a la venta");
  await ctx.close();

  console.log("\n3. Portafolio público en el celular");
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pub = await ctx2.newPage();
  vigilar(pub);
  await pub.goto(BASE + "/catalogo/" + cuenta.slug, { waitUntil: "load" });
  ok((await pub.locator("section[data-grupo-categoria]").count()) === 4, "se ven los títulos por categoría");
  await pub.locator('[data-barra-catalogo] [data-categoria="Combos"]').click();
  ok(Boolean(await esperarHasta(async () => (await pub.locator("article").count()) === 6)), "al tocar Combos quedan 6");
  await pub.locator('[data-barra-catalogo] [data-categoria=""]').click();
  await pub.locator("[data-buscar-catalogo]").fill("colada");
  ok(Boolean(await esperarHasta(async () => (await pub.locator("article").count()) === 1)), "el buscador del portafolio encuentra la Piña colada");
  const ancho = await pub.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  ok(ancho, "la fila de categorías no ensancha la página");
  await ctx2.close();

  console.log("\n4. Errores durante el recorrido");
  ok(errores.length === 0, "ningún error 500", errores.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  await db.user.deleteMany({ where: { slug: { contains: S } } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
