/**
 * Comprueba en un navegador la caja (POS): factura autorizada, venta a
 * cuentas por cobrar, clientes guardados y carga masiva.
 *
 * Factus se reemplaza por un servidor de mentira que levanta este script.
 *
 * Lo que se prueba:
 *   - En Ajustes se configura la factura autorizada y se prueba la conexión.
 *   - Se vende con "Factura autorizada": se piden los datos del comprador, se
 *     emite y el PDF se descarga solo. La venta queda sin botón de borrar.
 *   - Una venta a "Cuentas por cobrar" deja la deuda y no suma a Ventas.
 *   - El cliente escrito en la venta queda guardado.
 *   - Se pegan clientes y productos desde Excel sin duplicar.
 *
 * Antes:
 *   npm run build
 *   FACTUS_BASE_URL=http://localhost:3999/factus npm start
 * Después: npm run verificar:pos
 */
import "dotenv/config";
import http from "node:http";
import fs from "node:fs";
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
    await new Promise((r) => setTimeout(r, 400));
    v = await fn();
  }
  return v;
};

// ------------------------------------------------------------ Factus de mentira
const enviadas = [];
const falso = http.createServer((req, res) => {
  let crudo = "";
  req.on("data", (c) => (crudo += c));
  req.on("end", () => {
    const responder = (status, datos) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(datos));
    };
    const ruta = req.url ?? "";
    if (ruta === "/factus/oauth/token") return responder(200, { access_token: "tok", expires_in: 600 });
    if (ruta.startsWith("/factus/v2/numbering-ranges")) {
      return responder(200, {
        data: [{ id: 8, prefix: "SETP", from: 990000000, to: 995000000, current: 990000001, resolution_number: "18760000001", document: "Factura de Venta", is_active: 1 }],
      });
    }
    if (ruta === "/factus/v2/bills/validate") {
      const cuerpo = JSON.parse(crudo || "{}");
      enviadas.push(cuerpo);
      return responder(201, {
        data: {
          bill: {
            reference_code: cuerpo.reference_code,
            number: "SETP990000001",
            cufe: "c0ffee1234567890abcdef",
            is_validated: true,
            links: { qr: "https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=c0ffee", public_url: "https://factus.test/f/1" },
          },
        },
      });
    }
    responder(404, { message: "no existe" });
  });
});
await new Promise((r) => falso.listen(3999, r));

// ----------------------------------------------------------------- la cuenta
const S = "pos-" + Date.now();
const cuenta = await db.user.create({
  data: {
    email: "caja-" + S + "@test.local",
    passwordHash: bcrypt.hashSync("demo1234", 10),
    ownerName: "Caja",
    businessName: "Tienda " + S,
    businessType: "OTRO",
    slug: "tienda-" + S,
    currency: "COP",
    staff: { create: { name: "Caja", role: "DUENO", onboardingDoneAt: new Date(), tourDoneAt: new Date() } },
    services: { create: [{ name: "Camisa prueba", price: 11900, category: "Camisas", bookable: false }] },
  },
});

