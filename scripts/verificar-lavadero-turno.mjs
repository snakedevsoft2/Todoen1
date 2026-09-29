/**
 * El lavadero en el navegador: carros pendientes de un dia para otro, el
 * resumen partido entre el lavadero y los lavadores, la entrega de turno de un
 * jefe de patio al siguiente, y el lavador marcando su salida.
 *
 * Necesita el servidor en http://localhost:3000 (npm run dev).
 */
import "dotenv/config";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const BASE = "http://localhost:3000";
const db = new PrismaClient();
const fallas = [];
const ok = (c, t) => {
  console.log((c ? "  OK   " : "  !!   ") + t);
  if (!c) fallas.push(t);
};

const S = "turno-" + Date.now();
const zona = "America/Bogota";
const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(new Date());
const ayer = new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(new Date(Date.now() - 86400000));
const clave = bcrypt.hashSync("demo1234", 10);
const listo = new Date();

const user = await db.user.create({
  data: {
    email: "dueno-" + S + "@test.local",
    passwordHash: clave,
    ownerName: "Dueño",
    businessName: "Lavadero " + S,
    businessType: "LAVADERO",
    slug: "lav-" + S,
    timezone: zona,
    staff: {
      create: [
        { name: "Dueño", role: "DUENO", onboardingDoneAt: listo, tourDoneAt: listo },
        { name: "Andrés", role: "SUPERVISOR", email: "andres-" + S + "@test.local", passwordHash: clave, onboardingDoneAt: listo, tourDoneAt: listo },
        { name: "Camila", role: "SUPERVISOR", email: "camila-" + S + "@test.local", passwordHash: clave, onboardingDoneAt: listo, tourDoneAt: listo },
        { name: "Jhon", role: "VENDEDOR", commissionPct: 40, email: "jhon-" + S + "@test.local", passwordHash: clave, onboardingDoneAt: listo, tourDoneAt: listo },
      ],
    },
  },
  include: { staff: true },
});
const jhon = user.staff.find((s) => s.name === "Jhon");
const andres = user.staff.find((s) => s.name === "Andrés");

// Un carro de ayer sin entregar y uno de hoy ya cobrado por 20.000 con Jhon.
await db.washJob.create({
  data: { userId: user.id, day: ayer, clientName: "Cliente de ayer", clientPhone: "300", vehiclePlate: "AYE-001", serviceName: "Lavado", price: 18000, status: "LAVANDO", assignedStaffId: jhon.id, receivedById: andres.id },
});
const cobrado = await db.washJob.create({
  data: { userId: user.id, day: hoy, clientName: "Cliente de hoy", clientPhone: "301", vehiclePlate: "HOY-002", serviceName: "Lavado", price: 20000, status: "ENTREGADO", assignedStaffId: jhon.id, deliveredAt: new Date() },
});
await db.sale.create({
  data: { userId: user.id, day: hoy, total: 20000, paymentMethod: "EFECTIVO", origin: "LAVADO", staffId: jhon.id, washJobId: cobrado.id, items: { create: [{ userId: user.id, name: "Lavado", unitPrice: 20000, qty: 1 }] } },
});

const browser = await chromium.launch({ channel: "msedge" });
const errores = [];

async function entrar(correo) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  // Saltar la presentacion que sale antes del login la primera vez.
  await ctx.addInitScript(() => localStorage.setItem("todoen1_onboarding_seen", "true"));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errores.push(e.message));
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', correo);
  await page.fill('input[name="password"]', "demo1234");
  await Promise.all([page.waitForURL(/\/panel/, { timeout: 60000 }), page.click('button[type="submit"]')]);
  return { ctx, page };
}

const shot = (page, n) =>
  page.screenshot({ path: process.env.SHOTS ? process.env.SHOTS + "/" + n + ".png" : undefined, fullPage: true });

