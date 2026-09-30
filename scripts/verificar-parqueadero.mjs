/**
 * Comprueba en un navegador el parqueadero de motos y carros.
 *
 * Lo que se prueba:
 *   - "Parqueadero" aparece en el registro y crea la cuenta.
 *   - Ingresar un vehiculo solo con la placa saca el ticket, con su QR,
 *     el boton de imprimir y el de WhatsApp.
 *   - El QR abre una pagina publica (sin sesion) con el tiempo, lo que va
 *     a pagar, la tarifa, el rango de precios y la direccion.
 *   - Dar salida cobrando crea la venta; salir sin pagar lo deja en
 *     pendientes por pagar.
 *   - El dueño cambia la tarifa y el resumen del dia cuenta todo.
 *
 * Antes:   npm run dev   (o npm run build && npm start)
 * Después: node scripts/verificar-parqueadero.mjs
 */
import "dotenv/config";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const FOTOS = process.env.FOTOS_DIR ?? null;
const db = new PrismaClient();
let fallos = 0;
const ok = (c, t, extra = "") => {
  if (c) console.log("  OK   " + t);
  else {
    fallos++;
    console.log("  MAL  " + t + (extra ? "  <- " + extra : ""));
  }
};
const foto = async (page, nombre) => {
  if (FOTOS) await page.screenshot({ path: FOTOS + "/" + nombre + ".png", fullPage: true });
};

const S = Date.now();
const email = "parqueadero-" + S + "@test.local";
const browser = await chromium.launch({ channel: "msedge" });

