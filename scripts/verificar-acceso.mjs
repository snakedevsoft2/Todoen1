/**
 * Comprueba en un navegador la pregunta de seguridad y el arranque de Facebook.
 *
 * Facebook no se puede probar de punta a punta sin una app real de Meta. Lo
 * que si se prueba es todo lo que depende de nosotros: que el boton aparezca
 * solo con credenciales, que el arranque mande a Facebook con los datos
 * correctos y la cookie de state, y que una vuelta falsificada se rechace.
 *
 * Antes de correrlo, el servidor con credenciales de Facebook de mentira:
 *   FACEBOOK_APP_ID=app-de-prueba FACEBOOK_APP_SECRET=secreto npm start
 * Despues:
 *   npm run verificar:acceso
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

const S = "acc-" + Date.now();
const cuenta = await db.user.create({
  data: {
    email: "duena-" + S + "@test.local",
    passwordHash: bcrypt.hashSync("demo1234", 10),
    ownerName: "Duena Acceso",
    businessName: "Acceso " + S,
    businessType: "OTRO",
    slug: "acceso-" + S,
    staff: { create: { name: "Duena Acceso", role: "DUENO" } },
  },
});

const browser = await chromium.launch({ channel: "msedge" });

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const page = await ctx.newPage();

  console.log("\n1. Sin correo configurado, olvidar la clave lleva a la pregunta");
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  const href = await page.getByRole("link", { name: /Olvidaste tu contrase/i }).getAttribute("href");
  ok(href?.startsWith("/recuperar/pregunta"), "el enlace va a /recuperar/pregunta", String(href));

  console.log("\n2. Configurar la pregunta en Ajustes");
  await page.fill('input[name="email"]', cuenta.email);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel|\/bienvenida/, { timeout: 25000 });
  await page.goto(BASE + "/panel/ajustes", { waitUntil: "networkidle" });

  const pregunta = await page.locator('select[name="pregunta"]').inputValue();
  await page.fill('input[name="respuesta"]', "Firuláis");
  await page.fill('input[name="claveActual"]', "no-es-esta");
  await page.getByRole("button", { name: /Guardar pregunta/i }).click();
  await page.waitForTimeout(1500);
  ok(/actual no coincide/i.test(await page.textContent("body")), "sin la clave actual correcta no se guarda");
  ok(!(await db.user.findUnique({ where: { id: cuenta.id } })).securityAnswerHash, "y en la base no quedo nada");

  await page.fill('input[name="respuesta"]', "Firuláis");
  await page.fill('input[name="claveActual"]', "demo1234");
  await page.getByRole("button", { name: /Guardar pregunta/i }).click();
  await page.waitForTimeout(1800);
  const guardada = await db.user.findUnique({ where: { id: cuenta.id } });
  ok(guardada.securityQuestion === pregunta, "la pregunta quedo guardada");
  ok(Boolean(guardada.securityAnswerHash) && !guardada.securityAnswerHash.includes("firulais"), "la respuesta queda cifrada, no en texto");
  if (DIR) await page.screenshot({ path: DIR + "/pregunta-ajustes.png" });

  console.log("\n3. Recuperar con la pregunta");
  await page.goto(BASE + "/salir", { waitUntil: "networkidle" });
  await page.goto(BASE + "/recuperar/pregunta", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', cuenta.email);
  await page.getByRole("button", { name: /Ver mi pregunta/i }).click();
  await page.waitForTimeout(1500);
  ok((await page.textContent("body")).includes(pregunta), "muestra la pregunta de esa cuenta");

  await page.fill('input[name="respuesta"]', "Toby");
  await page.fill('input[name="password"]', "NuevaClave9");
  await page.fill('input[name="confirmPassword"]', "NuevaClave9");
  await page.getByRole("button", { name: /Cambiar contrase/i }).click();
  await page.waitForTimeout(1800);
  ok(/no coincide/i.test(await page.textContent("body")), "una respuesta equivocada se rechaza");

  await page.fill('input[name="respuesta"]', "  FIRULAIS ");
  await page.fill('input[name="password"]', "NuevaClave9");
  await page.fill('input[name="confirmPassword"]', "NuevaClave9");
  await page.getByRole("button", { name: /Cambiar contrase/i }).click();
  await page.waitForURL(/\/login/, { timeout: 20000 });
  ok(/cambiada/i.test(page.url()) || /qued[oó] cambiada/i.test(await page.textContent("body")), "la correcta, escrita distinto, cambia la clave");

  await page.fill('input[name="email"]', cuenta.email);
  await page.fill('input[name="password"]', "NuevaClave9");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel|\/bienvenida/, { timeout: 20000 }).catch(() => {});
  ok(/\/panel|\/bienvenida/.test(page.url()), "entra con la clave nueva", page.url());

  console.log("\n4. Un correo que no existe no se delata");
  await page.goto(BASE + "/salir", { waitUntil: "networkidle" });
  await page.goto(BASE + "/recuperar/pregunta", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', "nadie-" + S + "@test.local");
  await page.getByRole("button", { name: /Ver mi pregunta/i }).click();
  await page.waitForTimeout(1500);
  const falso = await page.textContent("body");
  ok(/¿/.test(falso) && (await page.locator('input[name="respuesta"]').count()) === 1, "tambien muestra una pregunta");
  ok(!/no existe|no tiene cuenta|no est[aá] registrado/i.test(falso), "y no dice que el correo no existe");

  console.log("\n5. Facebook: el boton y el arranque");
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  // Nombre exacto: el pie tiene tambien un enlace a la pagina de Facebook del
  // negocio ("Facebook - Nuestro perfil"), que no es el boton de ingreso.
  ok(
    await page.getByRole("link", { name: "Facebook", exact: true }).isVisible(),
    "con credenciales, aparece el boton de Facebook"
  );
  if (DIR) await page.screenshot({ path: DIR + "/login-facebook.png" });

  const arranque = await ctx.request.get(BASE + "/auth/facebook", { maxRedirects: 0 });
  const destino = arranque.headers()["location"] ?? "";
  ok(arranque.status() >= 300 && arranque.status() < 400, "el arranque redirige", String(arranque.status()));
  ok(destino.startsWith("https://www.facebook.com/v19.0/dialog/oauth"), "a la pantalla de Facebook", destino.slice(0, 60));
  const q = new URL(destino || "https://x").searchParams;
  ok(q.get("client_id") === "app-de-prueba", "con el id de nuestra app");
  ok(q.get("redirect_uri") === BASE + "/auth/facebook/callback", "con la vuelta a nuestra ruta", String(q.get("redirect_uri")));
  ok((q.get("scope") ?? "").includes("email"), "pidiendo el correo");
  const cookie = arranque.headers()["set-cookie"] ?? "";
  ok(cookie.includes("ten_facebook_state=" + q.get("state")), "y guarda el state en una cookie para comparar a la vuelta");

  const falsificada = await ctx.request.get(BASE + "/auth/facebook/callback?code=abc&state=inventado", { maxRedirects: 0 });
  ok((falsificada.headers()["location"] ?? "").includes("error=state"), "una vuelta con state falso se rechaza");

  await ctx.close();
} finally {
  await browser.close();
  await db.securityAttempt.deleteMany({ where: { email: { contains: S } } });
  await db.user.delete({ where: { id: cuenta.id } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
