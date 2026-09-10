/**
 * Comprueba en un navegador de verdad que el panel de la plataforma esta bien
 * cerrado.
 *
 * Lo que se prueba aqui y no en tests/ es lo que solo se puede comprobar
 * navegando: que un cliente cualquiera no alcance /admin, que apagarle un
 * apartado a una cuenta no se lo apague a las demas, y que una cuenta
 * suspendida quede por fuera de verdad.
 *
 * Antes de correrlo:
 *   1. En .env, ADMIN_EMAILS tiene que incluir barberia@demo.com
 *   2. npm run seed        (las tres cuentas de ejemplo)
 *   3. npm run build && npm start
 *
 * Y despues:  npm run verificar:admin
 *
 * Toca la base de datos: usar solo contra la base local de pruebas.
 */
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

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

const entrar = async (page, email, clave = "demo1234") => {
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', clave);
  await page.click('button[type="submit"]');
  await page.waitForURL(/[/]panel/, { timeout: 20000 }).catch(() => {});
  await page.waitForLoadState("networkidle");
  if (page.url().includes("/bienvenida")) {
    await page.getByRole("button", { name: /Saltar por ahora/i }).click();
    await page.waitForURL((u) => u.pathname === "/panel", { timeout: 15000 }).catch(() => {});
  }
};

const browser = await chromium.launch({ channel: "msedge" });

