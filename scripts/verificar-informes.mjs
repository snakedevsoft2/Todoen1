/**
 * Comprueba los reportes de visita y la planilla en PDF, en un navegador.
 *
 * Lo que se prueba aqui es lo que solo se ve navegando: crear el reporte,
 * subir fotos desde el telefono, que las fotos NO se vean desde otra cuenta ni
 * sin sesion, que el PDF salga con las fotos y con el personal que marco en el
 * sitio, y que la planilla salga en PDF con las horas bien.
 *
 * IMPORTANTE: el servidor tiene que correr con TZ=UTC, que es como corre
 * Vercel. Asi se ve si alguna hora se corre por usar la zona del servidor en
 * vez de la del negocio:
 *
 *   TZ=UTC npm start
 *   npm run verificar:informes
 */
import "dotenv/config";
import fs from "node:fs";
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

const S = "inf-" + Date.now();
const hoy = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const cuenta = await db.user.create({
  data: {
    email: "jefe-" + S + "@test.local",
    passwordHash: bcrypt.hashSync("demo1234", 10),
    ownerName: "Jefe",
    businessName: "Aseo Total " + S,
    businessType: "ASISTENCIA",
    slug: "aseo-" + S,
    staff: {
      create: [
        { name: "Jefe", role: "DUENO" },
        { name: "Pedro Operario", email: "pedro-" + S + "@test.local", passwordHash: bcrypt.hashSync("demo1234", 10), role: "VENDEDOR" },
      ],
    },
  },
  include: { staff: true },
});
const pedro = cuenta.staff.find((s) => s.name === "Pedro Operario");
const otra = await db.user.create({
  data: {
    email: "otra-" + S + "@test.local",
    passwordHash: bcrypt.hashSync("demo1234", 10),
    ownerName: "Otra",
    businessName: "Otra " + S,
    businessType: "ASISTENCIA",
    slug: "otra-" + S,
    staff: { create: { name: "Otra", role: "DUENO" } },
  },
});

const sitio = await db.workSite.create({
  data: { userId: cuenta.id, name: "Edificio Los Cedros", address: "Calle 80 #12-30", lat: 4.65, lng: -74.058 },
});

// Pedro marco en el sitio a las 8:00 y a las 17:00 hora de Bogota (13:00 y
// 22:00 UTC). Si alguna pantalla usa la hora del servidor, saldra 01:00 p. m.
await db.attendance.createMany({
  data: [
    { userId: cuenta.id, staffId: pedro.id, siteId: sitio.id, kind: "ENTRADA", markedAt: new Date(hoy + "T13:00:00Z"), clientKey: S + "-e", distanceM: 10 },
    { userId: cuenta.id, staffId: pedro.id, siteId: sitio.id, kind: "SALIDA", markedAt: new Date(hoy + "T22:00:00Z"), clientKey: S + "-s", distanceM: 12 },
  ],
});

const browser = await chromium.launch({ channel: "msedge" });

async function entrar(ctx, correo) {
  const p = await ctx.newPage();
  await p.goto(BASE + "/login", { waitUntil: "networkidle" });
  await p.fill('input[name="email"]', correo);
  await p.fill('input[name="password"]', "demo1234");
  await p.click('button[type="submit"]');
  await p.waitForURL(/\/panel|\/bienvenida/, { timeout: 25000 });
  return p;
}

