/**
 * El lavadero sin señal, en un navegador, desde la aplicación instalada.
 *
 * Lo que se prueba:
 *   - El jefe de patio, sin señal: recibe un vehículo, lo ve en el tablero, le
 *     asigna lavador, lo marca listo y lo cobra. También registra una venta en
 *     Ventas. Nada llega todavía al servidor.
 *   - Al volver la señal, desde el patio (no hace falta abrir Ventas), todo
 *     sube solo y una sola vez: el vehículo queda entregado con su venta a
 *     nombre del lavador, el día de hoy.
 *   - El lavador, sin señal, marca "Ya terminé" y la pantalla lo muestra
 *     hecho; al volver la señal queda listo en el servidor.
 *   - Desde el navegador (sin la aplicación instalada) no se guarda nada en
 *     el teléfono: se avisa que hace falta abrir la aplicación instalada.
 *
 * Antes:   npm run build && npm start
 * Después: npm run verificar:lavadero-sin-senal
 */
import "dotenv/config";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const db = new PrismaClient();
let fallos = 0;
const ok = (c, t, extra = "") => {
  if (c) console.log("  OK   " + t);
  else {
    fallos++;
    console.log("  MAL  " + t + (extra ? "  <- " + extra : ""));
  }
};
const esperarHasta = async (fn, ms = 30000) => {
  const fin = Date.now() + ms;
  let v = await fn();
  while (!v && Date.now() < fin) {
    await new Promise((r) => setTimeout(r, 500));
    v = await fn();
  }
  return v;
};

const S = "lavoff-" + Date.now();
const zona = "America/Bogota";
const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(new Date());
const clave = bcrypt.hashSync("demo1234", 10);
const listo = new Date();

const user = await db.user.create({
  data: {
    // Con pago: solo la cuenta que pagó instala la aplicación y la usa sin señal.
    paidUntil: new Date(Date.now() + 30 * 86_400_000),
    email: "fer-" + S + "@test.local",
    passwordHash: clave,
    ownerName: "Fer",
    businessName: "Lavadero " + S,
    businessType: "LAVADERO",
    slug: "lav-" + S,
    timezone: zona,
    staff: {
      create: [
        { name: "Fer", role: "DUENO", onboardingDoneAt: listo, tourDoneAt: listo },
        { name: "Andrés", role: "SUPERVISOR", email: "andres-" + S + "@test.local", passwordHash: clave, onboardingDoneAt: listo, tourDoneAt: listo },
        { name: "Jhon", role: "VENDEDOR", commissionPct: 40, email: "jhon-" + S + "@test.local", passwordHash: clave, onboardingDoneAt: listo, tourDoneAt: listo },
      ],
    },
    services: { create: [{ name: "Lavado completo", price: 25000, category: "Lavados" }] },
  },
  include: { staff: true },
});
const jhon = user.staff.find((s) => s.name === "Jhon");

const browser = await chromium.launch({ channel: "msedge" });
const errores = [];

/**
 * Entra con ese correo. `instalada`: la pantalla se comporta como abierta desde
 * el icono del teléfono (display-mode: standalone), que es lo que mira
 * estaInstalada() en lib/instalar.ts.
 */
async function entrar(correo, instalada) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => localStorage.setItem("todoen1_onboarding_seen", "true"));
  if (instalada) {
    await ctx.addInitScript(() => {
      const original = window.matchMedia.bind(window);
      window.matchMedia = (q) =>
        q.includes("display-mode: standalone")
          ? { matches: true, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false }
          : original(q);
    });
  }
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errores.push(e.message));
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', correo);
  await page.fill('input[name="password"]', "demo1234");
  await Promise.all([page.waitForURL(/\/panel/, { timeout: 60000 }), page.click('button[type="submit"]')]);
  return { ctx, page };
}

/** Abre la pantalla con señal y espera a que quede guardada y la cuenta confirmada en el teléfono. */
async function dejarLista(page, ruta) {
  await page.goto(BASE + ruta, { waitUntil: "networkidle" });
  await esperarHasta(() => page.evaluate(() => Boolean(navigator.serviceWorker?.controller)));
  // La primera carga no pasó por el trabajador de fondo: se vuelve a abrir.
  await page.goto(BASE + ruta, { waitUntil: "networkidle" });
  return esperarHasta(() =>
    page.evaluate(async (r) => {
      const pagina = await (await caches.open("ten-paginas-v1")).match(location.origin + r);
      const lic = await (await caches.open("ten-licencia-v1")).match(location.origin + "/__licencia");
      return Boolean(pagina) && Boolean(lic) && (await lic.json()).activa === true;
    }, ruta)
  );
}