try {
  const resto = await db.user.findUniqueOrThrow({ where: { email: "restaurante@demo.com" } });
  const barb = await db.user.findUniqueOrThrow({ where: { email: "barberia@demo.com" } });

  // ---------------------------------------------------------- sin sesion
  console.log("\n== Sin haber entrado ==");
  const anon = await browser.newContext();
  const p0 = await anon.newPage();
  await p0.goto(BASE + "/admin", { waitUntil: "networkidle" });
  ok(p0.url().includes("/login"), "/admin sin sesion manda al login", p0.url());
  await p0.goto(BASE + "/admin/" + resto.id, { waitUntil: "networkidle" });
  ok(p0.url().includes("/login"), "la ficha de una cuenta tampoco se ve sin sesion", p0.url());
  await anon.close();

  // ------------------------------------------------------ usuario normal
  console.log("\n== Como un cliente cualquiera (restaurante) ==");
  const ctxCliente = await browser.newContext();
  const p1 = await ctxCliente.newPage();
  await entrar(p1, "restaurante@demo.com");

  const menuCliente = await p1.locator("aside").innerText();
  ok(
    !/Panel de la plataforma/i.test(menuCliente),
    "no se le muestra el enlace al panel de la plataforma"
  );

  await p1.goto(BASE + "/admin", { waitUntil: "networkidle" });
  ok(
    !p1.url().includes("/admin"),
    "y si escribe /admin a mano, lo devuelve a su panel",
    p1.url()
  );

  await p1.goto(BASE + "/admin/" + barb.id, { waitUntil: "networkidle" });
  ok(
    !p1.url().includes("/admin"),
    "tampoco alcanza la ficha de OTRO negocio por su id",
    p1.url()
  );

  const textoCliente = await p1.locator("body").innerText();
  ok(
    !/Barberia El Estilo/i.test(textoCliente),
    "y no se le filtro ni el nombre del otro negocio"
  );
  await ctxCliente.close();

  // ------------------------------------------------------------- admin
  console.log("\n== Como administrador de la plataforma ==");
  const ctxAdmin = await browser.newContext();
  const p2 = await ctxAdmin.newPage();
  await entrar(p2, "barberia@demo.com");

  ok(
    /Panel de la plataforma/i.test(await p2.locator("aside").innerText()),
    "a el si se le muestra el enlace"
  );

  await p2.goto(BASE + "/admin", { waitUntil: "networkidle" });
  ok(p2.url().endsWith("/admin"), "entra al panel", p2.url());

  const tablero = await p2.locator("body").innerText();
  ok(/Negocios/i.test(tablero), "ve el tablero de la plataforma");
  ok(
    /restaurante@demo\.com/i.test(tablero),
    "ve los correos de las cuentas registradas"
  );
  ok(
    /Restaurante Do/i.test(tablero) && /Comidas Rapidas/i.test(tablero),
    "ve las tres cuentas"
  );

  // Que NO se vea contenido de nadie.
  ok(
    !/Bandeja paisa|Almuerzo del dia|Hamburguesa/i.test(tablero),
    "NO se le muestra el contenido de las cuentas (platos, productos)"
  );

  // ------------------------------------------------- apagar un apartado
  console.log("\n== Apagarle un apartado a una cuenta ==");
  await p2.goto(BASE + "/admin/" + resto.id, { waitUntil: "networkidle" });
  const ficha = await p2.locator("body").innerText();
  ok(/Restaurante Do/i.test(ficha), "abre la ficha del restaurante");
  ok(
    (await p2.locator("#m-turnos").count()) === 0,
    "y no le ofrece interruptor de Turnos, que no es de su oficio"
  );
  ok((await p2.locator("#m-cuentas").count()) === 1, "pero si el de Cuentas abiertas");

  const selector = p2.locator("#m-reportes");
  ok((await selector.count()) === 1, "hay interruptor para Reportes");
  await selector.selectOption("apagado");
  await p2.waitForTimeout(1500);

  const enBase = await db.accountModule.findFirst({
    where: { userId: resto.id, moduleKey: "reportes" },
  });
  ok(enBase?.enabled === false, "quedo apagado en la base de datos");

  // Y ahora el cliente ya no lo ve.
  const ctxCli2 = await browser.newContext();
  const p3 = await ctxCli2.newPage();
  await entrar(p3, "restaurante@demo.com");
  const menuTrasApagar = await p3.locator("aside nav a").evaluateAll((els) =>
    els.map((e) => e.textContent.trim())
  );
  console.log("     menu del restaurante: " + menuTrasApagar.join(" | "));
  ok(!menuTrasApagar.some((t) => /Reportes/i.test(t)), "el cliente ya no ve Reportes en su menu");

  await p3.goto(BASE + "/panel/espacio", { waitUntil: "networkidle" });
  ok(
    (await p3.locator('input[name="visible"][value="reportes"]').count()) === 0,
    "y tampoco puede volver a prenderlo desde su configurador"
  );

  // La barberia no se vio afectada.
  const ctxBarb = await browser.newContext();
  const p4 = await ctxBarb.newPage();
  await entrar(p4, "barberia@demo.com");
  const menuBarb = await p4.locator("aside nav a").evaluateAll((els) =>
    els.map((e) => e.textContent.trim())
  );
  ok(
    menuBarb.some((t) => /Reportes/i.test(t)),
    "apagarselo a uno no se lo apago a los demas"
  );
  await ctxBarb.close();

  // Deshacer.
  await p2.goto(BASE + "/admin/" + resto.id, { waitUntil: "networkidle" });
  await p2.locator("#m-reportes").selectOption("sin_tocar");
  await p2.waitForTimeout(1500);
  ok(
    (await db.accountModule.count({ where: { userId: resto.id, moduleKey: "reportes" } })) === 0,
    "volver a 'de fabrica' borra la excepcion"
  );

  // ------------------------------------------------------- suspension
  console.log("\n== Suspender una cuenta ==");
  await p2.goto(BASE + "/admin/" + resto.id, { waitUntil: "networkidle" });

  const boton = p2.getByRole("button", { name: /Suspender esta cuenta/i });
  ok(await boton.isDisabled(), "el boton nace apagado hasta confirmar el nombre");

  await p2.fill('input[name="reason"]', "prueba automatica");
  await p2.waitForTimeout(200);
  ok(await boton.isDisabled(), "escribir solo el motivo no alcanza");

  const campos = p2.locator('input:not([name]):not([type="hidden"]):not([type="search"])');
  await campos.first().fill("Restaurante Doña Rosa");
  await p2.waitForTimeout(300);
  ok(!(await boton.isDisabled()), "con el nombre exacto ya se puede");

  await boton.click();
  await p2.waitForTimeout(2000);

  const suspendido = await db.user.findUniqueOrThrow({ where: { id: resto.id } });
  ok(suspendido.suspendedAt !== null, "quedo suspendida en la base");
  ok(suspendido.suspendedReason === "prueba automatica", "con su motivo anotado");

  // La sesion que ya estaba abierta se cae.
  await p3.goto(BASE + "/panel", { waitUntil: "networkidle" });
  ok(
    p3.url().includes("/login"),
    "la sesion que ya estaba abierta deja de valer",
    p3.url()
  );

  // Y no puede volver a entrar.
  await p3.goto(BASE + "/login", { waitUntil: "networkidle" });
  await p3.fill('input[name="email"]', "restaurante@demo.com");
  await p3.fill('input[name="password"]', "demo1234");
  await p3.click('button[type="submit"]');
  await p3.waitForTimeout(2000);
  const aviso = await p3.locator("body").innerText();
  ok(!p3.url().includes("/panel"), "no puede volver a entrar", p3.url());
  ok(/suspendida/i.test(aviso), "y se le explica por que, con el telefono de soporte");
  ok(/882 0056/.test(aviso), "el telefono de soporte aparece en el aviso");

  // No se borro nada suyo.
  const susCosas = await db.sale.count({ where: { userId: resto.id } });
  ok(susCosas > 0, "suspender no le borro sus datos", susCosas + " ventas");

  // Reactivar.
  await p2.goto(BASE + "/admin/" + resto.id, { waitUntil: "networkidle" });
  await p2.getByRole("button", { name: /Reactivar cuenta/i }).click();
  await p2.waitForTimeout(1500);
  ok(
    (await db.user.findUniqueOrThrow({ where: { id: resto.id } })).suspendedAt === null,
    "reactivar le devuelve el acceso"
  );

  await entrar(p3, "restaurante@demo.com");
  ok(p3.url().includes("/panel"), "y ya puede entrar otra vez", p3.url());

  // ----------------------------------------- no dispararse en el pie
  console.log("\n== El administrador no se puede dejar por fuera ==");
  await p2.goto(BASE + "/admin/" + barb.id, { waitUntil: "networkidle" });
  await p2.fill('input[name="reason"]', "intento");
  const campos2 = p2.locator('input:not([name]):not([type="hidden"]):not([type="search"])');
  await campos2.first().fill("Barberia El Estilo");
  await p2.waitForTimeout(300);
  await p2.getByRole("button", { name: /Suspender esta cuenta/i }).click();
  await p2.waitForTimeout(1500);
  ok(
    (await db.user.findUniqueOrThrow({ where: { id: barb.id } })).suspendedAt === null,
    "no puede suspender su propia cuenta"
  );
  ok(
    /No puedes suspender tu propia cuenta/i.test(await p2.locator("body").innerText()),
    "y se lo dice claro"
  );

  await ctxCli2.close();
  await ctxAdmin.close();
} catch (e) {
  fallos++;
  console.log("\nEXPLOTO: " + e.message);
} finally {
  await browser.close();
  await db.$disconnect();
}

console.log("\n" + (fallos === 0 ? "TODO BIEN" : fallos + " COMPROBACIONES FALLARON"));
process.exit(fallos === 0 ? 0 : 1);
