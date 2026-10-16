/**
 * La dueña del lavadero borra y corrige cualquier registro, viendo antes qué
 * se borra y qué cambia.
 *
 * Lo que se prueba, en un navegador:
 *   - Borrar una venta de un lavado abre el aviso con lo que se borra y lo que
 *     cambia (caja, comisión, vehículo, sello). Cancelar no borra nada; "Sí,
 *     borrar" la borra y el vehículo vuelve a Pendientes.
 *   - Patio > Historial: corrige la placa de un vehículo ya cobrado y lo borra
 *     con su venta.
 *   - Borra un "Pendiente" dejado desde Ventas, un gasto y una entrega de turno.
 *   - El jefe de patio no ve nada de esto, y el historial no le abre.
 *
 * Antes:   npm run build && npm start
 * Después: npm run verificar:borrar-duena
 */
import "dotenv/config";
import { chromium } from "playwright";
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
const esperarHasta = async (fn, ms = 20000) => {
  const fin = Date.now() + ms;
  let v = await fn();
  while (!v && Date.now() < fin) {
    await new Promise((r) => setTimeout(r, 400));
    v = await fn();
  }
  return v;
};

const S = "borrar-" + Date.now();
const zona = "America/Bogota";
const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(new Date());
const clave = bcrypt.hashSync("demo1234", 10);
const listo = new Date();

const user = await db.user.create({
  data: {
    paidUntil: new Date(Date.now() + 30 * 86_400_000),
    email: "fer-" + S + "@test.local",
    passwordHash: clave,
    ownerName: "Fer",
    businessName: "Lavadero " + S,
    businessType: "LAVADERO",
    slug: "lav-" + S,
    timezone: zona,
    loyaltyGoal: 5,
    staff: {
      create: [
        { name: "Fer", role: "DUENO", onboardingDoneAt: listo, tourDoneAt: listo },
        { name: "Andrés", role: "SUPERVISOR", email: "andres-" + S + "@test.local", passwordHash: clave, onboardingDoneAt: listo, tourDoneAt: listo },
        { name: "Jhon", role: "VENDEDOR", commissionPct: 40, email: "jhon-" + S + "@test.local", passwordHash: clave, onboardingDoneAt: listo, tourDoneAt: listo },
      ],
    },
  },
  include: { staff: true },
});
const jhon = user.staff.find((s) => s.name === "Jhon");
const andres = user.staff.find((s) => s.name === "Andrés");
const cliente = await db.customer.create({ data: { userId: user.id, name: "Carlos", phone: "3001112233" } });
const tarjeta = await db.loyaltyCard.create({ data: { userId: user.id, customerId: cliente.id, stamps: 0 } });

/** Un lavado cobrado, con su venta y su sello, como lo deja el patio. */
async function lavado(placa, recibo) {
  const job = await db.washJob.create({
    data: { userId: user.id, day: hoy, clientName: "Carlos", clientPhone: "3001112233", customerId: cliente.id, vehiclePlate: placa, vehicleType: "carro", serviceName: "Lavado completo", price: 25000, status: "ENTREGADO", assignedStaffId: jhon.id, receivedById: andres.id, deliveredAt: new Date() },
  });
  const sale = await db.sale.create({
    data: { userId: user.id, day: hoy, total: 25000, paymentMethod: "EFECTIVO", origin: "LAVADO", clientName: "Carlos", staffId: jhon.id, washJobId: job.id, receiptSeq: recibo, items: { create: [{ userId: user.id, name: "Lavado completo", unitPrice: 25000, qty: 1 }] } },
  });
  await db.loyaltyStamp.create({ data: { userId: user.id, loyaltyCardId: tarjeta.id, saleId: sale.id } });
  await db.loyaltyCard.update({ where: { id: tarjeta.id }, data: { stamps: { increment: 1 } } });
  return { job, sale };
}

const uno = await lavado("AAA-111", 7);
const dos = await lavado("BBB-222", 8);
const deuda = await db.debt.create({
  data: { userId: user.id, day: hoy, clientName: "Don José", amount: 15000, concept: "Lavado de moto", clientKey: "llave-" + S, staffId: andres.id },
});
const gasto = await db.expense.create({ data: { userId: user.id, day: hoy, description: "Shampoo", amount: 60000, category: "Insumos" } });
const entrega = await db.patioHandover.create({
  data: { userId: user.id, day: hoy, fromStaffId: andres.id, since: new Date(Date.now() - 3600000), vehiclesDelivered: 2, totalSales: 50000, totalCash: 50000, totalCard: 0, totalTransfer: 0, pendingCount: 0, pendingValue: 0, pendingSnapshot: [], cashDelivered: 50000 },
});

