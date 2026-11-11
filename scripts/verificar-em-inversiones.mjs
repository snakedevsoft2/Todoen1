/**
 * Comprueba en un navegador de verdad lo que pidio EM Inversiones el 10 nov
 * 2026 (ver src/lib/em-inversiones.ts):
 *
 * 1. Domingos y festivos sin cuota (el plan del cliente diario los salta).
 * 2. El cobro del dia: todos los recibos de una y la planilla del cobrador.
 * 3. El recibo de abono corto, con la cuota.
 * 4. Renovar un prestamo descontando lo que debe, y deshacerlo.
 * 5. Otro negocio de cartera no ve nada de esto.
 *
 * Las fechas son fijas alrededor del festivo del lunes 16 nov 2026 (domingo
 * 15, festivo 16), asi que da lo mismo el dia en que se corra.
 *
 * Antes de correrlo: docker start ten-pg, y la aplicacion en localhost:3000
 * (npm run dev, o npm run build && npm start). Despues:
 *   node scripts/verificar-em-inversiones.mjs
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

const S = "em-" + Date.now();
const CLAVE = "demo1234";

async function crearCuenta(nombre, slug) {
  return db.user.create({
    data: {
      email: slug + "@test.local",
      passwordHash: bcrypt.hashSync(CLAVE, 10),
      ownerName: "Emerson",
      businessName: nombre,
      businessType: "CARTERA",
      slug,
      phone: "3226483731",
      staff: { create: { name: "Emerson", role: "DUENO" } },
    },
  });
}

/** 100.000 en 10 cuotas diarias, prestado el viernes 13 nov 2026. */
async function prestamo(userId, clientName, abonos = []) {
  const d = await db.debt.create({
    data: {
      userId,
      clientName,
      clientPhone: "3001112233",
      clientAddress: "Calle 10 #5-20",
      concept: "Préstamo",
      amount: 100000,
      principal: 80000,
      interestPct: 25,
      installments: 10,
      frequency: "DIARIA",
      day: "2026-11-13",
      dueDay: "2026-11-23",
      receiptSeq: 40 + clientName.length,
    },
  });
  for (const amount of abonos) {
    await db.debtPayment.create({
      data: { userId, debtId: d.id, amount, day: "2026-11-14", method: "EFECTIVO", receiptSeq: 90 },
    });
  }
  return d;
}

const em = await crearCuenta("EM INVERSIONES", "em-inversiones-" + S);
const otro = await crearCuenta("Creditos " + S, "creditos-" + S);

const zoila = await prestamo(em.id, "Zoila Pérez");
const ana = await prestamo(em.id, "Ana Ruiz", [10000]);
await prestamo(em.id, "Adelantado Gómez", [20000]);
const delOtro = await prestamo(otro.id, "Zoila Pérez");

const browser = await chromium.launch({ channel: "msedge" });

/** Entra con la cuenta y deja window.print grabando lo que se iba a imprimir. */
async function entrar(user) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  await ctx.addInitScript(() => {
    window.__impresiones = [];
    window.print = () => {
      window.__impresiones.push(document.getElementById("ten-impresion")?.innerHTML ?? "");
    };
  });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', CLAVE);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel|\/bienvenida/, { timeout: 60000 });
  return page;
}

const impresiones = (page) => page.evaluate(() => window.__impresiones);
const ultima = async (page) => (await impresiones(page)).at(-1) ?? "";

