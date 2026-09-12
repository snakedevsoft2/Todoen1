/**
 * Comprueba que un negocio en dolares pueda poner precios con centavos.
 *
 * Es el caso del reporte: un puesto de snacks que vende a $0.40 y no podia
 * guardarlo. Se recorre el camino completo en el navegador: escribir el
 * precio, guardarlo, ver que quedo bien en la base y que se muestre igual.
 *
 * Antes de correrlo:
 *   1. npm run db:up
 *   2. npm run build && npm start
 *
 * Y despues:  npm run verificar:centavos
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

const S = "usd-" + Date.now();
const CORREO = "snacks-" + S + "@test.local";

const cuenta = await db.user.create({
  data: {
    email: CORREO,
    passwordHash: bcrypt.hashSync("demo1234", 10),
    ownerName: "Dueno Snacks",
    businessName: "Chopo Snacks " + S,
    businessType: "OTRO",
    slug: "chopo-" + S,
    currency: "USD",
    staff: { create: { name: "Dueno Snacks", role: "DUENO" } },
  },
});

const browser = await chromium.launch({ channel: "msedge" });

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', CORREO);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel|\/bienvenida/, { timeout: 25000 });

  console.log("\n1. El campo deja escribir 0.40");
  await page.goto(BASE + "/panel/catalogo", { waitUntil: "networkidle" });

  const precio = page.locator('input[name="price"]').first();
  const paso = await precio.getAttribute("step");
  ok(paso === "0.01", "el campo acepta centavos (step 0.01)", String(paso));

  await page.locator('input[name="name"]').first().fill("Papas limon");
  await precio.fill("0.40");
  await page.locator('input[name="cost"]').first().fill("0.28");
  await page.locator('input[name="category"]').first().fill("Snacks");

  // La validacion del navegador es la que antes lo frenaba.
  const valido = await precio.evaluate((el) => el.checkValidity());
  ok(valido, "el navegador ya no lo rechaza");
  const queja = await precio.evaluate((el) => el.validationMessage);
  ok(queja === "", "no sale 'ingresa un valor valido'", queja);

  if (DIR) await page.screenshot({ path: DIR + "/centavos-formulario.png" });

  console.log("\n2. Se guarda bien");
  await page.getByRole("button", { name: /Agregar/i }).first().click();
  await page.waitForTimeout(2500);

  const guardado = await db.service.findFirst({
    where: { userId: cuenta.id, name: "Papas limon" },
    select: { price: true, cost: true },
  });
  ok(Boolean(guardado), "el producto quedo guardado");
  ok(guardado?.price === 40, "el precio quedo como 40 centavos, no como 0", String(guardado?.price));
  ok(guardado?.cost === 28, "el costo quedo como 28 centavos", String(guardado?.cost));

  console.log("\n3. Se muestra como lo escribio");
  await page.reload({ waitUntil: "networkidle" });
  const texto = await page.textContent("body");
  ok(/0[.,]40/.test(texto), "en pantalla dice 0,40 y no 40");
  ok(!/\$\s?40[.,]00/.test(texto), "y no dice 40,00, que seria cien veces mas");

  console.log("\n4. Al editarlo vuelve a verse 0.40, no 40");
  const filas = page.locator("details");
  if ((await filas.count()) > 0) {
    await filas.first().click();
    await page.waitForTimeout(700);
    const valor = await page.locator('input[name="price"]').last().inputValue();
    ok(valor === "0.40", "el campo de edicion trae 0.40", valor);
  } else {
    ok(false, "no se encontro la ficha para editar");
  }

  console.log("\n5. Un negocio en pesos sigue igual que siempre");
  await db.user.update({ where: { id: cuenta.id }, data: { currency: "COP" } });
  await page.goto(BASE + "/panel/catalogo", { waitUntil: "networkidle" });
  const pasoCop = await page.locator('input[name="price"]').first().getAttribute("step");
  ok(pasoCop === "1", "en pesos el campo sigue siendo de unidades enteras", String(pasoCop));

  console.log("\n6. Sumar centavos no arrastra error");
  await db.user.update({ where: { id: cuenta.id }, data: { currency: "USD" } });
  const hoy = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < 3; i += 1) {
    await db.expense.create({
      data: { userId: cuenta.id, description: "Prueba " + i, amount: 10, day: hoy },
    });
  }
  const suma = await db.expense.aggregate({
    where: { userId: cuenta.id },
    _sum: { amount: true },
  });
  ok(suma._sum.amount === 30, "tres gastos de $0.10 suman exactamente $0.30", String(suma._sum.amount));
} finally {
  await browser.close();
  await db.expense.deleteMany({ where: { userId: cuenta.id } });
  await db.service.deleteMany({ where: { userId: cuenta.id } });
  await db.user.delete({ where: { id: cuenta.id } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
