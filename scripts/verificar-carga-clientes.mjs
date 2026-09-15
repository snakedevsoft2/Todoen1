/**
 * Comprueba en un navegador la carga de clientes desde archivos y el borrado
 * de varios.
 *
 * Lo que se prueba:
 *   - Un Excel con título arriba, nombre y apellido separados y el celular
 *     guardado como número: se leen el teléfono y el correo.
 *   - Volver a subir con datos distintos: pregunta y sobrescribe.
 *   - Subir lo mismo otra vez: dice que no hay nada nuevo.
 *   - Contactos del celular (.vcf).
 *   - Borrar un cliente marcado y luego todos.
 *
 * Antes:   npm run build && npm start
 * Después: npm run verificar:carga-clientes
 */
import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
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
const esperarHasta = async (fn, ms = 20000) => {
  const fin = Date.now() + ms;
  let v = await fn();
  while (!v && Date.now() < fin) {
    await new Promise((r) => setTimeout(r, 400));
    v = await fn();
  }
  return v;
};

const S = "cargacli-" + Date.now();
const cuenta = await db.user.create({
  data: {
    email: "carga-" + S + "@test.local",
    passwordHash: bcrypt.hashSync("demo1234", 10),
    ownerName: "Dueña",
    businessName: "Tienda " + S,
    businessType: "OTRO",
    slug: "tienda-" + S,
    staff: { create: { name: "Dueña", role: "DUENO", onboardingDoneAt: new Date(), tourDoneAt: new Date() } },
    accountModules: { create: { moduleKey: "clientes", enabled: true } },
  },
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "carga-clientes-"));
function excel(nombre, filas) {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), "Clientes");
  const ruta = path.join(dir, nombre);
  fs.writeFileSync(ruta, XLSX.write(libro, { type: "buffer", bookType: "xlsx" }));
  return ruta;
}
const primero = excel("clientes.xlsx", [
  ["Lista de clientes"],
  [],
  ["Nombres", "Apellidos", "Número de celular", "E-mail"],
  ["Ana", "Pérez", 3001234567, "ana@correo.com"],
  ["Luis", "Gómez", "310 987 6543", "mailto:luis@correo.com"],
]);
const segundo = excel("clientes-corregido.xlsx", [
  ["Nombres", "Apellidos", "Número de celular", "E-mail"],
  ["Ana", "Pérez", 3001234567, "ana.nueva@correo.com"],
  ["Luis", "Gómez", 3111111111, "luis@correo.com"],
  ["Marta", "Ruiz", 3152223344, ""],
]);
const contactos = path.join(dir, "contactos.vcf");
fs.writeFileSync(contactos, "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Pedro Paz\r\nTEL;TYPE=CELL:+57 320 555 0000\r\nEMAIL:pedro@correo.com\r\nEND:VCARD\r\n");