try {
  const page = await entrar(em);

  console.log("\n1. El plan del cliente diario salta el domingo y el festivo");
  await page.goto(BASE + "/panel/cartera/" + ana.id, { waitUntil: "networkidle" });
  const ficha = await page.textContent("body");
  ok(/Sin domingos ni festivos/.test(ficha), "la ficha lo dice");
  ok(!/15\/11\/2026/.test(ficha) && !/16\/11\/2026/.test(ficha), "no hay cuota el 15 ni el 16 de noviembre");
  ok(/Vence 26\/11\/2026/.test(ficha), "el vencimiento se corre al 26 (antes era el 23)");

  console.log("\n2. El recibo de abono es corto y dice la cuota");
  await page.getByRole("button", { name: /^Imprimir$/ }).first().click();
  await page.waitForTimeout(600);
  // La primera vez pregunta el papel.
  if (await page.locator("[data-menu-imprimir]").count()) {
    await page.locator("[data-menu-imprimir] button", { hasText: "Tirilla 58 mm" }).click();
  }
  await page.waitForFunction(() => window.__impresiones.length > 0, null, { timeout: 15000 });
  const recibo = await ultima(page);
  ok(/Cuota 1 de 10/.test(recibo), "dice la cuota que pago", recibo.slice(0, 200));
  ok(/Cuotas pagadas/.test(recibo), "y cuantas lleva");
  ok(!/Abonos anteriores/.test(recibo) && !/Calle 10/.test(recibo), "sin lista de abonos ni direccion");

  console.log("\n3. El cobro del dia (martes 17, despues del festivo)");
  await page.goto(BASE + "/panel/cartera/cobro?dia=2026-11-17", { waitUntil: "networkidle" });
  const cobro = await page.textContent("body");
  ok(/Zoila Pérez/.test(cobro) && /Ana Ruiz/.test(cobro), "salen los dos que deben");
  ok(!/Adelantado Gómez/.test(cobro), "quien ya pago la de ese dia no sale");
  ok(/Cuota 1 de 10/.test(cobro) && /Cuota 2 de 10/.test(cobro), "con la cuota en que va cada uno");
  ok(/Atrasado 1 cuota/.test(cobro), "Zoila sale atrasada una cuota (la del sabado)");
  ok(/30[.,]000/.test(cobro), "total a cobrar 30.000");
  if (DIR) await page.screenshot({ path: DIR + "/em-cobro.png", fullPage: true });

  const n = (await impresiones(page)).length;
  const botones = page.locator("[data-cobro-del-dia]");
  await botones.getByRole("button", { name: /Imprimir los recibos \(2\)/ }).click();
  await page.waitForFunction((k) => window.__impresiones.length > k, n, { timeout: 15000 });
  const rollo = await ultima(page);
  ok((rollo.match(/class="ti-corte"/g) ?? []).length === 1, "los dos recibos en un rollo, con un corte en medio");
  ok(/RECIBO DE PAGO/.test(rollo) && /2 de 10/.test(rollo) && /Queda debiendo/.test(rollo), "cada recibo con su cuota y lo que queda");

  await botones.getByRole("button", { name: "Elegir tamano de impresion" }).first().click();
  await page.locator("[data-menu-imprimir] button", { hasText: "Hoja carta" }).click();
  await page.waitForFunction((k) => window.__impresiones.length > k + 1, n, { timeout: 15000 });
  const hoja = await ultima(page);
  ok((hoja.match(/class="ti-celda"/g) ?? []).length === 2, "en hoja normal, un recuadro por recibo");

  // Cada boton se queda con el papel que habia al abrir la pantalla (58 mm).
  await botones.getByRole("button", { name: "Imprimir la planilla" }).click();
  await page.waitForFunction((k) => window.__impresiones.length > k + 2, n, { timeout: 15000 });
  const planillaRollo = await ultima(page);
  ok(/PLANILLA DE COBRO/.test(planillaRollo) && /TOTAL/.test(planillaRollo), "la planilla en el rollo de la termica");

  await botones.getByRole("button", { name: "Elegir tamano de impresion" }).nth(1).click();
  await page.locator("[data-menu-imprimir] button", { hasText: "Hoja carta" }).click();
  await page.waitForFunction((k) => window.__impresiones.length > k + 3, n, { timeout: 15000 });
  const planilla = await ultima(page);
  ok(/Planilla de cobro/.test(planilla) && (planilla.match(/<tr>/g) ?? []).length === 4, "y en hoja: los dos clientes y el total");
  const wa = await botones.getByRole("link", { name: /Planilla por WhatsApp/ }).getAttribute("href");
  ok(/^https:\/\/wa\.me\/\?text=/.test(wa ?? "") && /Zoila/.test(decodeURIComponent(wa ?? "")), "y por WhatsApp");

  console.log("\n4. El domingo y el festivo no se cobra");
  await page.goto(BASE + "/panel/cartera/cobro?dia=2026-11-16", { waitUntil: "networkidle" });
  const festivo = await page.textContent("body");
  ok(/no se cobra/.test(festivo) && /Independencia de Cartagena/.test(festivo), "el festivo con su nombre");
  ok(!/Imprimir los recibos/.test(festivo), "sin nada que imprimir");
  await page.goto(BASE + "/panel/cartera/cobro?dia=2026-11-15", { waitUntil: "networkidle" });
  ok(/Domingo/.test(await page.textContent("body")), "el domingo tampoco");

  console.log("\n5. Renovar descontando lo que debe");
  await page.goto(BASE + "/panel/cartera/" + zoila.id, { waitUntil: "networkidle" });
  await page.getByText(/Renovar \(debe/).click();
  const form = page.locator("form[data-renovar]");
  await form.locator('input[name="principal"]').fill("150000");
  await page.waitForTimeout(400);
  const vista = await form.textContent();
  ok(/Le entregas en la mano/.test(vista) && /50[.,]000/.test(vista), "dice cuanto le entrega: 150.000 - 100.000");
  await form.getByRole("button", { name: /Renovar el préstamo/ }).click();
  await page.getByText(/Préstamo renovado/).waitFor({ timeout: 20000 });

  const vieja = await db.debt.findUnique({ where: { id: zoila.id }, include: { payments: true, renewedInto: true } });
  ok(vieja?.status === "PAGADA", "el anterior queda pagado", vieja?.status);
  const cierre = vieja?.payments.find((p) => p.renewal);
  ok(cierre?.amount === 100000 && cierre?.saleId === null, "con un abono de renovacion que no entra a la caja");
  const nueva = vieja?.renewedInto;
  ok(nueva?.principal === 150000 && nueva?.amount === 187500, "el nuevo: 150.000 al 25% = 187.500", String(nueva?.amount));
  ok(nueva?.clientAddress === "Calle 10 #5-20" && nueva?.frequency === "DIARIA", "copia los datos y la frecuencia");
  ok((await db.sale.count({ where: { userId: em.id } })) === 0, "no se creo ninguna venta");

  await page.reload({ waitUntil: "networkidle" });
  const renovada = await page.textContent("body");
  ok(/Se renovó en el préstamo/.test(renovada), "la ficha vieja dice que se renovo");
  ok(!/Renovar \(debe/.test(renovada), "y ya no deja renovarla otra vez");

  console.log("\n6. Borrar el nuevo deshace la renovacion");
  await page.goto(BASE + "/panel/cartera/" + nueva.id, { waitUntil: "networkidle" });
  ok(/Es la renovación del préstamo/.test(await page.textContent("body")), "el nuevo dice de cual salio");
  await page.getByRole("button", { name: /Borrar/ }).last().click();
  await page.waitForTimeout(2500);
  const deshecha = await db.debt.findUnique({ where: { id: zoila.id }, include: { payments: true } });
  ok(deshecha?.status === "PENDIENTE" && deshecha.payments.length === 0, "el anterior vuelve a deber lo de antes");
  ok((await db.debt.count({ where: { id: nueva.id } })) === 0, "y el nuevo ya no existe");

  console.log("\n7. Otro negocio de cartera sigue igual");
  const otra = await entrar(otro);
  const r = await otra.goto(BASE + "/panel/cartera/cobro", { waitUntil: "networkidle" });
  ok(r?.status() === 404, "no tiene el cobro del dia", String(r?.status()));
  await otra.goto(BASE + "/panel/cartera/" + delOtro.id, { waitUntil: "networkidle" });
  const suya = await otra.textContent("body");
  ok(/15\/11\/2026/.test(suya) && /16\/11\/2026/.test(suya), "su plan sigue cobrando domingo y festivo");
  ok(!/Renovar el préstamo/.test(suya) && !/Sin domingos ni festivos/.test(suya), "ni renovar ni el aviso");
  await otra.goto(BASE + "/panel/cartera", { waitUntil: "networkidle" });
  ok(!/Cobro del día/.test(await otra.textContent("body")), "ni el boton del cobro del dia");
} finally {
  await browser.close();
  for (const u of [em, otro]) {
    await db.debtPayment.deleteMany({ where: { userId: u.id } });
    await db.debt.updateMany({ where: { userId: u.id }, data: { renewedFromId: null } });
    await db.debt.deleteMany({ where: { userId: u.id } });
    await db.user.delete({ where: { id: u.id } }).catch(() => {});
  }
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
