/**
 * Comprueba lo que pidio Chopo Snacks para su cuenta, y que ningun otro
 * negocio lo reciba:
 *
 *   - la hora de cada venta y fiado, al lado de la fecha y en la factura;
 *   - "Vista previa" de la factura dentro de la pantalla (Ventas y Cuentas por cobrar);
 *   - "Agregar más" escogiendo del inventario, en ventas y en fiados;
 *   - el orden de Ventas arrastrando, guardado para todos los telefonos;
 *   - ocultar un producto soltandolo en la papelera, y deshacerlo;
 *   - buscar y filtrar por vendedor en Cuentas por cobrar.
 *
 * Antes de correrlo:
 *   1. npm run db:up
 *   2. npm run dev   (o npm run build && npm start)
 *
 * Y despues:  npm run verificar:chopo
 *
 * Crea dos cuentas desechables (una "Chopo Snacks" y otra cualquiera) y las
 * borra al final. Toca la base de datos: usar solo contra la base local.
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

const S = Date.now();
const ZONA = "America/Guayaquil";
const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());
const HORA = /\d{2}\/\d{2}\/\d{4} · \d{1,2}:\d{2} (am|pm)/;

/** Una cuenta con productos, una venta, un fiado desde Ventas y una deuda de otra persona. */
async function crearCuenta(nombre, correo) {
  const cuenta = await db.user.create({
    data: {
      email: correo,
      passwordHash: bcrypt.hashSync("demo1234", 10),
      ownerName: "Dueña",
      businessName: nombre,
      businessType: "OTRO",
      slug: "prueba-" + correo.split("@")[0],
      currency: "USD",
      timezone: ZONA,
      staff: { create: [{ name: "Dueña", role: "DUENO" }, { name: "Juliana", role: "VENDEDOR" }] },
    },
    include: { staff: true },
  });
  const duena = cuenta.staff.find((s) => s.role === "DUENO");
  const juliana = cuenta.staff.find((s) => s.role === "VENDEDOR");
  const productos = {};
  for (const [name, price] of [
    ["Papa natural grande", 60],
    ["Papa natural mediana", 40],
    ["Dulce grande", 60],
    ["Mixto", 50],
  ]) {
    productos[name] = await db.service.create({ data: { userId: cuenta.id, name, price, category: "SNACKS" } });
  }
  const venta = await db.sale.create({
    data: {
      userId: cuenta.id,
      day: hoy,
      total: 120,
      staffId: duena.id,
      paymentMethod: "EFECTIVO",
      origin: "MANUAL",
      items: {
        create: [{ userId: cuenta.id, serviceId: productos["Papa natural grande"].id, name: "Papa natural grande", unitPrice: 60, qty: 2 }],
      },
    },
  });
  const fiado = await db.debt.create({
    data: {
      userId: cuenta.id,
      clientName: "Rosa Vizcaino",
      concept: "3x Papa natural mediana",
      amount: 120,
      day: hoy,
      staffId: juliana.id,
      clientKey: "k-" + correo,
    },
  });
  await db.debt.create({
    data: { userId: cuenta.id, clientName: "Viveres Carlitos", concept: "3x Dulce grande", amount: 180, day: hoy, staffId: duena.id },
  });
  return { cuenta, productos, venta, fiado };
}

/** Entra con el tamaño de un celular, sin la presentacion del primer ingreso (ver OnboardingGate). */
async function entrar(browser, correo) {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
  await page.addInitScript(() => localStorage.setItem("todoen1_onboarding_seen", "true"));
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', correo);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel/, { timeout: 30000 });
  return page;
}

/** Arrastra con el mouse: el sensor arranca despues de 8 pixeles. */
async function arrastrar(page, desde, hasta) {
  await desde.scrollIntoViewIfNeeded();
  const a = await desde.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 12, { steps: 4 });
  await page.waitForTimeout(250);
  const b = typeof hasta === "function" ? await hasta() : await hasta.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 15 });
  await page.waitForTimeout(300);
  await page.mouse.up();
  await page.waitForTimeout(400);
}

const grilla = (page, nombre) =>
  page.locator('button:has(span.break-words)').filter({ hasText: new RegExp("^" + nombre + "US\\$") }).first();

const chopo = await crearCuenta("Chopo Snacks", "chopo-" + S + "@test.local");
const otro = await crearCuenta("Tienda Prueba", "otro-" + S + "@test.local");
const browser = await chromium.launch({ channel: "msedge" });

