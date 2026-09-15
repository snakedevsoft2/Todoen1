/**
 * Comprueba en un navegador que "Otro negocio" pueda agregar empleados.
 *
 * Antes el menú mostraba "Empleados" y al tocarlo volvía al inicio. Lo que se
 * prueba:
 *   - Otro negocio abre Empleados y agrega a alguien con su usuario.
 *   - Esa persona entra solo con su usuario, sin contraseña.
 *   - En Ventas ya se puede elegir quién atendió.
 *   - Un restaurante con Empleados prendido también abre la pantalla.
 *
 * Antes:   npm run build && npm start
 * Después: npm run verificar:empleados
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

const S = "emp-" + Date.now();
const clave = bcrypt.hashSync("demo1234", 10);
const listo = { onboardingDoneAt: new Date(), tourDoneAt: new Date() };
const otro = await db.user.create({
  data: {
    email: "otro-" + S + "@test.local",
    passwordHash: clave,
    ownerName: "Dueña",
    businessName: "Snacks " + S,
    businessType: "OTRO",
    slug: "snacks-" + S,
    staff: { create: { name: "Dueña", role: "DUENO", ...listo } },
  },
});
const resto = await db.user.create({
  data: {
    email: "resto-" + S + "@test.local",
    passwordHash: clave,
    ownerName: "Chef",
    businessName: "Resto " + S,
    businessType: "RESTAURANTE",
    slug: "resto-" + S,
    staff: { create: { name: "Chef", role: "DUENO", ...listo } },
    accountModules: { create: { moduleKey: "equipo", enabled: true } },
  },
});
const usuarioEmpleado = "juliana." + S.replace(/[^a-z0-9]/g, "");

const errores = [];
const browser = await chromium.launch({ channel: "msedge" });

async function entrar(ctx, email, clavePlana = "demo1234") {
  const page = await ctx.newPage();
  page.on("response", (r) => r.status() >= 500 && r.status() !== 503 && errores.push(r.status() + " " + r.url()));
  await page.goto(BASE + "/login", { waitUntil: "load" });
  await page.fill('input[name="email"]', email);
  if (clavePlana) await page.fill('input[name="password"]', clavePlana);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel/, { timeout: 25000 });
  return page;
}

try {
  console.log("\n1. Otro negocio abre Empleados");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const duena = await entrar(ctx, otro.email);
  ok((await duena.locator("nav a", { hasText: "Empleados" }).count()) > 0, "el menú muestra Empleados");
  await duena.goto(BASE + "/panel/equipo", { waitUntil: "load" });
  ok(duena.url().endsWith("/panel/equipo"), "la pantalla abre y no vuelve al inicio", duena.url());
  ok((await duena.getByRole("heading", { name: "Empleados" }).count()) > 0, "se llama Empleados");

  console.log("\n2. Agrega un empleado con su usuario");
  const form = duena.locator("form", { has: duena.getByRole("button", { name: "Agregar empleado" }) });
  await form.locator('input[name="name"]').fill("Juliana Intriago");
  await form.locator('input[name="username"]').fill(usuarioEmpleado);
  await form.getByRole("button", { name: "Agregar empleado" }).click();
  ok(Boolean(await duena.getByText(/Empleado agregado/).waitFor({ timeout: 15000 }).then(() => true, () => false)), "confirma que quedó agregado");
  const persona = await db.staff.findFirst({ where: { userId: otro.id, username: usuarioEmpleado } });
  ok(persona?.role === "VENDEDOR", "queda como empleado, no como barbero", persona?.role);
  await duena.reload({ waitUntil: "load" });
  ok((await duena.getByText("Juliana Intriago").count()) > 0, "aparece en la lista del equipo");

  console.log("\n3. El empleado entra con su usuario");
  const ctxEmp = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const empleada = await entrar(ctxEmp, usuarioEmpleado, "");
  ok(/\/panel/.test(empleada.url()), "entra al panel", empleada.url());
  await ctxEmp.close();

  console.log("\n4. En Ventas se elige quién atendió");
  await duena.goto(BASE + "/panel/ventas", { waitUntil: "load" });
  ok((await duena.locator("option", { hasText: "Juliana Intriago" }).count()) > 0, "Juliana sale para elegir en la venta");
  await ctx.close();

  console.log("\n5. Un restaurante con Empleados prendido también");
  const ctxResto = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const chef = await entrar(ctxResto, resto.email);
  await chef.goto(BASE + "/panel/equipo", { waitUntil: "load" });
  ok(chef.url().endsWith("/panel/equipo") && (await chef.getByRole("button", { name: "Agregar empleado" }).count()) === 1, "abre la pantalla con el formulario", chef.url());
  await ctxResto.close();

  console.log("\n6. Errores durante el recorrido");
  ok(errores.length === 0, "ningún error 500", errores.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  await db.user.deleteMany({ where: { slug: { contains: S } } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
