/**
 * Comprueba que los recibos se puedan imprimir de verdad.
 *
 * No se puede tocar una impresora desde una prueba, asi que lo que se
 * comprueba es todo lo que si depende de nosotros: que el boton este, que deje
 * elegir el tamano, que recuerde el elegido, y sobre todo que el PDF que se le
 * manda al sistema sea del ancho correcto. Un PDF de 58mm de ancho es lo que
 * hace que la termica saque la tirilla bien; si eso se rompe, el recibo sale
 * recortado y nadie se entera hasta que lo imprime.
 *
 * Antes de correrlo:
 *   1. npm run db:up
 *   2. npm run build && npm start
 *
 * Y despues:  npm run verificar:impresion
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

const S = "imp-" + Date.now();
const CORREO = "cobra-" + S + "@test.local";
const hoy = new Date().toISOString().slice(0, 10);

const cuenta = await db.user.create({
  data: {
    // Con pago: sin senal solo la usa la cuenta que pago.
    paidUntil: new Date(Date.now() + 30 * 86_400_000),
    email: CORREO,
    passwordHash: bcrypt.hashSync("demo1234", 10),
    ownerName: "Prestamista",
    businessName: "Creditos " + S,
    businessType: "CARTERA",
    slug: "creditos-" + S,
    phone: "300 000 0000",
    address: "Calle 10 #4-20",
    staff: { create: { name: "Prestamista", role: "DUENO" } },
  },
});

// Una deuda con un abono, que es lo que genera el comprobante.
const deuda = await db.debt.create({
  data: {
    userId: cuenta.id,
    clientName: "Juan Perez",
    clientPhone: "3001112233",
    concept: "Prestamo",
    amount: 600000,
    principal: 500000,
    interestPct: 20,
    installments: 20,
    frequency: "DIARIA",
    day: hoy,
    guarantorName: "Rosa Medina",
    guarantorId: "43.123.456",
    guarantorPhone: "3009998877",
    guarantorAddress: "Carrera 8 #12-30",
  },
});
await db.debtPayment.create({
  data: { userId: cuenta.id, debtId: deuda.id, amount: 30000, day: hoy, method: "EFECTIVO" },
});

const browser = await chromium.launch({ channel: "msedge" });

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();

  await page.addInitScript(() => {
    // El dialogo de impresion bloquearia la prueba: se atrapa lo que iba a
    // salir en papel, con el tamano de pagina que se le pidio.
    window.__impresiones = [];
    window.print = () => {
      window.__impresiones.push({
        html: document.getElementById("ten-impresion")?.innerHTML ?? "",
        estilo: document.getElementById("ten-impresion-estilo")?.textContent ?? "",
      });
      window.dispatchEvent(new Event("afterprint"));
    };
    window.open = () => null;

    // Una termica Bluetooth de mentira que guarda los bytes que le llegan.
    window.__bt = [];
    const caracteristica = {
      properties: { write: false, writeWithoutResponse: true },
      writeValue: async () => {},
      writeValueWithoutResponse: async (v) => {
        for (const b of new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) window.__bt.push(b);
      },
    };
    const termica = {
      name: "Termica prueba",
      gatt: {
        connected: false,
        async connect() {
          this.connected = true;
          return { getPrimaryServices: async () => [{ getCharacteristics: async () => [caracteristica] }] };
        },
      },
    };
    Object.defineProperty(navigator, "bluetooth", {
      configurable: true,
      value: { requestDevice: async () => termica },
    });
  });

  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', CORREO);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel|\/bienvenida/, { timeout: 25000 });

  console.log("\n1. El oficio de cobranza trae sus apartados");
  await page.goto(BASE + "/panel/cartera", { waitUntil: "networkidle" });
  const menu = await page.textContent("body");
  ok(/Cuentas por cobrar/i.test(menu), "el apartado se llama Cuentas por cobrar");
  ok(/Cobradores/i.test(menu), "se puede agregar usuarios: Cobradores esta en el menu");
  ok(/Qui[eé]n me presta/i.test(menu), "Quien me presta esta en el menu");

  console.log("\n2. Se pueden agregar usuarios (cobradores)");
  await page.goto(BASE + "/panel/equipo", { waitUntil: "networkidle" });
  ok(!page.url().includes("/bienvenida"), "la pantalla de Cobradores abre", page.url());
  const equipo = await page.textContent("body");
  ok(/[Cc]obrador/.test(equipo), "habla de cobradores y no de barberos");

  console.log("\n3. El boton de imprimir en el comprobante de abono");
  await page.goto(BASE + "/panel/cartera/" + deuda.id, { waitUntil: "networkidle" });
  const imprimir = page.getByRole("button", { name: "Imprimir" }).first();
  ok(await imprimir.isVisible(), "el boton Imprimir esta en la ficha");

  const porCorreo = page.getByRole("button", { name: /Por correo/i }).first();
  ok(await porCorreo.isVisible(), "el comprobante ya se puede mandar por correo");

  console.log("\n4. Deja elegir el tamano");
  await page.getByRole("button", { name: "Elegir tamano de impresion" }).first().click();
  await page.waitForTimeout(400);
  const menuImp = await page.textContent("body");
  ok(/Tirilla 58 mm/.test(menuImp), "ofrece tirilla de 58mm");
  ok(/Tirilla 80 mm/.test(menuImp), "ofrece tirilla de 80mm");
  ok(/Hoja carta/.test(menuImp), "ofrece hoja normal");
  if (DIR) await page.screenshot({ path: DIR + "/imprimir-menu.png" });

  console.log("\n5. Imprime sin internet, del ancho de la tirilla");
  await ctx.setOffline(true);
  await page.getByRole("button", { name: /Tirilla 58 mm/ }).click();
  await page.waitForTimeout(1500);

  const imps = await page.evaluate(() => window.__impresiones ?? []);
  ok(imps.length === 1, "abrio el dialogo de impresion sin senal", String(imps.length));
  const tir = imps[imps.length - 1] ?? { html: "", estilo: "" };
  ok(/COMPROBANTE DE ABONO/.test(tir.html) && /Juan Perez/.test(tir.html), "con el comprobante del abono");
  // El tamano de pagina es lo que hace que la termica saque la tirilla y no una hoja.
  const m = /size:58mm (\d+)mm/.exec(tir.estilo);
  ok(Boolean(m), "la pagina mide 58mm de ancho", tir.estilo.slice(-80));
  if (m) {
    ok(Number(m[1]) > 60, "el alto crece con el contenido, no es una hoja fija", m[1] + "mm");
    console.log("       (tirilla de 58 x " + m[1] + " mm)");
  }
  // Se limpia un momento despues de cerrar el dialogo, no al instante.
  await page.waitForTimeout(2000);
  ok(
    (await page.evaluate(() => document.getElementById("ten-impresion"))) === null,
    "despues de imprimir no queda nada pegado en la pantalla"
  );
  await ctx.setOffline(false);

  console.log("\n6. Se acuerda del tamano que uso");
  const guardado = await page.evaluate(() => localStorage.getItem("ten_formato_impresion"));
  ok(guardado === "58", "queda guardado en este equipo", String(guardado));
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Elegir tamano de impresion" }).first().click();
  await page.waitForTimeout(300);
  ok(
    /la que usas/.test(await page.textContent("body")),
    "y se lo muestra marcado la proxima vez"
  );

  console.log("\n7. La hoja carta / A4 usa el papel de la impresora");
  await page.getByRole("button", { name: /Hoja carta/ }).click();
  await page.waitForTimeout(1500);
  const hoja = (await page.evaluate(() => window.__impresiones ?? [])).at(-1) ?? { html: "", estilo: "" };
  ok(/ti-a4/.test(hoja.html), "sale el recibo en formato de hoja");
  ok(/@page\{margin:12mm\}/.test(hoja.estilo) && !/@page\{size/.test(hoja.estilo), "sin forzar tamano: carta o A4, la que tenga");

  console.log("\n8. Directo a una termica Bluetooth, sin driver");
  await page.getByRole("button", { name: "Elegir tamano de impresion" }).first().click();
  await page.waitForTimeout(300);
  ok(await page.getByRole("button", { name: /Térmica por Bluetooth/ }).isVisible(), "ofrece la termica por Bluetooth");
  if (DIR) await page.screenshot({ path: DIR + "/imprimir-conexiones.png" });
  await page.getByRole("button", { name: /Térmica por Bluetooth/ }).click();
  await page.waitForTimeout(2500);
  const bytes = await page.evaluate(() => window.__bt ?? []);
  ok(bytes[0] === 0x1b && bytes[1] === 0x40, "le llegan comandos ESC/POS", bytes.slice(0, 4).join(","));
  const texto = String.fromCharCode(...bytes);
  ok(/ABONA/.test(texto) && /Juan Perez/.test(texto), "con el comprobante escrito");
  ok(/Enviado a la impresora/.test(await page.textContent("body")), "y avisa que se envio");
  ok(
    (await page.evaluate(() => localStorage.getItem("ten_conexion_impresion"))) === "bluetooth",
    "queda como la forma de imprimir de este equipo"
  );

  console.log("\n9. En el celular el menú de imprimir se ve completo");
  const ctxCel = await browser.newContext({ storageState: await ctx.storageState(), viewport: { width: 390, height: 844 } });
  const cel = await ctxCel.newPage();
  await cel.goto(BASE + "/panel/cartera/" + deuda.id, { waitUntil: "networkidle" });
  await cel.getByRole("button", { name: "Elegir tamano de impresion" }).first().click();
  const menuCel = cel.locator("[data-menu-imprimir]");
  await menuCel.waitFor({ timeout: 5000 });
  const caja = await menuCel.boundingBox();
  ok(Boolean(caja) && caja.x >= 0 && caja.x + caja.width <= 390 && caja.y >= 0 && caja.y + caja.height <= 844, "el menú queda dentro de la pantalla", JSON.stringify(caja));
  ok(await cel.getByRole("button", { name: /Tirilla 58 mm/ }).isVisible(), "y se ven las opciones");
  if (DIR) await cel.screenshot({ path: DIR + "/imprimir-celular.png" });
  await menuCel.getByRole("button", { name: "Cerrar" }).click();
  ok((await cel.locator("[data-menu-imprimir]").count()) === 0, "y se cierra");
  await ctxCel.close();

  await ctx.close();
} finally {
  await browser.close();
  await db.debtPayment.deleteMany({ where: { userId: cuenta.id } });
  await db.debt.deleteMany({ where: { userId: cuenta.id } });
  await db.user.delete({ where: { id: cuenta.id } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
