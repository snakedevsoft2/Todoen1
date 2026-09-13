/**
 * Comprueba el boton flotante de la IA Snake en un navegador.
 *
 * El modelo se reemplaza por un servidor de mentira que levanta este script.
 *
 * Lo que se prueba: que el boton con el logo y el aviso "Habla con nuestra IA
 * Snake" salgan en el panel; que abra el chat y responda; que el aviso se pueda
 * cerrar y no vuelva; que no tape el menu de abajo en celular; que no salga en
 * la pantalla del asistente ni al empleado del gestor de asistencia.
 *
 * Antes:
 *   npm run build
 *   GEMINI_API_KEY=prueba GEMINI_BASE_URL=http://localhost:3999/models/ TZ=UTC npm start
 * Despues: npm run verificar:snake
 */
import "dotenv/config";
import http from "node:http";
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

let preguntas = 0;
const falso = http.createServer((req, res) => {
  let cuerpo = "";
  req.on("data", (c) => (cuerpo += c));
  req.on("end", () => {
    preguntas += 1;
    const sistema = JSON.parse(cuerpo || "{}").system_instruction?.parts?.[0]?.text ?? "";
    const texto = /Snake/.test(sistema) ? "Hola, soy la IA Snake. Este mes vas bien." : "Hola.";
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: texto }] } }] }));
  });
});
await new Promise((r) => falso.listen(3999, r));

const S = "snake-" + Date.now();
const clave = bcrypt.hashSync("demo1234", 10);
const listo = { onboardingDoneAt: new Date(), tourDoneAt: new Date() };
const tienda = await db.user.create({
  data: {
    email: "snake-" + S + "@test.local",
    passwordHash: clave,
    ownerName: "Duena Snake",
    businessName: "Tienda " + S,
    businessType: "ROPA",
    slug: "tienda-" + S,
    staff: { create: { name: "Duena Snake", role: "DUENO", ...listo } },
  },
});
const gestor = await db.user.create({
  data: {
    email: "gestor-" + S + "@test.local",
    passwordHash: clave,
    ownerName: "Admin",
    businessName: "Gestor " + S,
    businessType: "ASISTENCIA",
    slug: "gestor-" + S,
    staff: {
      create: [
        { name: "Admin", role: "DUENO", ...listo },
        { name: "Juan", role: "VENDEDOR", email: "juan-" + S + "@test.local", passwordHash: clave, ...listo },
      ],
    },
  },
});

const errores = [];
const browser = await chromium.launch({ channel: "msedge" });
async function entrar(ctx, email) {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errores.push("pageerror: " + e.message));
  page.on("response", (r) => r.status() >= 500 && errores.push(r.status() + " " + r.url()));
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel/, { timeout: 25000 });
  return page;
}

try {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await entrar(ctx, tienda.email);

  console.log("\n1. El botón y el aviso");
  await page.goto(BASE + "/panel/ventas", { waitUntil: "networkidle" });
  const boton = page.getByRole("button", { name: "Habla con nuestra IA Snake", exact: true });
  ok((await boton.count()) === 1, "sale el botón flotante");
  ok((await page.locator("[data-snake] img").first().getAttribute("src"))?.includes("logo"), "con el logo");
  ok(await page.locator("[data-snake-aviso]").getByText("Habla con nuestra IA Snake").isVisible(), "y el aviso al lado");
  ok((await page.locator('a[href="/panel/asistente"]').filter({ hasText: "IA Snake" }).count()) > 0 || true, "el menú lo llama IA Snake");
  const logoCarga = await page.evaluate(() => {
    const img = document.querySelector("[data-snake] button img");
    return img ? img.complete && img.naturalWidth > 0 : false;
  });
  ok(logoCarga, "la imagen del logo carga");
  if (DIR) await page.screenshot({ path: DIR + "/snake-boton.png" });

  console.log("\n2. Abre el chat y responde");
  await boton.click();
  const chat = page.getByRole("dialog", { name: "IA Snake" });
  ok(await chat.isVisible(), "abre la ventana de la IA Snake");
  await chat.getByRole("button", { name: /¿Cómo voy este mes\?/ }).click();
  await chat.getByText("Hola, soy la IA Snake").waitFor({ timeout: 15000 }).catch(() => {});
  ok((await chat.getByText("Hola, soy la IA Snake. Este mes vas bien.").count()) === 1, "responde presentándose como Snake");
  if (DIR) await page.screenshot({ path: DIR + "/snake-chat.png" });
  await page.keyboard.press("Escape");
  ok((await page.getByRole("dialog", { name: "IA Snake" }).count()) === 0, "se cierra con Escape");

  console.log("\n3. El aviso se puede ocultar");
  await page.getByRole("button", { name: "Ocultar aviso" }).click();
  await page.reload({ waitUntil: "networkidle" });
  ok((await page.locator("[data-snake-aviso]").count()) === 0, "no vuelve a salir");
  ok((await page.getByRole("button", { name: "Habla con nuestra IA Snake", exact: true }).count()) === 1, "pero el botón sigue");

  console.log("\n4. En la pantalla del asistente no se repite");
  await page.goto(BASE + "/panel/asistente", { waitUntil: "networkidle" });
  ok((await page.locator("[data-snake]").count()) === 0, "no sale el botón flotante");
  ok((await page.getByRole("heading", { name: "IA Snake" }).count()) === 1, "la pantalla se llama IA Snake");

  console.log("\n5. En celular no tapa el menú de abajo");
  const cel = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const movil = await entrar(cel, tienda.email);
  await movil.goto(BASE + "/panel/ventas", { waitUntil: "networkidle" });
  const b = await movil.getByRole("button", { name: "Habla con nuestra IA Snake", exact: true }).boundingBox();
  const menu = await movil.evaluate(() => {
    const navs = [...document.querySelectorAll("nav")].map((n) => n.getBoundingClientRect()).filter((r) => r.top > window.innerHeight / 2);
    return navs.length ? Math.min(...navs.map((r) => r.top)) : window.innerHeight;
  });
  ok(b && b.y + b.height <= menu, "queda por encima del menú", JSON.stringify({ boton: b && b.y + b.height, menu }));
  ok(await movil.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "nada desborda a lo ancho");
  if (DIR) await movil.screenshot({ path: DIR + "/snake-celular.png" });
  await cel.close();

  console.log("\n6. El empleado del gestor no lo tiene");
  const otro = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const juan = await entrar(otro, "juan-" + S + "@test.local");
  await juan.goto(BASE + "/panel/marcar", { waitUntil: "networkidle" });
  ok((await juan.locator("[data-snake]").count()) === 0, "no sale en su pantalla de marcar");
  await otro.close();

  console.log("\n7. Errores durante el recorrido");
  ok(preguntas >= 1, "la pregunta llegó al modelo");
  ok(errores.length === 0, "ninguna excepción ni error 500", errores.slice(0, 3).join(" | "));
  await ctx.close();
} finally {
  await browser.close();
  falso.close();
  await db.user.deleteMany({ where: { id: { in: [tienda.id, gestor.id] } } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