async function bajarPdf(page, boton) {
  const [descarga] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), boton.click()]);
  return fs.readFileSync(await descarga.path()).toString("latin1");
}

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await entrar(ctx, cuenta.email);

  console.log("\n1. Crear un reporte de visita");
  await page.goto(BASE + "/panel/informes", { waitUntil: "networkidle" });
  await page.fill('input[name="title"]', "Limpieza de fachada");
  await page.locator('select[name="siteId"]').selectOption(sitio.id);
  await page.fill('input[name="clientName"]', "Administracion Cedros");
  await page.fill('input[name="clientPhone"]', "3001234567");
  await page.fill('textarea[name="body"]', "Se limpio la fachada norte y se cambiaron dos luminarias.");
  await page.getByRole("button", { name: /Crear reporte/i }).click();
  await page.waitForURL(/\/panel\/informes\/[^/]+$/, { timeout: 20000 });
  const informe = await db.visitReport.findFirst({ where: { userId: cuenta.id } });
  ok(Boolean(informe), "el reporte quedo guardado");
  ok(informe?.createdByStaffId === cuenta.staff.find((s) => s.role === "DUENO").id, "a nombre de quien lo creo");

  console.log("\n2. El personal sale de los marcajes, con la hora del negocio");
  const ficha = await page.textContent("body");
  ok(/Pedro Operario/.test(ficha), "aparece quien marco en el sitio ese dia");
  ok(/08:00/.test(ficha), "con la entrada a las 8:00 (hora de Bogota, no la del servidor)");
  ok(/05:00/.test(ficha), "y la salida a las 5:00 p. m.");

  console.log("\n3. Subir fotos desde el telefono");
  await page.evaluate(async () => {
    const hacer = (color, w, h) =>
      new Promise((resolve) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const x = c.getContext("2d");
        x.fillStyle = color;
        x.fillRect(0, 0, w, h);
        x.fillStyle = "#fff";
        x.fillRect(w / 4, h / 4, w / 2, h / 2);
        c.toBlob((b) => resolve(new File([b], color.slice(1) + ".png", { type: "image/png" })), "image/png");
      });
    const dt = new DataTransfer();
    dt.items.add(await hacer("#2a6", 800, 600));
    dt.items.add(await hacer("#a26", 600, 900));
    const input = document.getElementById("fotos-informe");
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  let fotos = 0;
  for (let i = 0; i < 40 && fotos < 2; i += 1) {
    fotos = await db.visitPhoto.count({ where: { reportId: informe.id } });
    if (fotos < 2) await page.waitForTimeout(500);
  }
  ok(fotos === 2, "subieron las dos fotos", String(fotos));

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const pintadas = await page.evaluate(() =>
    Array.from(document.querySelectorAll('img[src^="/foto-reporte/"]')).filter((i) => i.naturalWidth > 0).length
  );
  ok(pintadas === 2, "las fotos se ven en la ficha", String(pintadas));
  if (DIR) await page.screenshot({ path: DIR + "/informe-ficha.png" });

  console.log("\n4. Las fotos son privadas");
  const unaFoto = await db.visitPhoto.findFirst({ where: { reportId: informe.id } });
  const anonimo = await browser.newContext();
  const sinSesion = await anonimo.request.get(BASE + "/foto-reporte/" + unaFoto.id, { maxRedirects: 0 });
  ok(sinSesion.status() === 401, "sin sesion no se ve", String(sinSesion.status()));
  await anonimo.close();

  const ctxOtra = await browser.newContext();
  const pOtra = await entrar(ctxOtra, otra.email);
  const deOtra = await pOtra.request.get(BASE + "/foto-reporte/" + unaFoto.id);
  ok(deOtra.status() === 404, "desde otra cuenta responde como si no existiera", String(deOtra.status()));
  await ctxOtra.close();

  console.log("\n5. El PDF del reporte");
  const pdf = await bajarPdf(page, page.getByRole("button", { name: /Descargar PDF/i }));
  ok(pdf.startsWith("%PDF"), "es un PDF");
  const imagenes = (pdf.match(/\/Subtype\s*\/Image/g) ?? []).length;
  ok(imagenes >= 2, "lleva las fotos adentro", imagenes + " imagenes");
  ok(pdf.includes("Limpieza de fachada"), "lleva el titulo");
  ok(pdf.includes("Pedro Operario"), "lleva al personal que marco");
  ok(pdf.includes("Administracion Cedros"), "lleva el cliente");
  ok(
    await page.getByRole("button", { name: /Enviar por WhatsApp/i }).isVisible(),
    "tiene el boton de enviar por WhatsApp"
  );

  console.log("\n6. La planilla en pantalla y en PDF");
  await page.goto(BASE + "/panel/planilla?r=semana", { waitUntil: "networkidle" });
  const planilla = await page.textContent("body");
  ok(/Pedro Operario/.test(planilla), "aparece la persona");
  ok(/08:00/.test(planilla), "con la hora de Bogota");
  if (DIR) await page.screenshot({ path: DIR + "/planilla-exportar.png" });

  const pdfPlanilla = await bajarPdf(page, page.getByRole("button", { name: /Descargar planilla/i }));
  ok(pdfPlanilla.startsWith("%PDF"), "la planilla es un PDF");
  ok(pdfPlanilla.includes("Pedro Operario"), "con la persona");
  ok(pdfPlanilla.includes("9 h"), "y sus 9 horas de trabajo");
  const caja = /MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/.exec(pdfPlanilla);
  ok(caja && Number(caja[1]) > Number(caja[2]), "horizontal, porque son seis columnas");

  console.log("\n7. Un empleado no puede borrar el reporte");
  const ctxPedro = await browser.newContext();
  const pPedro = await entrar(ctxPedro, pedro.email);
  await pPedro.goto(BASE + "/panel/informes/" + informe.id, { waitUntil: "networkidle" });
  ok(
    (await pPedro.getByRole("button", { name: /Borrar reporte/i }).count()) === 0,
    "no ve el boton de borrar"
  );
  await ctxPedro.close();

  await ctx.close();
} finally {
  await browser.close();
  for (const id of [cuenta.id, otra.id]) {
    await db.attendance.deleteMany({ where: { userId: id } });
    await db.visitReport.deleteMany({ where: { userId: id } });
    await db.workSite.deleteMany({ where: { userId: id } });
    await db.user.delete({ where: { id } }).catch(() => {});
  }
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
