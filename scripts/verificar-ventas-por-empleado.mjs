/**
 * Comprueba en un navegador que cada empleado vea solo sus propias ventas y
 * sus propias cuentas por cobrar, y que el dueño las siga viendo todas.
 *
 * Lo que se prueba, con dos empleadas y la dueña:
 *   - En Ventas, cada quien ve solo lo que vendió; la dueña ve todo y el
 *     reparto por persona.
 *   - En Cuentas por cobrar, cada quien ve solo las que anotó y solo cobra
 *     abonos de esas; la dueña las ve todas, con quién las anotó.
 *   - Una empleada no puede abrir por la URL la deuda de la otra: es como si
 *     no existiera.
 *   - Ninguna ve botones de borrar.
 *
 * Antes:   npm run build && npm start
 * Después: node scripts/verificar-ventas-por-empleado.mjs
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

const S = "porempleado-" + Date.now();
const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const listo = { onboardingDoneAt: new Date(), tourDoneAt: new Date() };
const clave = bcrypt.hashSync("demo1234", 10);

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
        { name: "Ana", role: "VENDEDOR", username: "ana." + S.replace(/[^a-z0-9]/g, ""), ...listo },
        { name: "Beto", role: "VENDEDOR", username: "beto." + S.replace(/[^a-z0-9]/g, ""), ...listo },
      ],
    },
  },
  include: { staff: true },
});
const duenaStaff = cuenta.staff.find((s) => s.role === "DUENO");
const ana = cuenta.staff.find((s) => s.name === "Ana");
const beto = cuenta.staff.find((s) => s.name === "Beto");

// Una venta y una deuda de cada quien, de antes de esta prueba.
await db.sale.create({ data: { userId: cuenta.id, day: hoy, total: 15000, staffId: ana.id, clientName: "Cliente de Ana", items: { create: [{ userId: cuenta.id, name: "Producto de Ana", unitPrice: 15000, qty: 1 }] } } });
await db.sale.create({ data: { userId: cuenta.id, day: hoy, total: 9000, staffId: beto.id, clientName: "Cliente de Beto", items: { create: [{ userId: cuenta.id, name: "Producto de Beto", unitPrice: 9000, qty: 1 }] } } });
const deudaAna = await db.debt.create({ data: { userId: cuenta.id, staffId: ana.id, clientName: "Fiado de Ana", concept: "Mercado", amount: 20000, day: hoy } });
const deudaBeto = await db.debt.create({ data: { userId: cuenta.id, staffId: beto.id, clientName: "Fiado de Beto", concept: "Ferretería", amount: 30000, day: hoy } });

const errores = [];
const vigilar = (page) => page.on("response", (r) => r.status() >= 500 && r.status() !== 503 && errores.push(r.status() + " " + r.url()));

async function entrarConUsuario(usuario) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  vigilar(page);
  await page.goto(BASE + "/login", { waitUntil: "load" });
  await page.fill('input[name="email"]', usuario);
  await esperarHasta(() => page.locator("[data-ingreso-usuario]").count());
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel/, { timeout: 25000 });
  return { ctx, page };
}

const browser = await chromium.launch({ channel: "msedge" });
try {
  console.log("\n1. Ventas: cada quien ve solo lo que vendió");
  const { page: pAna } = await entrarConUsuario(ana.username);
  await pAna.goto(BASE + "/panel/ventas?d=" + hoy, { waitUntil: "load" });
  ok((await pAna.getByText("Cliente de Ana").count()) === 1, "Ana ve su propia venta");
  ok((await pAna.getByText("Cliente de Beto").count()) === 0, "y no la de Beto");
  ok((await pAna.getByText("Solo se ven tus ventas").count()) === 1, "y el aviso de que son solo las suyas");

  const { page: pBeto } = await entrarConUsuario(beto.username);
  await pBeto.goto(BASE + "/panel/ventas?d=" + hoy, { waitUntil: "load" });
  ok((await pBeto.getByText("Cliente de Beto").count()) === 1, "Beto ve la suya");
  ok((await pBeto.getByText("Cliente de Ana").count()) === 0, "y no la de Ana");

  const ctxDuena = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pDuena = await ctxDuena.newPage();
  vigilar(pDuena);
  await pDuena.goto(BASE + "/login", { waitUntil: "load" });
  await pDuena.fill('input[name="email"]', cuenta.email);
  await pDuena.fill('input[name="password"]', "demo1234");
  await pDuena.click('button[type="submit"]');
  await pDuena.waitForURL(/\/panel/, { timeout: 25000 });
  await pDuena.goto(BASE + "/panel/ventas?d=" + hoy, { waitUntil: "load" });
  ok((await pDuena.getByText("Cliente de Ana").count()) === 1 && (await pDuena.getByText("Cliente de Beto").count()) === 1, "la dueña ve las dos");
  ok((await pDuena.getByText("Solo se ven tus ventas").count()) === 0, "sin el aviso, porque las ve todas");
  ok((await pDuena.getByText("Ana", { exact: true }).count()) > 0 && (await pDuena.getByText("Beto", { exact: true }).count()) > 0, "y el reparto por persona");

  console.log("\n2. Cuentas por cobrar: cada quien ve solo las que anotó");
  await pAna.goto(BASE + "/panel/cartera?f=todas", { waitUntil: "load" });
  ok((await pAna.getByText("Fiado de Ana").count()) === 1, "Ana ve su deuda");
  ok((await pAna.getByText("Fiado de Beto").count()) === 0, "y no la de Beto");
  ok((await pAna.getByText("Solo ves las tuyas").count()) === 1, "con el aviso");

  await pBeto.goto(BASE + "/panel/cartera?f=todas", { waitUntil: "load" });
  ok((await pBeto.getByText("Fiado de Beto").count()) === 1, "Beto ve la suya");
  ok((await pBeto.getByText("Fiado de Ana").count()) === 0, "y no la de Ana");

  await pDuena.goto(BASE + "/panel/cartera?f=todas", { waitUntil: "load" });
  ok((await pDuena.getByText("Fiado de Ana").count()) === 1 && (await pDuena.getByText("Fiado de Beto").count()) === 1, "la dueña ve las dos");
  ok((await pDuena.getByText("Anotó Ana").count()) === 1 && (await pDuena.getByText("Anotó Beto").count()) === 1, "y quién anotó cada una");

  console.log("\n3. Una no puede abrir por la URL la deuda de la otra");
  const resp = await pAna.goto(BASE + "/panel/cartera/" + deudaBeto.id, { waitUntil: "load" });
  ok(resp.status() === 404, "responde que no existe", String(resp.status()));
  const propia = await pAna.goto(BASE + "/panel/cartera/" + deudaAna.id, { waitUntil: "load" });
  ok(propia.status() === 200 && (await pAna.getByText("Fiado de Ana").count()) > 0, "pero sí abre la suya");

  console.log("\n4. Un abono de Ana no aparece en lo cobrado de Beto");
  await pAna.goto(BASE + "/panel/cartera/" + deudaAna.id, { waitUntil: "load" });
  await pAna.locator('input[name="amount"]').first().fill("5000");
  await pAna.getByRole("button", { name: /Anotar el abono|Registrar abono|Abonar/i }).first().click();
  ok(Boolean(await esperarHasta(async () => (await db.debtPayment.count({ where: { debtId: deudaAna.id } })) === 1)), "el abono queda guardado");
  await pBeto.goto(BASE + "/panel/cartera?f=todas", { waitUntil: "load" });
  const valorCobradoBeto = await pBeto.locator(".card-tight", { hasText: "Cobrado este mes" }).locator(".stat-value").innerText();
  ok(!/5[.,]?000/.test(valorCobradoBeto), "el abono de Ana no suma en lo cobrado de Beto", valorCobradoBeto);

  console.log("\n5. Ninguna empleada ve botones de borrar");
  ok((await pAna.locator('button[aria-label="Borrar venta"]').count()) === 0, "sin borrar venta");
  await pAna.goto(BASE + "/panel/cartera/" + deudaAna.id, { waitUntil: "load" });
  ok((await pAna.getByRole("button", { name: /^Borrar/ }).count()) === 0, "sin borrar deuda");

  console.log("\n6. Errores durante el recorrido");
  ok(errores.length === 0, "ningún error 500", errores.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  await db.user.deleteMany({ where: { slug: { contains: S } } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