const errores = [];
const browser = await chromium.launch({ channel: "msedge" });
const sinDesborde = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errores.push("pageerror: " + e.message));
  page.on("response", (r) => r.status() >= 500 && errores.push(r.status() + " " + r.url()));

  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', cuenta.email);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel/, { timeout: 25000 });

  console.log("\n1. Configurar la factura autorizada en Ajustes");
  await page.goto(BASE + "/panel/ajustes", { waitUntil: "networkidle" });
  const caja = page.locator("[data-facturacion]");
  ok((await caja.count()) === 1, "aparece la tarjeta de factura autorizada");
  await caja.locator('input[name="enabled"]').check();
  await caja.locator('input[name="clientId"]').fill("cliente-id");
  await caja.locator('input[name="clientSecret"]').fill("secreto");
  await caja.locator('input[name="username"]').fill("caja@test.local");
  await caja.locator('input[name="password"]').fill("clave-factus-123");
  await caja.getByRole("button", { name: "Guardar", exact: true }).click();
  ok(Boolean(await esperarHasta(() => caja.getByText(/quedó activa/).count())), "se guarda y queda activa");
  const config = await db.billingConfig.findUnique({ where: { userId: cuenta.id } });
  ok(config?.enabled === true && !String(config?.credentials).includes("clave-factus-123"), "las credenciales quedan cifradas");
  await caja.getByRole("button", { name: /Probar conexión con Factus/ }).click();
  ok(Boolean(await esperarHasta(() => caja.getByText(/Conectado con Factus/).count())), "la prueba de conexión trae los rangos");
  await caja.getByRole("button", { name: "Usar este" }).click();
  ok((await caja.locator('input[name="numberingRangeId"]').inputValue()) === "8", "se elige el rango con un toque");
  ok((await caja.getByText(/toca Guardar para usarlo/).count()) === 1, "y avisa que falta guardar");
  await caja.getByRole("button", { name: "Guardar", exact: true }).click();
  ok(
    Boolean(await esperarHasta(async () => (await db.billingConfig.findUnique({ where: { userId: cuenta.id } }))?.numberingRangeId === "8")),
    "al guardar queda el rango elegido"
  );
  ok(await sinDesborde(page), "en celular nada se sale en Ajustes");
  if (DIR) await page.screenshot({ path: DIR + "/pos-ajustes.png", fullPage: true });

  console.log("\n2. Vender con factura autorizada");
  await page.goto(BASE + "/panel/ventas", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Camisa prueba/ }).click();
  await page.getByRole("button", { name: /Camisa prueba/ }).click();
  await page.locator('select[name="comprobante"]').selectOption("autorizada");
  await page.fill('input[name="clientName"]', "Ana Pérez");
  await page.fill('input[name="clientPhone"]', "3001234567");
  await page.getByRole("button", { name: /Guardar venta/ }).click();
  const comprador = page.locator("[data-comprador]");
  ok(Boolean(await esperarHasta(() => comprador.count())), "pide los datos del comprador apenas se guarda la venta");
  await comprador.getByRole("checkbox").first().uncheck();
  await comprador.getByLabel("Tipo de documento").selectOption("13");
  await comprador.getByLabel("Número de documento").fill("1012345678");
  await comprador.getByLabel("Nombre o razón social").fill("Ana Pérez");
  await comprador.getByLabel("Correo del comprador").fill("ana@correo.com");
  const [descarga] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }).catch(() => null),
    comprador.getByRole("button", { name: "Emitir factura autorizada" }).click(),
  ]);
  ok(Boolean(descarga) && /^factura-electronica-.*SETP990000001\.pdf$/.test(descarga?.suggestedFilename() ?? ""), "el PDF autorizado se descarga solo", descarga?.suggestedFilename());
  if (descarga) {
    const bytes = fs.readFileSync(await descarga.path());
    ok(bytes.subarray(0, 4).toString() === "%PDF", "y es un PDF de verdad");
  }
  const factura = await db.electronicInvoice.findFirst({ where: { userId: cuenta.id } });
  ok(factura?.status === "AUTORIZADA" && factura?.number === "SETP990000001", "queda autorizada con su número oficial");
  const item = enviadas[0]?.items?.[0];
  ok(item?.price === "10000.00" && enviadas[0]?.customer?.identification === "1012345678" && enviadas[0]?.numbering_range_id === 8, "a Factus va el precio sin IVA, la cédula y el rango", JSON.stringify({ precio: item?.price, cliente: enviadas[0]?.customer, rango: enviadas[0]?.numbering_range_id }));
  const ana = await db.customer.findFirst({ where: { userId: cuenta.id, name: "Ana Pérez" } });
  ok(ana?.phone === "3001234567", "el cliente de la venta queda guardado con su teléfono");
  if (DIR) await page.screenshot({ path: DIR + "/pos-venta-autorizada.png", fullPage: true });

  await page.reload({ waitUntil: "networkidle" });
  ok((await page.locator('[data-factura-autorizada="AUTORIZADA"]').count()) === 1, "la lista muestra la factura autorizada");
  ok((await page.getByRole("button", { name: "Borrar venta" }).count()) === 0, "la venta con factura no se puede borrar");

  console.log("\n3. Vender a cuentas por cobrar");
  await page.getByRole("button", { name: /Camisa prueba/ }).click();
  // El del formulario de venta: cada venta de la lista tiene su propio selector de pago.
  const formularioVenta = page.locator("form", { has: page.getByRole("button", { name: /Guardar venta/ }) });
  await formularioVenta.locator('select[name="paymentMethod"]').selectOption("CREDITO");
  await page.fill('input[name="clientName"]', "Doña Marta");
  await page.getByRole("button", { name: /Guardar venta/ }).click();
  ok(Boolean(await esperarHasta(() => page.getByText(/Quedó en Cuentas por cobrar a nombre de Doña Marta/).count())), "confirma que quedó en cuentas por cobrar");
  const deuda = await db.debt.findFirst({ where: { userId: cuenta.id } });
  ok(deuda?.amount === 11900 && deuda?.clientName === "Doña Marta" && deuda?.alreadyInvoiced === false, "la deuda queda con el valor y el cliente");
  ok((await db.sale.count({ where: { userId: cuenta.id } })) === 1, "y no suma a las ventas del día");
  ok(await sinDesborde(page), "en celular nada se sale en Ventas");

  console.log("\n4. Subir clientes pegando desde Excel");
  await page.goto(BASE + "/panel/clientes", { waitUntil: "networkidle" });
  const cargaClientes = page.locator('[data-carga-masiva="clientes"]');
  await cargaClientes.locator("textarea").fill("Nombre\tCelular\tCorreo\nLuis Gómez\t3109876543\tluis@correo.com\nAna Pérez\t3001234567\tana@correo.com");
  ok(Boolean(await esperarHasta(() => cargaClientes.getByText(/Leímos/).count())), "muestra la vista previa");
  await cargaClientes.getByRole("button", { name: "Revisar y cargar 2 clientes" }).click();
  ok(Boolean(await esperarHasta(() => cargaClientes.locator("[data-decision-carga]").count())), "pregunta qué hacer con el que ya estaba");
  await cargaClientes.getByRole("button", { name: "Solo completar lo que falta" }).click();
  ok(Boolean(await esperarHasta(() => cargaClientes.getByText(/Listo: 1 nuevos, 1 actualizados/).count())), "carga uno nuevo y completa al que ya estaba");
  ok((await db.customer.count({ where: { userId: cuenta.id } })) === 3, "sin duplicar a Ana");

  console.log("\n5. Subir productos pegando desde Excel");
  await page.goto(BASE + "/panel/catalogo", { waitUntil: "networkidle" });
  const cargaProductos = page.locator('[data-carga-masiva="productos"]');
  await cargaProductos.locator("textarea").fill("Nombre;Precio;Cantidad\nGorra;20.000;5\nCamisa prueba;13000;");
  await cargaProductos.getByRole("button", { name: "Revisar y cargar 2 productos" }).click();
  ok(Boolean(await esperarHasta(() => cargaProductos.locator("[data-decision-carga]").count())), "pregunta qué hacer con el que ya estaba");
  await cargaProductos.getByRole("button", { name: /Sobrescribir con los datos del archivo|Cargar el nuevo/ }).click();
  ok(Boolean(await esperarHasta(() => cargaProductos.getByText(/Listo: 1 nuevos, [01] actualizados/).count())), "crea la gorra y actualiza la camisa");
  const gorra = await db.service.findFirst({ where: { userId: cuenta.id, name: "Gorra" }, include: { variants: true } });
  const camisa = await db.service.findFirst({ where: { userId: cuenta.id, name: "Camisa prueba" } });
  ok(gorra?.price === 20000 && gorra?.variants[0]?.stock === 5 && camisa?.price === 13000, "con sus precios y la cantidad");
  ok(await sinDesborde(page), "en celular nada se sale en el catálogo");

  console.log("\n6. Errores durante el recorrido");
  ok(errores.length === 0, "ninguna excepción ni error 500", errores.slice(0, 3).join(" | "));
  await ctx.close();
} finally {
  await browser.close();
  falso.close();
  await db.user.delete({ where: { id: cuenta.id } }).catch((e) => console.log("  (no se pudo borrar la cuenta de prueba: " + e.message.slice(0, 120) + ")"));
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