const errores = [];
const browser = await chromium.launch({ channel: "msedge" });
const clientesDe = () => db.customer.findMany({ where: { userId: cuenta.id }, orderBy: { name: "asc" } });

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on("response", (r) => r.status() >= 500 && r.status() !== 503 && errores.push(r.status() + " " + r.url()));
  await page.goto(BASE + "/login", { waitUntil: "load" });
  await page.fill('input[name="email"]', cuenta.email);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel/, { timeout: 25000 });
  await page.goto(BASE + "/panel/clientes", { waitUntil: "load" });
  const carga = page.locator('[data-carga-masiva="clientes"]');
  const archivo = carga.locator('input[type="file"]');

  console.log("\n1. Un Excel con título, nombre y apellido separados");
  await archivo.setInputFiles(primero);
  ok(Boolean(await esperarHasta(() => carga.getByText(/Leímos 2 clientes/).count())), "lee los 2 clientes del Excel");
  const vista = carga.locator("[data-vista-previa]");
  ok((await vista.getByText("3001234567").count()) > 0 && (await vista.getByText("ana@correo.com").count()) > 0, "la vista previa muestra el teléfono y el correo");
  ok((await vista.getByText("Ana Pérez").count()) > 0 && (await vista.getByText("luis@correo.com").count()) > 0, "une nombre y apellido y limpia el mailto");
  await carga.getByRole("button", { name: "Revisar y cargar 2 clientes" }).click();
  ok(Boolean(await esperarHasta(() => carga.getByText(/Listo: 2 nuevos, 0 actualizados/).count())), "carga los dos sin preguntar, porque son nuevos");
  let lista = await clientesDe();
  const ana = lista.find((c) => c.name === "Ana Pérez");
  const luis = lista.find((c) => c.name === "Luis Gómez");
  ok(ana?.phone === "3001234567" && ana?.email === "ana@correo.com", "Ana quedó con teléfono y correo", JSON.stringify(ana && [ana.phone, ana.email]));
  ok(luis?.phone === "310 987 6543" && luis?.email === "luis@correo.com", "Luis quedó con teléfono y correo", JSON.stringify(luis && [luis.phone, luis.email]));

  console.log("\n2. Volver a subir con datos distintos");
  await archivo.setInputFiles(segundo);
  await carga.getByRole("button", { name: "Revisar y cargar 3 clientes" }).click();
  const decision = carga.locator("[data-decision-carga]");
  ok(Boolean(await esperarHasta(() => decision.count())), "pregunta qué hacer con los que ya estaban");
  ok((await decision.getByText(/1 nuevo y 2 que ya tenías \(2 con datos distintos\)/).count()) === 1, "dice cuántos son nuevos y cuántos cambian", await decision.textContent());
  ok((await decision.getByText(/ana@correo\.com → ana\.nueva@correo\.com/).count()) === 1, "muestra qué cambia");
  await decision.getByRole("button", { name: "Sobrescribir con los datos del archivo" }).click();
  ok(Boolean(await esperarHasta(() => carga.getByText(/Listo: 1 nuevos, 2 actualizados/).count())), "sobrescribe a los dos y crea a Marta");
  lista = await clientesDe();
  ok(lista.find((c) => c.name === "Ana Pérez")?.email === "ana.nueva@correo.com", "Ana quedó con el correo nuevo");
  ok(lista.find((c) => c.name === "Luis Gómez")?.phone === "3111111111", "Luis quedó con el teléfono nuevo");
  ok(lista.length === 3, "no duplicó a nadie", String(lista.length));

  console.log("\n3. Subir lo mismo otra vez");
  await archivo.setInputFiles(segundo);
  await carga.getByRole("button", { name: "Revisar y cargar 3 clientes" }).click();
  ok(Boolean(await esperarHasta(() => decision.getByText(/No hay nada nuevo que cargar/).count())), "dice que no hay nada nuevo");
  await decision.getByRole("button", { name: "Listo" }).click();
  ok((await clientesDe()).length === 3, "y no cambia nada");

  console.log("\n4. Contactos del celular");
  await archivo.setInputFiles(contactos);
  ok(Boolean(await esperarHasta(() => carga.getByText(/Contactos del celular/).count())), "reconoce el archivo de contactos");
  await carga.getByRole("button", { name: "Revisar y cargar 1 clientes" }).click();
  ok(Boolean(await esperarHasta(() => carga.getByText(/Listo: 1 nuevos/).count())), "carga el contacto");
  const pedro = (await clientesDe()).find((c) => c.name === "Pedro Paz");
  ok(pedro?.phone === "+57 320 555 0000" && pedro?.email === "pedro@correo.com", "con su teléfono y su correo");

  console.log("\n5. Borrar uno y luego todos");
  await page.reload({ waitUntil: "load" });
  const listaClientes = page.locator("[data-lista-clientes]");
  await listaClientes.getByRole("button", { name: "Seleccionar para borrar" }).click();
  await listaClientes.getByRole("checkbox", { name: "Seleccionar Marta Ruiz" }).check();
  await listaClientes.getByRole("button", { name: "Borrar (1)" }).click();
  await listaClientes.locator("[data-confirmar-borrado]").getByRole("button", { name: "Sí, borrar" }).click();
  ok(Boolean(await esperarHasta(async () => (await db.customer.count({ where: { userId: cuenta.id } })) === 3)), "borra solo a Marta");
  ok(Boolean(await esperarHasta(() => listaClientes.getByText("Se borró 1 cliente.").count())), "avisa cuántos borró");

  await listaClientes.getByRole("button", { name: "Seleccionar para borrar" }).click();
  await listaClientes.getByText("Seleccionar todos").click();
  ok(Boolean(await esperarHasta(() => listaClientes.getByText("3 seleccionados").count())), "Seleccionar todos marca a los 3");
  await listaClientes.getByRole("button", { name: "Borrar (3)" }).click();
  await listaClientes.locator("[data-confirmar-borrado]").getByRole("button", { name: "Sí, borrar" }).click();
  ok(Boolean(await esperarHasta(async () => (await db.customer.count({ where: { userId: cuenta.id } })) === 0)), "borra a todos");
  ok(Boolean(await esperarHasta(() => page.getByText("Todavía no tienes clientes").count())), "la lista queda vacía");

  console.log("\n6. Errores durante el recorrido");
  ok(errores.length === 0, "ningún error 500", errores.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  fs.rmSync(dir, { recursive: true, force: true });
  await db.user.deleteMany({ where: { slug: { contains: S } } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
