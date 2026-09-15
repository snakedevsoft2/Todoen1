/**
 * Comprueba en un navegador el control de pagos y la licencia sin conexión.
 *
 * Lo que se prueba:
 *   - Al dueño se le avisa que su plan está por vencer.
 *   - Sin señal la app funciona mientras el teléfono haya confirmado la cuenta
 *     hace menos de 15 días; pasado eso se bloquea, y al volver la señal se
 *     desbloquea sola.
 *   - El administrador registra un pago desde su panel.
 *   - Con el pago vencido y sin días de gracia, la cuenta se suspende sola,
 *     no puede entrar y, sin señal, lo guardado ya no se abre.
 *   - Al registrar el pago vuelve a quedar activa.
 *
 * Antes:
 *   npm run build
 *   ADMIN_EMAILS=admin-pagos@test.local npm start
 * Después: npm run verificar:licencia
 */
import "dotenv/config";
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

const S = "lic-" + Date.now();
const clave = bcrypt.hashSync("demo1234", 10);
const listo = { onboardingDoneAt: new Date(), tourDoneAt: new Date() };
await db.user.deleteMany({ where: { email: ADMIN } });
const admin = await db.user.create({
  data: { email: ADMIN, passwordHash: clave, ownerName: "Plataforma", businessName: "Plataforma " + S, businessType: "OTRO", slug: "plataforma-" + S, staff: { create: { name: "Plataforma", role: "DUENO", ...listo } } },
});
const cuenta = await db.user.create({
  data: {
    email: "cliente-" + S + "@test.local",
    passwordHash: clave,
    ownerName: "Cliente",
    businessName: "Tienda " + S,
    businessType: "OTRO",
    slug: "tienda-" + S,
    paidUntil: new Date(Date.now() + 3 * DIA),
    staff: { create: { name: "Cliente", role: "DUENO", ...listo } },
    expenses: { create: { day: "2026-09-14", amount: 12000, description: "Gasto de prueba licencia" } },
  },
});

const errores = [];
const browser = await chromium.launch({ channel: "msedge" });

async function entrar(ctx, email) {
  const page = await ctx.newPage();
  page.on("response", (r) => r.status() >= 500 && r.status() !== 503 && errores.push(r.status() + " " + r.url()));
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel/, { timeout: 25000 });
  return page;
}

async function abrirEnFrio(page, ruta) {
  try {
    await page.goto(BASE + ruta, { waitUntil: "domcontentloaded", timeout: 20000 });
  } catch {
    // Se revisa lo que quedo en pantalla.
  }
  await page.waitForTimeout(2000);
  return (await page.textContent("body").catch(() => "")) ?? "";
}

const licencia = (page) =>
  page.evaluate(async () => {
    const r = await (await caches.open("ten-licencia-v1")).match(location.origin + "/__licencia");
    return r ? await r.json() : null;
  });

