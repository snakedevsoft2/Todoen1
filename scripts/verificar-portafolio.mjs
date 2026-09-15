/**
 * Comprueba en un navegador el portafolio: compartirlo, el logo, el fondo y
 * el boton de WhatsApp.
 *
 * Lo que se prueba:
 *   - "Compartir con QR" abre el QR y el enlace, en el computador y dentro de
 *     la pantalla del celular.
 *   - El QR responde como imagen.
 *   - En Mi portafolio se puede cambiar el logo.
 *   - Un fondo de otro color se guarda y se ve en la pagina publica.
 *   - "Escribirnos" abre WhatsApp con el indicativo del pais (un numero de
 *     Ecuador guardado como 0982... sale 593982...).
 *
 * Antes:   npm run build && npm start
 * Después: npm run verificar:portafolio
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
const esperarHasta = async (fn, ms = 20000) => {
  const fin = Date.now() + ms;
  let v = await fn();
  while (!v && Date.now() < fin) {
    await new Promise((r) => setTimeout(r, 400));
    v = await fn();
  }
  return v;
};

const S = "porta-" + Date.now();
const listo = { onboardingDoneAt: new Date(), tourDoneAt: new Date() };
const cuenta = await db.user.create({
  data: {
    email: "porta-" + S + "@test.local",
    passwordHash: bcrypt.hashSync("demo1234", 10),
    ownerName: "Dueña",
    businessName: "Snacks " + S,
    businessType: "OTRO",
    slug: "snacks-" + S,
    phone: "0982657613",
    currency: "USD",
    timezone: "America/Guayaquil",
    staff: { create: { name: "Dueña", role: "DUENO", ...listo } },
    services: { create: { name: "Bastón grande", price: 80, category: "Snacks", bookable: false } },
  },
});
const ruta = "/catalogo/" + cuenta.slug;

const errores = [];
const vigilar = (page) => page.on("response", (r) => r.status() >= 500 && r.status() !== 503 && errores.push(r.status() + " " + r.url()));
const browser = await chromium.launch({ channel: "msedge" });

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  vigilar(page);
  await page.goto(BASE + "/login", { waitUntil: "load" });
  await page.fill('input[name="email"]', cuenta.email);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel/, { timeout: 25000 });

  console.log("\n1. Compartir el portafolio con QR");
  await page.goto(BASE + "/panel", { waitUntil: "load" });
  await page.getByRole("button", { name: "Compartir con QR" }).first().click();
  const hoja = page.locator("[data-compartir-portafolio]");
  ok(Boolean(await esperarHasta(() => hoja.isVisible())), "abre la ventana para compartir");
  ok((await hoja.locator('img[src="/qr/' + cuenta.slug + '"]').count()) === 1, "con el código QR");
  ok(((await hoja.locator("[data-enlace-portafolio]").textContent()) ?? "").trim().endsWith(ruta), "y el enlace del portafolio");
  const wa = (await hoja.locator("[data-compartir-whatsapp]").getAttribute("href")) ?? "";
  ok(wa.startsWith("https://wa.me/?text=") && wa.includes(encodeURIComponent(ruta)), "el botón de WhatsApp manda el enlace", wa);
  const qr = await page.request.get(BASE + "/qr/" + cuenta.slug);
  ok(qr.ok() && (qr.headers()["content-type"] ?? "").includes("svg"), "el QR responde como imagen", String(qr.status()));
  await hoja.getByRole("button", { name: "Cerrar" }).click();

  console.log("\n2. En el celular la ventana se ve completa");
  const ctxCel = await browser.newContext({ storageState: await ctx.storageState(), viewport: { width: 390, height: 844 } });
  const cel = await ctxCel.newPage();
  vigilar(cel);
  await cel.goto(BASE + "/panel", { waitUntil: "load" });
  await cel.getByRole("button", { name: "Abrir menú" }).click();
  await cel.getByRole("button", { name: "Compartir con QR" }).last().click();
  const hojaCel = cel.locator("[data-compartir-portafolio]");
  await hojaCel.waitFor({ timeout: 5000 });
  const caja = await hojaCel.boundingBox();
  ok(Boolean(caja) && caja.x >= 0 && caja.x + caja.width <= 390 && caja.y >= 0 && caja.y + caja.height <= 844, "queda dentro de la pantalla", JSON.stringify(caja));
  await ctxCel.close();

  console.log("\n3. Logo y fondo desde Mi portafolio");
  await page.goto(BASE + "/panel/portafolio", { waitUntil: "load" });
  ok((await page.getByText("Tu logo y tus colores").count()) === 1, "Mi portafolio tiene el bloque para cambiar el logo");
  const libre = page.locator("[data-fondo-libre]");
  // Un color elegido de verdad dispara el evento input; fill cambia el valor sin avisarle a React.
  await libre.locator('input[type="color"]').evaluate((el) => {
    const poner = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    poner.call(el, "#1f7a4d");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  ok(Boolean(await esperarHasta(() => libre.getByText("Tu color: #1f7a4d").count())), "se puede elegir otro color de fondo");
  await page.locator("form", { has: libre }).locator('button[type="submit"]').last().click();
  ok(
    Boolean(await esperarHasta(async () => (await db.user.findUnique({ where: { id: cuenta.id } }))?.publicBackground === "color:#1f7a4d")),
    "el fondo queda guardado"
  );

  console.log("\n4. La página pública");
  await page.goto(BASE + ruta, { waitUntil: "load" });
  const conFondo = await page.evaluate(() =>
    [...document.querySelectorAll("*")].some((e) => getComputedStyle(e).backgroundColor === "rgb(31, 122, 77)")
  );
  ok(conFondo, "se ve con el color de fondo elegido");
  const escribir = (await page.getByRole("link", { name: /Escribirnos/ }).first().getAttribute("href")) ?? "";
  ok(escribir.startsWith("https://wa.me/593982657613"), "Escribirnos abre WhatsApp con el 593 de Ecuador", escribir);

  console.log("\n5. Errores durante el recorrido");
  ok(errores.length === 0, "ningún error 500", errores.slice(0, 3).join(" | "));
  await ctx.close();
} finally {
  await browser.close();
  await db.user.deleteMany({ where: { slug: { contains: S } } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
