/**
 * Comprueba Cuentas por pagar de Chopo Snacks (ver src/lib/por-pagar.ts):
 *
 *   - solo Juliana Intriago lo ve: ni el dueño, ni otro empleado, ni una
 *     Juliana Intriago de otro negocio (ni en el menu ni escribiendo la direccion);
 *   - agregar proveedores, anotar compras con descuento, IVA y precio de venta,
 *     pagarlas por abonos, corregirlas y borrarlas;
 *   - el precio de la ultima compra se pone solo;
 *   - la lista de a quien se le debe.
 *
 * Antes de correrlo:
 *   1. npm run db:up
 *   2. npm run dev   (o npm run build && npm start)
 *
 * Y despues:  npm run verificar:por-pagar
 *
 * Crea cuentas desechables y las borra al final. Usar solo contra la base local.
 */
import "dotenv/config";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const BASE = "http://localhost:3000";
const RUTA = "/panel/por-pagar";
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

const S = Date.now();
const CLAVE = bcrypt.hashSync("demo1234", 10);

const chopo = await db.user.create({
  data: {
    email: "chopo-pp-" + S + "@test.local",
    passwordHash: CLAVE,
    ownerName: "Luis Andrimba",
    businessName: "Chopo Snacks",
    businessType: "OTRO",
    slug: "chopo-pp-" + S,
    currency: "USD",
    timezone: "America/Guayaquil",
    staff: {
      create: [
        { name: "LUIS ANDRIMBA", role: "DUENO" },
        { name: "Juliana Intriago", role: "VENDEDOR", username: "juliana.pp" + S, passwordHash: CLAVE },
        { name: "Javier", role: "VENDEDOR", username: "javier.pp" + S, passwordHash: CLAVE },
      ],
    },
  },
});
const otro = await db.user.create({
  data: {
    email: "otro-pp-" + S + "@test.local",
    passwordHash: CLAVE,
    ownerName: "Juliana Intriago",
    businessName: "Tienda Prueba",
    businessType: "OTRO",
    slug: "otro-pp-" + S,
    currency: "USD",
    staff: { create: [{ name: "Juliana Intriago", role: "DUENO" }] },
  },
});

const browser = await chromium.launch({ channel: "msedge" });

async function entrar(usuario) {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
  await page.addInitScript(() => localStorage.setItem("todoen1_onboarding_seen", "true"));
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', usuario);
  // El empleado entra con su usuario, sin contraseña (ver LoginForm).
  if (usuario.includes("@")) await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel/, { timeout: 30000 });
  return page;
}

/** Quien no es Juliana: sin enlace en el menu y sin pantalla aunque escriba la direccion. */
async function noLoVe(usuario, quien) {
  const page = await entrar(usuario);
  await page.goto(BASE + "/panel", { waitUntil: "networkidle" });
  for (const ruta of [RUTA, "/panel/mejores-clientes"]) {
    ok((await page.locator('a[href="' + ruta + '"]').count()) === 0, quien + ": " + ruta + " no sale en el menú");
    const r = await page.goto(BASE + ruta, { waitUntil: "networkidle" });
    ok(r.status() === 404 && (await page.locator("[data-botones-proveedores], [data-nuevo-proveedor], [data-ranking-clientes]").count()) === 0, quien + ": " + ruta + " no abre", String(r.status()));
  }
  await page.close();
}

async function ultimaCompra(nombre) {
  return db.payableBill.findFirst({
    where: { userId: chopo.id, supplier: { name: nombre } },
    orderBy: { createdAt: "desc" },
    include: { items: { orderBy: { position: "asc" } }, payments: true },
  });
}

/** Llena un renglon del formulario de compra (n empieza en 0). */
async function renglon(form, n, datos) {
  const fila = form.locator("[data-renglon]").nth(n);
  await fila.getByPlaceholder("Descripción").fill(datos.desc);
  for (const [etiqueta, valor] of Object.entries(datos.campos)) {
    await fila.getByLabel(etiqueta, { exact: true }).fill(valor);
  }
}

