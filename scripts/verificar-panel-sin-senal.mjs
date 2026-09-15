/**
 * Comprueba en un navegador que el panel se pueda usar sin señal: consultar,
 * descargar e imprimir.
 *
 * Lo que se prueba:
 *   - Con señal, las pantallas del menu, el logo y el armador de PDF quedan
 *     guardados solos en el teléfono, sin abrir cada pantalla.
 *   - Sin señal, un apartado que no se abrió abre en frío con sus datos y un
 *     aviso de que es lo último guardado; se navega por el menú.
 *   - Sin señal se descarga el PDF de la factura de una venta, con el logo,
 *     y se imprime el recibo.
 *   - Una pantalla que no está en el menú muestra el aviso con enlaces.
 *
 * Antes:   npm run build && npm start
 * Después: npm run verificar:panel-sin-senal
 */
import "dotenv/config";
import fs from "node:fs";
import { crc32, deflateSync } from "node:zlib";
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

/** Un PNG de verdad, de un color, armado a mano: el PDF solo incrusta imágenes válidas. */
function png(lado, [r, g, b]) {
  const trozo = (tipo, datos) => {
    const largo = Buffer.alloc(4);
    largo.writeUInt32BE(datos.length);
    const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
    const suma = Buffer.alloc(4);
    suma.writeUInt32BE(crc32(cuerpo) >>> 0);
    return Buffer.concat([largo, cuerpo, suma]);
  };
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(lado, 0);
  cabecera.writeUInt32BE(lado, 4);
  cabecera[8] = 8; // bits por canal
  cabecera[9] = 2; // color RGB
  const fila = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: lado }, () => [r, g, b]).flat())]);
  const pixeles = deflateSync(Buffer.concat(Array.from({ length: lado }, () => fila)));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", cabecera),
    trozo("IDAT", pixeles),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}
const LOGO = "data:image/png;base64," + png(32, [79, 70, 229]).toString("base64");

const S = "panel-" + Date.now();
const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const cuenta = await db.user.create({
  data: {
    // Con pago: solo la cuenta que pago instala la app y la usa sin senal.
    paidUntil: new Date(Date.now() + 30 * 86_400_000),
    email: "panel-" + S + "@test.local",
    passwordHash: bcrypt.hashSync("demo1234", 10),
    ownerName: "Dueña",
    businessName: "Comidas " + S,
    businessType: "COMIDAS_RAPIDAS",
    slug: "comidas-" + S,
    logo: LOGO,
    staff: { create: { name: "Dueña", role: "DUENO", onboardingDoneAt: new Date(), tourDoneAt: new Date() } },
    expenses: { create: { day: hoy, amount: 45000, description: "Pan y carne prueba", category: "Insumos" } },
  },
  include: { staff: true },
});
await db.sale.create({
  data: {
    userId: cuenta.id,
    day: hoy,
    total: 28000,
    staffId: cuenta.staff[0].id,
    items: { create: [{ userId: cuenta.id, name: "Hamburguesa prueba", unitPrice: 14000, qty: 2 }] },
  },
});

const errores = [];
const browser = await chromium.launch({ channel: "msedge" });

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

