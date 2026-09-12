/**
 * Comprueba reponer la clave desde el panel de la plataforma, en un navegador
 * de verdad.
 *
 * Lo que se prueba aqui y no en tests/ es lo que solo se puede comprobar
 * navegando: que el boton este donde debe, que el enlace que genera sirva de
 * verdad para entrar despues, que el del barbero vaya al correo del barbero y
 * no al del dueno, y que un cliente cualquiera no alcance esta pantalla.
 *
 * Antes de correrlo:
 *   1. npm run db:up
 *   2. En .env, ADMIN_EMAILS tiene que incluir barberia@demo.com
 *   3. npm run seed        (las tres cuentas de ejemplo)
 *   4. npm run build && npm start
 *
 * Y despues:  npm run verificar:clave-admin
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

const S = "adm-" + Date.now();
const CORREO = "cliente-" + S + "@test.local";
const CORREO_BARBERO = "barbero-" + S + "@test.local";
const VIEJA = "laDeAntes";
const NUEVA = "laNuevaSegura9";

const cuenta = await db.user.create({
  data: {
    email: CORREO,
    passwordHash: bcrypt.hashSync(VIEJA, 10),
    ownerName: "Cliente Prueba",
    businessName: "Negocio " + S,
    businessType: "BARBERIA",
    slug: "negocio-" + S,
    staff: {
      create: [
        { name: "Duena", role: "DUENO" },
        {
          name: "Barbero Prueba",
          email: CORREO_BARBERO,
          passwordHash: bcrypt.hashSync(VIEJA, 10),
          role: "BARBERO",
        },
      ],
    },
  },
  include: { staff: true },
});
const barbero = cuenta.staff.find((s) => s.name === "Barbero Prueba");

const browser = await chromium.launch({ channel: "msedge" });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  // barberia@demo.com esta en ADMIN_EMAILS.
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', "barberia@demo.com");
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel|\/bienvenida/, { timeout: 25000 });

  console.log("\n1. La ficha de la cuenta en /admin");
  await page.goto(BASE + "/admin/" + cuenta.id, { waitUntil: "networkidle" });
  const cuerpo = await page.textContent("body");
  ok(cuerpo.includes("No puede entrar"), "se ve el apartado para destrancarla");
  ok(cuerpo.includes(CORREO), "dice a que correo le va a llegar");
  ok(
    !/contraseña actual|clave actual/i.test(cuerpo),
    "no muestra ninguna contraseña del cliente"
  );

  const botones = page.getByRole("button", { name: "Reponer clave" });
  ok((await botones.count()) === 2, "hay un boton para el dueno y otro para el barbero", String(await botones.count()));

  console.log("\n2. Reponerle la clave al dueno");
  const antes = await db.passwordReset.count({ where: { userId: cuenta.id } });
  await botones.first().click();
  await page.waitForTimeout(2500);

  const tras = await page.textContent("body");
  ok(/sirve una sola vez/i.test(tras), "muestra el enlace generado");
  // Con la llave de prueba, Resend rechaza: tiene que decirlo, no callarselo.
  ok(
    /No se pudo mandar el correo/i.test(tras),
    "avisa que el correo no salio en vez de quedarse callado"
  );

  const creados = await db.passwordReset.count({ where: { userId: cuenta.id } });
  ok(creados === antes + 1, "quedo un enlace guardado para esa cuenta");

  const enlace = await page.locator("code").first().textContent();
  ok(enlace.includes("/recuperar/"), "el enlace apunta a /recuperar", enlace.slice(0, 60));

  if (DIR) await page.screenshot({ path: DIR + "/admin-reponer.png" });

  console.log("\n3. El enlace del administrador de verdad funciona");
  const otra = await browser.newContext();
  const p2 = await otra.newPage();
  await p2.goto(enlace.trim(), { waitUntil: "networkidle" });
  ok(/Pon tu contrase/i.test(await p2.textContent("body")), "abre el formulario de clave nueva");

  await p2.fill('input[name="password"]', NUEVA);
  await p2.fill('input[name="confirmPassword"]', NUEVA);
  await p2.click('button[type="submit"]');
  await p2.waitForURL(/\/login/, { timeout: 20000 });

  const despues = await db.user.findUnique({ where: { id: cuenta.id } });
  ok(bcrypt.compareSync(NUEVA, despues.passwordHash), "la clave nueva quedo guardada");
  ok(!bcrypt.compareSync(VIEJA, despues.passwordHash), "la vieja dejo de servir");

  await p2.goto(BASE + "/login", { waitUntil: "networkidle" });
  await p2.fill('input[name="email"]', CORREO);
  await p2.fill('input[name="password"]', NUEVA);
  await p2.click('button[type="submit"]');
  await p2.waitForURL(/\/panel|\/bienvenida/, { timeout: 20000 }).catch(() => {});
  ok(/\/panel|\/bienvenida/.test(p2.url()), "el cliente entra con su clave nueva", p2.url());
  await otra.close();

  console.log("\n4. Reponerle la clave a un barbero");
  await page.goto(BASE + "/admin/" + cuenta.id, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Reponer clave" }).nth(1).click();
  await page.waitForTimeout(2500);
  const delBarbero = await db.passwordReset.findFirst({
    where: { staffId: barbero.id },
    orderBy: { createdAt: "desc" },
  });
  ok(Boolean(delBarbero), "queda un enlace a nombre del barbero");
  ok(delBarbero?.email === CORREO_BARBERO, "va al correo del barbero, no al del dueno", delBarbero?.email);
  ok(delBarbero?.userId === null, "el enlace no apunta a la cuenta del negocio");

  console.log("\n5. Una cuenta suspendida no recibe enlace");
  await db.user.update({ where: { id: cuenta.id }, data: { suspendedAt: new Date(), suspendedReason: "prueba" } });
  await page.goto(BASE + "/admin/" + cuenta.id, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Reponer clave" }).first().click();
  await page.waitForTimeout(2000);
  ok(
    /suspendida/i.test(await page.textContent("body")),
    "avisa que primero hay que reactivarla"
  );
  await db.user.update({ where: { id: cuenta.id }, data: { suspendedAt: null, suspendedReason: null } });

  console.log("\n6. Un cliente cualquiera no alcanza esto");
  const ajeno = await browser.newContext();
  const p3 = await ajeno.newPage();
  await p3.goto(BASE + "/login", { waitUntil: "networkidle" });
  await p3.fill('input[name="email"]', "restaurante@demo.com");
  await p3.fill('input[name="password"]', "demo1234");
  await p3.click('button[type="submit"]');
  await p3.waitForURL(/\/panel|\/bienvenida/, { timeout: 20000 });
  await p3.goto(BASE + "/admin/" + cuenta.id, { waitUntil: "networkidle" });
  ok(!p3.url().includes("/admin"), "lo devuelve a su panel", p3.url());
  await ajeno.close();
} finally {
  await browser.close();
  await db.passwordReset.deleteMany({ where: { email: { in: [CORREO, CORREO_BARBERO] } } });
  await db.user.delete({ where: { id: cuenta.id } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
