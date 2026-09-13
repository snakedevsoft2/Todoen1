/**
 * Comprueba que las imagenes y el carrito lleguen completos desde los
 * formularios.
 *
 * Existe por un error que las pruebas no vieron: la portada, el logo y la foto
 * de producto se cortaban a doscientos caracteres al guardarse, y la pagina
 * publica quedaba sin portada. Las pruebas de fondos escribian la portada
 * directo en la base, sin pasar por el formulario, asi que nunca lo notaron.
 * Aqui todo entra como entra una persona: eligiendo un archivo.
 *
 * Antes:   npm run build && npm start
 * Despues: npm run verificar:imagenes
 */
import "dotenv/config";
import { deflateSync, crc32 } from "node:zlib";
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

/** Un PNG de verdad con pixeles al azar, para que no se comprima a casi nada. */
function png(ancho, alto) {
  const trozo = (tipo, datos) => {
    const largo = Buffer.alloc(4);
    largo.writeUInt32BE(datos.length);
    const cuerpo = Buffer.concat([Buffer.from(tipo), datos]);
    const suma = Buffer.alloc(4);
    suma.writeUInt32BE(crc32(cuerpo) >>> 0);
    return Buffer.concat([largo, cuerpo, suma]);
  };
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(ancho, 0);
  cabecera.writeUInt32BE(alto, 4);
  cabecera[8] = 8; // bits
  cabecera[9] = 2; // RGB
  const filas = Buffer.alloc((ancho * 3 + 1) * alto);
  for (let y = 0; y < alto; y++) {
    const inicio = y * (ancho * 3 + 1);
    for (let x = 0; x < ancho * 3; x++) filas[inicio + 1 + x] = Math.floor(Math.random() * 256);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", cabecera),
    trozo("IDAT", deflateSync(filas)),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}
const archivo = (nombre) => ({ name: nombre + ".png", mimeType: "image/png", buffer: png(120, 90) });

const S = "img-" + Date.now();
const listo = { onboardingDoneAt: new Date(), tourDoneAt: new Date() };
const cuenta = await db.user.create({
  data: {
    email: "img-" + S + "@test.local",
    passwordHash: bcrypt.hashSync("demo1234", 10),
    ownerName: "Duena Imagenes",
    businessName: "Tienda " + S,
    businessType: "ROPA",
    slug: "tienda-" + S,
    staff: { create: { name: "Duena Imagenes", role: "DUENO", ...listo } },
  },
});

const errores = [];
const browser = await chromium.launch({ channel: "msedge" });

const esImagenCompleta = (v) => typeof v === "string" && v.startsWith("data:image/") && v.length > 1000;

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errores.push(e.message));
  page.on("response", (r) => r.status() >= 500 && errores.push(r.status() + " " + r.url()));

  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', cuenta.email);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel/, { timeout: 25000 });

  console.log("\n1. Portada del portafolio");
  await page.goto(BASE + "/panel/portafolio", { waitUntil: "networkidle" });
  const formPortafolio = page.locator("form", { has: page.locator('input[name="publicCover"]') });
  await formPortafolio.locator('input[type="file"]').first().setInputFiles(archivo("portada"));
  await page.waitForFunction(
    () => (document.querySelector('input[name="publicCover"]')?.value ?? "").startsWith("data:image/"),
    null,
    { timeout: 10000 }
  );
  await page.getByRole("button", { name: /Guardar mi p[aá]gina/i }).click();
  await page.waitForTimeout(2500);
  let u = await db.user.findUnique({ where: { id: cuenta.id } });
  ok(esImagenCompleta(u.publicCover), "la portada se guarda completa", String(u.publicCover?.length));

  await page.goto(BASE + "/catalogo/" + cuenta.slug, { waitUntil: "networkidle" });
  const portada = await page.evaluate(() => {
    const img = [...document.querySelectorAll("header img")].find((i) => i.src.startsWith("data:image/"));
    return img ? { ancho: img.naturalWidth, alto: img.naturalHeight } : null;
  });
  ok(Boolean(portada && portada.ancho > 0), "la pagina publica muestra la portada", JSON.stringify(portada));

  console.log("\n2. Logo");
  await page.goto(BASE + "/panel/personalizar", { waitUntil: "networkidle" });
  const formLogo = page.locator("form", { has: page.locator('input[name="logo"]') });
  await formLogo.locator('input[type="file"]').first().setInputFiles(archivo("logo"));
  await page.waitForFunction(
    () => (document.querySelector('input[name="logo"]')?.value ?? "").startsWith("data:image/"),
    null,
    { timeout: 10000 }
  );
  await formLogo.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(2500);
  u = await db.user.findUnique({ where: { id: cuenta.id } });
  ok(esImagenCompleta(u.logo), "el logo se guarda completo", String(u.logo?.length));
  const logo = await page.request.get(BASE + "/logo/" + cuenta.slug);
  ok(logo.status() === 200 && (logo.headers()["content-type"] ?? "").startsWith("image/"), "y se sirve como imagen", String(logo.status()));

  console.log("\n3. Foto de un producto");
  await page.goto(BASE + "/panel/catalogo", { waitUntil: "networkidle" });
  const formProducto = page.locator("form", { has: page.locator('input[name="image"]') }).first();
  await formProducto.locator('input[name="name"]').fill("Camisa " + S);
  await formProducto.locator('input[name="price"]').fill("65000");
  await formProducto.locator('input[type="file"]').first().setInputFiles(archivo("camisa"));
  await page.waitForFunction(
    () => [...document.querySelectorAll('input[name="image"]')].some((i) => i.value.startsWith("data:image/")),
    null,
    { timeout: 10000 }
  );
  await formProducto.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(2500);
  const camisa = await db.service.findFirst({ where: { userId: cuenta.id, name: "Camisa " + S } });
  ok(Boolean(camisa), "el producto se guarda");
  ok(esImagenCompleta(camisa?.image), "con su foto completa", String(camisa?.image?.length));

  console.log("\n4. Una venta con carrito largo");
  await page.goto(BASE + "/panel/ventas", { waitUntil: "networkidle" });
  const concepto = page.locator('input[placeholder="Otro concepto"]');
  const valor = page.locator('input[placeholder="Valor"]');
  for (let i = 1; i <= 8; i++) {
    await concepto.fill("Arreglo de prenda numero " + i + " con dobladillo");
    await valor.fill(String(1000 * i));
    await page.getByRole("button", { name: "Agregar", exact: true }).click();
  }
  const largo = await page.evaluate(() => document.querySelector('input[name="itemsJson"]')?.value.length ?? 0);
  ok(largo > 200, "el carrito pasa de doscientos caracteres", String(largo));
  await page.locator("form", { has: page.locator('input[name="itemsJson"]') }).locator('button[type="submit"]').last().click();
  await page.waitForTimeout(2500);
  const venta = await db.sale.findFirst({ where: { userId: cuenta.id }, include: { items: true } });
  ok(venta?.items.length === 8, "la venta queda con los ocho renglones", String(venta?.items.length));
  ok(venta?.total === 36000, "y el total correcto", String(venta?.total));

  console.log("\n5. Errores durante el recorrido");
  ok(errores.length === 0, "ninguna excepcion ni error 500", errores.slice(0, 3).join(" | "));
  await ctx.close();
} finally {
  await browser.close();
  await db.user.delete({ where: { id: cuenta.id } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