try {
  console.log("\n1. Solo Juliana lo ve");
  await noLoVe(chopo.email, "el dueño");
  await noLoVe("javier.pp" + S, "otro empleado");
  await noLoVe(otro.email, "una Juliana Intriago de otro negocio");

  const page = await entrar("juliana.pp" + S);
  await page.goto(BASE + "/panel", { waitUntil: "networkidle" });
  ok((await page.locator('a[href="' + RUTA + '"]').count()) > 0, "Juliana lo tiene en el menú");
  await page.goto(BASE + RUTA, { waitUntil: "networkidle" });
  ok(await page.getByText("Todavía no hay proveedores").isVisible(), "abre vacío, listo para empezar");

  console.log("\n2. Agregar proveedores");
  const nuevo = page.locator("[data-nuevo-proveedor]");
  for (const nombre of ["IMDAKA", "MARCSEAL"]) {
    // Con el primer proveedor el formulario se pliega: ya sale su boton.
    if (!(await nuevo.evaluate((d) => d.open))) await nuevo.locator("summary").click();
    await nuevo.locator('input[name="name"]').fill(nombre);
    await nuevo.getByRole("button", { name: "Agregar proveedor" }).click();
    await page.locator("[data-botones-proveedores] a", { hasText: nombre }).waitFor({ timeout: 10000 });
  }
  ok((await db.payableSupplier.count({ where: { userId: chopo.id } })) === 2, "quedaron los dos");
  ok((await page.locator("[data-botones-proveedores] a").count()) === 2, "con su botón cada uno");

  console.log("\n3. Compra con precio de venta, como en la hoja de IMDAKA");
  await page.locator("[data-botones-proveedores] a", { hasText: "IMDAKA" }).click();
  await page.waitForURL(/\?p=/);
  await page.locator("[data-nueva-compra]").click();
  let form = page.locator("[data-formulario-compra]");
  await form.getByLabel("Con precio de venta (ganancia)").check();
  await renglon(form, 0, { desc: "DIENTES", campos: { Cantidad: "10", "Precio uni.": "1,7", "Precio venta": "2" } });
  await renglon(form, 1, { desc: "GUSANOS", campos: { Cantidad: "10", "Precio uni.": "1.7", "Precio venta": "2" } });
  ok((await form.locator("[data-total-compra]").innerText()).includes("34,00"), "el total se ve mientras se escribe");
  if (DIR) await page.screenshot({ path: DIR + "/por-pagar-formulario.png" });
  await form.getByRole("button", { name: "Guardar compra" }).click();
  await form.waitFor({ state: "detached", timeout: 10000 });
  let compra = await ultimaCompra("IMDAKA");
  ok(compra?.items.length === 2 && Number(compra.items[0].unitPrice) === 1.7 && Number(compra.items[0].salePrice) === 2, "se guardaron los renglones con su precio de venta");
  const hoja = page.locator("[data-hoja-proveedor]");
  await hoja.waitFor();
  ok((await hoja.locator("[data-estado]").first().innerText()).includes("PENDIENTE"), "queda PENDIENTE");
  ok((await hoja.innerText()).includes("GANANCIA"), "con las columnas de venta y ganancia");

  console.log("\n4. Pagar por abonos");
  await hoja.locator("[data-pagar-compra]").first().click();
  let pago = page.locator("[data-form-pago]");
  await pago.locator('input[name="amount"]').fill("10");
  await pago.getByRole("button", { name: "Anotar pago" }).click();
  await page.getByText("Abono anotado.").waitFor({ timeout: 10000 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  ok((await hoja.locator("[data-estado]").first().innerText()).includes("Falta 24"), "dice cuánto falta");
  await hoja.locator("[data-pagar-compra]").first().click();
  pago = page.locator("[data-form-pago]");
  ok((await pago.locator('input[name="amount"]').inputValue()) === "24", "el monto arranca con lo que falta");
  await pago.getByRole("button", { name: "Anotar pago" }).click();
  await page.getByText("Compra pagada por completo.").waitFor({ timeout: 10000 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  ok((await hoja.locator("[data-estado]").first().innerText()).includes("CANCELADO"), "con todo pagado queda CANCELADO");

  console.log("\n5. Corregir la compra");
  await hoja.getByRole("button", { name: "Corregir compra" }).first().click();
  form = page.locator("[data-formulario-compra]");
  await form.locator("[data-renglon]").nth(0).getByLabel("Cantidad", { exact: true }).fill("20");
  await form.getByRole("button", { name: "Guardar cambios" }).click();
  await form.waitFor({ state: "detached", timeout: 10000 });
  compra = await ultimaCompra("IMDAKA");
  ok(Number(compra.items[0].qty) === 20 && compra.payments.length === 2, "cambió la cantidad y los pagos siguen");
  const debe = await hoja.locator("[data-estado]", { hasText: "Falta 17" }).first().waitFor({ timeout: 8000 }).then(() => true, () => false);
  ok(debe, "vuelve a quedar debiendo lo que subió");

  console.log("\n6. Compra con descuento e IVA, ya pagada (hoja de MARCSEAL)");
  await page.locator("[data-botones-proveedores] a", { hasText: "MARCSEAL" }).click();
  await page.waitForURL(/\?p=/);
  await page.waitForLoadState("networkidle");
  await page.locator("[data-nueva-compra]").click();
  form = page.locator("[data-formulario-compra]");
  await form.getByLabel("Con descuento").check();
  await form.locator("[data-con-iva]").check();
  await renglon(form, 0, { desc: "SALSA DE TOMATE", campos: { Cantidad: "2", "Precio uni.": "14,06", Descuento: "10,74" } });
  await renglon(form, 1, { desc: "ADEREZO MAYONESA", campos: { Cantidad: "2", "Precio uni.": "17,18", Descuento: "8,85" } });
  await renglon(form, 2, { desc: "SALSA AMARILLA", campos: { Cantidad: "1", "Precio uni.": "21,09", Descuento: "6,31" } });
  await form.locator("[data-ya-pagada]").check();
  ok((await form.locator("[data-total-compra]").innerText()).includes("66,32"), "57,67 + 15 % de IVA = 66,32, como en la hoja");
  await form.getByRole("button", { name: "Guardar compra" }).click();
  await form.waitFor({ state: "detached", timeout: 10000 });
  compra = await ultimaCompra("MARCSEAL");
  ok(Number(compra.taxPct) === 15 && compra.payments.length === 1 && Math.abs(Number(compra.payments[0].amount) - 66.3205) < 0.001, "guardó el IVA y el pago completo", String(compra?.payments[0]?.amount));
  ok((await page.locator("[data-hoja-proveedor] [data-estado]").first().innerText()).includes("CANCELADO"), "queda CANCELADO");
  if (DIR) await page.screenshot({ path: DIR + "/por-pagar-hoja.png", fullPage: true });

  console.log("\n7. El precio de la última vez se pone solo");
  await page.locator("[data-nueva-compra]").click();
  form = page.locator("[data-formulario-compra]");
  ok(await form.locator("[data-con-iva]").isChecked(), "arranca con el IVA de la última compra");
  await form.locator("[data-renglon]").nth(0).getByPlaceholder("Descripción").fill("salsa amarilla");
  ok((await form.locator("[data-renglon]").nth(0).getByLabel("Precio uni.", { exact: true }).inputValue()) === "21,09", "puso 21,09");
  await page.keyboard.press("Escape");

  console.log("\n8. A quién se le debe");
  await page.getByRole("link", { name: "Por pagar", exact: true }).click();
  await page.waitForLoadState("networkidle");
  const lista = await page.locator("[data-lista-por-pagar]").innerText();
  ok(lista.includes("IMDAKA") && !lista.includes("MARCSEAL"), "sale IMDAKA, que debe, y no MARCSEAL, que está al día");
  ok(/17,00/.test(lista), "con lo que se le debe");
  if (DIR) await page.screenshot({ path: DIR + "/por-pagar-lista.png" });

  console.log("\n9. Borrar una compra y un proveedor");
  await page.locator("[data-botones-proveedores] a", { hasText: "IMDAKA" }).click();
  await page.waitForURL(/\?p=/);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Borrar compra" }).first().click();
  await page.getByRole("button", { name: /Sí, borrar/ }).click();
  await page.waitForTimeout(1500);
  ok((await db.payableBill.count({ where: { userId: chopo.id, supplier: { name: "IMDAKA" } } })) === 0, "la compra se borró");
  ok((await db.payablePayment.count({ where: { userId: chopo.id } })) === 1, "y sus pagos con ella");
  await page.getByRole("button", { name: "Borrar proveedor" }).click();
  await page.getByRole("button", { name: /Sí, borrar/ }).click();
  await page.waitForTimeout(1500);
  ok((await db.payableSupplier.count({ where: { userId: chopo.id, name: "IMDAKA" } })) === 0, "el proveedor se borró");

  console.log("\n10. Mejores clientes: cuánto compra cada uno");
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" }).format(new Date());
  const venta = (clientName, total, origin = "MANUAL") =>
    db.sale.create({
      data: { userId: chopo.id, day: hoy, total, paymentMethod: "EFECTIVO", origin, clientName, items: { create: [{ userId: chopo.id, name: "Mixto", unitPrice: total, qty: 1 }] } },
    });
  await venta("Rosa Vizcaíno", 1200);
  await venta("ROSA VIZCAINO", 800);
  await venta("Rosa Vizcaino", 999, "CARTERA"); // un abono: no es otra compra
  await venta(null, 5000); // mostrador
  await venta("Viveres Carlitos", 300);
  await db.debt.create({ data: { userId: chopo.id, clientName: "Viveres Carlitos", concept: "4x Papa natural grande", amount: 240, day: hoy } });
  await page.goto(BASE + "/panel/mejores-clientes", { waitUntil: "networkidle" });
  ok((await page.locator('a[href="/panel/mejores-clientes"]').count()) > 0, "Juliana lo tiene en el menú");
  const filas = await page.locator("[data-ranking-clientes] > li").allInnerTexts();
  ok(filas.length === 2, "dos clientes: el mostrador no cuenta", String(filas.length));
  ok(/ROSA VIZCAINO|Rosa Vizca/i.test(filas[0]) && filas[0].includes("2 compras") && filas[0].includes("20,00"), "Rosa primero: 2 compras por 20,00, sin contar el abono", filas[0]?.replace(/\n/g, " "));
  ok(filas[1]?.includes("Viveres Carlitos") && filas[1].includes("5,40"), "Carlitos: venta + fiado = 5,40", filas[1]?.replace(/\n/g, " "));
  if (DIR) await page.screenshot({ path: DIR + "/mejores-clientes.png" });
} finally {
  await browser.close();
  for (const c of [chopo, otro]) {
    await db.user.delete({ where: { id: c.id } }).catch((e) => console.log("No se borró " + c.email + ": " + e.message));
  }
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
