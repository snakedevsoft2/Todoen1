/**
 * Comprueba que Ventas guarde y deje imprimir sin señal, en los dos casos que
 * pasan de verdad:
 *
 *   1. El celular está en modo avión de verdad (sin señal real): la venta se
 *      guarda directo en el teléfono, aparece en la cola y se puede imprimir.
 *   2. El celular dice "conectado" pero no hay con qué llegar al servidor
 *      (wifi sin internet, señal que no pasa datos): antes se quedaba
 *      colgado en "Guardando venta..."; ahora, a los 15 segundos se rinde y
 *      la manda igual a la cola del teléfono.
 *
 * Y que, al volver la señal, las dos suban solas.
 *
 * Antes:   npm run build && npm start
 * Después: node scripts/verificar-ventas-sin-conexion.mjs
 */
import "dotenv/config";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const BASE = "http://localhost:3000";
const db = new PrismaClient();
let fallos = 0;
const ok = (c, t, extra = "") => {
  if (c) console.log("  OK   " + t);
  else {
    fallos++;
    console.log("  MAL  " + t + (extra ? "  <- " + extra : ""));
  }
};

const S = "ventasoff-" + Date.now();
const cuenta = await db.user.create({
  data: {
    // Con pago: solo la cuenta que pago instala la app y la usa sin senal.
    paidUntil: new Date(Date.now() + 30 * 86_400_000),
    email: "duena-" + S + "@test.local",
    passwordHash: bcrypt.hashSync("demo1234", 10),
    ownerName: "Dueña",
    businessName: "Tienda " + S,
    businessType: "OTRO",
    slug: "tienda-" + S,
    staff: { create: { name: "Dueña", role: "DUENO", onboardingDoneAt: new Date(), tourDoneAt: new Date() } },
    services: { create: [{ name: "Gaseosa", price: 3500, category: "Bebidas" }] },
  },
});

const browser = await chromium.launch({ channel: "msedge" });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/login", { waitUntil: "load" });
  await page.fill('input[name="email"]', cuenta.email);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel/, { timeout: 25000 });

  console.log("\n1. Con señal, se abre Ventas y queda guardada para sin conexión");
  await page.goto(BASE + "/panel/ventas", { waitUntil: "networkidle" });
  let guardada = false;
  for (let i = 0; i < 30 && !guardada; i += 1) {
    guardada = await page.evaluate(async () => Boolean(await (await caches.open("ten-paginas-v1")).match(location.origin + "/panel/ventas")));
    if (!guardada) await page.waitForTimeout(500);
  }
  ok(guardada, "la pantalla de Ventas quedó guardada en el teléfono");

  console.log("\n2. Modo avión de verdad: la venta se guarda en el teléfono");
  await ctx.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  ok(await page.locator("[data-sin-senal]").isVisible().catch(() => false), "avisa que está sin señal");
  await page.getByRole("button", { name: "Gaseosa", exact: false }).click();
  await page.getByRole("button", { name: /Guardar venta/ }).click();
  ok(
    Boolean(
      await page
        .getByText(/quedó guardada en este teléfono/)
        .first()
        .waitFor({ state: "visible", timeout: 8000 })
        .then(() => true)
        .catch(() => false)
    ),
    "confirma que quedó guardada, sin quedarse pegado"
  );
  ok((await page.locator("[data-ventas-pendientes]").count()) === 1, "aparece en la cola de pendientes");
  ok((await db.sale.count({ where: { userId: cuenta.id } })) === 0, "todavía no llegó al servidor");

  console.log("\n3. Esa venta pendiente se puede imprimir sin señal");
  ok(
    (await page.locator("[data-ventas-pendientes] button", { hasText: "Imprimir" }).count()) === 1,
    "trae su propio botón de imprimir"
  );
  await page.locator("[data-ventas-pendientes] button", { hasText: "Imprimir" }).first().click();
  ok((await page.locator("[data-menu-imprimir]").count()) === 1, "abre el menú de tamaño de papel sin pedir red");

  console.log("\n4. Wifi \"conectado\" pero sin salida real: no se queda pegado");
  await ctx.setOffline(false);
  await page.route("**/api/ventas", async (route) => {
    // Nunca responde: asi se ve si el tope de tiempo funciona.
    await new Promise(() => {});
    void route;
  });
  await page.reload({ waitUntil: "load" });
  await page.getByRole("button", { name: "Gaseosa", exact: false }).click();
  const desde = Date.now();
  await page.getByRole("button", { name: /Guardar venta/ }).click();
  const salio = await page
    .getByText(/quedó guardada en este teléfono/)
    .first()
    .waitFor({ state: "visible", timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  const segundos = (Date.now() - desde) / 1000;
  ok(salio, "no se queda colgado: cae solo a la cola");
  ok(segundos < 19, "y lo hace en menos de 19 segundos (tope de 15)", segundos.toFixed(1) + "s");
  await page.unroute("**/api/ventas");

  console.log("\n5. Vuelve la señal de verdad: las dos ventas suben solas");
  await page.reload({ waitUntil: "networkidle" });
  let subidas = 0;
  for (let i = 0; i < 30 && subidas < 2; i += 1) {
    subidas = await db.sale.count({ where: { userId: cuenta.id } });
    if (subidas < 2) await page.waitForTimeout(500);
  }
  ok(subidas === 2, "las dos ventas hechas sin red llegaron al servidor", String(subidas));

  await ctx.close();
} finally {
  await browser.close();
  await db.sale.deleteMany({ where: { userId: cuenta.id } }).catch(() => {});
  await db.user.delete({ where: { id: cuenta.id } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
