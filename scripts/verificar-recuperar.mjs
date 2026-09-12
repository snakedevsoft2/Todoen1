/**
 * Comprueba en un navegador de verdad el camino completo de recuperar la clave
 * olvidada.
 *
 * Lo que se prueba aqui y no en tests/ es lo que solo se puede comprobar
 * navegando: que el enlace de la pantalla de ingreso lleve donde debe, que un
 * enlace muerto no muestre el formulario, que guardar la clave nueva deje
 * entrar de verdad, y que la pantalla sirva en un celular.
 *
 * Antes de correrlo:
 *   1. npm run db:up
 *   2. En .env, RESEND_API_KEY con cualquier valor (aqui no se manda ningun
 *      correo: el enlace se fabrica contra la base, como lo haria el buzon).
 *   3. npm run build && npm start
 *
 * Y despues:  npm run verificar:recuperar
 *
 * Crea una cuenta desechable, la usa y la borra. Toca la base de datos: usar
 * solo contra la base local de pruebas.
 */
import "dotenv/config";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";

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

const SUFIJO = "e2e-" + Date.now();
const CORREO = "prueba-" + SUFIJO + "@test.local";
const CLAVE_VIEJA = "laDeAntes";
const CLAVE_NUEVA = "laNuevaSegura9";

const huella = (t) => createHash("sha256").update(t).digest("hex");

const cuenta = await db.user.create({
  data: {
    email: CORREO,
    passwordHash: bcrypt.hashSync(CLAVE_VIEJA, 10),
    ownerName: "Prueba E2E",
    businessName: "Negocio " + SUFIJO,
    businessType: "BARBERIA",
    slug: "negocio-" + SUFIJO,
  },
});

const browser = await chromium.launch({ channel: "msedge" });

try {
  // ---------- Escritorio ----------
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  console.log("\n1. La pantalla de ingreso lleva a recuperar");
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', CORREO);
  const olvide = page.getByRole("link", { name: /Olvidaste tu contrase/i });
  ok(await olvide.isVisible(), "se ve el enlace de olvidaste tu contrasena");
  const destino = await olvide.getAttribute("href");
  ok(
    destino?.startsWith("/recuperar") && destino.includes(encodeURIComponent(CORREO)),
    "el enlace va a /recuperar con el correo ya escrito",
    String(destino)
  );

  console.log("\n2. Pedir el enlace");
  await olvide.click();
  await page.waitForURL(/\/recuperar/);
  await page.waitForLoadState("networkidle");
  ok(
    (await page.inputValue('input[name="email"]')) === CORREO,
    "el correo llego solo, no toca reescribirlo"
  );

  // Un correo que no existe responde lo mismo que uno que si: no se puede
  // averiguar quien tiene cuenta.
  await page.fill('input[name="email"]', "nadie-" + SUFIJO + "@test.local");
  await page.click('button[type="submit"]');
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  const textoInexistente = await page.textContent("body");
  ok(
    /Revisa tu correo/i.test(textoInexistente),
    "con un correo sin cuenta responde lo mismo que con uno real"
  );
  ok(
    !/no est[aá] registrado|no existe/i.test(textoInexistente),
    "y no delata que ese correo no tiene cuenta"
  );
  const creadosParaFantasma = await db.passwordReset.count({
    where: { email: "nadie-" + SUFIJO + "@test.local" },
  });
  ok(creadosParaFantasma === 0, "no crea enlace para un correo sin cuenta");

  console.log("\n3. Un enlace inventado no abre nada");
  await page.goto(BASE + "/recuperar/token-inventado-" + SUFIJO, { waitUntil: "networkidle" });
  const textoMalo = await page.textContent("body");
  ok(/Este enlace ya no sirve/i.test(textoMalo), "avisa que el enlace no sirve");
  ok(
    await page.getByRole("link", { name: /Pedir un enlace nuevo/i }).isVisible(),
    "y ofrece pedir uno nuevo"
  );
  ok(
    (await page.locator('input[name="password"]').count()) === 0,
    "no muestra el formulario de clave nueva"
  );

  console.log("\n4. El enlace de verdad");
  // Se fabrica como lo haria el correo: token en claro para la direccion,
  // huella en la base.
  const token = randomBytes(32).toString("base64url");
  await db.passwordReset.create({
    data: {
      tokenHash: huella(token),
      email: CORREO,
      userId: cuenta.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  await page.goto(BASE + "/recuperar/" + token, { waitUntil: "networkidle" });
  const textoBueno = await page.textContent("body");
  ok(/Pon tu contrase/i.test(textoBueno), "abre el formulario de clave nueva");
  ok(textoBueno.includes(CORREO), "dice de que cuenta es la clave que se va a cambiar");

  // Las dos casillas distintas no dejan pasar.
  await page.fill('input[name="password"]', CLAVE_NUEVA);
  await page.fill('input[name="confirmPassword"]', "otraCosaDistinta");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1200);
  ok(
    /no coinciden/i.test(await page.textContent("body")),
    "con las dos casillas distintas avisa y no cambia nada"
  );
  const sinCambiar = await db.user.findUnique({ where: { id: cuenta.id } });
  ok(
    bcrypt.compareSync(CLAVE_VIEJA, sinCambiar.passwordHash),
    "la clave vieja sigue sirviendo mientras no se guarde bien"
  );

  // Ahora si.
  await page.fill('input[name="confirmPassword"]', CLAVE_NUEVA);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/login/, { timeout: 20000 });
  await page.waitForLoadState("networkidle");
  ok(
    /qued[oó] cambiada/i.test(await page.textContent("body")),
    "vuelve al ingreso avisando que quedo cambiada"
  );

  const despues = await db.user.findUnique({ where: { id: cuenta.id } });
  ok(bcrypt.compareSync(CLAVE_NUEVA, despues.passwordHash), "la clave nueva quedo guardada");
  ok(!bcrypt.compareSync(CLAVE_VIEJA, despues.passwordHash), "la vieja dejo de servir");

  console.log("\n5. El enlace no se puede usar dos veces");
  await page.goto(BASE + "/recuperar/" + token, { waitUntil: "networkidle" });
  const textoUsado = await page.textContent("body");
  ok(/ya se us[oó]/i.test(textoUsado), "el mismo enlace ya no abre el formulario");

  console.log("\n6. Entrar con la clave nueva");
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', CORREO);
  await page.fill('input[name="password"]', CLAVE_NUEVA);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel|\/bienvenida/, { timeout: 20000 });
  ok(/\/panel|\/bienvenida/.test(page.url()), "entra al panel con la clave nueva", page.url());

  console.log("\n7. En celular");
  const movil = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await movil.goto(BASE + "/recuperar", { waitUntil: "networkidle" });
  ok(
    await movil.getByRole("button", { name: /Enviarme el enlace/i }).isVisible(),
    "el boton se ve en pantalla de celular"
  );
  const ancho = await movil.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1
  );
  ok(ancho, "no se sale de la pantalla a lo ancho");
  await movil.close();
} finally {
  await browser.close();
  await db.passwordReset.deleteMany({ where: { email: CORREO } });
  await db.user.delete({ where: { id: cuenta.id } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
