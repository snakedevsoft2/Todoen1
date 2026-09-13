/**
 * Comprueba los fondos del portafolio en un navegador.
 *
 * Lo que se prueba: que el editor muestre el fondo en la vista previa al
 * elegirlo, que se guarde, y que la pagina publica lo pinte con el contenido
 * en una tarjeta; que "Mi portada" ponga la foto de fondo sin repetirla
 * arriba; que sin portada caiga al color del negocio; y que en celular nada
 * se salga de la pantalla.
 *
 * Antes:   npm run build && npm start
 * Despues: npm run verificar:fondos
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

// Portada de 1x1: basta para probar que se pinta y que no se repite.
const PORTADA = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const S = "fondo-" + Date.now();
const cuenta = await db.user.create({
  data: {
    email: "tienda-" + S + "@test.local",
    passwordHash: bcrypt.hashSync("demo1234", 10),
    ownerName: "Duena Fondos",
    businessName: "Boutique " + S,
    businessType: "ROPA",
    slug: "boutique-" + S,
    brandColor: "#be123c",
    publicOpen: true,
    publicCover: PORTADA,
    publicHeadline: "Ropa con estilo",
    staff: { create: { name: "Duena Fondos", role: "DUENO" } },
  },
});

const browser = await chromium.launch({ channel: "msedge" });

async function fondoDe(page) {
  return page.evaluate(() => {
    const el = document.querySelector("main")?.closest("[data-fondo]") ?? document.querySelector("[data-fondo]");
    return {
      key: el?.getAttribute("data-fondo"),
      color: el ? getComputedStyle(el).backgroundColor : null,
      tarjeta: Boolean(el?.querySelector(".rounded-3xl.bg-panel")),
      fotoFondo: document.querySelectorAll("img.blur-2xl").length,
      franja: document.querySelectorAll("header img[src^='data:image']").length,
    };
  });
}

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();

  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', cuenta.email);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel|\/bienvenida/, { timeout: 25000 });

  console.log("\n1. Elegir el fondo en el editor");
  await page.goto(BASE + "/panel/portafolio", { waitUntil: "networkidle" });
  ok((await page.getByText("Fondo de la página").count()) > 0, "el editor tiene el selector de fondo");
  await page.getByText("Noche", { exact: true }).click();
  await page.waitForTimeout(400);
  ok((await page.locator('[data-fondo="oscuro"]').count()) > 0, "la vista previa cambia al instante, sin guardar");
  if (DIR) await page.screenshot({ path: DIR + "/fondos-editor.png" });

  await page.getByRole("button", { name: /Guardar mi p[aá]gina/i }).click();
  await page.waitForTimeout(2000);
  const guardado = await db.user.findUnique({ where: { id: cuenta.id }, select: { publicBackground: true } });
  ok(guardado.publicBackground === "oscuro", "se guarda", guardado.publicBackground);

  console.log("\n2. La pagina publica con fondo Noche");
  await page.goto(BASE + "/catalogo/" + cuenta.slug, { waitUntil: "networkidle" });
  let f = await fondoDe(page);
  ok(f.key === "oscuro", "usa el fondo elegido", String(f.key));
  ok(f.color === "rgb(17, 17, 22)", "pinta el color de fondo", String(f.color));
  ok(f.tarjeta, "el contenido va en una tarjeta encima");
  ok(f.franja === 1, "con fondo de color, la portada sigue arriba", String(f.franja));
  if (DIR) await page.screenshot({ path: DIR + "/fondos-noche.png" });

  console.log("\n3. Mi portada de fondo");
  await db.user.update({ where: { id: cuenta.id }, data: { publicBackground: "foto" } });
  await page.reload({ waitUntil: "networkidle" });
  f = await fondoDe(page);
  ok(f.key === "foto", "usa la portada", String(f.key));
  ok(f.fotoFondo === 1, "la foto queda de fondo, difuminada");
  ok(f.franja === 0, "y no se repite arriba: estaria dos veces en la pagina", String(f.franja));

  console.log("\n4. Mi portada sin portada");
  await db.user.update({ where: { id: cuenta.id }, data: { publicCover: null } });
  await page.reload({ waitUntil: "networkidle" });
  f = await fondoDe(page);
  ok(f.key === "marca", "cae al color del negocio", String(f.key));
  ok(f.color === "rgb(190, 18, 60)", "con el color de marca", String(f.color));
  ok(f.fotoFondo === 0, "y no deja un fondo de foto vacio");

  console.log("\n5. Clasico sigue siendo la pagina de siempre");
  await db.user.update({ where: { id: cuenta.id }, data: { publicBackground: "claro", publicCover: PORTADA } });
  await page.reload({ waitUntil: "networkidle" });
  f = await fondoDe(page);
  ok(f.key === "claro" && !f.tarjeta, "sin tarjeta", JSON.stringify(f));

  console.log("\n6. En celular no se sale de la pantalla");
  await db.user.update({ where: { id: cuenta.id }, data: { publicBackground: "arena" } });
  const cel = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await cel.goto(BASE + "/catalogo/" + cuenta.slug, { waitUntil: "networkidle" });
  ok(
    await cel.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    "nada desborda a lo ancho"
  );
  if (DIR) await cel.screenshot({ path: DIR + "/fondos-arena-celular.png" });
  await cel.close();

  console.log("\n7. Un valor inventado no rompe nada");
  await db.user.update({ where: { id: cuenta.id }, data: { publicBackground: "rosado-chillon" } });
  const r = await page.goto(BASE + "/catalogo/" + cuenta.slug, { waitUntil: "networkidle" });
  f = await fondoDe(page);
  ok(r.status() === 200 && f.key === "claro", "sale la pagina clasica", String(f.key));

  await ctx.close();
} finally {
  await browser.close();
  await db.user.delete({ where: { id: cuenta.id } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
