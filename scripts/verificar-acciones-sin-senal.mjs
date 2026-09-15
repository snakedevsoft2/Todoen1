/**
 * Comprueba en un navegador que el panel guarde cambios sin señal.
 *
 * Lo que se prueba, sin señal y en pantallas abiertas en frío:
 *   - anotar un gasto (formulario con mensaje),
 *   - agregar un producto a una cuenta de mesa que ya existía (botón),
 *   - registrar un abono de cartera,
 * que el panel muestre cuántos cambios esperan, que nada llegue todavía al
 * servidor, y que al volver la señal todo suba solo y una sola vez.
 *
 * Antes:   npm run build && npm start
 * Después: npm run verificar:acciones-sin-senal
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

const S = "acc-" + Date.now();
const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const cuenta = await db.user.create({
  data: {
    email: "acc-" + S + "@test.local",
    passwordHash: bcrypt.hashSync("demo1234", 10),
    ownerName: "Dueña",
    businessName: "Negocio " + S,
    businessType: "OTRO",
    slug: "negocio-" + S,
    staff: { create: { name: "Dueña", role: "DUENO", onboardingDoneAt: new Date(), tourDoneAt: new Date() } },
    services: { create: { name: "Café prueba", price: 3000, category: "Bebidas", bookable: false } },
    accountModules: { create: [{ moduleKey: "cartera", enabled: true }, { moduleKey: "cuentas", enabled: true }] },
  },
});
const mesa = await db.order.create({ data: { userId: cuenta.id, label: "Mesa sin senal", day: hoy } });
const deuda = await db.debt.create({ data: { userId: cuenta.id, clientName: "Juan Deuda", concept: "Fiado prueba", amount: 50000, day: hoy } });

const errores = [];
const browser = await chromium.launch({ channel: "msedge" });

const guardada = (page, ruta) =>
  page.evaluate(async (r) => Boolean(await (await caches.open("ten-paginas-v1")).match(location.origin + r)), ruta);

async function abrirEnFrio(page, ruta) {
  try {
    await page.goto(BASE + ruta, { waitUntil: "domcontentloaded", timeout: 20000 });
  } catch (e) {
    ok(false, "abre " + ruta + " sin red", String(e).slice(0, 100));
  }
  await page.waitForTimeout(2500);
}

const pendientes = (page) => page.locator("[data-acciones-pendientes]").textContent().catch(() => "");

try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on("response", (r) => r.status() >= 500 && r.status() !== 503 && errores.push(r.status() + " " + r.url()));

  await page.goto(BASE + "/login", { waitUntil: "load" });
  await page.fill('input[name="email"]', cuenta.email);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel/, { timeout: 25000 });

  console.log("\n1. Con señal, las pantallas quedan guardadas");
  for (const ruta of ["/panel/gastos", "/panel/cuentas/" + mesa.id, "/panel/cartera/" + deuda.id]) {
    await page.goto(BASE + ruta, { waitUntil: "load" });
    ok(Boolean(await esperarHasta(() => guardada(page, ruta), 30000)), ruta + " quedó guardada");
  }

  console.log("\n2. Sin señal, guardar cambios");
  await ctx.setOffline(true);

  await abrirEnFrio(page, "/panel/gastos");
  const formGasto = page.locator("form", { has: page.locator('input[name="description"]') });
  await formGasto.locator('input[name="description"]').fill("Hielo sin senal");
  await formGasto.locator('input[name="amount"]').fill("8000");
  await formGasto.locator('button[type="submit"]').click();
  ok(Boolean(await esperarHasta(() => page.getByText(/quedó guardado en este teléfono/).count())), "el gasto queda guardado en el teléfono");
  ok(Boolean(await esperarHasta(async () => /1 cambio/.test(await pendientes(page)))), "el panel muestra 1 cambio esperando señal");

  await abrirEnFrio(page, "/panel/cuentas/" + mesa.id);
  await page.getByRole("button", { name: /Café prueba/ }).first().click();
  ok(Boolean(await esperarHasta(async () => /2 cambios/.test(await pendientes(page)))), "agregar a la mesa queda en la cola");

  await abrirEnFrio(page, "/panel/cartera/" + deuda.id);
  const formAbono = page.locator("form", { has: page.locator('input[name="amount"]') }).first();
  await formAbono.locator('input[name="amount"]').fill("20000");
  await formAbono.locator('button[type="submit"]').click();
  ok(Boolean(await esperarHasta(async () => /3 cambios/.test(await pendientes(page)))), "el abono queda en la cola: 3 cambios esperando señal");
  const lista = await pendientes(page);
  ok(/Nuevo gasto: Hielo sin senal/.test(lista) && /Agregar a una cuenta/.test(lista) && /Abono/.test(lista), "cada cambio se ve con su nombre", lista);
  if (DIR) await page.screenshot({ path: DIR + "/acciones-sin-senal.png", fullPage: true });

  const nada =
    (await db.expense.count({ where: { userId: cuenta.id } })) +
    (await db.orderItem.count({ where: { orderId: mesa.id } })) +
    (await db.debtPayment.count({ where: { debtId: deuda.id } }));
  ok(nada === 0, "nada llegó todavía al servidor", String(nada));

  console.log("\n3. Vuelve la señal y todo sube solo, una vez");
  await ctx.setOffline(false);
  await page.goto(BASE + "/panel/gastos", { waitUntil: "load" });
  ok(Boolean(await esperarHasta(async () => (await db.expense.count({ where: { userId: cuenta.id, description: "Hielo sin senal", amount: 8000 } })) === 1, 30000)), "llegó el gasto");
  ok(Boolean(await esperarHasta(async () => (await db.orderItem.count({ where: { orderId: mesa.id, name: "Café prueba" } })) === 1, 30000)), "llegó el café a la mesa");
  ok(Boolean(await esperarHasta(async () => (await db.debtPayment.count({ where: { debtId: deuda.id, amount: 20000 } })) === 1, 30000)), "llegó el abono");
  await page.waitForTimeout(5000);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(3000);
  ok(
    (await db.expense.count({ where: { userId: cuenta.id } })) === 1 &&
      (await db.orderItem.count({ where: { orderId: mesa.id } })) === 1 &&
      (await db.debtPayment.count({ where: { debtId: deuda.id } })) === 1,
    "sin repetidos"
  );
  ok((await db.offlineAction.count({ where: { userId: cuenta.id, estado: "HECHO" } })) === 3, "las tres quedaron anotadas como hechas");
  ok((await page.locator("[data-acciones-pendientes]").count()) === 0, "ya no quedan cambios esperando");
  ok((await page.getByText("Hielo sin senal").count()) > 0, "y el gasto aparece en la lista");

  console.log("\n4. Errores durante el recorrido");
  ok(errores.length === 0, "ningún error 500", errores.slice(0, 3).join(" | "));
  await ctx.close();
} finally {
  await browser.close();
  await db.user.delete({ where: { id: cuenta.id } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
