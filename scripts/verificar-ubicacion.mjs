/**
 * Comprueba en un navegador la ubicación durante la jornada y el botón "Llegué".
 *
 * Lo que se prueba:
 *   - El administrador activa el pedido de ubicación en la Planilla.
 *   - La empleada marca su entrada, se le pregunta si acepta, acepta, y su
 *     ubicación llega al servidor.
 *   - Marca "Llegué" a una obra y queda con la distancia al sitio.
 *   - El administrador ve el mapa, la llegada y la última ubicación.
 *   - Puede dejar de compartir, y al marcar la salida ya no se comparte nada.
 *
 * Antes:   npm run build && npm start
 * Después: npm run verificar:ubicacion
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
const esperarHasta = async (fn, ms = 20000) => {
  const fin = Date.now() + ms;
  let v = await fn();
  while (!v && Date.now() < fin) {
    await new Promise((r) => setTimeout(r, 500));
    v = await fn();
  }
  return v;
};

const S = "ubic-" + Date.now();
const clave = bcrypt.hashSync("demo1234", 10);
const listo = { onboardingDoneAt: new Date(), tourDoneAt: new Date() };
const cuenta = await db.user.create({
  data: {
    email: "jefe-" + S + "@test.local",
    passwordHash: clave,
    ownerName: "Jefe",
    businessName: "Obras " + S,
    businessType: "ASISTENCIA",
    slug: "obras-" + S,
    staff: {
      create: [
        { name: "Jefe", role: "DUENO", ...listo },
        { name: "Rosa Campo", role: "VENDEDOR", email: "rosa-" + S + "@test.local", passwordHash: clave, color: "#16a34a", ...listo },
      ],
    },
    sites: { create: { name: "Obra Norte", lat: 4.65, lng: -74.058, radiusM: 150 } },
  },
  include: { staff: true },
});
const rosa = cuenta.staff.find((s) => s.name === "Rosa Campo");

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
const sinDesborde = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

try {
  console.log("\n1. El administrador activa el pedido de ubicación");
  const ctxJefe = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const jefe = await entrar(ctxJefe, cuenta.email);
  await jefe.goto(BASE + "/panel/planilla", { waitUntil: "networkidle" });
  await jefe.locator("[data-interruptor-seguimiento]").check();
  ok(Boolean(await esperarHasta(async () => (await db.user.findUnique({ where: { id: cuenta.id } }))?.liveTracking === true)), "queda activado");

  console.log("\n2. La empleada marca su entrada y acepta compartir su ubicación");
  const ctxRosa = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: 4.6505, longitude: -74.0585, accuracy: 15 },
    permissions: ["geolocation"],
  });
  const tel = await entrar(ctxRosa, rosa.email);
  await tel.goto(BASE + "/panel/marcar", { waitUntil: "networkidle" });
  ok((await tel.locator("[data-consentimiento-ubicacion]").count()) === 0, "antes de la entrada no se pregunta nada");
  await tel.getByRole("button", { name: /Marcar entrada/ }).click();
  ok(Boolean(await esperarHasta(() => tel.getByText("Entrada registrada").count())), "marca la entrada");
  const pregunta = tel.locator("[data-consentimiento-ubicacion]");
  ok(Boolean(await esperarHasta(() => pregunta.count())), "se le pregunta si acepta, explicando qué implica");
  if (DIR) await tel.screenshot({ path: DIR + "/ubicacion-consentimiento.png", fullPage: true });
  await pregunta.getByRole("button", { name: "Acepto compartir mi ubicación" }).click();
  ok(Boolean(await esperarHasta(() => tel.locator('[data-seguimiento="compartiendo"]').count())), "se ve que está compartiendo");
  ok(Boolean(await esperarHasta(async () => (await db.staff.findUnique({ where: { id: rosa.id } }))?.locationConsentAt)), "queda guardado que aceptó");
  ok(Boolean(await esperarHasta(() => db.locationPing.count({ where: { staffId: rosa.id } }), 40000)), "su ubicación llega al servidor");

  console.log("\n3. Marca que llegó a la obra");
  await tel.getByRole("button", { name: "Llegué a una visita" }).click();
  // Exactos: el selector de "¿Dónde estás?" tiene una opción "Sin sitio".
  await tel.getByLabel("Sitio", { exact: true }).selectOption({ label: "Obra Norte" });
  await tel.getByLabel("Nota", { exact: true }).fill("Entrega de material");
  await tel.getByRole("button", { name: "Marcar llegada" }).click();
  ok(Boolean(await esperarHasta(() => tel.getByText(/Llegada registrada/).count())), "confirma la llegada");
  const avisoLlegada = await tel.getByText(/Llegada registrada/).textContent().catch(() => "");
  const llegada = await esperarHasta(() => db.siteVisit.findFirst({ where: { staffId: rosa.id } }));
  const entrada = await db.attendance.findFirst({ where: { staffId: rosa.id, kind: "ENTRADA" } });
  ok(
    typeof llegada?.distanceM === "number" && llegada.distanceM < 150,
    "queda con la distancia a la obra",
    JSON.stringify({ aviso: avisoLlegada, sitio: llegada?.siteId, lat: llegada?.lat, lng: llegada?.lng, distancia: llegada?.distanceM, latEntrada: entrada?.lat })
  );
  await tel.reload({ waitUntil: "networkidle" });
  ok((await tel.locator("[data-llegadas]").getByText(/Obra Norte/).count()) === 1, "aparece en sus llegadas de hoy");
  ok(await sinDesborde(tel), "en celular nada se sale en Marcar");
  if (DIR) await tel.screenshot({ path: DIR + "/ubicacion-marcar.png", fullPage: true });

  console.log("\n4. El administrador ve el mapa y la llegada");
  await jefe.reload({ waitUntil: "networkidle" });
  ok(Boolean(await esperarHasta(() => jefe.locator("[data-mapa-equipo].leaflet-container").count())), "aparece el mapa del equipo");
  ok((await jefe.locator("[data-llegadas-planilla]").getByText(/Rosa Campo/).count()) === 1, "con la llegada de Rosa a la obra");
  ok((await jefe.getByText(/ubicación a las/).count()) >= 1, "y la hora de su última ubicación");
  if (DIR) await jefe.screenshot({ path: DIR + "/ubicacion-planilla.png", fullPage: true });

  console.log("\n5. Dejar de compartir y marcar la salida");
  await tel.locator('[data-seguimiento]').getByRole("button", { name: "Dejar de compartir" }).click();
  ok(Boolean(await esperarHasta(async () => (await db.staff.findUnique({ where: { id: rosa.id } }))?.locationConsentAt === null)), "retirar el permiso queda guardado");
  ok(Boolean(await esperarHasta(async () => (await tel.locator("[data-seguimiento]").count()) === 0)), "y deja de compartir");
  await tel.getByRole("button", { name: /Marcar salida/ }).click();
  ok(Boolean(await esperarHasta(() => tel.getByText("Salida registrada").count())), "marca la salida");
  ok((await tel.locator("[data-consentimiento-ubicacion], [data-seguimiento]").count()) === 0, "después de la salida no se pide ni se comparte nada");

  console.log("\n6. Errores durante el recorrido");
  ok(errores.length === 0, "ninguna excepción ni error 500", errores.slice(0, 3).join(" | "));
  await ctxRosa.close();
  await ctxJefe.close();
} finally {
  await browser.close();
  await db.user.delete({ where: { id: cuenta.id } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
