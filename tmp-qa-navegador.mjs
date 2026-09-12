/**
 * QA en el navegador: se intenta romper la aplicacion a proposito.
 *
 * No repite los caminos felices, que ya estan cubiertos. Prueba lo que un
 * usuario real hace sin querer y lo que uno malintencionado hace a proposito:
 * mandar formularios sin llenar, meter guiones y letras donde van numeros,
 * pegar textos larguisimos, mandar etiquetas HTML, tocar dos veces el mismo
 * boton, y pedir la ficha de otro negocio.
 */
import "dotenv/config";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const BASE = "http://localhost:3000";
const db = new PrismaClient();
const hallazgos = [];
const ok = (c, t, extra = "") => {
  if (c) console.log("  OK   " + t);
  else {
    hallazgos.push(t + (extra ? " -> " + extra : ""));
    console.log("  !!   " + t + (extra ? "  <- " + extra : ""));
  }
};

const S = "qa-" + Date.now();
const hoy = new Date().toISOString().slice(0, 10);

async function crear(nombre, tipo, correo) {
  return db.user.create({
    data: {
      email: correo,
      passwordHash: bcrypt.hashSync("demo1234", 10),
      ownerName: nombre,
      businessName: nombre + " " + S,
      businessType: tipo,
      slug: nombre.toLowerCase() + "-" + S,
      staff: { create: { name: nombre, role: "DUENO" } },
    },
  });
}

const a = await crear("Alfa", "CARTERA", "alfa-" + S + "@test.local");
const b = await crear("Beta", "ROPA", "beta-" + S + "@test.local");

// Una deuda del negocio B, para intentar alcanzarla desde A.
const deudaAjena = await db.debt.create({
  data: {
    userId: b.id,
    clientName: "Cliente de Beta",
    concept: "Fiado",
    amount: 50000,
    day: hoy,
  },
});

