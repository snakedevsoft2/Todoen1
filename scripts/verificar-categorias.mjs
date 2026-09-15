/**
 * Comprueba en un navegador que los productos se encuentren sin bajar por toda
 * la lista.
 *
 * Lo que se prueba, con 30 productos en 4 categorias:
 *   - En Catálogo las categorias arrancan cerradas; al tocar una se ve solo esa,
 *     y el buscador encuentra sin tildes. Ordenar por precio cambia el orden.
 *   - El dueño crea su propia categoria, no la deja repetir, la sube al primer
 *     lugar, le pasa un producto, le cambia el nombre y la borra (el producto
 *     vuelve a General).
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
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "la página no se sale del ancho del celular");

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

  console.log("\n1b. Categorías propias");
  page.on("dialog", (d) => d.accept());
  await page.goto(BASE + "/panel/catalogo", { waitUntil: "load" });
  const gestor = page.locator("[data-gestor-categorias]");
  const crear = async (nombre) => {
    await gestor.locator('[data-crear-categoria] input[name="name"]').fill(nombre);
    await gestor.locator("[data-crear-categoria]").getByRole("button", { name: "Crear" }).click();
  };
  ok((await db.productCategory.count({ where: { userId: cuenta.id } })) === 3, "las categorías que ya tenía quedan guardadas");
  await crear("Promos");
  ok(Boolean(await esperarHasta(() => gestor.locator('[data-fila-categoria="Promos"]').count())), "crea una categoría nueva");
  await crear("promos");
  ok(Boolean(await esperarHasta(() => gestor.getByText("Ya tienes la categoría Promos.").count())), "no deja repetirla con otras mayúsculas");

  for (let n = 0; n < 3; n++) {
    await gestor.getByRole("button", { name: "Subir Promos", exact: true }).click();
    await esperarHasta(async () => (await db.productCategory.findFirst({ where: { userId: cuenta.id, name: "Promos" } }))?.position === 2 - n);
  }
  ok((await db.productCategory.findFirst({ where: { userId: cuenta.id, name: "Promos" } }))?.position === 0, "con las flechas queda de primera");

  const filaPromos = gestor.locator('[data-fila-categoria="Promos"]');
  await filaPromos.getByRole("button", { name: "Productos", exact: true }).click();
  await filaPromos.getByLabel("Bolsa", { exact: true }).check();
  await filaPromos.getByRole("button", { name: "Guardar productos" }).click();
  ok(Boolean(await esperarHasta(async () => (await db.service.findFirst({ where: { userId: cuenta.id, name: "Bolsa" } }))?.category === "Promos")), "le pasa la Bolsa a Promos");
  await page.reload({ waitUntil: "load" });
  ok((await page.locator("[data-barra-catalogo] [data-categoria]").nth(1).getAttribute("data-categoria")) === "Promos", "y Promos sale primera en la fila de categorías");

  await gestor.locator('[data-fila-categoria="Promos"]').getByRole("button", { name: "Cambiar nombre" }).click();
  await gestor.locator('[data-fila-categoria="Promos"] [data-renombrar]').fill("Ofertas del día");
  await gestor.locator('[data-fila-categoria="Promos"]').getByRole("button", { name: "Guardar nombre" }).click();
  ok(Boolean(await esperarHasta(async () => (await db.service.findFirst({ where: { userId: cuenta.id, name: "Bolsa" } }))?.category === "Ofertas del día")), "al cambiarle el nombre, la Bolsa se va con ella");

  await gestor.getByRole("button", { name: "Borrar categoría Ofertas del día" }).click();
  ok(
    Boolean(await esperarHasta(async () => (await db.service.findFirst({ where: { userId: cuenta.id, name: "Bolsa" } }))?.category === "General" && (await db.productCategory.count({ where: { userId: cuenta.id } })) === 3)),
    "al borrarla, la Bolsa no se borra: vuelve a General"
  );

  console.log("\n1c. Seleccionar productos y meterlos en una categoría");
  await page.goto(BASE + "/panel/catalogo", { waitUntil: "load" });
  const moverBarra = page.locator("[data-mover-productos]");
  const contar = (category) => db.service.count({ where: { userId: cuenta.id, category } });
  await page.locator("[data-seleccionar-productos]").click();
  await page.locator("[data-buscar-catalogo]").fill("postre 1");
  await moverBarra.getByLabel(/Seleccionar los que se ven/).check();
  ok((await page.locator("[data-seleccionados]").innerText()).startsWith("2"), "con el buscador elige de una los 2 que se ven");
  await page.locator("[data-buscar-catalogo]").fill("");
  await page.getByLabel("Seleccionar Bolsa", { exact: true }).check();
  ok((await page.locator("[data-seleccionados]").innerText()).startsWith("3"), "y suma otro tocándolo uno a uno");
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "seleccionando, la página no se sale del ancho del celular");
  await page.locator("[data-destino-categoria]").selectOption("__nueva__");
  await page.locator("[data-nueva-categoria]").fill("Favoritos");
  const anchoSelector = (await page.locator("[data-destino-categoria]").boundingBox())?.width ?? 0;
  ok(anchoSelector > 120, "con una categoría nueva, el selector sigue a la vista", Math.round(anchoSelector) + " px");
  await moverBarra.getByRole("button", { name: /^Mover/ }).click();
  ok(Boolean(await esperarHasta(async () => (await contar("Favoritos")) === 3)), "mete los 3 elegidos en una categoría nueva");
  ok(Boolean(await esperarHasta(() => page.getByText("3 productos pasaron a Favoritos.").count())), "y avisa cuántos pasaron");
  ok(Boolean(await esperarHasta(() => page.locator('[data-barra-catalogo] [data-categoria="Favoritos"]').count())), "Favoritos aparece en la fila de categorías");

  await page.locator('[data-barra-catalogo] [data-categoria="Favoritos"]').click();
  await page.locator("[data-seleccionar-productos]").click();
  await moverBarra.getByLabel(/Seleccionar los que se ven/).check();
  await page.getByLabel("Seleccionar Bolsa", { exact: true }).uncheck();
  await page.locator("[data-destino-categoria]").selectOption("Postres");
  await moverBarra.getByRole("button", { name: /^Mover/ }).click();
  ok(Boolean(await esperarHasta(async () => (await contar("Postres")) === 10 && (await contar("Favoritos")) === 1)), "devuelve los postres a una categoría que ya existe");

  await page.locator("[data-seleccionar-productos]").click();
  await page.getByLabel("Seleccionar Bolsa", { exact: true }).check();
  await page.locator("[data-destino-categoria]").selectOption("General");
  await moverBarra.getByRole("button", { name: /^Mover/ }).click();
  ok(Boolean(await esperarHasta(async () => (await contar("General")) === 1 && (await contar("Favoritos")) === 0)), "y la Bolsa vuelve a General");

  console.log("\n2. Ventas");
  await page.goto(BASE + "/panel/ventas", { waitUntil: "load" });
  const barraVenta = page.locator("[data-barra-catalogo]").first();
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "la venta no se sale del ancho del celular");
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