const enCache = (page, nombre, parte) =>
  page.evaluate(
    async ([n, p]) => {
      const c = await caches.open(n);
      return (await c.keys()).some((k) => k.url.includes(p));
    },
    [nombre, parte]
  );

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  // El dialogo de impresion bloquearia la prueba: se atrapa lo que iba a salir en papel.
  await ctx.addInitScript(() => {
    window.__impresiones = [];
    window.print = () => {
      window.__impresiones.push(document.getElementById("ten-impresion")?.innerHTML ?? "");
      window.dispatchEvent(new Event("afterprint"));
    };
  });
  const page = await ctx.newPage();
  page.on("response", (r) => r.status() >= 500 && r.status() !== 503 && errores.push(r.status() + " " + r.url()));

  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', cuenta.email);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel/, { timeout: 25000 });

  console.log("\n1. Con señal, el panel queda guardado solo");
  await page.goto(BASE + "/panel", { waitUntil: "networkidle" });
  ok(Boolean(await esperarHasta(() => enCache(page, "ten-paginas-v1", "/panel/gastos"), 60000)), "Gastos quedó guardado sin abrirlo");
  ok(Boolean(await esperarHasta(() => enCache(page, "ten-paginas-v1", "/panel/caja"), 30000)), "Cierre de caja también");
  ok(Boolean(await esperarHasta(() => enCache(page, "ten-paginas-v1", "/panel/ventas"), 30000)), "y Ventas");
  ok(Boolean(await esperarHasta(() => enCache(page, "ten-estaticos-v1", "/logo/"), 30000)), "el logo quedó guardado");
  ok(
    Boolean(
      await esperarHasta(
        () => page.evaluate(async () => (await (await caches.open("ten-estaticos-v1")).keys()).length > 20),
        30000
      )
    ),
    "y los archivos de las pantallas"
  );

  console.log("\n2. Sin señal, consultar");
  await ctx.setOffline(true);
  const resp = await abrirEnFrio(page, "/panel/gastos");
  ok(Boolean(resp?.fromServiceWorker()), "Gastos abre en frío desde el teléfono");
  ok((await page.getByText("Pan y carne prueba").count()) > 0, "con el gasto que ya estaba");
  ok(await page.locator("[data-aviso-sin-conexion]").isVisible().catch(() => false), "y avisa que es lo último guardado");
  if (DIR) await page.screenshot({ path: DIR + "/panel-sin-senal-gastos.png", fullPage: true });
  await page.getByRole("link", { name: "Cierre de caja" }).first().click();
  ok(
    Boolean(await esperarHasta(() => page.getByRole("heading", { name: "Cierre de caja" }).count(), 20000)),
    "se navega por el menú a Cierre de caja"
  );

  console.log("\n3. Sin señal, descargar e imprimir la factura");
  await abrirEnFrio(page, "/panel/ventas");
  ok((await page.getByText("2x Hamburguesa prueba").count()) > 0, "la venta del día está en la lista");
  await page.getByRole("button", { name: "Factura", exact: true }).first().click();
  const [descarga] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }).catch(() => null),
    page.getByRole("button", { name: "Descargar PDF" }).first().click(),
  ]);
  const bytes = descarga ? fs.readFileSync(await descarga.path()) : Buffer.alloc(0);
  ok(bytes.subarray(0, 4).toString() === "%PDF", "descarga el PDF de la factura sin señal", descarga?.suggestedFilename());
  ok(bytes.includes("/Subtype /Image"), "y el PDF trae el logo");

  const imprimir = page.getByRole("button", { name: "Imprimir", exact: true }).first();
  await imprimir.click();
  const tirilla = page.getByRole("button", { name: /Tirilla 58 mm/ });
  if (await tirilla.count()) await tirilla.first().click();
  const impreso = await esperarHasta(() => page.evaluate(() => window.__impresiones.at(-1) ?? null), 8000);
  ok(Boolean(impreso) && impreso.includes("Hamburguesa prueba"), "imprime el recibo sin señal");
  const logoSrc = await page.evaluate(() => document.querySelector('img[src*="/logo/"]')?.getAttribute("src") ?? null);
  ok(
    Boolean(logoSrc) && (await page.evaluate(async (src) => (await fetch(src)).ok, logoSrc)),
    "el logo carga sin señal",
    String(logoSrc)
  );

  console.log("\n4. Una pantalla fuera del menú avisa con enlaces");
  await abrirEnFrio(page, "/panel/cartera");
  const cuerpo = (await page.textContent("body").catch(() => "")) ?? "";
  ok(/Sin conexi/.test(cuerpo) && /Gastos/.test(cuerpo) && /Registrar una venta/.test(cuerpo), "ofrece las pantallas guardadas");

  console.log("\n5. Vuelve la señal");
  await ctx.setOffline(false);
  await page.goto(BASE + "/panel/gastos", { waitUntil: "networkidle" });
  ok((await page.locator("[data-aviso-sin-conexion]").count()) === 0, "con señal ya no sale el aviso");

  console.log("\n6. Errores durante el recorrido");
  ok(errores.length === 0, "ningún error 500", errores.slice(0, 3).join(" | "));
  await ctx.close();
} finally {
  await browser.close();
  await db.user.delete({ where: { id: cuenta.id } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