const browser = await chromium.launch({ channel: "msedge" });
const errores = [];

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errores.push(String(e).slice(0, 160)));
  page.on("response", (r) => {
    if (r.status() >= 500) errores.push("HTTP " + r.status() + " " + r.url().replace(BASE, ""));
  });

  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', a.email);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel|\/bienvenida/, { timeout: 25000 });

  console.log("\n1. Formulario de prestamo vacio");
  await page.goto(BASE + "/panel/cartera", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Anotar el prestamo/i }).click();
  await page.waitForTimeout(1200);
  const antes = await db.debt.count({ where: { userId: a.id } });
  ok(antes === 0, "no guarda un prestamo vacio", String(antes) + " guardados");

  console.log("\n2. Capital en cero y cuotas en cero");
  await page.fill('input[name="clientName"]', "Prueba");
  await page.fill('input[name="concept"]', "Prestamo");
  await page.fill('input[name="principal"]', "0");
  await page.fill('input[name="installments"]', "0");
  await page.getByRole("button", { name: /Anotar el prestamo/i }).click();
  await page.waitForTimeout(1200);
  ok(
    (await db.debt.count({ where: { userId: a.id } })) === 0,
    "no guarda un prestamo de cero"
  );
  ok(
    /mayor|escribe|cuantas/i.test(await page.textContent("body")),
    "y avisa por que no lo guardo"
  );

  console.log("\n3. Interes absurdo");
  await page.fill('input[name="principal"]', "100000");
  await page.fill('input[name="interestPct"]', "99999");
  await page.fill('input[name="installments"]', "10");
  await page.getByRole("button", { name: /Anotar el prestamo/i }).click();
  await page.waitForTimeout(1200);
  const conInteres = await db.debt.findFirst({ where: { userId: a.id } });
  ok(!conInteres, "rechaza un interes de 99999%", conInteres ? "lo guardo" : "");

  console.log("\n4. Texto larguisimo y etiquetas HTML en el nombre");
  const largo = "A".repeat(5000);
  await page.fill('input[name="clientName"]', largo);
  await page.fill('input[name="concept"]', '<img src=x onerror="document.title=\'roto\'">');
  await page.fill('input[name="principal"]', "100000");
  await page.fill('input[name="interestPct"]', "20");
  await page.fill('input[name="installments"]', "10");
  await page.getByRole("button", { name: /Anotar el prestamo/i }).click();
  await page.waitForTimeout(2000);

  const conLargo = await db.debt.findFirst({ where: { userId: a.id } });
  if (conLargo) {
    ok(
      conLargo.clientName.length <= 300,
      "recorta un nombre de 5000 letras",
      "guardo " + conLargo.clientName.length
    );
    await page.goto(BASE + "/panel/cartera/" + conLargo.id, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    ok((await page.title()) !== "roto", "el HTML del concepto no se ejecuta");
    const desborde = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 2
    );
    ok(desborde, "el nombre largo no rompe el ancho de la pantalla");
  } else {
    ok(false, "no guardo el prestamo de la prueba 4");
  }

  console.log("\n5. Abonar mas de lo que debe");
  if (conLargo) {
    await page.goto(BASE + "/panel/cartera/" + conLargo.id, { waitUntil: "networkidle" });
    const campo = page.locator('input[name="amount"]').first();
    await campo.fill("99999999");
    await page.getByRole("button", { name: /Registrar|Abonar|Guardar/i }).first().click();
    await page.waitForTimeout(1800);
    const pagos = await db.debtPayment.aggregate({
      where: { debtId: conLargo.id },
      _sum: { amount: true },
    });
    const sumado = pagos._sum.amount ?? 0;
    ok(sumado <= conLargo.amount, "no deja abonar mas de la deuda", "abonado " + sumado);
  }

  console.log("\n6. La ficha de otro negocio");
  await page.goto(BASE + "/panel/cartera/" + deudaAjena.id, { waitUntil: "networkidle" });
  const ajena = await page.textContent("body");
  ok(!/Cliente de Beta/.test(ajena), "no muestra la deuda de otro negocio", page.url());

  console.log("\n7. Una direccion inventada");
  const r404 = await page.goto(BASE + "/panel/cartera/no-existe-esto", { waitUntil: "networkidle" });
  ok(r404.status() < 500, "una ficha inexistente no revienta el servidor", "HTTP " + r404.status());

  console.log("\n8. Doble clic en guardar");
  await page.goto(BASE + "/panel/gastos", { waitUntil: "networkidle" });
  const antesGastos = await db.expense.count({ where: { userId: a.id } });
  await page.fill('input[name="description"]', "Gasto doble " + S);
  await page.fill('input[name="amount"]', "1000");
  const boton = page.getByRole("button", { name: /Anotar|Guardar|Agregar/i }).first();
  await boton.click({ clickCount: 2, delay: 40 });
  await page.waitForTimeout(2500);
  const despuesGastos = await db.expense.count({ where: { userId: a.id } });
  ok(
    despuesGastos - antesGastos <= 1,
    "el doble clic no anota el gasto dos veces",
    "se anotaron " + (despuesGastos - antesGastos)
  );

  console.log("\n9. Letras donde va plata");
  await page.goto(BASE + "/panel/gastos", { waitUntil: "networkidle" });
  await page.fill('input[name="description"]', "Letras " + S);
  const campoPlata = page.locator('input[name="amount"]').first();
  await campoPlata.evaluate((el) => {
    el.type = "text";
    el.value = "abc";
  });
  await page.getByRole("button", { name: /Anotar|Guardar|Agregar/i }).first().click();
  await page.waitForTimeout(1500);
  const conLetras = await db.expense.findFirst({ where: { userId: a.id, description: "Letras " + S } });
  ok(!conLetras, "no guarda un gasto sin valor", conLetras ? "guardo " + conLetras.amount : "");

  console.log("\n10. Errores de consola durante todo el recorrido");
  ok(errores.length === 0, "ninguna excepcion ni error 500", errores.slice(0, 3).join(" | "));

  await ctx.close();
} finally {
  await browser.close();
  for (const id of [a.id, b.id]) {
    await db.debtPayment.deleteMany({ where: { userId: id } });
    await db.debt.deleteMany({ where: { userId: id } });
    await db.expense.deleteMany({ where: { userId: id } });
    await db.user.delete({ where: { id } }).catch(() => {});
  }
  await db.$disconnect();
}

console.log("\n===== RESUMEN QA =====");
if (hallazgos.length === 0) console.log("Sin hallazgos.");
else hallazgos.forEach((h, i) => console.log(i + 1 + ". " + h));
process.exit(0);
