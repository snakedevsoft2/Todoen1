/**
 * Comprueba en un navegador que se pueda instalar la aplicacion en cualquier
 * celular.
 *
 * Lo que se prueba:
 *   - Android con aviso de instalacion: "Instalar" abre la ventana del navegador.
 *   - iPhone: "Instalar" muestra los pasos de Compartir y "Agregar a inicio", y
 *     la pagina trae lo que necesita el iPhone para abrir como aplicacion.
 *   - Dentro de Instagram: dice que se abra en el navegador.
 *   - "Ahora no" oculta el aviso y no vuelve a salir.
 *   - La cuenta con funciones limitadas no ofrece instalar.
 *
 * Antes:   npm run build && npm start
 * Después: npm run verificar:instalar
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
    await new Promise((r) => setTimeout(r, 400));
    v = await fn();
  }
  return v;
};

const UA = {
  android: "Mozilla/5.0 (Linux; Android 13; SM-A515F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  instagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0",
};

const S = "inst-" + Date.now();
const clave = bcrypt.hashSync("demo1234", 10);
const listo = { onboardingDoneAt: new Date(), tourDoneAt: new Date() };
const nueva = (nombre, extra = {}) =>
  db.user.create({
    data: {
      email: nombre + "-" + S + "@test.local",
      passwordHash: clave,
      ownerName: "Dueña",
      businessName: "Negocio " + nombre + " " + S,
      businessType: "OTRO",
      slug: nombre + "-" + S,
      staff: { create: { name: "Dueña", role: "DUENO", ...listo } },
      ...extra,
    },
  });
const completa = await nueva("completa");
const limitada = await nueva("limitada", { trialEndsAt: new Date(Date.now() - 86_400_000) });

const errores = [];
const browser = await chromium.launch({ channel: "msedge" });

async function celular(ua, cuenta, extraInit) {
  const ctx = await browser.newContext({ userAgent: ua, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  if (extraInit) await ctx.addInitScript(extraInit);
  const page = await ctx.newPage();
  page.on("response", (r) => r.status() >= 500 && r.status() !== 503 && errores.push(r.status() + " " + r.url()));
  await page.goto(BASE + "/login", { waitUntil: "load" });
  await page.fill('input[name="email"]', cuenta.email);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel/, { timeout: 25000 });
  return { ctx, page };
}

try {
  console.log("\n1. Android: abre la ventana de instalación del navegador");
  const android = await celular(UA.android, completa, () => {
    window.__ventanaInstalar = false;
    // Un aviso de instalacion de mentira, como el que manda Chrome.
    window.addEventListener("load", () =>
      setTimeout(() => {
        const e = new Event("beforeinstallprompt", { cancelable: true });
        e.prompt = async () => {
          window.__ventanaInstalar = true;
        };
        e.userChoice = Promise.resolve({ outcome: "accepted" });
        window.dispatchEvent(e);
      }, 1500)
    );
  });
  const avisoAndroid = android.page.locator("[data-aviso-instalar]");
  ok(Boolean(await esperarHasta(() => avisoAndroid.isVisible())), "muestra el aviso para instalar");
  await android.page.waitForTimeout(2500);
  await avisoAndroid.getByRole("button", { name: "Instalar" }).click();
  ok(Boolean(await esperarHasta(() => android.page.evaluate(() => window.__ventanaInstalar))), "Instalar abre la ventana del navegador");
  ok(Boolean(await esperarHasta(() => avisoAndroid.getByText(/quedó instalada/).count())), "y confirma que quedó instalada");
  await android.ctx.close();

  console.log("\n2. iPhone: muestra los pasos de Agregar a inicio");
  const iphone = await celular(UA.iphone, completa);
  ok((await iphone.page.locator('meta[name="apple-mobile-web-app-capable"][content="yes"]').count()) > 0, "la página trae lo que el iPhone necesita para abrir como aplicación");
  ok((await iphone.page.locator('link[rel="apple-touch-icon"]').count()) > 0, "y el ícono para la pantalla de inicio");
  const avisoIphone = iphone.page.locator("[data-aviso-instalar]");
  ok(Boolean(await esperarHasta(() => avisoIphone.isVisible())), "muestra el aviso para instalar");
  await avisoIphone.getByRole("button", { name: "Instalar" }).click();
  const pasosIphone = iphone.page.locator('[data-instalar-pasos="ios-safari"]');
  ok(Boolean(await esperarHasta(() => pasosIphone.isVisible())), "abre los pasos del iPhone");
  ok((await pasosIphone.getByText(/Agregar a inicio/).count()) > 0, "con Compartir y Agregar a inicio");
  const caja = await pasosIphone.boundingBox();
  ok(Boolean(caja) && caja.x >= 0 && caja.x + caja.width <= 390 && caja.y + caja.height <= 844, "y se ven completos en la pantalla", JSON.stringify(caja));
  await pasosIphone.getByRole("button", { name: "Cerrar" }).click();

  console.log("\n3. Ahora no");
  await avisoIphone.getByRole("button", { name: "Ahora no" }).click();
  ok((await avisoIphone.count()) === 0, "el aviso se va");
  await iphone.page.reload({ waitUntil: "load" });
  await iphone.page.waitForTimeout(1500);
  ok((await iphone.page.locator("[data-aviso-instalar]").count()) === 0, "y no vuelve a salir");
  await iphone.page.getByRole("button", { name: "Abrir menú" }).click();
  ok(Boolean(await esperarHasta(() => iphone.page.locator("[data-boton-instalar]").last().isVisible())), "el botón Instalar la aplicación sigue en el menú");
  await iphone.ctx.close();

  console.log("\n4. Dentro de Instagram");
  const insta = await celular(UA.instagram, completa);
  const avisoInsta = insta.page.locator("[data-aviso-instalar]");
  ok(Boolean(await esperarHasta(() => avisoInsta.isVisible())), "muestra el aviso");
  await avisoInsta.getByRole("button", { name: "Instalar" }).click();
  const pasosInsta = insta.page.locator('[data-instalar-pasos="app-interna"]');
  ok(Boolean(await esperarHasta(() => pasosInsta.isVisible())), "explica que está dentro de otra aplicación");
  ok((await pasosInsta.getByText(/Abrir en el navegador/).count()) > 0, "y cómo abrirla en el navegador");
  ok((await pasosInsta.getByRole("button", { name: "Copiar enlace" }).count()) === 1, "con el botón para copiar el enlace");
  await insta.ctx.close();

  console.log("\n5. La cuenta con funciones limitadas no ofrece instalar");
  const lim = await celular(UA.android, limitada);
  await lim.page.waitForTimeout(2000);
  ok((await lim.page.locator("[data-aviso-instalar]").count()) === 0, "sin aviso para instalar");
  ok((await lim.page.locator("[data-boton-instalar]").count()) === 0, "ni botón en el menú");
  await lim.ctx.close();

  console.log("\n6. Errores durante el recorrido");
  ok(errores.length === 0, "ningún error 500", errores.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  await db.user.deleteMany({ where: { slug: { contains: S } } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