try {
  const page = await entrar(browser, chopo.cuenta.email);
  await page.goto(BASE + "/panel/ventas", { waitUntil: "networkidle" });

  console.log("\n1. La hora sale al lado de la fecha");
  const ventaLi = page.locator("li").filter({ hasText: "2x Papa natural grande" }).first();
  const fiadoLi = page.locator("li").filter({ hasText: "Rosa Vizcaino" }).first();
  ok(HORA.test(await ventaLi.innerText()), "en la venta");
  ok(HORA.test(await fiadoLi.innerText()), "en el fiado");
  ok((await ventaLi.locator("input[name=day]").count()) === 1 && (await ventaLi.locator("input[name*=hora]").count()) === 0, "Editar no deja tocar la hora");

  console.log("\n2. Vista previa de la factura, dentro de la pantalla");
  await ventaLi.getByRole("button", { name: "Vista previa" }).click();
  const vista = page.locator("[data-vista-factura]");
  await vista.waitFor({ timeout: 5000 });
  const textoVista = await vista.innerText();
  ok(/TOTAL/.test(textoVista) && /Papa natural grande/.test(textoVista), "muestra el recibo con sus productos");
  ok(/ · \d{1,2}:\d{2} (am|pm)/.test(textoVista), "la factura lleva la hora");
  if (DIR) await page.screenshot({ path: DIR + "/chopo-vista-previa.png" });
  ok((await vista.getByRole("button", { name: "Imprimir" }).count()) > 0, "se puede imprimir desde ahi");
  await vista.getByRole("button", { name: "Cerrar", exact: true }).click();
  ok(!(await vista.isVisible()), "se cierra");

  await fiadoLi.getByRole("button", { name: "Vista previa" }).click();
  await vista.waitFor({ timeout: 5000 });
  ok(/Rosa Vizcaino/.test(await vista.innerText()), "el fiado tambien tiene vista previa");
  await page.keyboard.press("Escape");

  console.log("\n3. Agregar más a la venta, escogiendo del inventario");
  await ventaLi.getByText("Agregar más a esta venta").click();
  const agregarVenta = ventaLi.locator("[data-agregar-inventario]");
  await agregarVenta.getByRole("button", { name: /^Mixto/ }).click();
  await agregarVenta.getByRole("button", { name: /^Mixto/ }).click();
  await agregarVenta.getByRole("button", { name: /a la venta$/ }).click();
  await page.waitForTimeout(2500);
  const venta = await db.sale.findUnique({ where: { id: chopo.venta.id }, include: { items: true } });
  ok(venta.total === 220, "el total subio 2 x 0,50", String(venta.total));
  ok(venta.items.some((i) => i.name === "Mixto" && i.qty === 2 && i.unitPrice === 50), "quedo el renglon con el precio del catalogo");

  console.log("\n4. Agregar más a un fiado");
  await page.reload({ waitUntil: "networkidle" });
  const fiadoLi2 = page.locator("li").filter({ hasText: "Rosa Vizcaino" }).first();
  await fiadoLi2.getByText("Agregar más a este fiado").click();
  const agregarFiado = fiadoLi2.locator("[data-agregar-inventario]");
  await agregarFiado.getByRole("button", { name: /^Dulce grande/ }).click();
  await agregarFiado.getByPlaceholder("Otro (no está en inventario)").fill("Tortilla");
  await agregarFiado.getByPlaceholder("Precio").fill("0.25");
  await agregarFiado.getByRole("button", { name: "Agregar otro" }).click();
  await agregarFiado.getByRole("button", { name: /al fiado$/ }).click();
  await page.waitForTimeout(2500);
  const fiado = await db.debt.findUnique({ where: { id: chopo.fiado.id } });
  ok(fiado.amount === 205, "el fiado subio 0,60 + 0,25", String(fiado.amount));
  ok(fiado.concept === "3x Papa natural mediana, 1x Dulce grande, 1x Tortilla", "el concepto lleva lo agregado", fiado.concept);

  console.log("\n5. El orden arrastrando queda para todos los telefonos");
  await page.reload({ waitUntil: "networkidle" });
  await arrastrar(page, grilla(page, "Mixto"), grilla(page, "Papa natural grande"));
  await page.waitForTimeout(1500);
  const mixto = await db.service.findUnique({ where: { id: chopo.productos["Mixto"].id } });
  ok(mixto.ventaPos === 0, "Mixto quedo de primero en el servidor", String(mixto.ventaPos));
  const otroTelefono = await entrar(browser, chopo.cuenta.email);
  await otroTelefono.goto(BASE + "/panel/ventas", { waitUntil: "networkidle" });
  const primero = await otroTelefono.locator('button:has(span.break-words)').first().innerText();
  ok(primero.startsWith("Mixto"), "en otro telefono tambien sale de primero", primero.split("\n")[0]);
  await otroTelefono.close();

  console.log("\n6. Ocultar soltando en la papelera, y deshacer");
  const dulce = grilla(page, "Dulce grande");
  await arrastrar(page, dulce, async () => {
    const p = page.locator("[data-papelera]");
    await p.waitFor({ timeout: 3000 });
    if (DIR) await page.screenshot({ path: DIR + "/chopo-papelera.png" });
    return p.boundingBox();
  });
  const confirmar = page.locator("[data-confirmar-ocultar]");
  ok(await confirmar.isVisible(), "pregunta antes de ocultar");
  await confirmar.getByRole("button", { name: "Ocultar" }).click();
  await page.waitForTimeout(2000);
  let d = await db.service.findUnique({ where: { id: chopo.productos["Dulce grande"].id } });
  ok(d.active === false, "quedo pausado, no borrado");
  ok((await grilla(page, "Dulce grande").count()) === 0, "ya no sale en Ventas");
  await page.locator("[data-oculto-reciente]").getByRole("button", { name: "Deshacer" }).click();
  await page.waitForTimeout(2000);
  d = await db.service.findUnique({ where: { id: chopo.productos["Dulce grande"].id } });
  ok(d.active === true, "Deshacer lo vuelve a mostrar");

  console.log("\n7. Cuentas por cobrar: buscar, filtrar por vendedor, hora y vista previa");
  await page.goto(BASE + "/panel/cartera", { waitUntil: "networkidle" });
  const buscador = page.locator("[data-buscar-cartera]");
  ok(await buscador.isVisible(), "tiene buscador");
  ok(HORA.test((await page.locator("li.card").first().innerText()).replace("Debe desde el ", "")), "la deuda lleva la hora");
  await buscador.locator("input[name=q]").fill("carlitos");
  await buscador.getByRole("button", { name: "Buscar" }).click();
  await page.waitForLoadState("networkidle");
  let lista = await page.locator("li.card").allInnerTexts();
  ok(lista.length === 1 && lista[0].includes("Viveres Carlitos"), "buscar por nombre deja solo esa", String(lista.length));
  await page.goto(BASE + "/panel/cartera", { waitUntil: "networkidle" });
  const juliana = chopo.cuenta.staff.find((s) => s.role === "VENDEDOR");
  await page.locator("[data-buscar-cartera] select[name=v]").selectOption(juliana.id);
  await page.locator("[data-buscar-cartera]").getByRole("button", { name: "Buscar" }).click();
  await page.waitForLoadState("networkidle");
  lista = await page.locator("li.card").allInnerTexts();
  ok(lista.length === 1 && lista[0].includes("Rosa Vizcaino"), "filtrar por vendedor deja solo lo de Juliana", String(lista.length));
  const todas = await page.getByRole("link", { name: "Todas" }).getAttribute("href");
  ok(todas.includes("f=todas") && todas.includes("v=" + juliana.id), "cambiar de filtro no pierde el vendedor", todas);
  await page.locator("li.card").first().getByRole("button", { name: "Vista previa" }).click();
  await page.locator("[data-vista-factura]").waitFor({ timeout: 5000 });
  ok(true, "la vista previa abre en Cuentas por cobrar");
  if (DIR) await page.screenshot({ path: DIR + "/chopo-cartera.png" });

  console.log("\n8. Otro negocio sigue igual que siempre");
  const p2 = await entrar(browser, otro.cuenta.email);
  await p2.goto(BASE + "/panel/ventas", { waitUntil: "networkidle" });
  const texto2 = await p2.locator("body").innerText();
  ok(!HORA.test(texto2), "sin hora en la lista");
  ok((await p2.getByRole("button", { name: "Vista previa" }).count()) === 0, "sin vista previa");
  ok((await p2.locator("[data-agregar-inventario]").count()) === 0, "con el Agregar más de siempre");
  await p2.goto(BASE + "/panel/cartera", { waitUntil: "networkidle" });
  ok((await p2.locator("[data-buscar-cartera]").count()) === 0, "sin buscador en Cartera");
} finally {
  await browser.close();
  for (const c of [chopo, otro]) {
    await db.user.delete({ where: { id: c.cuenta.id } }).catch((e) => console.log("No se borro " + c.cuenta.email + ": " + e.message));
  }
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
