/**
 * Comprueba en un navegador que se pueda vender y escanear sin señal.
 *
 * Lo que se prueba: con señal, Ventas y Escáner quedan guardados en el
 * teléfono (también el lector de texto). Sin señal, las dos pantallas abren en
 * frío, se registran dos ventas, se arma el PDF, se pasa a texto y se guarda
 * el documento, y nada llega todavía al servidor. Al volver la señal todo
 * sube solo, una sola vez, con el día correcto.
 *
 * Antes:   npm run build && npm start
 * Después: npm run verificar:sin-senal
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
const esperarHasta = async (fn, ms = 20000) => {
  const fin = Date.now() + ms;
  let v = await fn();
  while (!v && Date.now() < fin) {
    await new Promise((r) => setTimeout(r, 500));
    v = await fn();
  }
  return v;
};

const S = "senal-" + Date.now();
const cuenta = await db.user.create({
  data: {
    email: "caja-" + S + "@test.local",
    passwordHash: bcrypt.hashSync("demo1234", 10),
    ownerName: "Caja",
    businessName: "Comidas " + S,
    businessType: "COMIDAS_RAPIDAS",
    slug: "comidas-" + S,
    staff: { create: { name: "Caja", role: "DUENO", onboardingDoneAt: new Date(), tourDoneAt: new Date() } },
    services: {
      create: [
        { name: "Hamburguesa prueba", price: 14000, category: "Hamburguesas", bookable: false },
        { name: "Gaseosa prueba", price: 4000, category: "Bebidas", bookable: false },
      ],
    },
  },
});
const hoy = new Intl.DateTimeFormat("en-CA", {
  timeZone: cuenta.timezone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const errores = [];
const browser = await chromium.launch({ channel: "msedge" });

const paginaGuardada = (page, ruta) =>
  page.evaluate(async (r) => {
    const c = await caches.open("ten-paginas-v1");
    return Boolean(await c.match(location.origin + r));
  }, ruta);

const lectorGuardado = (page) =>
  page.evaluate(async () => {
    const c = await caches.open("ten-estaticos-v1");
    const urls = (await c.keys()).map((k) => k.url).filter((u) => u.includes("/ocr/"));
    return (
      urls.some((u) => u.endsWith("/worker.min.js")) &&
      urls.some((u) => u.includes("tesseract-core")) &&
      urls.some((u) => u.endsWith("/spa.traineddata.gz"))
    );
  });

async function abrirEnFrio(page, ruta) {
  let resp = null;
  try {
    resp = await page.goto(BASE + ruta, { waitUntil: "domcontentloaded", timeout: 20000 });
  } catch (e) {
    ok(false, "abre " + ruta + " sin red", String(e).slice(0, 120));
  }
  await page.waitForTimeout(2500);
  return resp;
}

try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errores.push("pageerror: " + e.message));
  page.on("response", (r) => r.status() >= 500 && r.status() !== 503 && errores.push(r.status() + " " + r.url()));

  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', cuenta.email);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel/, { timeout: 25000 });

  console.log("\n1. Con señal, Ventas y Escáner quedan guardados en el teléfono");
  await page.goto(BASE + "/panel/ventas", { waitUntil: "networkidle" });
  ok(Boolean(await esperarHasta(() => paginaGuardada(page, "/panel/ventas"))), "la pantalla de Ventas quedó guardada");
  await page.goto(BASE + "/panel/escaner", { waitUntil: "networkidle" });
  ok(Boolean(await esperarHasta(() => paginaGuardada(page, "/panel/escaner"))), "la pantalla del Escáner quedó guardada");
  ok(Boolean(await esperarHasta(() => lectorGuardado(page), 90000)), "y el lector de texto con el idioma español");

  console.log("\n2. Sin señal, vender");
  await ctx.setOffline(true);
  const resp = await abrirEnFrio(page, "/panel/ventas");
  ok(Boolean(resp?.fromServiceWorker()), "Ventas abre en frío desde el teléfono");
  ok(await page.locator("[data-sin-senal]").isVisible().catch(() => false), "avisa que está sin señal y se puede seguir vendiendo");
  await page.getByRole("button", { name: /Hamburguesa prueba/ }).click();
  await page.getByRole("button", { name: /Hamburguesa prueba/ }).click();
  await page.getByRole("button", { name: /Guardar venta/ }).click();
  ok(Boolean(await esperarHasta(() => page.getByText(/quedó guardada en este teléfono/).count())), "la venta queda guardada en el teléfono");
  await page.fill('input[name="manualTotal"]', "5000");
  await page.fill('input[name="concept"]', "Propina prueba");
  await page.getByRole("button", { name: /Guardar venta/ }).click();
  ok(
    Boolean(await esperarHasta(() => page.locator("[data-ventas-pendientes]").getByText(/2 ventas por subir/).count())),
    "muestra 2 ventas por subir con su total"
  );
  ok(/33\.000/.test((await page.locator("[data-ventas-pendientes]").textContent().catch(() => "")) ?? ""), "el total pendiente es $33.000");
  ok((await db.sale.count({ where: { userId: cuenta.id } })) === 0, "todavía no llegan al servidor");
  if (DIR) await page.screenshot({ path: DIR + "/ventas-sin-senal.png", fullPage: true });

  console.log("\n3. Sin señal, escanear");
  const resp2 = await abrirEnFrio(page, "/panel/escaner");
  ok(Boolean(resp2?.fromServiceWorker()), "el Escáner abre en frío desde el teléfono");
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 1600;
    const x = c.getContext("2d");
    x.fillStyle = "#fff";
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = "#000";
    x.font = "bold 150px Arial";
    x.fillText("FACTURA", 180, 500);
    x.font = "90px Arial";
    x.fillText("Total 45000", 180, 750);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.fill('input[maxlength="120"]', "Factura sin senal");
  await page.locator('input[name="escanear-imagenes"]').setInputFiles({ name: "pagina.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  ok(Boolean(await esperarHasta(() => page.locator("[data-paginas] img").count().then((n) => n === 1))), "la página se procesa");
  const descarga = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    page.getByRole("button", { name: /Descargar PDF/ }).click(),
  ])
    .then(([d]) => d)
    .catch(() => null);
  ok(descarga?.suggestedFilename() === "factura-sin-senal.pdf", "arma y descarga el PDF sin señal", descarga?.suggestedFilename());
  await page.getByRole("button", { name: "Pasar a texto" }).click();
  const leido = await esperarHasta(() => page.locator("[data-texto-escaneado]").inputValue().catch(() => ""), 180000);
  ok(/FACTURA/i.test(leido ?? ""), "pasa a texto sin señal", JSON.stringify((leido ?? "").slice(0, 60)) + " " + ((await page.locator('[role="alert"], .alert').allTextContents().catch(() => [])).join(" | ")));
  await page.getByRole("button", { name: /Guardar en mis documentos/ }).click();
  ok(Boolean(await esperarHasta(() => page.getByText(/quedó guardado en este teléfono/).count())), "el documento queda guardado en el teléfono");
  ok((await page.locator("[data-documentos-pendientes]").getByText(/1 documento por subir/).count()) === 1, "muestra 1 documento por subir");
  ok((await db.scanDocument.count({ where: { userId: cuenta.id } })) === 0, "todavía no llega al servidor");

  console.log("\n4. Otra pantalla sin señal ofrece las que sí sirven");
  await abrirEnFrio(page, "/panel/catalogo");
  const cuerpo = (await page.textContent("body").catch(() => "")) ?? "";
  ok(/Sin conexi/.test(cuerpo) && /Registrar una venta/.test(cuerpo) && /Escanear un documento/.test(cuerpo), "enlaza a Ventas y Escáner");
  ok(!/Marcar entrada o salida/.test(cuerpo), "y no a pantallas que nunca se abrieron");

  console.log("\n5. Vuelve la señal y todo sube solo, una vez");
  await ctx.setOffline(false);
  await page.goto(BASE + "/panel/escaner", { waitUntil: "networkidle" });
  ok(Boolean(await esperarHasta(() => db.scanDocument.count({ where: { userId: cuenta.id } }).then((n) => n === 1), 30000)), "el documento llegó");
  await page.goto(BASE + "/panel/ventas", { waitUntil: "networkidle" });
  ok(Boolean(await esperarHasta(() => db.sale.count({ where: { userId: cuenta.id } }).then((n) => n === 2), 30000)), "las dos ventas llegaron");
  await page.waitForTimeout(4000);
  const ventas = await db.sale.findMany({ where: { userId: cuenta.id }, include: { items: true }, orderBy: { total: "asc" } });
  ok(ventas.length === 2, "no quedaron repetidas", String(ventas.length));
  ok(ventas.map((v) => v.total).join(",") === "5000,28000", "con sus totales", ventas.map((v) => v.total).join(","));
  ok(ventas[1]?.items[0]?.qty === 2 && ventas[1]?.items[0]?.name === "Hamburguesa prueba", "la hamburguesa x2 con su detalle");
  ok(ventas[0]?.items[0]?.name === "Propina prueba", "la del valor suelto con su concepto");
  ok(ventas.every((v) => v.day === hoy), "con el día de hoy", ventas.map((v) => v.day).join(","));
  const doc = await db.scanDocument.findFirst({ where: { userId: cuenta.id } });
  ok(doc?.title === "Factura sin senal" && /FACTURA/i.test(doc?.text ?? ""), "el documento con su nombre y su texto");
  await page.reload({ waitUntil: "networkidle" });
  ok((await page.locator("[data-ventas-pendientes]").count()) === 0, "ya no quedan ventas por subir");
  ok((await page.getByText("Propina prueba").count()) > 0, "y aparecen en la lista del día");

  console.log("\n6. Errores durante el recorrido");
  ok(errores.length === 0, "ninguna excepción ni error 500", errores.slice(0, 3).join(" | "));
  await ctx.close();
} finally {
  await browser.close();
  await db.user.delete({ where: { id: cuenta.id } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