const browser = await chromium.launch({ channel: "msedge" });
const errores = [];

async function entrar(correo) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => localStorage.setItem("todoen1_onboarding_seen", "true"));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errores.push(e.message));
  page.on("response", (r) => r.status() >= 500 && errores.push(r.status() + " " + r.url()));
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', correo);
  await page.fill('input[name="password"]', "demo1234");
  await Promise.all([page.waitForURL(/\/panel/, { timeout: 60000 }), page.click('button[type="submit"]')]);
  return { ctx, page };
}

const aviso = (page) => page.locator("[data-confirmar-borrado]");
const foto = (page, n) => (DIR ? page.screenshot({ path: DIR + "/" + n + ".png" }) : Promise.resolve());

try {
  const { ctx, page } = await entrar(user.email);

  console.log("\n1. Borrar la venta de un lavado desde Ventas");
  await page.goto(BASE + "/panel/ventas", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Borrar venta" }).first().click();
  await aviso(page).waitFor({ timeout: 8000 });
  const texto = await aviso(page).innerText();
  await foto(page, "1-aviso-venta");
  ok(/Lo que se borra/i.test(texto) && /Qué cambia si lo borras/i.test(texto), "el aviso dice qué se borra y qué cambia");
  ok(/caja del .*efectivo baja/.test(texto), "dice que baja la caja del día", texto);
  ok(/Jhon.*deja de ganar/.test(texto), "dice que Jhon deja de ganar la comisión");
  ok(/vuelve a Pendientes del patio/.test(texto), "dice que el vehículo vuelve a Pendientes");
  ok(/pierde el sello/.test(texto), "dice que la tarjeta pierde el sello");
  ok(/Recibo #000[78]/.test(texto), "muestra el número de recibo");

  await aviso(page).getByRole("button", { name: "Cancelar" }).click();
  ok((await aviso(page).count()) === 0, "Cancelar cierra el aviso");
  ok((await db.sale.count({ where: { userId: user.id } })) === 2, "y no borra nada");

  // Escape tambien cierra.
  await page.getByRole("button", { name: "Borrar venta" }).first().click();
  await aviso(page).waitFor();
  await page.keyboard.press("Escape");
  ok((await aviso(page).count()) === 0, "Escape cierra el aviso");

  await page.getByRole("button", { name: "Borrar venta" }).first().click();
  await aviso(page).getByRole("button", { name: /Sí, borrar la venta/ }).click();
  ok(await esperarHasta(async () => (await db.sale.count({ where: { userId: user.id } })) === 1), "Sí, borrar la borra");
  // La de arriba es la mas reciente: la del BBB-222.
  ok((await db.washJob.findUnique({ where: { id: dos.job.id } }))?.status === "POR_COBRAR", "su vehículo quedó en Pendientes del patio");
  ok(Boolean(await db.sale.findUnique({ where: { id: uno.sale.id } })), "la otra venta sigue ahí");
  ok((await db.loyaltyCard.findUnique({ where: { id: tarjeta.id } }))?.stamps === 1, "la tarjeta quedó con un sello menos");

  console.log("\n2. Borrar un Pendiente dejado desde Ventas");
  await page.goto(BASE + "/panel/ventas", { waitUntil: "networkidle" });
  await page.locator("li", { hasText: "Don José" }).getByRole("button", { name: "Borrar" }).click();
  const textoDeuda = await aviso(page).innerText();
  ok(/Don José deja de deber/.test(textoDeuda) && /La caja no cambia/.test(textoDeuda), "el aviso dice que deja de deber y la caja no cambia");
  await aviso(page).getByRole("button", { name: /Sí, borrar/ }).click();
  ok(await esperarHasta(async () => !(await db.debt.findUnique({ where: { id: deuda.id } }))), "el pendiente se borró");

  console.log("\n3. Patio > Historial");
  await page.goto(BASE + "/panel/patio", { waitUntil: "networkidle" });
  ok((await page.getByRole("link", { name: "Historial" }).count()) === 1, "el patio tiene el enlace al historial");
  await page.getByRole("link", { name: "Historial" }).click();
  await page.waitForURL(/historial/);
  await page.waitForLoadState("networkidle");
  const fila = page.locator("[data-vehiculo-historial=" + JSON.stringify(uno.job.id) + "]");
  ok((await page.locator("[data-vehiculo-historial]").count()) === 2, "muestra los dos vehículos del día, cobrado y pendiente");

  await fila.getByText("Editar datos").click();
  await fila.locator('input[name="vehiclePlate"]').fill("AAA-999");
  await fila.getByRole("button", { name: "Guardar cambios" }).click();
  ok(
    await esperarHasta(async () => (await db.washJob.findUnique({ where: { id: uno.job.id } }))?.vehiclePlate === "AAA-999"),
    "corrige la placa de un vehículo ya cobrado"
  );
  ok((await db.washJob.findUnique({ where: { id: uno.job.id } }))?.price === 25000, "sin cambiarle el precio");

  await page.goto(BASE + "/panel/patio/historial?q=AAA", { waitUntil: "networkidle" });
  ok((await page.locator("[data-vehiculo-historial]").count()) === 1, "lo encuentra buscando por placa");
  await page.getByRole("button", { name: "Borrar vehículo" }).click();
  const textoVehiculo = await aviso(page).innerText();
  await foto(page, "2-aviso-vehiculo");
  ok(/Se borra también su venta/.test(textoVehiculo), "el aviso dice que se borra también su venta", textoVehiculo);
  ok(/AAA-999/.test(textoVehiculo), "con la placa corregida");
  await aviso(page).getByRole("button", { name: /Sí, borrar el vehículo/ }).click();
  ok(await esperarHasta(async () => !(await db.washJob.findUnique({ where: { id: uno.job.id } }))), "el vehículo se borró");
  ok(!(await db.sale.findUnique({ where: { id: uno.sale.id } })), "y su venta también");
  ok((await db.loyaltyCard.findUnique({ where: { id: tarjeta.id } }))?.stamps === 0, "y su sello");

  console.log("\n4. Un gasto y una entrega de turno");
  await page.goto(BASE + "/panel/gastos", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Borrar gasto" }).click();
  ok(/el neto de la caja de ese día sube/.test(await aviso(page).innerText()), "el aviso del gasto dice cómo cambia la caja");
  await aviso(page).getByRole("button", { name: /Sí, borrar el gasto/ }).click();
  ok(await esperarHasta(async () => !(await db.expense.findUnique({ where: { id: gasto.id } }))), "el gasto se borró");

  await page.goto(BASE + "/panel/patio/entrega", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Borrar entrega" }).click();
  ok(/Las ventas, los gastos y los vehículos del patio no cambian/.test(await aviso(page).innerText()), "el aviso de la entrega dice que lo demás no cambia");
  await aviso(page).getByRole("button", { name: /Sí, borrar la entrega/ }).click();
  ok(await esperarHasta(async () => !(await db.patioHandover.findUnique({ where: { id: entrega.id } }))), "la entrega se borró");

  const auditoria = await db.staffActivity.count({ where: { userId: user.id, tipo: "borrado" } });
  ok(auditoria >= 5, "cada borrado quedó en la auditoría", String(auditoria));
  await ctx.close();

  console.log("\n5. El jefe de patio no borra");
  {
    await db.expense.create({ data: { userId: user.id, day: hoy, description: "Cera", amount: 30000, category: "Insumos" } });
    const { ctx: c2, page: p2 } = await entrar("andres-" + S + "@test.local");
    await p2.goto(BASE + "/panel/ventas", { waitUntil: "networkidle" });
    ok((await p2.getByRole("button", { name: "Borrar venta" }).count()) === 0, "en Ventas no le sale borrar");
    await p2.goto(BASE + "/panel/patio", { waitUntil: "networkidle" });
    ok((await p2.getByRole("link", { name: "Historial" }).count()) === 0, "en el patio no tiene historial");
    await p2.goto(BASE + "/panel/patio/historial", { waitUntil: "networkidle" });
    ok(!p2.url().includes("/historial"), "y si escribe la dirección, no le abre", p2.url());
    await p2.goto(BASE + "/panel/gastos", { waitUntil: "networkidle" });
    ok((await p2.getByRole("button", { name: "Borrar gasto" }).count()) === 0, "en Gastos no le sale borrar");
    await c2.close();
  }

  ok(errores.length === 0, "sin errores en las pantallas", errores.join(" | "));
} finally {
  await browser.close();
  await db.user.delete({ where: { id: user.id } }).catch(() => undefined);
  await db.$disconnect();
}

console.log(fallos ? "\n" + fallos + " fallaron" : "\nTodo bien");
process.exit(fallos ? 1 : 0);
