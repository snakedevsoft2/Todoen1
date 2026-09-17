/**
 * Comprueba en un navegador las mesas del restaurante con pedido por QR.
 *
 * Lo que se prueba:
 *   - El dueño dice cuántas mesas tiene y aparece el piso, una mesa por mesa.
 *   - El QR de una mesa abre el menú público; un cliente pide desde ahí sin
 *     sesión y le llega la confirmación.
 *   - Esa mesa se ve resaltada como "Pedido nuevo" en el panel, con el total
 *     y los items ya cargados.
 *   - Al abrir la cuenta se ve el aviso de que vino por QR y se apaga solo.
 *   - Cancelar la cuenta de una mesa la deja libre otra vez.
 *   - Un negocio que no es de restaurante no ve el piso de mesas.
 *
 * Antes:   npm run build && npm start
 * Después: node scripts/verificar-mesas.mjs
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

const S = "mesas-" + Date.now();
const cuenta = await db.user.create({
  data: {
    email: "duena-" + S + "@test.local",
    passwordHash: bcrypt.hashSync("demo1234", 10),
    ownerName: "Dueña",
    businessName: "Restaurante " + S,
    businessType: "RESTAURANTE",
    slug: "resto-" + S,
    staff: { create: { name: "Dueña", role: "DUENO", onboardingDoneAt: new Date(), tourDoneAt: new Date() } },
    services: {
      create: [
        { name: "Bandeja paisa", price: 28000, category: "Platos" },
        { name: "Jugo de mora", price: 6000, category: "Bebidas" },
      ],
    },
  },
});

const otraCuenta = await db.user.create({
  data: {
    email: "otra-" + S + "@test.local",
    passwordHash: bcrypt.hashSync("demo1234", 10),
    ownerName: "Otro",
    businessName: "Tienda " + S,
    businessType: "OTRO",
    slug: "tienda-" + S,
    staff: { create: { name: "Dueño", role: "DUENO", onboardingDoneAt: new Date(), tourDoneAt: new Date() } },
  },
});

const errores = [];
const vigilar = (page) => page.on("response", (r) => r.status() >= 500 && r.status() !== 503 && errores.push(r.status() + " " + r.url()));

const browser = await chromium.launch({ channel: "msedge" });
try {
  console.log("\n1. La dueña configura sus mesas");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const duena = await ctx.newPage();
  vigilar(duena);
  duena.on("dialog", (d) => d.accept());
  await duena.goto(BASE + "/login", { waitUntil: "load" });
  await duena.fill('input[name="email"]', cuenta.email);
  await duena.fill('input[name="password"]', "demo1234");
  await duena.click('button[type="submit"]');
  await duena.waitForURL(/\/panel/, { timeout: 25000 });
  await duena.goto(BASE + "/panel/cuentas", { waitUntil: "load" });
  ok((await duena.getByRole("heading", { name: "Pedido de mesa" }).count()) === 1, "aparece la tarjeta de mesas");

  await duena.fill('input[name="cantidad"]', "3");
  await duena.getByRole("button", { name: "Guardar" }).click();
  ok(Boolean(await esperarHasta(async () => (await db.table.count({ where: { userId: cuenta.id, active: true } })) === 3)), "quedan 3 mesas");
  await duena.waitForLoadState("load");
  ok((await duena.locator('[data-mesa="1"]').count()) === 1, "se ve el piso con la mesa 1");
  ok((await duena.locator('[data-mesa="3"]').count()) === 1, "y la mesa 3");
  ok((await duena.locator('[data-mesa="1"] svg').count()) >= 1, "cada mesa trae su dibujo");

  const mesa2 = await db.table.findFirst({ where: { userId: cuenta.id, number: 2 } });

  console.log("\n2. Un cliente pide desde el QR de la mesa 2, sin sesión");
  const ctxCliente = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const cliente = await ctxCliente.newPage();
  vigilar(cliente);
  await cliente.goto(BASE + "/mesa/" + mesa2.qrToken, { waitUntil: "load" });
  ok((await cliente.getByText("Mesa 2").count()) > 0, "la página dice de qué mesa es");
  ok((await cliente.getByText("Bandeja paisa").count()) === 1, "se ve el menú del negocio");

  await cliente.getByRole("button", { name: "Agregar Bandeja paisa" }).click();
  await cliente.getByRole("button", { name: "Agregar Bandeja paisa" }).click();
  await cliente.getByRole("button", { name: "Agregar Jugo de mora" }).click();
  await cliente.fill('input[placeholder*="Nota para la cocina"]', "sin arroz");
  await cliente.getByRole("button", { name: "Enviar pedido" }).click();
  ok(Boolean(await esperarHasta(() => cliente.locator("[data-aviso-pedido]").getByText(/enviado/i).count())), "confirma que el pedido se envió");

  const orden = await esperarHasta(() => db.order.findFirst({ where: { tableId: mesa2.id, status: "ABIERTA" } }));
  ok(Boolean(orden), "la cuenta de la mesa 2 quedó abierta");
  ok(orden?.hasNewFromCustomer === true, "marcada como pedido nuevo");
  ok(orden?.notes === "sin arroz", "con la nota del cliente");

  console.log("\n3. En el panel, la mesa 2 se ve resaltada");
  await duena.reload({ waitUntil: "load" });
  const mesaDosEnPiso = duena.locator('[data-mesa="2"]');
  ok((await mesaDosEnPiso.getAttribute("data-estado-mesa")) === "nueva", "la mesa 2 queda marcada como nueva");
  ok((await mesaDosEnPiso.getByText("Pedido nuevo").count()) === 1, "con el aviso de pedido nuevo");
  ok((await mesaDosEnPiso.getByText("62.000").count()) === 1, "y ya con el total de lo pedido", await mesaDosEnPiso.innerText());

  console.log("\n4. Al abrir la cuenta, avisa que vino por QR y se apaga solo");
  await mesaDosEnPiso.locator("button").first().click();
  await duena.waitForURL(/\/panel\/cuentas\//, { timeout: 15000 });
  ok((await duena.locator("[data-pedido-nuevo]").count()) === 1, "muestra el aviso de que llegó por QR");
  ok((await duena.getByText("62.000").count()) >= 1, "con el total de lo que pidió el cliente ya cargado");
  ok((await duena.getByText("3 items en la cuenta").count()) === 1, "y los items que pidió");
  await duena.reload({ waitUntil: "load" });
  ok((await duena.locator("[data-pedido-nuevo]").count()) === 0, "y al volver a entrar ya no sale (quedó visto)");

  console.log("\n5. La mesa no aparece entre domicilios, y se cancela desde su propia cuenta");
  await duena.goto(BASE + "/panel/cuentas", { waitUntil: "load" });
  const listaDomicilios = duena.locator("section", { has: duena.getByRole("heading", { name: "En curso" }) });
  ok((await listaDomicilios.getByText("Mesa 2", { exact: true }).count()) === 0, "Mesa 2 no está en la lista de domicilios y otras cuentas");
  await duena.goto(BASE + "/panel/cuentas/" + orden.id, { waitUntil: "load" });
  await duena.getByRole("button", { name: "Cancelar esta cuenta" }).click();
  ok(
    Boolean(await esperarHasta(async () => (await db.order.findUnique({ where: { id: orden.id } }))?.status === "CANCELADA")),
    "la cuenta queda cancelada"
  );
  ok(Boolean(await esperarHasta(() => duena.getByText("Esta cuenta esta cancelada").count())), "y la pantalla lo muestra");
  await duena.goto(BASE + "/panel/cuentas", { waitUntil: "load" });
  ok((await duena.locator('[data-mesa="2"]').getAttribute("data-estado-mesa")) === "libre", "y la mesa vuelve a quedar libre");

  console.log("\n6. Un negocio que no es de restaurante no ve el piso de mesas");
  const ctxOtro = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const otro = await ctxOtro.newPage();
  vigilar(otro);
  await otro.goto(BASE + "/login", { waitUntil: "load" });
  await otro.fill('input[name="email"]', otraCuenta.email);
  await otro.fill('input[name="password"]', "demo1234");
  await otro.click('button[type="submit"]');
  await otro.waitForURL(/\/panel/, { timeout: 25000 });
  await otro.goto(BASE + "/panel/cuentas", { waitUntil: "load" });
  ok((await otro.getByRole("heading", { name: "Pedido de mesa" }).count()) === 0, "sin la tarjeta de mesas");

  console.log("\n7. Una mesa que ya no existe avisa en vez de reventar");
  const res = await cliente.goto(BASE + "/mesa/token-que-no-existe", { waitUntil: "load" });
  ok(res.status() === 404, "responde que no la encuentra", String(res.status()));

  console.log("\n8. Errores durante el recorrido");
  ok(errores.length === 0, "ningún error 500", errores.slice(0, 5).join(" | "));
} finally {
  await browser.close();
  await db.user.deleteMany({ where: { id: { in: [cuenta.id, otraCuenta.id] } } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
