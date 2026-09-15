/**
 * Comprueba en un navegador el selector de clientes de Ventas: una lista
 * desplegable propia (no el datalist nativo, que en iPhone ni aparece) para
 * escoger un cliente ya guardado sin repetir el nombre y el telefono a mano.
 *
 * Lo que se prueba:
 *   - Al tocar el campo, sin escribir nada, ya aparecen los clientes guardados.
 *   - Al escribir, filtra sin importar tildes ni mayusculas.
 *   - Al escoger uno, se llenan el nombre y el telefono.
 *   - Si ya habia un telefono escrito a mano, escoger un cliente no lo borra.
 *   - Un nombre que no esta en la lista se manda igual (cliente nuevo).
 *   - Despues de guardar la venta, el selector queda vacio otra vez.
 *
 * Antes:   npm run build && npm start
 * Después: node scripts/verificar-selector-clientes.mjs
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

const S = "selcli-" + Date.now();
const cuenta = await db.user.create({
  data: {
    email: S + "@test.local",
    passwordHash: bcrypt.hashSync("demo1234", 10),
    ownerName: "Dueña",
    businessName: "Tienda " + S,
    businessType: "OTRO",
    slug: S,
    paidUntil: new Date(Date.now() + 30 * 86_400_000),
    staff: { create: { name: "Dueña", role: "DUENO", onboardingDoneAt: new Date(), tourDoneAt: new Date() } },
    services: { create: [{ name: "Camisa", price: 30000, category: "Ropa", bookable: false }] },
    customers: {
      create: [
        { name: "María José Niño", phone: "3001112233" },
        { name: "Andrés Niño", phone: "3004445566" },
      ],
    },
  },
});

const errores = [];
const browser = await chromium.launch({ channel: "msedge" });
const vigilar = (page) => page.on("response", (r) => r.status() >= 500 && r.status() !== 503 && errores.push(r.status() + " " + r.url()));

try {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  vigilar(page);
  await page.goto(BASE + "/login", { waitUntil: "load" });
  await page.fill('input[name="email"]', cuenta.email);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel/, { timeout: 25000 });
  await page.goto(BASE + "/panel/ventas", { waitUntil: "load" });

  const input = page.locator("[data-selector-cliente]");
  const lista = page.locator("[data-lista-clientes]");

  console.log("\n1. Aparece la lista al tocar, sin escribir nada");
  await input.click();
  ok(Boolean(await esperarHasta(() => lista.isVisible())), "la lista se abre sola");
  ok((await lista.locator("li").count()) === 2, "trae los 2 clientes guardados");

  console.log("\n2. Filtra sin tildes ni mayúsculas");
  await input.fill("nino");
  ok(Boolean(await esperarHasta(async () => (await lista.locator("li").count()) === 2)), "«nino» encuentra a los dos Niño");
  await input.fill("andres");
  ok(Boolean(await esperarHasta(async () => (await lista.locator("li").count()) === 1)), "«andres» deja solo a Andrés");

  console.log("\n3. Escoger uno llena el nombre y el teléfono");
  await lista.locator("button", { hasText: "Andrés Niño" }).click();
  ok((await input.inputValue()) === "Andrés Niño", "el nombre queda puesto");
  ok((await page.locator('input[name="clientPhone"]').inputValue()) === "3004445566", "y el teléfono también");

  console.log("\n4. Un teléfono ya escrito a mano no se borra al escoger otro cliente");
  await input.fill("");
  await page.locator('input[name="clientPhone"]').fill("3009998877");
  await input.fill("maria");
  await lista.locator("button", { hasText: "María José Niño" }).click();
  ok((await page.locator('input[name="clientPhone"]').inputValue()) === "3009998877", "se respeta el teléfono escrito");

  console.log("\n5. Un nombre nuevo se manda igual (cliente nuevo)");
  await input.fill("Cliente Nuevo De Paso");
  await page.keyboard.press("Escape");
  ok((await input.inputValue()) === "Cliente Nuevo De Paso", "el nombre escrito se conserva aunque no esté guardado");

  console.log("\n6. Al guardar la venta, el selector queda vacío para la próxima");
  await input.fill("");
  await page.locator('input[name="clientPhone"]').fill("");
  await page.getByRole("button", { name: /Camisa/ }).first().click();
  await page.fill('input[name="manualTotal"]', "").catch(() => {});
  await input.fill("Compradora De Prueba");
  await page.getByRole("button", { name: "Guardar venta" }).click();
  ok(Boolean(await esperarHasta(() => page.getByText("Venta registrada.").count())), "la venta se guarda");
  ok(Boolean(await esperarHasta(async () => (await input.inputValue()) === "")), "el nombre del cliente se limpia solo");

  console.log("\n7. Errores durante el recorrido");
  ok(errores.length === 0, "ningún error 500", errores.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  await db.user.deleteMany({ where: { slug: S } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
