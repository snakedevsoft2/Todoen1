/**
 * Comprueba el oficio de cartera en un navegador de verdad.
 *
 * Lo que se prueba aqui y no en tests/ es lo que solo se puede comprobar
 * navegando: que se pueda registrar un negocio de cobranza, que el formulario
 * calcule la cuota mientras se teclea, que el prestamo quede guardado con su
 * interes y su fiador, y sobre todo que el tablero diga a quien hay que
 * cobrarle hoy y quien se atraso, que es para lo que existe el oficio.
 *
 * Antes de correrlo:
 *   1. npm run db:up
 *   2. npm run build && npm start
 *
 * Y despues:  npm run verificar:cartera
 *
 * Crea una cuenta desechable y la borra al final. Toca la base de datos: usar
 * solo contra la base local de pruebas.
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

const S = "cart-" + Date.now();
const CORREO = "presta-" + S + "@test.local";

/** Suma dias a un "YYYY-MM-DD". */
const masDias = (day, n) => {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const hoy = new Date().toISOString().slice(0, 10);

const cuenta = await db.user.create({
  data: {
    email: CORREO,
    passwordHash: bcrypt.hashSync("demo1234", 10),
    ownerName: "Prestamista",
    businessName: "Creditos " + S,
    businessType: "CARTERA",
    slug: "creditos-" + S,
    staff: { create: { name: "Prestamista", role: "DUENO" } },
  },
});

const browser = await chromium.launch({ channel: "msedge" });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  console.log("\n1. El oficio se puede elegir al registrarse");
  await page.goto(BASE + "/registro", { waitUntil: "networkidle" });
  ok(
    /Cartera y cobranza/i.test(await page.textContent("body")),
    "aparece en la lista de tipos de negocio"
  );

  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', CORREO);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel|\/bienvenida/, { timeout: 25000 });

  console.log("\n2. El formulario pide lo de un prestamo");
  await page.goto(BASE + "/panel/cartera", { waitUntil: "networkidle" });
  const cuerpo = await page.textContent("body");
  ok(/Cuentas por cobrar/i.test(cuerpo), "la pantalla se llama Cuentas por cobrar");
  ok((await page.locator('input[name="principal"]').count()) > 0, "pide cuanto le prestas");
  ok((await page.locator('input[name="interestPct"]').count()) > 0, "pide el interes");
  ok((await page.locator('input[name="installments"]').count()) > 0, "pide las cuotas");
  ok((await page.locator('select[name="frequency"]').count()) > 0, "pide cada cuanto paga");

  console.log("\n3. Calcula la cuota mientras se teclea");
  await page.fill('input[name="clientName"]', "Juan Perez");
  await page.fill('input[name="clientPhone"]', "3001112233");
  await page.fill('input[name="concept"]', "Prestamo");
  await page.fill('input[name="principal"]', "500000");
  await page.fill('input[name="interestPct"]', "20");
  await page.fill('input[name="installments"]', "20");
  await page.waitForTimeout(600);

  const resumen = await page.textContent("body");
  ok(/30[.,]000/.test(resumen), "dice que la cuota es de 30.000");
  ok(/600[.,]000/.test(resumen), "dice que el total a pagar es 600.000");
  ok(/100[.,]000/.test(resumen), "dice cuanto se gana: 100.000");

  console.log("\n4. El fiador");
  await page.getByRole("button", { name: /Datos del fiador/i }).click();
  await page.waitForTimeout(300);
  await page.fill('input[name="guarantorName"]', "Rosa Medina");
  await page.fill('input[name="guarantorId"]', "43.123.456");
  await page.fill('input[name="guarantorPhone"]', "3009998877");
  await page.fill('input[name="guarantorAddress"]', "Carrera 8 #12-30");
  ok(true, "se pueden llenar los cuatro datos");

  if (DIR) await page.screenshot({ path: DIR + "/cartera-formulario.png" });

  console.log("\n5. Queda guardado como prestamo");
  await page.getByRole("button", { name: /Anotar el prestamo/i }).click();
  await page.waitForTimeout(2800);

  const deuda = await db.debt.findFirst({ where: { userId: cuenta.id } });
  ok(Boolean(deuda), "el prestamo quedo guardado");
  ok(deuda?.principal === 500000, "guarda el capital", String(deuda?.principal));
  ok(deuda?.amount === 600000, "el total es capital mas interes", String(deuda?.amount));
  ok(deuda?.interestPct === 20, "guarda el interes", String(deuda?.interestPct));
  ok(deuda?.installments === 20, "guarda las cuotas", String(deuda?.installments));
  ok(deuda?.frequency === "DIARIA", "guarda la frecuencia", String(deuda?.frequency));
  ok(deuda?.guarantorName === "Rosa Medina", "guarda el fiador", String(deuda?.guarantorName));
  ok(deuda?.guarantorId === "43.123.456", "guarda la cedula del fiador");
  ok(
    deuda?.dueDay === masDias(deuda.day, 20),
    "el vencimiento es el dia de la ultima cuota",
    String(deuda?.dueDay)
  );

  console.log("\n6. La ficha muestra el plan y el fiador");
  await page.goto(BASE + "/panel/cartera/" + deuda.id, { waitUntil: "networkidle" });
  const ficha = await page.textContent("body");
  ok(/El prestamo/i.test(ficha), "se ve el bloque del prestamo");
  ok(/Proxima cuota/i.test(ficha), "dice cual es la proxima cuota");
  ok(/Fiador/i.test(ficha) && /Rosa Medina/.test(ficha), "se ve el fiador con su nombre");
  ok(/43\.123\.456/.test(ficha), "y su cedula");

  await page.getByRole("group").filter({ hasText: /Ver el plan completo/i }).first().click();
  await page.waitForTimeout(400);
  ok(/Cuota/i.test(await page.textContent("body")), "el plan completo se puede desplegar");
  if (DIR) await page.screenshot({ path: DIR + "/cartera-ficha.png" });

  console.log("\n7. El tablero avisa a quien cobrarle hoy");
  // Se mueve el prestamo al pasado para que hoy le toque la cuota 3 y ademas
  // arrastre atraso: es la situacion que el tablero tiene que delatar.
  await db.debt.update({
    where: { id: deuda.id },
    data: { day: masDias(hoy, -3) },
  });
  await page.goto(BASE + "/panel/cartera", { waitUntil: "networkidle" });
  const tablero = await page.textContent("body");
  ok(/Atrasados/i.test(tablero), "muestra el bloque de atrasados");
  ok(/Juan Perez/.test(tablero), "con el nombre de quien debe");
  ok(/cuotas? atrasadas?/i.test(tablero), "dice cuantas cuotas lleva sin pagar");
  ok(/Cobrar/i.test(tablero), "y el boton para cobrarle por WhatsApp");
  if (DIR) await page.screenshot({ path: DIR + "/cartera-tablero.png" });

  console.log("\n8. Al ponerse al dia, el aviso desaparece");
  await db.debtPayment.create({
    data: { userId: cuenta.id, debtId: deuda.id, amount: 90000, day: hoy, method: "EFECTIVO" },
  });
  await page.reload({ waitUntil: "networkidle" });
  const alDia = await page.textContent("body");
  ok(!/Atrasados \(/i.test(alDia), "ya no aparece en atrasados");

  console.log("\n9. Una tienda normal no ve nada de esto");
  await db.user.update({ where: { id: cuenta.id }, data: { businessType: "ROPA" } });
  await page.goto(BASE + "/panel/cartera", { waitUntil: "networkidle" });
  const tienda = await page.textContent("body");
  ok(!/Hoy le toca a/i.test(tienda), "no sale el tablero de cobros del dia");
  ok(
    (await page.locator('input[name="principal"]').count()) === 0,
    "ni el formulario pide capital e interes"
  );
} finally {
  await browser.close();
  await db.debtPayment.deleteMany({ where: { userId: cuenta.id } });
  await db.debt.deleteMany({ where: { userId: cuenta.id } });
  await db.user.delete({ where: { id: cuenta.id } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
