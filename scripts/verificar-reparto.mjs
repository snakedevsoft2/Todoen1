/**
 * Comprueba Reparto de Chopo Snacks (ver src/lib/reparto.ts y REPARTO.md):
 *
 *   - solo la administradora (Juliana Intriago) lo ve: ni el dueño si es otro,
 *     ni los vendedores, ni otro negocio;
 *   - el Excel de octubre importado (con el comando, desde el seed JSON) da en
 *     pantalla lo mismo que el Excel;
 *   - reabrir una planilla cerrada deja anotado el motivo y recalcula en vivo;
 *   - una planilla nueva: carga "105+55", credito, cobro de un pendiente,
 *     gasto, entrega, guardar y cerrar;
 *   - cartera, reportes y su exportacion a Excel;
 *   - con REPARTO_XLSX y PROVEEDORES_XLSX (rutas a los .xlsx), la importacion
 *     desde la pantalla de ambos libros.
 *
 * Antes: npm run db:up y npm run dev. Despues: npm run verificar:reparto
 * Crea cuentas desechables y las borra al final. Solo contra la base local.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
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
const CLAVE = bcrypt.hashSync("demo1234", 10);
const chopo = await db.user.create({
  data: {
    email: "reparto-" + S + "@test.local",
    passwordHash: CLAVE,
    ownerName: "Luis Andrimba",
    businessName: "Chopo Snacks",
    businessType: "OTRO",
    slug: "reparto-" + S,
    currency: "USD",
    timezone: "America/Guayaquil",
    staff: {
      create: [
        { name: "LUIS ANDRIMBA", role: "DUENO" },
        { name: "Juliana Intriago", role: "VENDEDOR", username: "juliana.rp" + S },
        { name: "Javier", role: "VENDEDOR", username: "javier.rp" + S },
        { name: "Henry", role: "VENDEDOR", username: "henry.rp" + S },
        { name: "Jimmy", role: "VENDEDOR", username: "jimmy.rp" + S },
      ],
    },
  },
  include: { staff: true },
});
const persona = (n) => chopo.staff.find((s) => s.name === n);

const browser = await chromium.launch({ channel: "msedge" });
async function entrar(usuario) {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, acceptDownloads: true });
  await page.addInitScript(() => localStorage.setItem("todoen1_onboarding_seen", "true"));
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', usuario);
  if (usuario.includes("@")) await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel/, { timeout: 30000 });
  return page;
}
const dinero = (t) => Number(String(t).replace(/[^\d,-]/g, "").replace(",", "."));

try {
  console.log("\n0. Importar el Excel de octubre con el comando (seed JSON)");
  const salida = execFileSync("npx", ["tsx", "scripts/importar-reparto.ts", "--cuenta", chopo.email, "--aplicar"], { encoding: "utf8", shell: true });
  ok(/\{"crear":43\}/.test(salida) && /Listo\./.test(salida), "43 planillas importadas", salida.split("\n").find((l) => l.startsWith("Planillas")));
  const segunda = execFileSync("npx", ["tsx", "scripts/importar-reparto.ts", "--cuenta", chopo.email, "--aplicar"], { encoding: "utf8", shell: true });
  ok(/\{"ya-estaba":43\}/.test(segunda), "la segunda vez no duplica nada");
  ok((await db.repartoLinea.count({ where: { userId: chopo.id } })) === 1053, "1.053 líneas de producto");

  console.log("\n1. Solo Juliana lo ve");
  for (const [usuario, quien] of [[chopo.email, "el dueño"], ["javier.rp" + S, "un vendedor"]]) {
    const p = await entrar(usuario);
    await p.goto(BASE + "/panel", { waitUntil: "networkidle" });
    ok((await p.locator('a[href="/panel/reparto"]').count()) === 0, quien + ": no sale en el menú");
    const r = await p.goto(BASE + "/panel/reparto", { waitUntil: "networkidle" });
    ok(r.status() === 404, quien + ": la dirección no abre", String(r.status()));
    const x = await p.request.get(BASE + "/panel/reparto/exportar?tipo=cartera");
    ok(x.status() === 404, quien + ": tampoco baja el Excel", String(x.status()));
    await p.close();
  }
  const page = await entrar("juliana.rp" + S);
  await page.goto(BASE + "/panel", { waitUntil: "networkidle" });
  ok((await page.locator('a[href="/panel/reparto"]').count()) > 0, "Juliana lo tiene en el menú");

  console.log("\n2. Las planillas de octubre, como en el Excel");
  await page.goto(BASE + "/panel/reparto?mes=2026-10", { waitUntil: "networkidle" });
  const filas = page.locator("[data-lista-planillas] tbody tr");
  ok((await filas.count()) === 43, "43 planillas en la lista", String(await filas.count()));
  const pie = await page.locator("[data-lista-planillas] tfoot").innerText();
  ok(pie.includes("16.789,00") || pie.includes("16789,00"), "ventas del mes 16.789,00 (5.258,45 + 5.234,75 + 6.295,80)", pie.replace(/\s+/g, " "));
  if (DIR) await page.screenshot({ path: DIR + "/reparto-lista.png", fullPage: true });

  console.log("\n3. JAVIER 05-oct: cuadra con el Excel, se reabre y se corrige");
  const pl01 = await db.repartoPlanilla.findFirst({ where: { userId: chopo.id, origenRef: "JAVIER#2026-10-05" } });
  await page.goto(BASE + "/panel/reparto/" + pl01.id, { waitUntil: "networkidle" });
  const cuadre = page.locator("[data-cuadre]");
  ok((await cuadre.innerText()).includes("345,10"), "ventas 345,10");
  ok((await cuadre.locator("[data-semaforo]").getAttribute("data-semaforo")) === "faltante" && (await cuadre.locator("[data-diferencia]").innerText()).includes("1,25"), "faltan 1,25");
  ok(await page.locator('input[aria-label="Carga PAPA GRANDE NAT"]').isDisabled(), "cerrada: no se puede escribir");
  await page.locator('input[name="motivo"]').first().fill("Prueba: corregir devolución");
  await page.getByRole("button", { name: "Reabrir" }).click();
  await page.waitForTimeout(2000);
  await page.reload({ waitUntil: "networkidle" });
  ok(!(await page.locator('input[aria-label="Carga PAPA GRANDE NAT"]').isDisabled()), "reabierta: ya se puede corregir");
  ok((await page.locator("[data-auditoria]").innerText()).includes("Prueba: corregir devolución"), "el motivo queda en el historial");
  await page.locator('input[aria-label="Devolución PAPA GRANDE NAT"]').fill("75");
  ok((await page.locator("[data-total-general]").innerText()).includes("345,90"), "el total se recalcula al escribir (+0,80)");
  await page.locator("[data-guardar-planilla]").click();
  await page.getByText("Planilla guardada.").waitFor({ timeout: 15000 });
  const linea = await db.repartoLinea.findFirst({ where: { planillaId: pl01.id, producto: { code: "P001" } } });
  ok(linea?.devolucion === 75, "quedó guardada la devolución");
  const creditoIntacto = await db.repartoCobro.count({ where: { planillaId: pl01.id, creditoId: { not: null } } });
  ok(creditoIntacto >= 1, "el cobro de MARIANA AYALA sigue aplicado a su documento");

  console.log("\n4. Una planilla nueva, de punta a punta");
  await page.goto(BASE + "/panel/reparto", { waitUntil: "networkidle" });
  const abrir = page.locator("[data-abrir-planilla]");
  await abrir.locator('select[name="staffId"]').selectOption(persona("Henry").id);
  await abrir.locator('input[name="day"]').fill("2026-10-31");
  await abrir.getByRole("button", { name: "Abrir planilla" }).click();
  await page.waitForURL(/\/panel\/reparto\/c/, { timeout: 20000 });
  await page.waitForLoadState("networkidle");
  await page.locator('input[aria-label="Carga CHIFLE SAL LARGO MEDIANO"]').fill("40+39");
  await page.locator('input[aria-label="Devolución CHIFLE SAL LARGO MEDIANO"]').fill("30");
  ok((await page.locator('tr[data-producto="P010"]').innerText()).includes("19,60"), "79 − 30 = 49 × 0,40 = 19,60");
  await page.locator('section[data-seccion="creditos"]').getByRole("button", { name: "Crédito" }).click();
  await page.locator('input[aria-label="Cliente del crédito 1"]').fill("CLIENTE DE PRUEBA");
  await page.locator('input[aria-label="Valor del crédito 1"]').fill("5");
  const pendientes = page.locator("[data-pendientes]");
  if (!(await pendientes.evaluate((d) => d.open))) await pendientes.locator("summary").click();
  await pendientes.getByPlaceholder(/Buscar cliente/).fill("MARIANA AYALA");
  await pendientes.getByRole("button", { name: "Cobrar" }).first().click();
  await page.locator('input[aria-label="Valor del cobro 1"]').fill("10");
  await page.locator('section[data-seccion="pagos"]').getByRole("button", { name: "Gasto" }).click();
  await page.locator('input[aria-label="Concepto del gasto 1"]').fill("ALMUERZO");
  await page.locator('input[aria-label="Valor del gasto 1"]').fill("2.50");
  ok((await page.locator('select[aria-label="Categoría"]').first().inputValue()) === "almuerzo", "el gasto se clasifica solo");
  await page.locator("[data-entregado]").fill("20+2.10");
  // 19,60 − 5 (crédito) + 10 (cobro) − 2,50 (almuerzo) = 22,10: cuadra.
  ok((await page.locator("[data-semaforo]").first().getAttribute("data-semaforo")) === "cuadra", "con 20+2.10 entregado, cuadra");
  if (DIR) await page.screenshot({ path: DIR + "/reparto-planilla.png", fullPage: true });
  await page.locator("[data-guardar-planilla]").click();
  const guardo = await page.getByText("Planilla guardada.").waitFor({ timeout: 15000 }).then(() => true, () => false);
  if (!guardo) {
    const dice = await page.locator("[data-planilla-reparto] p.rounded-lg, [data-confirmar]").allInnerTexts();
    throw new Error("No guardó la planilla nueva: " + dice.join(" | "));
  }
  const nueva = await db.repartoPlanilla.findFirst({
    where: { userId: chopo.id, day: "2026-10-31", staffId: persona("Henry").id },
    include: { lineas: true, creditos: true, cobros: true, pagos: true },
  });
  ok(nueva?.lineas[0]?.carga === 79 && nueva.lineas[0].cargaDetalle === "40+39", "la carga se guarda con su detalle (40+39)");
  ok(nueva?.creditos[0]?.valor === 500 && nueva.cobros[0]?.valor === 1000 && nueva.cobros[0]?.creditoId, "crédito y cobro guardados, el cobro aplicado a su documento");
  ok(nueva?.pagos[0]?.categoria === "almuerzo" && nueva.entregado === 2210 && nueva.entregadoDetalle === "20+2.10", "gasto y entrega con su detalle");
  const estado = page.locator('section[data-seccion="estado"]');
  await page.getByRole("button", { name: "Cerrar planilla" }).click();
  const cerro = await page.getByText("Planilla cerrada.").waitFor({ timeout: 15000 }).then(() => true, () => false);
  if (!cerro) console.log("      dice: " + (await estado.innerText()).replace(/\s+/g, " "));
  // Sin recargar: cada mensaje es el de lo ultimo que se pidio.
  await estado.locator('input[name="motivo"]').first().fill("Prueba: mensaje de reabrir");
  await estado.getByRole("button", { name: "Reabrir" }).click();
  const reabrio = await estado.getByText("Planilla reabierta.").waitFor({ timeout: 15000 }).then(() => true, () => false);
  ok(reabrio, "al reabrir dice «Planilla reabierta.», no el mensaje de antes", (await estado.innerText()).replace(/\s+/g, " "));
  await page.getByRole("button", { name: "Cerrar planilla" }).click();
  await page.getByText("Planilla cerrada.").waitFor({ timeout: 15000 });
  await page.reload({ waitUntil: "networkidle" });
  ok(/cerrada/i.test(await page.locator("[data-estado-planilla]").innerText()), "se cierra");
  ok(await page.locator('input[aria-label="Carga CHIFLE SAL LARGO MEDIANO"]').isDisabled(), "cerrada, ya no se puede escribir");

  // Una planilla de octubre con un credito que se cobro en otro dia: anularla
  // dejaria ese cobro sin documento.
  const cobrados = await db.repartoCobro.findMany({
    where: { userId: chopo.id, credito: { planillaId: { not: null } } },
    select: { planillaId: true, credito: { select: { planillaId: true } } },
  });
  const conCobroAjeno = cobrados.find((c) => c.credito.planillaId !== c.planillaId)?.credito.planillaId;
  if (conCobroAjeno) {
    await page.goto(BASE + "/panel/reparto/" + conCobroAjeno, { waitUntil: "networkidle" });
    const anular = page.locator('section[data-seccion="estado"] details');
    await anular.locator("summary").click();
    await anular.locator('input[name="motivo"]').fill("Prueba: anular");
    await anular.getByRole("button", { name: "Anular" }).click();
    const bloqueo = await page.getByText(/No se puede anular: el crédito/).waitFor({ timeout: 15000 }).then(() => true, () => false);
    const sigue = await db.repartoPlanilla.findUnique({ where: { id: conCobroAjeno }, select: { estado: true } });
    ok(bloqueo && sigue?.estado !== "ANULADA", "no deja anular una planilla cuyo crédito ya se cobró en otra");
  } else ok(false, "hay una planilla con un crédito cobrado en otro día");

  console.log("\n5. Cartera calculada");
  await page.goto(BASE + "/panel/reparto/cartera", { waitUntil: "networkidle" });
  const cartera = await page.locator("[data-cartera-clientes]").innerText();
  ok(cartera.includes("CLIENTE DE PRUEBA"), "el crédito nuevo ya está en la cartera");
  ok((await page.locator("[data-tramos]").innerText()).includes("Más de 60"), "con su antigüedad");
  const xls = await page.request.get(BASE + "/panel/reparto/exportar?tipo=cartera");
  ok(xls.status() === 200 && (xls.headers()["content-type"] ?? "").includes("spreadsheet"), "la cartera baja en Excel");

  console.log("\n6. Reportes de octubre");
  await page.goto(BASE + "/panel/reparto/reportes?desde=2026-10-01&hasta=2026-10-30", { waitUntil: "networkidle" });
  const consolidado = await page.locator("[data-consolidado]").innerText();
  for (const [n, ventas] of [["Javier", "5.259,25"], ["Henry", "5.234,75"], ["Jimmy", "6.295,80"]]) {
    ok(consolidado.includes(n) && consolidado.includes(ventas), n + ": ventas " + ventas);
  }
  ok(consolidado.includes("Consolidado general"), "con el consolidado general");
  const exp = await page.request.get(BASE + "/panel/reparto/exportar?tipo=consolidado&desde=2026-10-01&hasta=2026-10-30");
  ok(exp.status() === 200 && Number(exp.headers()["content-length"] ?? (await exp.body()).length) > 1000, "el consolidado baja en Excel");
  if (DIR) await page.screenshot({ path: DIR + "/reparto-reportes.png", fullPage: true });

  if (process.env.REPARTO_XLSX) {
    console.log("\n7. Importar el Excel de reparto desde la pantalla");
    await page.goto(BASE + "/panel/reparto/importar", { waitUntil: "networkidle" });
    await page.locator('input[type="file"]').setInputFiles(process.env.REPARTO_XLSX);
    await page.locator("[data-revisar]").click();
    await page.locator("[data-reporte]").waitFor({ timeout: 60000 });
    const rep = await page.locator("[data-reporte]").innerText();
    ok(rep.includes("ya importadas 43") || rep.includes("ya importadas 42"), "dice que ya estaba importado", rep.split("\n").find((l) => l.startsWith("Planillas")));
  }

  if (process.env.PROVEEDORES_XLSX) {
    console.log("\n8. Importar el Excel de proveedores en Cuentas por pagar");
    await page.goto(BASE + "/panel/por-pagar", { waitUntil: "networkidle" });
    const imp = page.locator("[data-importar-excel]");
    await imp.locator("summary").click();
    await imp.locator('input[type="file"]').setInputFiles(process.env.PROVEEDORES_XLSX);
    await imp.getByRole("button", { name: /Revisar/ }).click();
    await imp.locator("[data-importar-proveedores]").waitFor({ timeout: 60000 });
    await imp.locator("[data-importar-proveedores]").click();
    await imp.getByText("Importado.").waitFor({ timeout: 60000 });
    const n = await db.payableSupplier.count({ where: { userId: chopo.id } });
    const monita = await db.payableBill.count({ where: { userId: chopo.id, supplier: { name: "LA MONITA" } } });
    ok(n === 18 && monita === 5, "18 proveedores, LA MONITA con sus 5 compras", n + " / " + monita);
    await imp.getByRole("button", { name: /Revisar/ }).click();
    await imp.getByText("Todo ya estaba importado.").waitFor({ timeout: 60000 });
    ok(true, "la segunda vez no duplica nada");
    await page.reload({ waitUntil: "networkidle" });
    const lista = await page.locator("[data-lista-por-pagar]").innerText();
    ok(lista.includes("LA MONITA") && lista.includes("807,63"), "LA MONITA debe 807,63, como en el Excel");
    if (DIR) await page.screenshot({ path: DIR + "/por-pagar-importado.png", fullPage: true });
  }
} finally {
  await browser.close();
  await db.user.delete({ where: { id: chopo.id } }).catch((e) => console.log("No se borró la cuenta: " + e.message));
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