const tarjeta = (page, placa) => page.locator("[data-vehiculo]", { hasText: placa });

try {
  console.log("\n1. Jefe de patio con la aplicación instalada, sin señal");
  {
    const { ctx, page } = await entrar("andres-" + S + "@test.local", true);
    ok(await dejarLista(page, "/panel/ventas"), "Ventas quedó guardada en el teléfono");
    ok(await dejarLista(page, "/panel/patio"), "el patio quedó guardado en el teléfono");

    await ctx.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("text=Recibir vehículo", { timeout: 15000 });

    const recibir = page.locator("form", { has: page.locator('input[name="clientPhone"]') });
    await recibir.locator('input[name="clientName"]').fill("Cliente Sin Señal");
    await recibir.locator('input[name="clientPhone"]').fill("3110000000");
    await recibir.locator('input[name="vehiclePlate"]').fill("OFF-001");
    await recibir.locator('select[name="serviceId"]').selectOption({ index: 1 });
    await recibir.getByRole("button", { name: /Recibir vehículo/ }).click();
    ok(
      await page
        .getByText(/quedó guardado en este teléfono/)
        .first()
        .waitFor({ timeout: 8000 })
        .then(() => true, () => false),
      "recibir: avisa que quedó guardado en el teléfono"
    );
    ok(
      await tarjeta(page, "OFF-001").waitFor({ timeout: 8000 }).then(() => true, () => false),
      "recibir: el vehículo aparece en el tablero sin señal"
    );
    ok((await tarjeta(page, "OFF-001").locator("[data-sin-subir]").count()) === 1, "recibir: lleva la marca de sin subir");

    await tarjeta(page, "OFF-001").locator('select[name="staffId"]').selectOption({ label: "Jhon" });
    await tarjeta(page, "OFF-001").getByRole("button", { name: "Asignar" }).click();
    ok(
      await tarjeta(page, "OFF-001").getByText("Lo lava Jhon").waitFor({ timeout: 8000 }).then(() => true, () => false),
      "asignar: queda lavándolo Jhon"
    );

    await tarjeta(page, "OFF-001").getByRole("button", { name: "Ya está listo" }).click();
    ok(
      await tarjeta(page, "OFF-001").getByRole("button", { name: "Cobrar" }).waitFor({ timeout: 8000 }).then(() => true, () => false),
      "listo: pasa a Listo y ofrece cobrar"
    );

    await tarjeta(page, "OFF-001").getByRole("button", { name: "Cobrar" }).click();
    await tarjeta(page, "OFF-001").getByRole("button", { name: /Confirmar cobro/ }).click();
    ok(
      await esperarHasta(async () => (await tarjeta(page, "OFF-001").count()) === 0, 8000),
      "cobrar: el vehículo sale del patio"
    );
    const aviso = await page.locator("[data-acciones-pendientes]").innerText().catch(() => "");
    ok(/4 cambios[\s\S]*esperando señal/.test(aviso), "el aviso dice que 4 cambios esperan señal", aviso);

    // Sigue igual al volver a abrir la aplicación sin señal.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-acciones-pendientes]", { timeout: 15000 });
    ok((await tarjeta(page, "OFF-001").count()) === 0, "al reabrir sin señal el patio sigue como se dejó");

    console.log("\n2. Una venta en Ventas, sin señal");
    await page.goto(BASE + "/panel/ventas", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Lavado completo", exact: false }).first().click();
    await page.getByRole("button", { name: /Guardar venta/ }).click();
    await page.getByRole("button", { name: "Confirmar venta" }).click();
    ok(
      await page
        .getByText(/quedó guardada en este teléfono/)
        .first()
        .waitFor({ timeout: 8000 })
        .then(() => true, () => false),
      "la venta quedó guardada en el teléfono"
    );
    ok((await db.washJob.count({ where: { userId: user.id } })) === 0, "nada llegó todavía al servidor (vehículos)");
    ok((await db.sale.count({ where: { userId: user.id } })) === 0, "nada llegó todavía al servidor (ventas)");

    console.log("\n3. Vuelve la señal con el patio abierto: todo sube solo");
    await page.goto(BASE + "/panel/patio", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("text=Recibir vehículo", { timeout: 15000 });
    ok((await page.locator("[data-acciones-pendientes]").innerText()).includes("1 venta"), "el patio también cuenta la venta que espera");
    await ctx.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    const subido = await esperarHasta(
      async () => (await db.sale.count({ where: { userId: user.id } })) === 2 && (await page.locator("[data-acciones-pendientes]").count()) === 0,
      40000
    );
    ok(subido, "subieron la venta y los cambios del patio");
    const job = await db.washJob.findFirst({ where: { userId: user.id, vehiclePlate: "OFF-001" }, include: { sale: true } });
    ok(job?.status === "ENTREGADO", "el vehículo quedó entregado", job?.status);
    ok(job?.assignedStaffId === jhon.id, "a nombre de Jhon");
    ok(job?.day === hoy && job?.sale?.day === hoy, "con el día de hoy", job?.day + " / " + job?.sale?.day);
    ok(job?.sale?.total === 25000 && job?.sale?.origin === "LAVADO", "el cobro quedó como venta del lavado de 25.000");
    ok((await db.washJob.count({ where: { userId: user.id } })) === 1, "un solo vehículo, sin repetidos");
    ok((await db.sale.count({ where: { userId: user.id, origin: { not: "LAVADO" } } })) === 1, "la venta de Ventas, una sola vez");
    await ctx.close();
  }

  console.log("\n4. El lavador, sin señal, marca que terminó");
  {
    const lavando = await db.washJob.create({
      data: { userId: user.id, day: hoy, clientName: "Otro", clientPhone: "312", vehiclePlate: "LAV-002", serviceName: "Lavado completo", price: 25000, status: "LAVANDO", assignedStaffId: jhon.id, startedAt: new Date() },
    });
    const { ctx, page } = await entrar("jhon-" + S + "@test.local", true);
    ok(await dejarLista(page, "/panel/mis-lavados"), "Mis lavados quedó guardada en el teléfono");
    await ctx.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Ya terminé" }).click();
    ok(
      await page.getByText(/Ya terminaste: se avisa al patio/).waitFor({ timeout: 8000 }).then(() => true, () => false),
      "la pantalla lo muestra hecho"
    );
    ok((await db.washJob.findUnique({ where: { id: lavando.id } }))?.status === "LAVANDO", "todavía no llegó al servidor");
    await ctx.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    ok(
      await esperarHasta(async () => (await db.washJob.findUnique({ where: { id: lavando.id } }))?.status === "LISTO", 40000),
      "al volver la señal quedó listo"
    );
    await ctx.close();
  }

  console.log("\n5. Desde el navegador, sin la aplicación instalada");
  {
    const { ctx, page } = await entrar("andres-" + S + "@test.local", false);
    await page.goto(BASE + "/panel/patio", { waitUntil: "networkidle" });
    await ctx.setOffline(true);
    const recibir = page.locator("form", { has: page.locator('input[name="clientPhone"]') });
    await recibir.locator('input[name="clientName"]').fill("Desde el navegador");
    await recibir.locator('input[name="clientPhone"]').fill("3110000001");
    await recibir.getByRole("button", { name: /Recibir vehículo/ }).click();
    ok(
      await page.getByText(/abre la aplicación instalada/).first().waitFor({ timeout: 8000 }).then(() => true, () => false),
      "avisa que para guardar sin señal hay que abrir la aplicación instalada"
    );
    ok((await page.locator("[data-acciones-pendientes]").count()) === 0, "no guardó nada en el teléfono");
    ok((await page.locator("[data-vehiculo]", { hasText: "Desde el navegador" }).count()) === 0, "y no lo muestra en el tablero");
    await ctx.close();
  }

  ok(errores.length === 0, "sin errores de JavaScript en las pantallas", errores.join(" | "));
} finally {
  await browser.close();
  await db.user.delete({ where: { id: user.id } }).catch(() => undefined);
  await db.$disconnect();
}

console.log(fallos ? "\n" + fallos + " fallaron" : "\nTodo bien");
process.exit(fallos ? 1 : 0);
