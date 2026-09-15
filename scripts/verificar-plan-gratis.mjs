/**
 * Comprueba en un navegador la prueba gratis y la versión gratis.
 *
 * Lo que se prueba:
 *   - Al registrarse, la cuenta queda con 7 días de prueba.
 *   - En la prueba tiene todo: el navegador deja instalarla y guarda las
 *     pantallas para usarla sin señal.
 *   - Cuando se acaba la prueba: ya no se puede instalar, se borra lo guardado
 *     y sin señal no abre; carga masiva, reportes, factura autorizada y
 *     exportar muestran que son del plan pago; la aplicación ya instalada
 *     queda tapada con el aviso.
 *   - El administrador ve la cuenta en la versión gratis y, al darle
 *     cortesía, vuelve a tener todo.
 *
 * Antes:
 *   npm run build
 *   ADMIN_EMAILS=admin-pagos@test.local npm start
 * Después: npm run verificar:plan-gratis
 */
import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const BASE = "http://localhost:3000";
const ADMIN = "admin-pagos@test.local";
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
const DIA = 86_400_000;

const S = "plan-" + Date.now();
const clave = bcrypt.hashSync("demo1234", 10);
const listo = { onboardingDoneAt: new Date(), tourDoneAt: new Date() };
await db.user.deleteMany({ where: { email: ADMIN } });
await db.user.create({
  data: { email: ADMIN, passwordHash: clave, ownerName: "Plataforma", businessName: "Plataforma " + S, businessType: "OTRO", slug: "plataforma-" + S, staff: { create: { name: "Plataforma", role: "DUENO", ...listo } } },
});
const cuenta = await db.user.create({
  data: {
    email: "prueba-" + S + "@test.local",
    passwordHash: clave,
    ownerName: "Dueña",
    businessName: "Tienda " + S,
    businessType: "OTRO",
    slug: "tienda-" + S,
    trialEndsAt: new Date(Date.now() + 3 * DIA),
    staff: { create: { name: "Dueña", role: "DUENO", ...listo } },
  },
});
const correoRegistro = "registro-" + S + "@test.local";

const errores = [];
const vigilar = (page) => page.on("response", (r) => r.status() >= 500 && r.status() !== 503 && errores.push(r.status() + " " + r.url()));

async function entrar(page, email) {
  await page.goto(BASE + "/login", { waitUntil: "load" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(panel|admin)/, { timeout: 25000 });
}

const conTrabajador = (page) => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length > 0);
const trabajadorActivo = (page) => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.active));
const guardadas = (page) => page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith("ten-")).length);

// Perfil normal y no de incógnito: en incógnito el navegador nunca ofrece instalar.
const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "plan-gratis-"));
const ctx = await chromium.launchPersistentContext(perfil, { channel: "msedge", viewport: { width: 390, height: 844 } });
const browser = await chromium.launch({ channel: "msedge" });

