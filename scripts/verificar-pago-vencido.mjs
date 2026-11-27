/**
 * Comprueba en un navegador la ventana fija de cuando el mes venció y no se ha pagado.
 *
 * Lo que se prueba:
 *   - Con el mes vencido, el dueño y el empleado ven la ventana en cada
 *     pantalla del panel, sin menú debajo y sin forma de cerrarla.
 *   - Al dueño se le pide pagar (con el WhatsApp); al empleado, que le avise.
 *   - Cuando se registra el pago, la ventana se quita sola, sin recargar.
 *   - Una cuenta por vencer solo ve la franja de siempre, sin ventana.
 *   - Desde la ventana se puede cerrar sesión.
 *
 * Antes: docker start ten-pg y npm run dev (o npm run build && npm start).
 * Después: npm run verificar:pago-vencido
 */
import "dotenv/config";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const db = new PrismaClient();
let fallos = 0;
const ok = (c, t, extra = "") => {
  if (c) console.log("  OK   " + t);
  else {
    fallos++;
    console.log("  MAL  " + t + (extra ? "  <- " + extra : ""));
  }
};
const DIA = 86_400_000;
const S = "vencido-" + Date.now();
const clave = bcrypt.hashSync("demo1234", 10);
const listo = { onboardingDoneAt: new Date(), tourDoneAt: new Date() };
const usuarioEmpleado = "cajera" + Date.now().toString(36);

const vencida = await db.user.create({
  data: {
    email: "vencida-" + S + "@test.local",
    passwordHash: clave,
    ownerName: "Dueña",
    businessName: "Tienda " + S,
    businessType: "OTRO",
    slug: "tienda-" + S,
    paidUntil: new Date(Date.now() - DIA),
    staff: {
      create: [
        { name: "Dueña", role: "DUENO", ...listo },
        { name: "Cajera", role: "VENDEDOR", username: usuarioEmpleado, ...listo },
      ],
    },
  },
});
const porVencer = await db.user.create({
  data: {
    email: "porvencer-" + S + "@test.local",
    passwordHash: clave,
    ownerName: "Dueño",
    businessName: "Barbería " + S,
    businessType: "OTRO",
    slug: "barberia-" + S,
    paidUntil: new Date(Date.now() + 3 * DIA),
    staff: { create: { name: "Dueño", role: "DUENO", ...listo } },
  },
});

const errores = [];
const browser = await chromium.launch({ channel: "msedge" });

async function nuevaPagina() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => localStorage.setItem("todoen1_onboarding_seen", "true"));
  const page = await ctx.newPage();
  page.on("response", (r) => r.status() >= 500 && errores.push(r.status() + " " + r.url()));
  return page;
}

async function entrar(page, usuario, contrasena) {
  await page.goto(BASE + "/login", { waitUntil: "load" });
  await page.fill('input[name="email"]', usuario);
  if (contrasena) await page.fill('input[name="password"]', contrasena);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel/, { timeout: 60000 });
  await page.waitForLoadState("load");
}

const ventana = (page, quien) => page.locator('[data-pago-vencido="' + quien + '"]');
const conMenu = async (page) => (await page.locator('a[href="/panel/ventas"], a[href="/panel/catalogo"]').count()) > 0;

try {
  console.log("\n1. El dueño con el mes vencido");
  const dueno = await nuevaPagina();
  await entrar(dueno, vencida.email, "demo1234");
  ok(await ventana(dueno, "dueno").isVisible(), "ve la ventana de pago al entrar");
  ok(!(await conMenu(dueno)), "debajo no queda el menú del panel");
  const pagar = dueno.getByRole("link", { name: "Pagar por WhatsApp" });
  ok((await pagar.getAttribute("href"))?.startsWith("https://wa.me/"), "tiene el botón para pagar por WhatsApp");
  ok((await dueno.locator("[data-pago-vencido] button, [data-pago-vencido] a").count()) === 2, "solo tiene pagar y cerrar sesión");
  await dueno.keyboard.press("Escape");
  await dueno.mouse.click(10, 10);
  ok(await ventana(dueno, "dueno").isVisible(), "no se cierra con Escape ni tocando afuera");
  await dueno.screenshot({ path: process.env.CAPTURA_DUENO ?? "pago-vencido-dueno.png" });
  await dueno.goto(BASE + "/panel/ventas", { waitUntil: "load" });
  ok(await ventana(dueno, "dueno").isVisible(), "sigue en otra pantalla del panel");

  console.log("\n2. El empleado de esa cuenta");
  const empleado = await nuevaPagina();
  await entrar(empleado, usuarioEmpleado);
  ok(await ventana(empleado, "empleado").isVisible(), "también ve la ventana");
  ok((await empleado.getByText("El propietario debe realizar el pago").count()) === 1, "se le dice que el propietario debe pagar");
  ok((await empleado.getByRole("link", { name: "Pagar por WhatsApp" }).count()) === 0, "no le sale el botón de pagar");
  ok(!(await conMenu(empleado)), "debajo no queda el menú del panel");
  await empleado.screenshot({ path: process.env.CAPTURA_EMPLEADO ?? "pago-vencido-empleado.png" });

  console.log("\n3. Se registra el pago");
  await db.user.update({ where: { id: vencida.id }, data: { paidUntil: new Date(Date.now() + 30 * DIA) } });
  await dueno.waitForSelector("[data-pago-vencido]", { state: "detached", timeout: 90000 }).catch(() => undefined);
  ok((await ventana(dueno, "dueno").count()) === 0, "al dueño se le quita sola, sin recargar");
  await empleado.waitForSelector("[data-pago-vencido]", { state: "detached", timeout: 90000 }).catch(() => undefined);
  ok((await ventana(empleado, "empleado").count()) === 0, "al empleado se le quita sola, sin recargar");
  ok(await conMenu(dueno), "el dueño vuelve a tener el panel");

  console.log("\n4. Una cuenta por vencer");
  const otro = await nuevaPagina();
  await entrar(otro, porVencer.email, "demo1234");
  ok((await otro.locator("[data-pago-vencido]").count()) === 0, "no ve la ventana");
  ok((await otro.locator('[data-aviso-pago="por-vencer"]').count()) === 1, "ve la franja de por vencer");

  console.log("\n5. Cerrar sesión desde la ventana");
  await db.user.update({ where: { id: vencida.id }, data: { paidUntil: new Date(Date.now() - DIA) } });
  await dueno.goto(BASE + "/panel", { waitUntil: "load" });
  await ventana(dueno, "dueno").getByRole("button", { name: "Cerrar sesión" }).click();
  await dueno.waitForURL(/\/(login|portada|$)/, { timeout: 30000 }).catch(() => undefined);
  await dueno.goto(BASE + "/panel", { waitUntil: "load" });
  ok(!dueno.url().includes("/panel"), "la sesión queda cerrada", dueno.url());

  ok(errores.length === 0, "sin errores del servidor", errores.join(", "));
} finally {
  await browser.close();
  await db.user.deleteMany({ where: { slug: { contains: S } } });
  await db.$disconnect();
}

console.log(fallos ? "\n" + fallos + " fallaron" : "\nTodo bien");
process.exit(fallos ? 1 : 0);
