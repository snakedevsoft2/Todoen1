/**
 * Comprueba en un navegador que la aplicacion sirva en cualquier pais.
 *
 * Lo que se prueba:
 *   - Al registrarse desde un celular en Ecuador, el pais sale solo y la cuenta
 *     queda en dolares y con la hora de Ecuador.
 *   - En Ajustes, al cambiar a Mexico se ponen el peso mexicano y la hora de
 *     Mexico, y se guardan.
 *   - Con precios guardados en pesos colombianos no deja pasar a dolares (una
 *     moneda usa centavos y la otra no).
 *   - "Otro pais" deja elegir cualquier moneda y zona del mundo.
 *
 * Antes:   npm run build && npm start
 * Después: npm run verificar:paises
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
const esperarHasta = async (fn, ms = 20000) => {
  const fin = Date.now() + ms;
  let v = await fn();
  while (!v && Date.now() < fin) {
    await new Promise((r) => setTimeout(r, 400));
    v = await fn();
  }
  return v;
};

const S = "paises-" + Date.now();
const correoNuevo = "ecuador-" + S + "@test.local";
const conDatos = await db.user.create({
  data: {
    email: "condatos-" + S + "@test.local",
    passwordHash: bcrypt.hashSync("demo1234", 10),
    ownerName: "Dueña",
    businessName: "Tienda " + S,
    businessType: "OTRO",
    slug: "tienda-" + S,
    staff: { create: { name: "Dueña", role: "DUENO", onboardingDoneAt: new Date(), tourDoneAt: new Date() } },
    services: { create: { name: "Camisa", price: 35000, category: "Ropa", bookable: false } },
  },
});

const errores = [];
const browser = await chromium.launch({ channel: "msedge" });
const vigilar = (page) => page.on("response", (r) => r.status() >= 500 && r.status() !== 503 && errores.push(r.status() + " " + r.url()));

try {
  console.log("\n1. Registrarse desde Ecuador");
  const ctx = await browser.newContext({ timezoneId: "America/Guayaquil", viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  vigilar(page);
  await page.goto(BASE + "/registro", { waitUntil: "load" });
  ok(Boolean(await esperarHasta(async () => (await page.locator("[data-pais]").inputValue()) === "EC")), "el país sale solo por la hora del celular");
  await page.locator('input[name="businessType"]').first().check({ force: true });
  await page.fill('input[name="businessName"]', "Ecuador " + S);
  await page.fill('input[name="ownerName"]', "Nueva");
  await page.fill('input[name="email"]', correoNuevo);
  await page.fill('input[name="password"]', "demo1234");
  await page.locator('form button[type="submit"]').last().click();
  const nueva = await esperarHasta(() => db.user.findUnique({ where: { email: correoNuevo } }), 25000);
  ok(nueva?.country === "EC" && nueva?.currency === "USD" && nueva?.timezone === "America/Guayaquil", "la cuenta queda en Ecuador, en dólares y con su hora", JSON.stringify(nueva && [nueva.country, nueva.currency, nueva.timezone]));

  console.log("\n2. En Ajustes, cambiar a México");
  await page.waitForURL(/\/panel/, { timeout: 25000 }).catch(() => {});
  await page.goto(BASE + "/panel/ajustes", { waitUntil: "load" });
  await page.locator("[data-pais]").selectOption("MX");
  ok((await page.locator("[data-moneda]").inputValue()) === "MXN", "se pone el peso mexicano");
  ok((await page.locator("[data-zona]").inputValue()) === "America/Mexico_City", "y la hora de Ciudad de México");
  ok((await page.locator("[data-zona] option").count()) > 3, "con las otras zonas de México para elegir");
  await page.locator("form", { has: page.locator("[data-pais]") }).getByRole("button", { name: "Guardar ajustes" }).click();
  ok(
    Boolean(await esperarHasta(async () => {
      const u = await db.user.findUnique({ where: { email: correoNuevo } });
      return u?.country === "MX" && u?.currency === "MXN" && u?.timezone === "America/Mexico_City";
    })),
    "queda guardado"
  );

  console.log("\n3. Otro país");
  await page.locator("[data-pais]").selectOption("OTRO");
  ok(Boolean(await esperarHasta(async () => (await page.locator("[data-zona] option").count()) > 100)), "deja elegir entre todas las zonas del mundo");
  ok((await page.locator("[data-moneda] option").count()) > 100, "y entre todas las monedas");
  await ctx.close();

  console.log("\n4. Con precios guardados no se cambia a una moneda con centavos");
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p2 = await ctx2.newPage();
  vigilar(p2);
  await p2.goto(BASE + "/login", { waitUntil: "load" });
  await p2.fill('input[name="email"]', conDatos.email);
  await p2.fill('input[name="password"]', "demo1234");
  await p2.click('button[type="submit"]');
  await p2.waitForURL(/\/panel/, { timeout: 25000 });
  await p2.goto(BASE + "/panel/ajustes", { waitUntil: "load" });
  await p2.locator("[data-pais]").selectOption("EC");
  await p2.locator("form", { has: p2.locator("[data-pais]") }).getByRole("button", { name: "Guardar ajustes" }).click();
  ok(Boolean(await esperarHasta(() => p2.getByText(/No se puede pasar de COP a USD/).count())), "avisa que cambiaría los precios guardados");
  ok((await db.user.findUnique({ where: { id: conDatos.id } }))?.currency === "COP", "y la moneda sigue igual");
  await ctx2.close();

  console.log("\n5. Errores durante el recorrido");
  ok(errores.length === 0, "ningún error 500", errores.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  await db.user.deleteMany({ where: { OR: [{ slug: { contains: S } }, { email: correoNuevo }] } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
