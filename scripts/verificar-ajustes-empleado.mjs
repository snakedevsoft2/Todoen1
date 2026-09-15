/**
 * Comprueba en un navegador que un empleado no tenga en Ajustes las tarjetas
 * de Seguridad ni de Pregunta de seguridad, y que al imprimir un recibo solo
 * le quede la opción de Bluetooth (sin el diálogo del sistema ni la hoja
 * completa, que solo sale por ese diálogo).
 *
 * Antes:   npm run build && npm start
 * Después: node scripts/verificar-ajustes-empleado.mjs
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
const esperarHasta = async (fn, ms = 15000) => {
  const fin = Date.now() + ms;
  let v = await fn();
  while (!v && Date.now() < fin) {
    await new Promise((r) => setTimeout(r, 300));
    v = await fn();
  }
  return v;
};

const S = "ajustesemp-" + Date.now();
const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const listo = { onboardingDoneAt: new Date(), tourDoneAt: new Date() };
const clave = bcrypt.hashSync("demo1234", 10);
const usuario = "ana." + S.replace(/[^a-z0-9]/g, "");

const cuenta = await db.user.create({
  data: {
    email: "duena-" + S + "@test.local",
    passwordHash: clave,
    ownerName: "Dueña",
    businessName: "Tienda " + S,
    businessType: "OTRO",
    slug: "tienda-" + S,
    staff: {
      create: [
        { name: "Dueña", role: "DUENO", ...listo },
        { name: "Ana", role: "VENDEDOR", username: usuario, ...listo },
      ],
    },
  },
  include: { staff: true },
});
const ana = cuenta.staff.find((s) => s.name === "Ana");
await db.sale.create({
  data: {
    userId: cuenta.id,
    day: hoy,
    total: 10000,
    staffId: ana.id,
    clientName: "Cliente de Ana",
    items: { create: [{ userId: cuenta.id, name: "Producto", unitPrice: 10000, qty: 1 }] },
  },
});

const errores = [];
const vigilar = (page) => page.on("response", (r) => r.status() >= 500 && r.status() !== 503 && errores.push(r.status() + " " + r.url()));

const browser = await chromium.launch({ channel: "msedge" });
try {
  console.log("\n1. Ajustes: la dueña sí tiene Seguridad y Pregunta de seguridad");
  const ctxDuena = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const duena = await ctxDuena.newPage();
  vigilar(duena);
  await duena.goto(BASE + "/login", { waitUntil: "load" });
  await duena.fill('input[name="email"]', cuenta.email);
  await duena.fill('input[name="password"]', "demo1234");
  await duena.click('button[type="submit"]');
  await duena.waitForURL(/\/panel/, { timeout: 25000 });
  await duena.goto(BASE + "/panel/ajustes", { waitUntil: "load" });
  ok((await duena.getByRole("heading", { name: "Seguridad", exact: true }).count()) === 1, "ve la tarjeta de Seguridad");
  ok((await duena.getByRole("heading", { name: "Pregunta de seguridad", exact: true }).count()) === 1, "y la de Pregunta de seguridad");

  console.log("\n2. Ana entra y no tiene ninguna de las dos");
  const ctxAna = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ana_ = await ctxAna.newPage();
  vigilar(ana_);
  await ana_.goto(BASE + "/login", { waitUntil: "load" });
  await ana_.fill('input[name="email"]', usuario);
  await esperarHasta(() => ana_.locator("[data-ingreso-usuario]").count());
  await ana_.click('button[type="submit"]');
  await ana_.waitForURL(/\/panel/, { timeout: 25000 });
  await ana_.goto(BASE + "/panel/ajustes", { waitUntil: "load" });
  ok((await ana_.getByRole("heading", { name: "Seguridad", exact: true }).count()) === 0, "sin la tarjeta de Seguridad");
  ok((await ana_.getByRole("heading", { name: "Pregunta de seguridad", exact: true }).count()) === 0, "ni la de Pregunta de seguridad");
  await ana_.getByLabel("Abrir menú").click();
  ok((await ana_.getByRole("button", { name: "Cerrar sesión" }).count()) === 1, "pero sigue pudiendo cerrar sesión, desde el menú");

  console.log("\n3. Al imprimir, la dueña ve todas las opciones");
  await duena.goto(BASE + "/panel/ventas?d=" + hoy, { waitUntil: "load" });
  await duena.getByRole("button", { name: "Factura" }).first().click();
  const menuDuena = duena.locator("[data-menu-imprimir]");
  await duena.getByRole("button", { name: "Elegir tamano de impresion" }).first().click();
  ok(Boolean(await esperarHasta(() => menuDuena.getByText("Hoja carta / A4").count())), "tiene la hoja carta / A4");
  ok((await menuDuena.getByText("¿Cómo está conectada?").count()) === 1, "y puede elegir cómo está conectada");
  ok((await menuDuena.getByText("Diálogo de impresión").count()) === 1, "con el diálogo del sistema entre las opciones");

  console.log("\n4. Ana, al imprimir, solo tiene Bluetooth");
  await ana_.goto(BASE + "/panel/ventas?d=" + hoy, { waitUntil: "load" });
  await ana_.getByRole("button", { name: "Factura" }).first().click();
  const menuAna = ana_.locator("[data-menu-imprimir]");
  await ana_.getByRole("button", { name: "Elegir tamano de impresion" }).first().click();
  ok(Boolean(await esperarHasta(() => menuAna.getByText("Tirilla 58 mm").count())), "puede elegir la tirilla de 58mm");
  ok((await menuAna.getByText("Tirilla 80 mm").count()) === 1, "y la de 80mm");
  ok((await menuAna.getByText("Hoja carta / A4").count()) === 0, "pero no la hoja carta / A4");
  ok((await menuAna.getByText("¿Cómo está conectada?").count()) === 0, "y no hay nada que elegir de conexión: solo queda Bluetooth");
  ok((await menuAna.getByText("Diálogo de impresión").count()) === 0, "en particular, no aparece el diálogo del sistema");

  console.log("\n5. Errores durante el recorrido");
  ok(errores.length === 0, "ningún error 500", errores.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  await db.user.deleteMany({ where: { slug: { contains: S } } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
