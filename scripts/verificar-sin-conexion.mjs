/**
 * Comprueba que el marcador abra EN FRIO sin senal.
 *
 * La cola de marcajes ya funcionaba con la pantalla abierta. Lo que se prueba
 * aqui es el otro caso, el del empleado que abre la aplicacion desde cero en
 * un sotano: que la pagina salga del trabajador de fondo, que se pueda marcar,
 * que el resto de pantallas muestre un aviso y no el error del navegador, y
 * que al llegar al ingreso se borre la copia guardada (lleva el nombre de
 * quien estaba adentro).
 *
 * Antes de correrlo:  npm run db:up  y  npm run build && npm start
 * Despues:            npm run verificar:sin-conexion
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

const S = "sw-" + Date.now();
const cuenta = await db.user.create({
  data: {
    // Con pago: solo la cuenta que pago instala la app y la usa sin senal.
    paidUntil: new Date(Date.now() + 30 * 86_400_000),
    email: "jefe-" + S + "@test.local",
    passwordHash: bcrypt.hashSync("demo1234", 10),
    ownerName: "Jefe",
    businessName: "SW " + S,
    businessType: "ASISTENCIA",
    slug: "sw-" + S,
    staff: {
      create: [
        { name: "Jefe", role: "DUENO" },
        { name: "Ana Frio", email: "ana-" + S + "@test.local", passwordHash: bcrypt.hashSync("demo1234", 10), role: "VENDEDOR" },
      ],
    },
  },
  include: { staff: true },
});
const ana = cuenta.staff.find((s) => s.name === "Ana Frio");

const browser = await chromium.launch({ channel: "msedge" });

try {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: 4.65, longitude: -74.058, accuracy: 15 },
    permissions: ["geolocation"],
  });
  const page = await ctx.newPage();

  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', ana.email);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel|\/bienvenida/, { timeout: 25000 });

  console.log("\n1. Con senal, la pantalla se guarda en el telefono");
  await page.goto(BASE + "/panel/marcar", { waitUntil: "networkidle" });
  const activo = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return false;
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((r) => setTimeout(() => r(null), 10000)),
    ]);
    return Boolean(reg && reg.active);
  });
  ok(activo, "el trabajador de fondo queda activo");

  let guardada = false;
  for (let i = 0; i < 30 && !guardada; i += 1) {
    guardada = await page.evaluate(async () => {
      const c = await caches.open("ten-paginas-v1");
      return Boolean(await c.match(location.origin + "/panel/marcar"));
    });
    if (!guardada) await page.waitForTimeout(500);
  }
  ok(guardada, "la pagina de Marcar quedo guardada");

  console.log("\n2. Sin senal, abrir la aplicacion desde cero");
  await ctx.setOffline(true);
  let resp = null;
  try {
    resp = await page.goto(BASE + "/panel/marcar", { waitUntil: "domcontentloaded", timeout: 20000 });
  } catch (e) {
    ok(false, "la pagina abre sin red", String(e).slice(0, 120));
  }
  await page.waitForTimeout(3000);
  ok(!page.url().startsWith("chrome-error"), "no sale la pagina de error del navegador", page.url());
  ok(Boolean(resp?.fromServiceWorker()), "la pagina salio del trabajador de fondo, no de la red");
  ok(
    await page.getByRole("button", { name: /Marcar (entrada|salida)/i }).isVisible().catch(() => false),
    "el boton de marcar aparece y la pantalla funciona"
  );

  console.log("\n3. Marcar en frio sin senal");
  await page.getByRole("button", { name: /Marcar entrada/i }).click();
  await page.waitForTimeout(4000);
  ok(/Entrada registrada/i.test(await page.textContent("body")), "confirma la entrada en pantalla");
  ok((await db.attendance.count({ where: { staffId: ana.id } })) === 0, "todavia no llega al servidor");
  const enCola = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const r = indexedDB.open("ten_marcajes", 1);
        r.onsuccess = () => {
          const c = r.result.transaction("pendientes", "readonly").objectStore("pendientes").count();
          c.onsuccess = () => resolve(c.result);
        };
        r.onerror = () => resolve(-1);
      })
  );
  ok(enCola === 1, "queda en la cola del telefono", String(enCola));

  console.log("\n4. Otra pantalla sin senal muestra un aviso, no el error");
  try {
    // La Guia no esta en el menu del empleado: nunca queda guardada en su telefono.
    await page.goto(BASE + "/panel/guia", { waitUntil: "domcontentloaded", timeout: 15000 });
  } catch {
    // Se revisa abajo.
  }
  ok(!page.url().startsWith("chrome-error"), "no queda en la pagina de error", page.url());
  ok(/Sin conexi/i.test(await page.textContent("body").catch(() => "")), "dice Sin conexion y ofrece ir a marcar");

  console.log("\n5. Vuelve la senal y el marcaje sale");
  await ctx.setOffline(false);
  await page.goto(BASE + "/panel/marcar", { waitUntil: "networkidle" });
  let llegaron = 0;
  for (let i = 0; i < 20 && llegaron === 0; i += 1) {
    llegaron = await db.attendance.count({ where: { staffId: ana.id } });
    if (llegaron === 0) await page.waitForTimeout(500);
  }
  ok(llegaron === 1, "el marcaje hecho en frio llego al servidor", String(llegaron));

  console.log("\n6. Al llegar al ingreso se borra la copia guardada");
  await page.goto(BASE + "/salir", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const quedan = await page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith("ten-paginas")));
  ok(quedan.length === 0, "no quedan paginas guardadas con datos de la persona", JSON.stringify(quedan));

  await ctx.close();
} finally {
  await browser.close();
  await db.attendance.deleteMany({ where: { userId: cuenta.id } });
  await db.user.delete({ where: { id: cuenta.id } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
