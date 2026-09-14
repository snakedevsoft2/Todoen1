/**
 * Comprueba en un navegador el cambio de tipo de negocio desde Ajustes.
 *
 * Lo que se prueba: que el dueño vea la opcion, que sin marcar la casilla no
 * cambie nada, que al confirmar pase a la bienvenida con el menu del oficio
 * nuevo, y que sus ventas sigan ahi. Un empleado no ve la opcion.
 *
 * Antes:   npm run build && npm start
 * Despues: npm run verificar:tipo
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

const S = "tipo-" + Date.now();
const clave = bcrypt.hashSync("demo1234", 10);
const listo = { onboardingDoneAt: new Date(), tourDoneAt: new Date() };
const cuenta = await db.user.create({
  data: {
    email: "tipo-" + S + "@test.local",
    passwordHash: clave,
    ownerName: "Lexand",
    businessName: "Barberia equivocada " + S,
    businessType: "ROPA",
    slug: "equivocada-" + S,
    staff: {
      create: [
        { name: "Lexand", role: "DUENO", ...listo },
        { name: "Ana", role: "VENDEDOR", email: "ana-" + S + "@test.local", passwordHash: clave, ...listo },
      ],
    },
    sales: { create: { day: "2026-09-10", total: 25000 } },
  },
});

const errores = [];
const browser = await chromium.launch({ channel: "msedge" });
async function entrar(ctx, email) {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errores.push("pageerror: " + e.message));
  page.on("response", (r) => r.status() >= 500 && errores.push(r.status() + " " + r.url()));
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel/, { timeout: 25000 });
  return page;
}

try {
  console.log("\n1. Un empleado no ve la opción");
  const ctxAna = await browser.newContext();
  const ana = await entrar(ctxAna, "ana-" + S + "@test.local");
  await ana.goto(BASE + "/panel/ajustes", { waitUntil: "networkidle" });
  ok((await ana.locator("[data-cambiar-tipo]").count()) === 0, "en sus ajustes no aparece");
  await ctxAna.close();

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await entrar(ctx, cuenta.email);

  console.log("\n2. El dueño la ve en Ajustes");
  await page.goto(BASE + "/panel/ajustes", { waitUntil: "networkidle" });
  const caja = page.locator("[data-cambiar-tipo]");
  ok((await caja.count()) === 1, "aparece el cambio de tipo de negocio");
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "en celular nada se sale");
  await caja.locator('select[name="businessType"]').selectOption("BARBERIA");
  ok((await caja.getByText(/No se borra nada/).count()) === 1, "explica qué pasa antes de cambiar");
  if (DIR) await page.screenshot({ path: DIR + "/tipo-ajustes.png", fullPage: true });

  console.log("\n3. Sin confirmar no cambia");
  await caja.getByRole("button", { name: "Cambiar tipo de negocio" }).click();
  await page.getByText(/Marca la casilla/).waitFor({ timeout: 10000 }).catch(() => {});
  ok((await page.getByText(/Marca la casilla/).count()) > 0, "pide marcar la casilla");
  ok((await db.user.findUnique({ where: { id: cuenta.id } })).businessType === "ROPA", "y sigue siendo tienda de ropa");

  console.log("\n4. Al confirmar cambia sin perder nada");
  await caja.locator('input[name="confirmo"]').check();
  await caja.getByRole("button", { name: "Cambiar tipo de negocio" }).click();
  await page.waitForURL(/\/panel\/bienvenida/, { timeout: 20000 }).catch(() => {});
  ok(page.url().includes("/panel/bienvenida"), "lo lleva a la bienvenida para armar el menú", page.url());
  const u = await db.user.findUnique({ where: { id: cuenta.id } });
  ok(u.businessType === "BARBERIA", "ahora es barbería");
  ok((await db.sale.count({ where: { userId: cuenta.id } })) === 1, "sus ventas siguen ahí");
  const rolAna = (await db.staff.findFirst({ where: { userId: cuenta.id, name: "Ana" } })).role;
  ok(rolAna === "BARBERO", "Ana ahora sale como barbero", rolAna);
  ok((await page.locator('a[href="/panel/turnos"]').count()) > 0, "y el menú ya trae Turnos");

  console.log("\n5. Errores durante el recorrido");
  ok(errores.length === 0, "ninguna excepción ni error 500", errores.slice(0, 3).join(" | "));
  await ctx.close();
} finally {
  await browser.close();
  await db.user.delete({ where: { id: cuenta.id } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
