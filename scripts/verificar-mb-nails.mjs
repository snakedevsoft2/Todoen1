/**
 * Comprueba en un navegador lo de MB NAILS SPA (ver lib/mb-nails.ts):
 *   - la manicurista sin PIN no entra; la dueña le pone el PIN en Manicuristas;
 *   - con usuario + PIN entra directo a Mis citas, con su menu fijo;
 *   - ve solo SUS citas; Cerrada cobra el servicio + lo de la lista + lo otro;
 *   - Reprogramada mueve la cita; Precios se ve pero no se puede cambiar;
 *   - el empleado de otra barberia sigue entrando sin PIN.
 *
 * Antes: docker start ten-pg, y la app en localhost:3000 (npm run dev).
 * Despues: node scripts/verificar-mb-nails.mjs   (SHOT=carpeta para capturas)
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

const S = String(Date.now()).slice(-7);
const CLAVE = "demo1234";
const PIN = "4827";
const ZONA = "America/Bogota";
const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());
const masDias = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);

async function cuenta(businessName, empleados) {
  return db.user.create({
    data: {
      email: "mb-" + S + "-" + businessName.length + "@test.local",
      passwordHash: bcrypt.hashSync(CLAVE, 10),
      ownerName: "Marcela",
      businessName,
      businessType: "BARBERIA",
      slug: "mb-" + S + "-" + businessName.length,
      currency: "COP",
      timezone: ZONA,
      workDays: "1,2,3,4,5,6,7",
      staff: {
        create: [
          { name: "Marcela", role: "DUENO", onboardingDoneAt: new Date(), tourDoneAt: new Date() },
          ...empleados.map(([name, username]) => ({ name, username, role: "BARBERO", tourDoneAt: new Date() })),
        ],
      },
    },
    include: { staff: true },
  });
}

const mb = await cuenta("MB NAILS SPA", [
  ["Jessica Gaitan", "jessica." + S],
  ["Paola Meléndez", "paola." + S],
]);
const otra = await cuenta("Barberia " + S, [["Andres", "andres." + S]]);
const jessica = mb.staff.find((s) => s.name === "Jessica Gaitan");
const paola = mb.staff.find((s) => s.name === "Paola Meléndez");

const servicio = (name, price, category) => db.service.create({ data: { userId: mb.id, name, price, category } });
const semi = await servicio("Semi (manos o pies)", 45000, "Uñas");
const coca = await servicio("Coca Cola 400ml", 3500, "Bebidas");
await servicio("Cejas", 15000, "Depilación con cera");
const cita = (staff, clientName, day, startTime) =>
  db.appointment.create({
    data: {
      userId: mb.id,
      serviceId: semi.id,
      serviceName: semi.name,
      price: semi.price,
      staffId: staff.id,
      staffName: staff.name,
      clientName,
      clientPhone: "3001234567",
      day,
      startTime,
      endTime: startTime.replace(/^(\d\d):00$/, (_, h) => h + ":30"),
    },
  });
const ana = await cita(jessica, "Ana Cliente", hoy, "10:00");
const beatriz = await cita(jessica, "Beatriz Cliente", masDias(hoy, 1), "15:00");
await cita(paola, "Carla Ajena", hoy, "10:00");

const browser = await chromium.launch({ channel: "msedge" });
const errores = [];
async function pagina() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errores.push(e.message));
  page.on("response", (r) => r.status() >= 500 && errores.push(r.status() + " " + r.url()));
  await page.addInitScript(() => localStorage.setItem("todoen1_onboarding_seen", "true"));
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  return page;
}
const esperar = async (fn, ms = 15000) => {
  const fin = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > fin) return v;
    await new Promise((r) => setTimeout(r, 400));
  }
};

try {
  console.log("\n1. Sin PIN no entra");
  let p = await pagina();
  await p.fill('input[name="email"]', jessica.username);
  await p.click('button[type="submit"]');
  await p.waitForSelector("text=Todavía no tienes PIN", { timeout: 20000 }).catch(() => null);
  ok((await p.locator("body").innerText()).includes("Todavía no tienes PIN"), "le dice que la dueña le tiene que poner el PIN");
  ok(p.url().includes("/login"), "se queda en el ingreso", p.url());
  await p.context().close();

  console.log("\n2. La dueña le pone el PIN en Manicuristas");
  const d = await pagina();
  await d.fill('input[name="email"]', mb.email);
  await d.fill('input[name="password"]', CLAVE);
  await d.click('button[type="submit"]');
  await d.waitForURL(/\/panel/, { timeout: 60000 });
  await d.goto(BASE + "/panel/equipo", { waitUntil: "networkidle" });
  const textoEquipo = await d.locator("body").innerText();
  ok(textoEquipo.includes("Manicuristas"), "el apartado se llama Manicuristas");
  ok(textoEquipo.includes("Sin PIN: todavía no puede entrar"), "dice quién no tiene PIN todavía");
  const tarjeta = d.locator("li").filter({ hasText: "Jessica Gaitan" }).first();
  await tarjeta.getByRole("button", { name: /Cambiar acceso/ }).click();
  await tarjeta.locator('input[name="pin"]').fill(PIN);
  await tarjeta.getByRole("button", { name: /Guardar acceso/ }).click();
  const conPin = await esperar(async () => (await db.staff.findUnique({ where: { id: jessica.id } })).pinHash);
  ok(Boolean(conPin) && bcrypt.compareSync(PIN, conPin), "el PIN quedó guardado (cifrado)");
  await d.goto(BASE + "/panel/turnos", { waitUntil: "networkidle" });
  const agenda = await d.locator("body").innerText();
  ok(agenda.includes("Agenda") && agenda.includes("Manicurista") && !/barbero/i.test(agenda), "la agenda habla de manicuristas, no de barberos", (agenda.match(/.{0,40}barbero.{0,40}/i) ?? [""])[0]);
  if (DIR) await d.screenshot({ path: DIR + "/mb-agenda-duena.png", fullPage: true });

  console.log("\n3. Entra con usuario + PIN");
  p = await pagina();
  await p.fill('input[name="email"]', jessica.username);
  await p.click('button[type="submit"]');
  await p.waitForSelector("#pin", { timeout: 20000 }).catch(() => null);
  ok((await p.locator("#pin").count()) === 1, "le pide el PIN");
  await p.fill("#pin", "1111");
  await p.click('button[type="submit"]');
  await p.waitForSelector("text=Ese PIN no es", { timeout: 20000 }).catch(() => null);
  ok((await p.locator("body").innerText()).includes("Ese PIN no es"), "con el PIN equivocado no entra");
  await p.fill("#pin", PIN);
  await p.click('button[type="submit"]');
  await p.waitForURL(/\/panel\/mis-citas/, { timeout: 60000 }).catch(() => null);
  ok(p.url().endsWith("/panel/mis-citas"), "con el PIN bueno llega a Mis citas", p.url());

  console.log("\n4. Solo ve lo suyo");
  const texto = await p.locator("body").innerText();
  ok(texto.includes("Ana Cliente") && texto.includes("Beatriz Cliente"), "ve sus dos citas");
  ok(!texto.includes("Carla Ajena"), "no ve la cita de otra manicurista");
  const enlaces = await p.locator("nav a").allInnerTexts();
  const menu = enlaces.join(" | ");
  ok(/Mis citas/.test(menu) && /Precios/.test(menu) && !/Ventas|Caja|Gastos|Reportes/.test(menu), "su menú es Mis citas, Precios y Perfil", menu);
  await p.goto(BASE + "/panel/ventas", { waitUntil: "networkidle" });
  ok(p.url().endsWith("/panel/mis-citas"), "si escribe otra dirección vuelve a sus citas", p.url());
  await p.goto(BASE + "/panel/catalogo", { waitUntil: "networkidle" });
  ok(p.url().endsWith("/panel/mis-citas"), "no entra al catálogo donde se cambian precios", p.url());
  if (DIR) await p.screenshot({ path: DIR + "/mb-mis-citas.png", fullPage: true });

  console.log("\n5. Cerrada, con adicionales");
  const tAna = p.locator('[data-cita="Ana Cliente"]');
  await tAna.locator("[data-boton-cerrada]").click();
  await tAna.locator("[data-elegir-adicional]").selectOption(coca.id);
  await tAna.locator("[data-agregar-de-lista]").click();
  await tAna.locator("[data-otro-nombre]").fill("Decorado");
  await tAna.locator("[data-otro-valor]").fill("10");
  await tAna.locator("[data-agregar-otro]").click();
  const totalVisto = await tAna.locator("[data-total-cita]").innerText();
  ok(/58\.500/.test(totalVisto), "el total es 45.000 + 3.500 + 10.000", totalVisto);
  if (DIR) await p.screenshot({ path: DIR + "/mb-cerrar.png", fullPage: true });
  p.once("dialog", (dlg) => dlg.accept());
  await tAna.getByRole("button", { name: /Guardar como cerrada/ }).click();
  const venta = await esperar(() => db.sale.findFirst({ where: { appointmentId: ana.id }, include: { items: true } }));
  ok(venta?.total === 58500, "la venta quedó por 58.500", String(venta?.total));
  ok(venta?.staffId === jessica.id && venta?.items.length === 3, "a su nombre, con 3 renglones", venta?.items.map((i) => i.name).join(", "));
  ok((await db.appointment.findUnique({ where: { id: ana.id } })).status === "ATENDIDO", "la cita quedó atendida");
  await p.waitForSelector('[data-cerrada="Ana Cliente"]', { timeout: 20000 }).catch(() => null);
  ok((await p.locator('[data-cerrada="Ana Cliente"]').count()) === 1, "sale en Cerradas hoy");
  if (DIR) await p.screenshot({ path: DIR + "/mb-despues-de-cerrar.png", fullPage: true });

  console.log("\n6. Reprogramada");
  const nuevoDia = masDias(hoy, 2);
  const tBea = p.locator('[data-cita="Beatriz Cliente"]');
  await tBea.locator("[data-boton-reprogramada]").click();
  await tBea.locator('input[name="day"]').fill(nuevoDia);
  await tBea.locator('select[name="startTime"]').selectOption("11:00");
  await tBea.getByRole("button", { name: /Guardar nueva fecha/ }).click();
  const movida = await esperar(async () => {
    const a = await db.appointment.findUnique({ where: { id: beatriz.id } });
    return a.day === nuevoDia ? a : null;
  });
  ok(movida?.startTime === "11:00" && /Reprogramada/.test(movida?.notes ?? ""), "quedó para el nuevo día a las 11:00, con la nota", JSON.stringify(movida && { day: movida.day, t: movida.startTime }));

  console.log("\n7. Precios: se ven, no se cambian");
  await p.goto(BASE + "/panel/precios", { waitUntil: "networkidle" });
  const precios = await p.locator("[data-lista-precios]").allInnerTexts();
  ok(precios.join(" ").includes("Coca Cola 400ml") && precios.join(" ").includes("45.000"), "ve la lista con sus precios");
  ok((await p.locator("[data-lista-precios] input, [data-lista-precios] button, main form").count()) === 0, "no hay dónde cambiar un precio");
  const sinDesborde = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  ok(sinDesborde, "en el celular nada se sale de la pantalla");
  if (DIR) await p.screenshot({ path: DIR + "/mb-precios.png", fullPage: true });

  console.log("\n8. Otra barbería sigue igual");
  const o = await pagina();
  const andres = otra.staff.find((s) => s.name === "Andres");
  await o.fill('input[name="email"]', andres.username);
  ok((await o.locator("[data-ingreso-usuario]").count()) === 1, "a su empleado no se le pide PIN");
  await o.click('button[type="submit"]');
  await o.waitForURL(/\/panel/, { timeout: 60000 }).catch(() => null);
  ok(/\/panel(\?|$|\/(?!mis-citas))/.test(o.url()), "entra con solo el usuario, a su panel de siempre", o.url());

  ok(errores.length === 0, "sin errores en la página", errores.join(" | "));
} finally {
  await browser.close();
  for (const u of [mb, otra]) await db.user.delete({ where: { id: u.id } }).catch((e) => console.log("No se borro " + u.email + ": " + e.message));
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