try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  console.log("Registro");
  await page.goto(BASE + "/registro", { waitUntil: "load" });
  const tile = page.locator('label[data-tipo="PARQUEADERO"]');
  ok(await tile.isVisible(), "Parqueadero aparece en el registro");
  await tile.click();
  await page.fill('input[name="businessName"]', "Parqueadero Prueba " + S);
  await page.fill('input[name="ownerName"]', "Dueña Prueba");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel/, { timeout: 60000 });
  const user = await db.user.findUnique({ where: { email } });
  ok(user?.businessType === "PARQUEADERO", "la cuenta queda como parqueadero");
  await db.user.update({ where: { id: user.id }, data: { address: "Calle 10 # 5-20, Bogotá" } });
  await db.staff.updateMany({ where: { userId: user.id }, data: { onboardingDoneAt: new Date(), tourDoneAt: new Date() } });

  console.log("Ingreso");
  await page.goto(BASE + "/panel/parqueadero", { waitUntil: "load" });
  ok(await page.getByText("Ingresar vehículo").first().isVisible(), "se ve el formulario de ingreso");
  ok((await page.locator('input[name="rateId"]').count()) === 2, "trae las tarifas de moto y carro");
  await foto(page, "1-parqueadero-vacio");
  await page.fill('input[name="plate"]', "abc 123");
  await page.getByText("Carro", { exact: true }).click();
  await page.click('form[data-ingreso-parqueadero] button[type="submit"]');
  await page.waitForURL(/\/panel\/parqueadero\/[^/]+\?nuevo=1/, { timeout: 30000 });
  ok(await page.getByText("Vehículo ingresado").isVisible(), "lleva al ticket recién creado");
  ok((await page.locator("[data-qr-ticket] svg").count()) === 1, "el ticket muestra el QR");
  ok(await page.getByRole("button", { name: /Imprimir ticket/ }).isVisible(), "tiene botón de imprimir");
  const wa = await page.locator('[data-acciones-ticket] a[href^="https://wa.me/"]').getAttribute("href");
  ok(wa && decodeURIComponent(wa).includes("/ticket/"), "WhatsApp lleva el enlace del ticket");
  await foto(page, "2-ticket");

  const ticket = await db.parkingTicket.findFirst({ where: { userId: user.id, plate: "ABC123" } });
  ok(Boolean(ticket), "el ticket queda con la placa normalizada");

  console.log("QR público");
  const cliente = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pub = await cliente.newPage();
  await pub.goto(BASE + "/ticket/" + ticket.qrToken, { waitUntil: "load" });
  ok(await pub.getByText("ABC123").first().isVisible(), "la página pública muestra la placa");
  await pub.waitForFunction(() => /\d\d:\d\d:\d\d/.test(document.querySelector("[data-reloj]")?.textContent ?? ""));
  ok(true, "el reloj corre");
  const cobro = await pub.locator("[data-cobro]").textContent();
  ok(/3\.000/.test(cobro ?? ""), "muestra lo que va a pagar", cobro);
  ok(await pub.getByText(/Desde .* hasta .* por día/).isVisible(), "muestra el rango de precios");
  ok(await pub.getByText("Calle 10 # 5-20", { exact: false }).isVisible(), "muestra la dirección");
  ok(await pub.getByRole("link", { name: /Ver en el mapa/ }).isVisible(), "tiene el enlace al mapa");
  await foto(pub, "3-qr-publico");
  const otro = await pub.goto(BASE + "/ticket/no-existe-" + S, { waitUntil: "load" });
  ok(otro?.status() === 404, "un token inventado no muestra nada");

  console.log("Salida pagando");
  await page.goto(BASE + "/panel/parqueadero/" + ticket.id, { waitUntil: "load" });
  await page.click('form[data-salida-parqueadero] button[type="submit"]');
  await page.getByText(/Cobrado/).first().waitFor({ timeout: 20000 });
  const venta = await db.sale.findFirst({ where: { parkingTicketId: ticket.id } });
  ok(venta?.origin === "PARQUEADERO" && venta.total === 3000, "la salida crea la venta de $3.000", JSON.stringify(venta));

  console.log("Salida sin pagar");
  await page.goto(BASE + "/panel/parqueadero", { waitUntil: "load" });
  await page.fill('input[name="plate"]', "MOT12D");
  await page.getByText("Moto", { exact: true }).click();
  await page.click('form[data-ingreso-parqueadero] button[type="submit"]');
  await page.waitForURL(/\?nuevo=1/, { timeout: 30000 });
  page.once("dialog", (d) => d.accept());
  await page.getByText("Sale sin pagar").click();
  await page.click('form[data-salida-parqueadero] button[type="submit"]');
  await page.getByText(/Quedó en pendientes por pagar/).waitFor({ timeout: 20000 });
  await page.goto(BASE + "/panel/parqueadero", { waitUntil: "load" });
  ok(await page.locator("[data-por-cobrar]").getByText("MOT12D").isVisible(), "queda en pendientes por pagar");
  await foto(page, "4-parqueadero-con-movimiento");

  console.log("Tarifas");
  await page.goto(BASE + "/panel/parqueadero/tarifas", { waitUntil: "load" });
  const formCarro = page.locator("form[data-tarifa-form]").filter({ has: page.locator('input[value="Carro"]') });
  await formCarro.locator('input[name="pricePerHour"]').fill("4000");
  await formCarro.locator('button[type="submit"]').click();
  await page.getByText("Tarifa actualizada.").waitFor({ timeout: 20000 });
  const carro = await db.parkingRate.findFirst({ where: { userId: user.id, name: "Carro" } });
  ok(carro?.pricePerHour === 4000, "el dueño cambia el precio por hora");
  await foto(page, "5-tarifas");

  console.log("Resumen del día");
  await page.goto(BASE + "/panel", { waitUntil: "load" });
  const resumen = await page.locator("[data-resumen-parqueadero]").textContent();
  ok(/Pendientes por pagar\s*1/.test(resumen ?? ""), "el resumen cuenta el pendiente", resumen);
  ok(/Salieron hoy\s*2/.test(resumen ?? ""), "el resumen cuenta las salidas", resumen);
  await foto(page, "6-resumen");

  await db.user.delete({ where: { id: user.id } });
} catch (e) {
  fallos++;
  console.log("  MAL  " + (e instanceof Error ? e.message : String(e)));
} finally {
  await browser.close();
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien." : "\n" + fallos + " fallo(s).");
process.exit(fallos === 0 ? 0 : 1);
