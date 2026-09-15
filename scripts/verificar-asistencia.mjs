/**
 * Comprueba el gestor de asistencia en un navegador de verdad, con y sin senal.
 *
 * Lo que se prueba aqui es lo que no se puede probar sin navegador: que el
 * marcaje salga con la coordenada del telefono, que sin red se guarde en la
 * cola en vez de perderse, que al volver la senal se envie solo, y sobre todo
 * que un reenvio NO duplique. Una mala senal convirtiendo una entrada en cinco
 * es exactamente el fallo que este modulo existe para impedir.
 *
 * Antes de correrlo:
 *   1. npm run db:up
 *   2. npm run build && npm start
 *
 * Y despues:  npm run verificar:asistencia
 *
 * Crea una cuenta desechable y la borra al final.
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

const S = "asis-" + Date.now();
// Una coordenada en Bogota, y el sitio a unos 20 metros.
const AQUI = { latitude: 4.65, longitude: -74.058, accuracy: 12 };

const dueno = await db.user.create({
  data: {
    // Con pago: solo la cuenta que pago instala la app y la usa sin senal.
    paidUntil: new Date(Date.now() + 30 * 86_400_000),
    email: "jefe-" + S + "@test.local",
    passwordHash: bcrypt.hashSync("demo1234", 10),
    ownerName: "Jefe",
    businessName: "Servicios " + S,
    businessType: "ASISTENCIA",
    slug: "servicios-" + S,
    staff: {
      create: [
        { name: "Jefe", role: "DUENO" },
        {
          name: "Juan Empleado",
          email: "juan-" + S + "@test.local",
          passwordHash: bcrypt.hashSync("demo1234", 10),
          role: "VENDEDOR",
        },
      ],
    },
  },
  include: { staff: true },
});
const juan = dueno.staff.find((s) => s.name === "Juan Empleado");

const sitio = await db.workSite.create({
  data: { userId: dueno.id, name: "Sede Norte", lat: 4.65018, lng: -74.058, radiusM: 150 },
});
const lejano = await db.workSite.create({
  data: { userId: dueno.id, name: "Obra Sur", lat: 4.55, lng: -74.1, radiusM: 150 },
});

const browser = await chromium.launch({ channel: "msedge" });

try {
  // El telefono de Juan, con permiso de ubicacion.
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: AQUI,
    permissions: ["geolocation"],
  });
  const page = await ctx.newPage();

  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', juan.email);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel|\/bienvenida/, { timeout: 25000 });

  console.log("\n1. Marcar entrada con senal");
  await page.goto(BASE + "/panel/marcar", { waitUntil: "networkidle" });
  ok(
    await page.getByRole("button", { name: /Marcar entrada/i }).isVisible(),
    "el empleado ve el boton de marcar entrada"
  );
  await page.locator("select").first().selectOption(sitio.id);
  await page.getByRole("button", { name: /Marcar entrada/i }).click();
  await page.waitForTimeout(3500);

  const primero = await db.attendance.findFirst({ where: { staffId: juan.id } });
  ok(Boolean(primero), "la entrada llego al servidor");
  ok(primero?.kind === "ENTRADA", "quedo como entrada");
  ok(
    primero?.lat !== null && Math.abs(primero.lat - AQUI.latitude) < 0.0001,
    "con la latitud del telefono",
    String(primero?.lat)
  );
  ok(primero?.accuracyM === 12, "y la precision del GPS", String(primero?.accuracyM));
  ok(
    primero?.distanceM !== null && primero.distanceM < 150,
    "mide la distancia al sitio: queda dentro del radio",
    String(primero?.distanceM) + " m"
  );
  if (DIR) await page.screenshot({ path: DIR + "/asistencia-marcar.png" });

  console.log("\n2. Marcar SIN senal");
  await ctx.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await page.waitForTimeout(500);

  const antesSinRed = await db.attendance.count({ where: { staffId: juan.id } });
  await page.getByRole("button", { name: /Marcar salida/i }).click();
  await page.waitForTimeout(3000);

  // El fallo que se encontro aqui: al marcar sin red, la aplicacion pedia la
  // pagina de nuevo, Next caia a una navegacion completa y el telefono quedaba
  // en la pagina de error del navegador. Se iba la aplicacion y, con ella, el
  // acceso a la cola. Esta comprobacion es para que no vuelva.
  ok(
    !page.url().startsWith("chrome-error"),
    "marcar sin red NO saca a la persona de la aplicacion",
    page.url()
  );

  ok(
    /Salida registrada/i.test(await page.textContent("body")),
    "confirma la salida en pantalla aunque no haya red"
  );
  ok(
    (await db.attendance.count({ where: { staffId: juan.id } })) === antesSinRed,
    "sin red no llega nada al servidor todavia"
  );
  await page.waitForTimeout(4500);
  const enCola = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const r = indexedDB.open("ten_marcajes", 1);
        r.onsuccess = () => {
          const tx = r.result.transaction("pendientes", "readonly");
          const c = tx.objectStore("pendientes").count();
          c.onsuccess = () => resolve(c.result);
        };
        r.onerror = () => resolve(-1);
      })
  );
  ok(enCola === 1, "el marcaje queda guardado en la cola del telefono", String(enCola));
  ok(
    /esperando señal/i.test(await page.textContent("body")),
    "y la pantalla dice que esta esperando senal"
  );
  if (DIR) await page.screenshot({ path: DIR + "/asistencia-sin-senal.png" });

  console.log("\n3. Vuelve la senal y se envia solo");
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(4000);

  const trasVolver = await db.attendance.count({ where: { staffId: juan.id } });
  ok(trasVolver === antesSinRed + 1, "la salida llego sola al volver la senal", String(trasVolver));

  const salida = await db.attendance.findFirst({
    where: { staffId: juan.id, kind: "SALIDA" },
  });
  ok(Boolean(salida), "quedo como salida");

  console.log("\n4. Un reenvio NO duplica");
  // Se simula lo peor: el envio llego al servidor pero la respuesta se perdio,
  // asi que el telefono vuelve a mandar exactamente el mismo marcaje.
  const reenvio = await page.evaluate(async (m) => {
    const r = await fetch("/api/asistencia/lote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marcajes: [m, m, m] }),
    });
    return r.json();
  }, {
    clientKey: salida.clientKey,
    kind: "SALIDA",
    markedAt: salida.markedAt.toISOString(),
    siteId: null,
    lat: null,
    lng: null,
    accuracyM: null,
    note: null,
  });
  const final = await db.attendance.count({ where: { staffId: juan.id } });
  ok(final === trasVolver, "mandar el mismo marcaje tres veces no crea copias", String(final));
  ok(
    reenvio.resultados?.every((r) => r.estado === "repetido"),
    "el servidor los reconoce como repetidos",
    JSON.stringify(reenvio.resultados?.map((r) => r.estado))
  );

  console.log("\n5. Lo que no se puede colar");
  const trampas = await page.evaluate(async ({ lejanoId }) => {
    const manda = async (m) => {
      const r = await fetch("/api/asistencia/lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marcajes: [m] }),
      });
      return (await r.json()).resultados?.[0];
    };
    const base = { siteId: null, lat: null, lng: null, accuracyM: null, note: null };
    return {
      futuro: await manda({
        ...base,
        clientKey: "fut-" + Math.random(),
        kind: "ENTRADA",
        markedAt: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
      }),
      viejo: await manda({
        ...base,
        clientKey: "old-" + Math.random(),
        kind: "ENTRADA",
        markedAt: new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString(),
      }),
      sitioAjeno: await manda({
        ...base,
        clientKey: "aj-" + Math.random(),
        kind: "ENTRADA",
        markedAt: new Date().toISOString(),
        siteId: "id-de-otro-negocio",
      }),
      sinTipo: await manda({
        ...base,
        clientKey: "st-" + Math.random(),
        kind: "CAFE",
        markedAt: new Date().toISOString(),
      }),
      lejos: await manda({
        ...base,
        clientKey: "lj-" + Math.random(),
        kind: "ENTRADA",
        // Ayer: hoy ya marco su entrada, y solo se permite una por dia.
        markedAt: new Date(Date.now() - 30 * 3600 * 1000).toISOString(),
        siteId: lejanoId,
        lat: 4.65,
        lng: -74.058,
      }),
    };
  }, { lejanoId: lejano.id });

  ok(trampas.futuro?.estado === "rechazado", "rechaza un marcaje con hora del futuro");
  ok(trampas.viejo?.estado === "rechazado", "rechaza un marcaje de hace 40 dias");
  ok(trampas.sitioAjeno?.estado === "rechazado", "rechaza un sitio que no es de la cuenta");
  ok(trampas.sinTipo?.estado === "rechazado", "rechaza lo que no es entrada ni salida");
  ok(
    trampas.lejos?.estado === "guardado",
    "marcar lejos del sitio SI se deja: se registra y se avisa, no se bloquea"
  );
  const marcaLejos = await db.attendance.findFirst({
    where: { staffId: juan.id, siteId: lejano.id },
  });
  ok(
    marcaLejos?.distanceM > 1000,
    "y queda anotado que estaba lejos",
    String(marcaLejos?.distanceM) + " m"
  );

  console.log("\n6. El empleado no ve la planilla del dueno");
  await page.goto(BASE + "/panel/planilla", { waitUntil: "networkidle" });
  ok(!page.url().includes("/planilla"), "lo devuelve a su panel", page.url());

  await ctx.close();

  console.log("\n7. La planilla del dueno");
  const jefe = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const pj = await jefe.newPage();
  await pj.goto(BASE + "/login", { waitUntil: "networkidle" });
  await pj.fill('input[name="email"]', dueno.email);
  await pj.fill('input[name="password"]', "demo1234");
  await pj.click('button[type="submit"]');
  await pj.waitForURL(/\/panel|\/bienvenida/, { timeout: 25000 });
  await pj.goto(BASE + "/panel/planilla", { waitUntil: "networkidle" });
  const planilla = await pj.textContent("body");
  ok(/Juan Empleado/.test(planilla), "muestra a la persona");
  ok(/lejos/i.test(planilla), "senala el marcaje hecho lejos del sitio");
  if (DIR) await pj.screenshot({ path: DIR + "/asistencia-planilla.png" });

  console.log("\n8. Anular no borra: tacha y deja el motivo");
  const totalAntes = await db.attendance.count({ where: { staffId: juan.id } });
  await pj.getByRole("button", { name: "Anular" }).first().click();
  await pj.fill('input[name="reason"]', "Marco con el telefono de otro");
  await pj.getByRole("button", { name: "Anular" }).first().click();
  await pj.waitForTimeout(2200);

  const totalDespues = await db.attendance.count({ where: { staffId: juan.id } });
  ok(totalDespues === totalAntes, "el marcaje NO se borra de la base", totalAntes + " -> " + totalDespues);
  const anulado = await db.attendance.findFirst({
    where: { staffId: juan.id, voidedAt: { not: null } },
  });
  ok(Boolean(anulado), "queda marcado como anulado");
  ok(anulado?.voidedReason === "Marco con el telefono de otro", "con el motivo escrito");

  await jefe.close();
} finally {
  await browser.close();
  await db.attendance.deleteMany({ where: { userId: dueno.id } });
  await db.workSite.deleteMany({ where: { userId: dueno.id } });
  await db.user.delete({ where: { id: dueno.id } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