try {
  console.log("\n1. Aviso de que el plan está por vencer");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const tel = await entrar(ctx, cuenta.email);
  await tel.goto(BASE + "/panel", { waitUntil: "networkidle" });
  ok((await tel.locator('[data-aviso-pago="por-vencer"]').count()) === 1, "el dueño ve que su plan vence en 3 días");

  console.log("\n2. Sin señal funciona mientras la cuenta esté confirmada");
  ok(Boolean(await esperarHasta(async () => (await licencia(tel))?.activa === true, 30000)), "el teléfono confirmó la cuenta");
  ok(
    Boolean(await esperarHasta(() => tel.evaluate(async () => Boolean(await (await caches.open("ten-paginas-v1")).match(location.origin + "/panel/gastos"))), 60000)),
    "Gastos quedó guardado"
  );
  await ctx.setOffline(true);
  ok((await abrirEnFrio(tel, "/panel/gastos")).includes("Gasto de prueba licencia"), "sin señal abre con sus datos");

  // El teléfono lleva 16 días sin confirmar.
  await tel.evaluate(async () => {
    const c = await caches.open("ten-licencia-v1");
    await c.put(location.origin + "/__licencia", new Response(JSON.stringify({ activa: true, verificadoEn: Date.now() - 16 * 86400000 })));
  });
  const bloqueado = await abrirEnFrio(tel, "/panel/gastos");
  ok(/Hace más de 15 días/.test(bloqueado) && !bloqueado.includes("Gasto de prueba licencia"), "pasados 15 días sin conectarse, se bloquea");

  await ctx.setOffline(false);
  await tel.goto(BASE + "/panel/gastos", { waitUntil: "networkidle" });
  ok(Boolean(await esperarHasta(async () => Date.now() - ((await licencia(tel))?.verificadoEn ?? 0) < 60000)), "con señal vuelve a confirmar sola");
  await ctx.setOffline(true);
  ok((await abrirEnFrio(tel, "/panel/gastos")).includes("Gasto de prueba licencia"), "y sin señal vuelve a funcionar");
  await ctx.setOffline(false);

  console.log("\n3. El administrador registra un pago");
  const ctxAdmin = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const adm = await entrar(ctxAdmin, ADMIN);
  await adm.goto(BASE + "/admin/" + cuenta.id, { waitUntil: "networkidle" });
  const pagos = adm.locator("[data-pagos-cuenta]");
  ok((await pagos.count()) === 1, "la cuenta muestra su bloque de pagos");
  const antes = (await db.user.findUnique({ where: { id: cuenta.id } })).paidUntil;
  await pagos.getByRole("button", { name: "+1 mes" }).click();
  ok(Boolean(await esperarHasta(() => pagos.getByText(/pagada hasta/).count())), "confirma hasta cuándo quedó pagada");
  const despues = (await db.user.findUnique({ where: { id: cuenta.id } })).paidUntil;
  ok(despues.getTime() - antes.getTime() > 27 * DIA, "suma el mes desde el vencimiento, sin perder los días que quedaban");

  console.log("\n4. Pago vencido: se suspende sola");
  await db.user.update({ where: { id: cuenta.id }, data: { paidUntil: new Date(Date.now() - 7 * DIA) } });
  await tel.goto(BASE + "/panel", { waitUntil: "networkidle" }).catch(() => {});
  ok(Boolean(await esperarHasta(() => tel.url().includes("/login"))), "la sesión se cierra en la siguiente pantalla", tel.url());
  const suspendida = await db.user.findUnique({ where: { id: cuenta.id } });
  ok(Boolean(suspendida.suspendedAt) && suspendida.suspendedForPayment, "queda suspendida por pago");
  await tel.fill('input[name="email"]', cuenta.email);
  await tel.fill('input[name="password"]', "demo1234");
  await tel.click('button[type="submit"]');
  ok(Boolean(await esperarHasta(() => tel.getByText(/venci[oó] el pago/i).count())), "al ingresar se le dice que venció el pago");
  ok(Boolean(await esperarHasta(async () => (await licencia(tel))?.activa === false)), "el teléfono sabe que la cuenta ya no está activa");
  await ctx.setOffline(true);
  const sinSenal = await abrirEnFrio(tel, "/panel/gastos");
  ok(!sinSenal.includes("Gasto de prueba licencia") && /Conéctate a internet/.test(sinSenal), "sin señal lo guardado ya no se abre");
  await ctx.setOffline(false);

  console.log("\n5. Al pagar vuelve a quedar activa");
  await adm.reload({ waitUntil: "networkidle" });
  await adm.locator("[data-pagos-cuenta]").getByRole("button", { name: "+1 mes" }).click();
  ok(Boolean(await esperarHasta(() => adm.getByText(/volvió a quedar activa/).count())), "el administrador ve que se reactivó");
  const tel2 = await entrar(ctx, cuenta.email);
  ok(tel2.url().includes("/panel"), "el cliente vuelve a entrar");

  console.log("\n6. Errores durante el recorrido");
  ok(errores.length === 0, "ningún error 500", errores.slice(0, 3).join(" | "));
  await ctxAdmin.close();
  await ctx.close();
} finally {
  await browser.close();
  await db.user.deleteMany({ where: { id: { in: [cuenta.id, admin.id] } } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
