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

  // Se atrapan los PDF que se mandan a imprimir para poder medirlos.
  await page.addInitScript(() => {
    window.__pdfs = [];
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (obj) => {
      if (obj instanceof Blob && obj.type === "application/pdf") {
        const lector = new FileReader();
        lector.onload = () => window.__pdfs.push(String(lector.result));
        lector.readAsBinaryString(obj);
      }
      return orig(obj);
    };
    // El dialogo de impresion bloquearia la prueba.
    window.__printCalls = 0;
    const abrir = window.open;
    window.open = () => null;
    void abrir;
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
  ok(/Quien me presta/i.test(menu), "Quien me presta esta en el menu");

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

  console.log("\n5. El PDF sale del ancho correcto");
  await page.getByRole("button", { name: /Tirilla 58 mm/ }).click();
  await page.waitForTimeout(3500);

  const pdfs = await page.evaluate(() => window.__pdfs ?? []);
  ok(pdfs.length > 0, "se genero un PDF para imprimir", "ninguno");

  if (pdfs.length > 0) {
    // El MediaBox del PDF dice el tamano real de la hoja, en puntos.
    const m = /MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/.exec(pdfs[pdfs.length - 1]);
    ok(Boolean(m), "el PDF declara su tamano de hoja");
    if (m) {
      const anchoMm = (Number(m[1]) / 72) * 25.4;
      const altoMm = (Number(m[2]) / 72) * 25.4;
      ok(
        Math.abs(anchoMm - 58) < 1,
        "el ancho es de 58mm, que es lo que hace que la termica saque la tirilla",
        anchoMm.toFixed(1) + "mm"
      );
      ok(altoMm > 60, "el alto crece con el contenido, no es una hoja fija", altoMm.toFixed(1) + "mm");
      console.log("       (tirilla de " + anchoMm.toFixed(1) + " x " + altoMm.toFixed(1) + " mm)");
    }
  }

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

  console.log("\n7. La hoja A4 sigue saliendo del tamano de siempre");
  await page.getByRole("button", { name: /Hoja carta/ }).click();
  await page.waitForTimeout(4000);
  const pdfs2 = await page.evaluate(() => window.__pdfs ?? []);
  const m2 = /MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/.exec(pdfs2[pdfs2.length - 1]);
  if (m2) {
    const anchoMm = (Number(m2[1]) / 72) * 25.4;
    ok(Math.abs(anchoMm - 210) < 2, "el A4 mide 210mm de ancho", anchoMm.toFixed(1) + "mm");
  } else {
    ok(false, "el A4 declara su tamano");
  }

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
