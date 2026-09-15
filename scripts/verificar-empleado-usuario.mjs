/**
 * Comprueba en un navegador al empleado que entra solo con su usuario.
 *
 * Lo que se prueba:
 *   - El dueño lo agrega con un usuario, sin contraseña.
 *   - El empleado entra escribiendo el usuario; la contraseña ni aparece.
 *   - No ve los botones de borrar ni cambiar, y el servidor tampoco le deja.
 *   - Lo que hace queda en su historial, que el dueño ve en Empleados.
 *   - Si el dueño le quita el acceso, queda por fuera.
 *   - Probar usuarios a ciegas se frena.
 *
 * Antes:   npm run build && npm start
 * Después: npm run verificar:empleado-usuario
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

const S = "usu-" + Date.now();
const usuario = "juliana." + S.replace(/[^a-z0-9]/g, "");
const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const listo = { onboardingDoneAt: new Date(), tourDoneAt: new Date() };
const cuenta = await db.user.create({
  data: {
    email: "duena-" + S + "@test.local",
    passwordHash: bcrypt.hashSync("demo1234", 10),
    ownerName: "Dueña",
    businessName: "Snacks " + S,
    businessType: "OTRO",
    slug: "snacks-" + S,
    staff: { create: { name: "Dueña", role: "DUENO", ...listo } },
    expenses: { create: { day: hoy, amount: 9000, description: "Gasto de la dueña" } },
  },
  include: { staff: true, expenses: true },
});
const venta = await db.sale.create({
  data: {
    userId: cuenta.id,
    day: hoy,
    total: 20000,
    staffId: cuenta.staff[0].id,
    clientName: "Venta de la dueña",
    items: { create: [{ userId: cuenta.id, name: "Papa grande", unitPrice: 20000, qty: 1 }] },
  },
});
const gastoDuena = cuenta.expenses[0];

const errores = [];
const vigilar = (page) => page.on("response", (r) => r.status() >= 500 && r.status() !== 503 && errores.push(r.status() + " " + r.url()));
const browser = await chromium.launch({ channel: "msedge" });

try {
  console.log("\n1. La dueña agrega a Juliana con un usuario");
  const ctxDuena = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const duena = await ctxDuena.newPage();
  vigilar(duena);
  duena.on("dialog", (d) => d.accept());
  await duena.goto(BASE + "/login", { waitUntil: "load" });
  await duena.fill('input[name="email"]', cuenta.email);
  await duena.fill('input[name="password"]', "demo1234");
  await duena.click('button[type="submit"]');
  await duena.waitForURL(/\/panel/, { timeout: 25000 });

  await duena.goto(BASE + "/panel/ventas?d=" + hoy, { waitUntil: "load" });
  ok((await duena.locator('input[name="id"][value="' + venta.id + '"]').count()) > 0, "la dueña sí ve los botones de la venta");

  await duena.goto(BASE + "/panel/equipo", { waitUntil: "load" });
  const form = duena.locator("form", { has: duena.getByRole("button", { name: "Agregar empleado" }) });
  await form.locator('input[name="name"]').fill("Juliana Intriago");
  ok((await form.locator('input[name="password"]').count()) === 0, "el formulario no pide contraseña");
  await form.locator('input[name="username"]').fill(usuario);
  await form.getByRole("button", { name: "Agregar empleado" }).click();
  ok(Boolean(await esperarHasta(() => duena.getByText(/Entra escribiendo el usuario/).count())), "confirma con qué usuario entra");
  const juliana = await db.staff.findFirst({ where: { userId: cuenta.id, username: usuario } });
  ok(Boolean(juliana) && !juliana.passwordHash && juliana.role === "VENDEDOR", "queda como empleada, sin contraseña");

  console.log("\n2. Juliana entra solo con su usuario");
  const ctxEmp = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const emp = await ctxEmp.newPage();
  vigilar(emp);
  await emp.goto(BASE + "/login", { waitUntil: "load" });
  await emp.fill('input[name="email"]', usuario.toUpperCase());
  ok(Boolean(await esperarHasta(() => emp.locator("[data-ingreso-usuario]").count())), "al escribir un usuario aparece el aviso de entrar sin contraseña");
  ok((await emp.locator('input[name="password"]').count()) === 0, "no hay campo de contraseña");
  await emp.click('button[type="submit"]');
  await emp.waitForURL(/\/panel/, { timeout: 25000 });
  ok(/\/panel/.test(emp.url()), "entra al panel", emp.url());

  console.log("\n3. No ve los botones de borrar ni cambiar");
  await emp.goto(BASE + "/panel/gastos", { waitUntil: "load" });
  ok((await emp.getByText("Gasto de la dueña").count()) > 0, "ve los gastos del día");
  ok((await emp.locator('input[name="id"][value="' + gastoDuena.id + '"]').count()) === 0, "pero no el botón de borrar");
  await emp.goto(BASE + "/panel/ventas?d=" + hoy, { waitUntil: "load" });
  ok((await emp.locator('input[name="id"][value="' + venta.id + '"]').count()) === 0, "en Ventas no puede borrar ni cambiar el pago");

  console.log("\n4. El servidor tampoco le deja, aunque lo intente por su cuenta");
  const intento = await emp.request.post(BASE + "/api/sin-senal", {
    data: { acciones: [{ clientKey: "borrar-" + S, accion: "deleteSaleAction", campos: [["id", venta.id]] }] },
  });
  const cuerpo = await intento.json().catch(() => ({}));
  ok(cuerpo.resultados?.[0]?.estado === "rechazado", "la cola rechaza borrar la venta", JSON.stringify(cuerpo));
  ok((await db.sale.count({ where: { id: venta.id } })) === 1, "la venta sigue ahí");

  console.log("\n5. Lo que hace queda en su historial");
  await emp.goto(BASE + "/panel/gastos", { waitUntil: "load" });
  const formGasto = emp.locator("form", { has: emp.locator('input[name="description"]') });
  await formGasto.locator('input[name="description"]').fill("Hielo de Juliana");
  await formGasto.locator('input[name="amount"]').fill("7000");
  await formGasto.locator('button[type="submit"]').click();
  ok(
    Boolean(await esperarHasta(async () => (await db.expense.count({ where: { userId: cuenta.id, description: "Hielo de Juliana" } })) === 1)),
    "anota su gasto"
  );
  const ventaEmp = await emp.request.post(BASE + "/api/ventas", { data: { manualTotal: "12000", clientName: "Cliente de Juliana", paymentMethod: "EFECTIVO" } });
  ok(ventaEmp.ok(), "registra una venta", String(ventaEmp.status()));

  await duena.goto(BASE + "/panel/equipo", { waitUntil: "load" });
  ok((await duena.getByText("Usuario: " + usuario).count()) === 1, "la dueña ve su usuario en el equipo");
  ok((await duena.locator('a[href="/panel/equipo/' + juliana.id + '"]').count()) === 1, "y el enlace para ver lo que hizo");
  await duena.goto(BASE + "/panel/equipo/" + juliana.id, { waitUntil: "load" });
  const historial = duena.locator("[data-actividad-empleado]");
  ok(Boolean(await esperarHasta(() => historial.getByText("Anotó un gasto: Hielo de Juliana").count())), "su historial muestra el gasto");
  ok((await historial.getByText("Registró una venta a Cliente de Juliana").count()) === 1, "y la venta");
  ok((await historial.getByText(/Borró/).count()) === 0, "y nada borrado");

  console.log("\n6. La dueña le quita el acceso");
  await duena.goto(BASE + "/panel/equipo", { waitUntil: "load" });
  await duena.getByRole("button", { name: "Quitar acceso" }).click();
  ok(Boolean(await esperarHasta(async () => !(await db.staff.findUnique({ where: { id: juliana.id } }))?.username)), "queda sin usuario");
  await emp.goto(BASE + "/panel", { waitUntil: "load" });
  ok(/\/(login|salir)/.test(emp.url()), "Juliana queda por fuera", emp.url());

  console.log("\n7. Probar usuarios a ciegas se frena");
  const ctxAtaque = await browser.newContext();
  const at = await ctxAtaque.newPage();
  let frenado = false;
  for (let i = 0; i < 12 && !frenado; i++) {
    await at.goto(BASE + "/login", { waitUntil: "load" });
    await at.fill('input[name="email"]', "noexiste" + i + "." + S.replace(/[^a-z0-9]/g, ""));
    await at.click('button[type="submit"]');
    await at.waitForSelector('[role="alert"]', { timeout: 15000 }).catch(() => null);
    frenado = (await at.getByText(/Demasiados intentos/).count()) > 0;
  }
  ok(frenado, "después de varios usuarios que no existen, pide esperar");

  console.log("\n8. Errores durante el recorrido");
  ok(errores.length === 0, "ningún error 500", errores.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  await db.securityAttempt.deleteMany({ where: { email: { startsWith: "usuario@" } } }).catch(() => {});
  await db.user.deleteMany({ where: { slug: { contains: S } } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