try {
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  vigilar(page);
  const cdp = await ctx.newCDPSession(page);
  const erroresDeInstalacion = async () => (await cdp.send("Page.getInstallabilityErrors")).installabilityErrors;

  console.log("\n1. Al registrarse empieza la prueba gratis");
  await page.goto(BASE + "/registro", { waitUntil: "load" });
  await page.locator('input[name="businessType"]').first().check({ force: true });
  await page.fill('input[name="businessName"]', "Registro " + S);
  await page.fill('input[name="ownerName"]', "Nueva");
  await page.fill('input[name="email"]', correoRegistro);
  await page.fill('input[name="password"]', "demo1234");
  await page.locator('form button[type="submit"]').last().click();
  const nueva = await esperarHasta(() => db.user.findUnique({ where: { email: correoRegistro } }), 25000);
  const dias = nueva?.trialEndsAt ? (nueva.trialEndsAt.getTime() - Date.now()) / DIA : 0;
  ok(dias > 6.9 && dias <= 7, "la cuenta nueva queda con 7 días de prueba", String(dias));
  await ctx.clearCookies();

  console.log("\n2. En la prueba tiene todo");
  await entrar(page, cuenta.email);
  await page.goto(BASE + "/panel/catalogo", { waitUntil: "load" });
  ok((await page.locator('link[rel="manifest"]').count()) === 1, "la página enlaza el manifiesto");
  ok((await page.locator('[data-aviso-pago="prueba"]').count()) === 1, "el dueño ve cuántos días de prueba le quedan");
  ok(page.url().includes("/panel/catalogo") && (await page.locator("[data-funcion-inactiva]").count()) === 0, "la carga masiva está disponible", page.url());
  ok(Boolean(await esperarHasta(() => trabajadorActivo(page), 25000)), "el trabajador de fondo queda activo");
  ok(Boolean(await esperarHasta(async () => (await guardadas(page)) > 0, 25000)), "guarda pantallas para usar sin señal");
  const alInstalar = await erroresDeInstalacion();
  ok(alInstalar.length === 0, "el navegador deja instalarla", JSON.stringify(alInstalar));

  console.log("\n3. Se acaba la prueba: versión gratis");
  await db.user.update({ where: { id: cuenta.id }, data: { trialEndsAt: new Date(Date.now() - DIA) } });
  await page.goto(BASE + "/panel", { waitUntil: "load" });
  ok((await page.locator('link[rel="manifest"]').count()) === 0, "ya no enlaza el manifiesto");
  ok((await page.locator('[data-aviso-pago="limitada"]').count()) === 1, "el dueño ve que está en la versión gratis y cómo activar el plan");
  ok(Boolean(await esperarHasta(async () => !(await conTrabajador(page)))), "se quita el trabajador de fondo");
  ok(Boolean(await esperarHasta(async () => (await guardadas(page)) === 0)), "se borran las pantallas guardadas");
  await page.reload({ waitUntil: "load" });
  const sinInstalar = await erroresDeInstalacion();
  ok(sinInstalar.length > 0, "el navegador ya no deja instalarla", JSON.stringify(sinInstalar));

  for (const [ruta, que] of [
    ["/panel/catalogo", "carga masiva"],
    ["/panel/reportes", "reportes"],
    ["/panel/ajustes", "factura autorizada"],
  ]) {
    await page.goto(BASE + ruta, { waitUntil: "load" });
    ok(page.url().includes(ruta) && (await page.locator("[data-funcion-inactiva]").count()) > 0, que + ": dice que es del plan pago", page.url());
  }
  const exportar = await page.request.get(BASE + "/panel/exportar/ventas");
  ok(exportar.status() === 403, "exportar a Excel responde que es del plan pago", String(exportar.status()));

  await ctx.setOffline(true);
  let abrio = false;
  try {
    await page.goto(BASE + "/panel/gastos", { waitUntil: "domcontentloaded", timeout: 15000 });
    abrio = (await page.locator('[data-aviso-pago="limitada"]').count()) > 0;
  } catch {
    abrio = false;
  }
  ok(!abrio, "sin señal el panel no abre");
  await ctx.setOffline(false);

  console.log("\n4. La aplicación ya instalada no abre en la versión gratis");
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "display-mode", value: "standalone" }] }).catch(() => undefined);
  await page.goto(BASE + "/panel", { waitUntil: "load" });
  if (await page.evaluate(() => matchMedia("(display-mode: standalone)").matches)) {
    ok(Boolean(await esperarHasta(() => page.locator("[data-app-inactiva]").count())), "la tapa con el aviso para activar el plan");
    await cdp.send("Emulation.setEmulatedMedia", { features: [] });
    await page.goto(BASE + "/panel", { waitUntil: "load" });
    ok((await page.locator("[data-app-inactiva]").count()) === 0, "en el navegador se sigue usando");
  } else {
    // Sin la simulacion del navegador, se le hace creer a una pagina aparte
    // que esta abierta como aplicacion instalada.
    const instalada = await ctx.newPage();
    vigilar(instalada);
    await instalada.addInitScript(() => {
      const original = window.matchMedia.bind(window);
      window.matchMedia = (q) => (q.includes("display-mode: standalone") ? { ...original(q), matches: true, media: q } : original(q));
    });
    await instalada.goto(BASE + "/panel", { waitUntil: "load" });
    ok(Boolean(await esperarHasta(() => instalada.locator("[data-app-inactiva]").count())), "la tapa con el aviso para activar el plan");
    await instalada.close();
    await page.goto(BASE + "/panel", { waitUntil: "load" });
    ok((await page.locator("[data-app-inactiva]").count()) === 0, "en el navegador se sigue usando");
  }

  console.log("\n5. El administrador le da cortesía y vuelve a tener todo");
  const actx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const adm = await actx.newPage();
  vigilar(adm);
  await entrar(adm, ADMIN);
  await adm.goto(BASE + "/admin", { waitUntil: "load" });
  ok((await adm.locator("[data-pago-cuenta]", { hasText: "Versión gratis" }).count()) > 0, "la lista marca la cuenta en versión gratis");
  await adm.goto(BASE + "/admin/" + cuenta.id, { waitUntil: "load" });
  const pagos = adm.locator("[data-pagos-cuenta]");
  ok((await pagos.getByText(/Versión gratis/).count()) === 1, "la ficha dice desde cuándo está en la versión gratis");
  await pagos.getByRole("button", { name: "Darle todo gratis (cortesía)" }).click();
  ok(Boolean(await esperarHasta(async () => (await db.user.findUnique({ where: { id: cuenta.id } })).trialEndsAt === null)), "queda de cortesía");
  await actx.close();

  await page.goto(BASE + "/panel", { waitUntil: "load" });
  ok((await page.locator('link[rel="manifest"]').count()) === 1, "vuelve a enlazar el manifiesto");
  ok(Boolean(await esperarHasta(() => trabajadorActivo(page), 25000)), "y vuelve a quedar lista para usar sin señal");

  console.log("\n6. Errores durante el recorrido");
  ok(errores.length === 0, "ningún error 500", errores.slice(0, 3).join(" | "));
} finally {
  await ctx.close();
  await browser.close();
  fs.rmSync(perfil, { recursive: true, force: true });
  await db.user.deleteMany({ where: { OR: [{ slug: { contains: S } }, { email: { in: [ADMIN, correoRegistro] } }] } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
