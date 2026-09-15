/**
 * Comprueba en un navegador que el administrador pueda eliminar una cuenta.
 *
 * Lo que se prueba:
 *   - El botón no se prende hasta escribir el nombre y marcar que se entiende.
 *   - Al eliminar vuelve a la lista con el aviso, y la cuenta ya no está.
 *   - Quien estaba adentro de esa cuenta queda por fuera.
 *   - La cuenta del administrador no tiene el botón.
 *
 * Antes:
 *   npm run build
 *   ADMIN_EMAILS=admin-pagos@test.local npm start
 * Después: npm run verificar:eliminar-cuenta
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

const S = "elim-" + Date.now();
const clave = bcrypt.hashSync("demo1234", 10);
const listo = { onboardingDoneAt: new Date(), tourDoneAt: new Date() };
await db.user.deleteMany({ where: { email: ADMIN } });
const admin = await db.user.create({
  data: { email: ADMIN, passwordHash: clave, ownerName: "Plataforma", businessName: "Plataforma " + S, businessType: "OTRO", slug: "plataforma-" + S, staff: { create: { name: "Plataforma", role: "DUENO", ...listo } } },
});
const nombre = "Tienda Borrar " + S;
const cuenta = await db.user.create({
  data: {
    email: "borrar-" + S + "@test.local",
    passwordHash: clave,
    ownerName: "Dueña",
    businessName: nombre,
    businessType: "OTRO",
    slug: "borrar-" + S,
    staff: { create: { name: "Dueña", role: "DUENO", ...listo } },
    expenses: { create: { day: "2026-09-14", amount: 7000, description: "Gasto que se borra" } },
  },
});

const errores = [];
const browser = await chromium.launch({ channel: "msedge" });

async function entrar(ctx, email) {
  const page = await ctx.newPage();
  page.on("response", (r) => r.status() >= 500 && r.status() !== 503 && errores.push(r.status() + " " + r.url()));
  await page.goto(BASE + "/login", { waitUntil: "load" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(panel|admin)/, { timeout: 25000 });
  return page;
}

try {
  const ctxDueno = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const dueno = await entrar(ctxDueno, cuenta.email);
  await dueno.goto(BASE + "/panel/gastos", { waitUntil: "load" });

  console.log("\n1. El botón pide confirmar");
  const ctxAdmin = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const adm = await entrar(ctxAdmin, ADMIN);
  await adm.goto(BASE + "/admin/" + cuenta.id, { waitUntil: "load" });
  const form = adm.locator("[data-eliminar-cuenta]");
  ok((await form.count()) === 1, "la ficha tiene el bloque para eliminar");
  ok((await form.getByText(/1 gastos/).count()) === 1, "muestra lo que se va a perder");
  const boton = form.getByRole("button", { name: "Eliminar para siempre" });
  ok(await boton.isDisabled(), "el botón empieza apagado");
  await form.locator('input[name="confirmacion"]').fill("Tienda");
  await form.getByRole("checkbox").check();
  ok(await boton.isDisabled(), "con el nombre incompleto sigue apagado");
  await form.locator('input[name="confirmacion"]').fill(nombre.toLowerCase());
  ok(await boton.isEnabled(), "con el nombre y la casilla se prende");

  console.log("\n2. Eliminar");
  await boton.click();
  await adm.waitForURL(/\/admin\?eliminada=/, { timeout: 25000 });
  ok((await adm.locator("[data-cuenta-eliminada]").count()) === 1, "vuelve a la lista con el aviso");
  ok((await db.user.count({ where: { id: cuenta.id } })) === 0, "la cuenta ya no existe");
  ok((await db.expense.count({ where: { userId: cuenta.id } })) === 0, "ni sus datos");
  ok((await adm.getByText(nombre).count()) <= 1, "la lista ya no la muestra (solo el aviso)");

  console.log("\n3. Quien estaba adentro queda por fuera");
  await dueno.goto(BASE + "/panel/gastos", { waitUntil: "load" });
  ok(/\/(login|salir)/.test(dueno.url()), "el dueño vuelve al ingreso", dueno.url());

  console.log("\n4. La cuenta del administrador no se puede eliminar");
  await adm.goto(BASE + "/admin/" + admin.id, { waitUntil: "load" });
  ok((await adm.locator("[data-eliminar-cuenta]").count()) === 0, "no tiene el botón");
  ok((await adm.getByText(/Es una cuenta de administrador/).count()) === 1, "y dice por qué");

  console.log("\n5. Errores durante el recorrido");
  ok(errores.length === 0, "ningún error 500", errores.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  await db.user.deleteMany({ where: { OR: [{ slug: { contains: S } }, { email: ADMIN }] } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