try {
  // --- Dueño: resumen del dia partido.
  {
    const { ctx, page } = await entrar(user.email);
    await page.goto(BASE + "/panel", { waitUntil: "networkidle" });
    const reparto = await page.locator("[data-reparto-lavadero]").innerText();
    ok(/Ingreso del lavadero[\s\S]*12[.,]000/i.test(reparto), "resumen: ingreso del lavadero 12.000");
    ok(/Para los lavadores[\s\S]*8[.,]000/i.test(reparto), "resumen: para los lavadores 8.000");
    const pend = await page.locator("[data-carros-pendientes]").innerText();
    ok(pend.includes("AYE-001"), "resumen: el carro de ayer aparece pendiente");
    await shot(page, "1-resumen-dueno");
    await ctx.close();
  }

  // --- Andres (jefe de patio): ve el pendiente de ayer y entrega el turno a Camila.
  {
    const { ctx, page } = await entrar("andres-" + S + "@test.local");
    await page.goto(BASE + "/panel/patio", { waitUntil: "networkidle" });
    ok((await page.content()).includes("Pendiente desde el"), "patio: marca el carro de ayer");
    await page.goto(BASE + "/panel/patio/entrega", { waitUntil: "networkidle" });
    await page.selectOption('select[name="toStaffId"]', { label: "Camila" });
    await page.fill('input[name="cashDelivered"]', "20000");
    await page.fill('textarea[name="notes"]', "AYE-001 lo recogen mañana");
    page.once("dialog", (d) => d.accept());
    await page.click("text=Entregar turno >> nth=-1");
    await page.waitForSelector("text=Turno entregado a Camila", { timeout: 30000 });
    ok(true, "entrega: Andrés entregó el turno a Camila");
    ok(await page.locator('a[href="/panel/marcar"]:has-text("Marcar mi salida")').count() > 0, "entrega: ofrece marcar la salida");
    await shot(page, "2-entrega-andres");
    await ctx.close();
  }

  const entrega = await db.patioHandover.findFirst({ where: { userId: user.id } });
  ok(entrega?.pendingCount === 1 && entrega.totalSales === 20000 && entrega.totalCommissions === 8000, "entrega: guardó pendientes, cobrado y comisiones");

  // --- Camila: ve el aviso en el patio y recibe.
  {
    const { ctx, page } = await entrar("camila-" + S + "@test.local");
    await page.goto(BASE + "/panel/patio", { waitUntil: "networkidle" });
    ok((await page.content()).includes("te entregó el patio"), "patio: Camila ve que le entregaron");
    await page.goto(BASE + "/panel/patio/entrega", { waitUntil: "networkidle" });
    await shot(page, "3-recibir-camila");
    await page.click("text=Recibí el patio así");
    // El boton cambia a "..." mientras envia: se espera a que la entrega salga como recibida.
    await page.waitForSelector("text=Recibió Camila", { timeout: 30000 }).catch(() => {});
    await page.waitForLoadState("networkidle");
    const recibida = await db.patioHandover.findUnique({ where: { id: entrega.id } });
    ok(Boolean(recibida?.receivedAt), "entrega: Camila la recibió");
    await ctx.close();
  }

  // --- Jhon (lavador): ve su pendiente de ayer y el acceso para marcar.
  {
    const { ctx, page } = await entrar("jhon-" + S + "@test.local");
    await page.goto(BASE + "/panel/mis-lavados", { waitUntil: "networkidle" });
    ok((await page.content()).includes("AYE-001"), "mis lavados: ve su carro pendiente de ayer");
    ok((await page.locator("[data-jornada-lavador]").innerText()).includes("Marcar entrada"), "mis lavados: acceso a marcar entrada");
    await db.attendance.create({ data: { userId: user.id, staffId: jhon.id, kind: "ENTRADA", clientKey: "k-" + S, markedAt: new Date(Date.now() - 3600000) } });
    await page.reload({ waitUntil: "networkidle" });
    ok((await page.locator("[data-jornada-lavador]").innerText()).includes("Marcar salida"), "mis lavados: con entrada abierta ofrece marcar salida");
    await shot(page, "4-mis-lavados-jhon");
    await page.click("[data-jornada-lavador]");
    await page.waitForURL(/\/panel\/marcar/);
    ok((await page.content()).includes("Volver a mis lavados"), "marcar: el lavador no ve enlaces a pantallas que no son suyas");
    await shot(page, "5-marcar-jhon");
    await ctx.close();
  }

  ok(errores.length === 0, "sin errores de JavaScript en la página" + (errores.length ? ": " + errores[0] : ""));
} finally {
  await browser.close();
  await db.user.deleteMany({ where: { slug: { contains: S } } });
  await db.$disconnect();
}

console.log(fallas.length ? "\n" + fallas.length + " fallas" : "\nTodo bien");
process.exit(fallas.length ? 1 : 0);
