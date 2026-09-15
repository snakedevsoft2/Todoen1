/**
 * Comprueba el gestor de asistencia de punta a punta, como lo usan de verdad.
 *
 * Lo que se prueba: que las tarjetas del registro no se salgan; que el
 * empleado solo tenga sus pantallas y no pueda abrir las demas; una entrada y
 * una salida por dia; una novedad y un reporte con foto hechos SIN SEÑAL que
 * se suben solos al volver; la foto de perfil; y que el administrador vea lo
 * nuevo en su resumen, lo apruebe, y descargue las horas en Excel.
 *
 * Antes:   npm run build && TZ=UTC npm start
 * Despues: npm run verificar:gestor
 */
import "dotenv/config";
import { deflateSync, crc32 } from "node:zlib";
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

function png(ancho, alto) {
  const trozo = (tipo, datos) => {
    const largo = Buffer.alloc(4);
    largo.writeUInt32BE(datos.length);
    const cuerpo = Buffer.concat([Buffer.from(tipo), datos]);
    const suma = Buffer.alloc(4);
    suma.writeUInt32BE(crc32(cuerpo) >>> 0);
    return Buffer.concat([largo, cuerpo, suma]);
  };
  const cab = Buffer.alloc(13);
  cab.writeUInt32BE(ancho, 0);
  cab.writeUInt32BE(alto, 4);
  cab[8] = 8;
  cab[9] = 2;
  const filas = Buffer.alloc((ancho * 3 + 1) * alto);
  for (let i = 0; i < filas.length; i++) if (i % (ancho * 3 + 1) !== 0) filas[i] = Math.floor(Math.random() * 256);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", cab),
    trozo("IDAT", deflateSync(filas)),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}
const archivo = (n) => ({ name: n + ".png", mimeType: "image/png", buffer: png(160, 120) });

const S = "gestor-" + Date.now();
const clave = bcrypt.hashSync("demo1234", 10);
const listo = { onboardingDoneAt: new Date(), tourDoneAt: new Date() };
const AQUI = { latitude: 4.6765, longitude: -74.0482 };

const cuenta = await db.user.create({
  data: {
    // Con pago: solo la cuenta que pago instala la app y la usa sin senal.
    paidUntil: new Date(Date.now() + 30 * 86_400_000),
    email: "admin-" + S + "@test.local",
    passwordHash: clave,
    ownerName: "Admin Gestor",
    businessName: "Aseo " + S,
    businessType: "ASISTENCIA",
    slug: "aseo-" + S,
    timezone: "America/Bogota",
    staff: {
      create: [
        { name: "Admin Gestor", role: "DUENO", ...listo },
        { name: "Juan Operario", role: "VENDEDOR", email: "juan-" + S + "@test.local", passwordHash: clave, ...listo },
        { name: "Rosa Operaria", role: "VENDEDOR", email: "rosa-" + S + "@test.local", passwordHash: clave, ...listo },
      ],
    },
  },
  include: { staff: true },
});
const juan = cuenta.staff.find((s) => s.name === "Juan Operario");
await db.workSite.create({
  data: { userId: cuenta.id, name: "Obra 80", lat: AQUI.latitude, lng: AQUI.longitude, radiusM: 200 },
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
  console.log("\n1. El registro no se sale de las casillas");
  for (const ancho of [1280, 390]) {
    const p = await browser.newPage({ viewport: { width: ancho, height: 900 } });
    await p.goto(BASE + "/registro", { waitUntil: "networkidle" });
    const desbordes = await p.evaluate(() =>
      [...document.querySelectorAll("[data-tipo] span")]
        .filter((s) => s.scrollWidth > s.clientWidth + 1)
        .map((s) => s.textContent)
    );
    ok(desbordes.length === 0, "a " + ancho + " px ningun texto se sale", desbordes.join(", "));
    if (ancho === 1280) ok((await p.getByText("Barbería", { exact: true }).count()) === 1, "con tildes");
    if (DIR) await p.screenshot({ path: DIR + "/gestor-registro-" + ancho + ".png" });
    await p.close();
  }

  const cel = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: AQUI,
    permissions: ["geolocation"],
  });
  const tel = await entrar(cel, juan.email);

  console.log("\n2. El empleado solo tiene sus pantallas");
  await tel.waitForURL(/\/panel\/marcar/, { timeout: 15000 }).catch(() => {});
  ok(tel.url().includes("/panel/marcar"), "al entrar llega directo a Marcar", tel.url());
  for (const ruta of ["/panel", "/panel/ventas", "/panel/planilla", "/panel/ajustes", "/panel/equipo"]) {
    await tel.goto(BASE + ruta, { waitUntil: "networkidle" });
    ok(tel.url().endsWith("/panel/marcar"), ruta + " lo devuelve a Marcar", tel.url());
  }
  const enlaces = await tel.evaluate(() => [...new Set([...document.querySelectorAll("nav a")].map((a) => a.getAttribute("href")))]);
  ok(
    enlaces.every((h) => ["/panel/marcar", "/panel/novedades", "/panel/informes", "/panel/escaner", "/panel/perfil"].includes(h)),
    "su menu es Marcar, Novedades, Reportes, Escáner y Perfil",
    enlaces.join(" ")
  );

  console.log("\n3. Una entrada y una salida por dia");
  await tel.getByRole("button", { name: /Marcar entrada/i }).click();
  ok(Boolean(await esperarHasta(() => db.attendance.count({ where: { staffId: juan.id } }).then((n) => n === 1))), "la entrada llega");
  await tel.waitForTimeout(4500);
  await tel.getByRole("button", { name: /Marcar salida/i }).click();
  ok(Boolean(await esperarHasta(() => db.attendance.count({ where: { staffId: juan.id } }).then((n) => n === 2))), "la salida llega");
  await tel.waitForTimeout(4500);
  ok(await tel.locator("[data-jornada-completa]").isVisible(), "queda la jornada completa, sin boton");
  await tel.reload({ waitUntil: "networkidle" });
  ok((await tel.getByRole("button", { name: /Marcar (entrada|salida)/i }).count()) === 0, "al recargar no aparece otro boton");
  const trampa = await tel.evaluate(async () => {
    const r = await fetch("/api/asistencia/lote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marcajes: [{ clientKey: "otra-" + Math.random(), kind: "ENTRADA", markedAt: new Date().toISOString() }] }),
    });
    return (await r.json()).resultados?.[0];
  });
  ok(trampa?.estado === "rechazado" && /Ya marcaste la entrada/.test(trampa.motivo), "el servidor rechaza una segunda entrada", JSON.stringify(trampa));
  if (DIR) await tel.screenshot({ path: DIR + "/gestor-marcar.png", fullPage: true });

  console.log("\n4. Una novedad sin señal se envia sola");
  await tel.goto(BASE + "/panel/novedades", { waitUntil: "networkidle" });
  await cel.setOffline(true);
  await tel.evaluate(() => window.dispatchEvent(new Event("offline")));
  await tel.getByRole("radio", { name: "Llegada tarde" }).click();
  await tel.fill('input[name="fromTime"]', "08:00");
  await tel.fill('input[name="toTime"]', "10:00");
  await tel.fill('textarea[name="reason"]', "Trancón en la autopista norte");
  await tel.getByRole("button", { name: /Avisar al administrador/i }).click();
  await tel.waitForTimeout(1200);
  ok(await tel.locator("[data-novedades-pendientes]").isVisible(), "queda por enviar en el telefono");
  ok((await db.novelty.count({ where: { staffId: juan.id } })) === 0, "todavia no llega");
  await cel.setOffline(false);
  await tel.evaluate(() => window.dispatchEvent(new Event("online")));
  const novedad = await esperarHasta(() => db.novelty.findFirst({ where: { staffId: juan.id } }));
  ok(novedad?.kind === "LLEGADA_TARDE" && novedad?.status === "PENDIENTE", "al volver la señal llega pendiente de revisar");

  console.log("\n5. Un reporte con foto sin señal se envia solo");
  await tel.goto(BASE + "/panel/informes", { waitUntil: "networkidle" });
  await cel.setOffline(true);
  await tel.evaluate(() => window.dispatchEvent(new Event("offline")));
  await tel.fill('input[name="title"]', "Visita obra 80");
  await tel.fill('textarea[name="body"]', "Se limpiaron los vidrios del piso 3.");
  await tel.locator('input[name="fotos-reporte"]').setInputFiles(archivo("vidrios"));
  await tel.waitForSelector('img[alt="Foto 1"]', { timeout: 15000 });
  await tel.getByRole("button", { name: /Enviar al administrador/i }).click();
  await tel.waitForTimeout(1200);
  ok(await tel.locator("[data-reportes-pendientes]").isVisible(), "queda esperando señal");
  ok((await db.visitReport.count({ where: { userId: cuenta.id } })) === 0, "todavia no llega");
  await cel.setOffline(false);
  await tel.evaluate(() => window.dispatchEvent(new Event("online")));
  const reporte = await esperarHasta(() => db.visitReport.findFirst({ where: { userId: cuenta.id, sentAt: { not: null } } }), 30000);
  ok(Boolean(reporte), "al volver la señal llega completo");
  ok((await db.visitPhoto.count({ where: { reportId: reporte?.id } })) === 1, "con su foto");

  console.log("\n6. Foto de perfil");
  await tel.goto(BASE + "/panel/perfil", { waitUntil: "networkidle" });
  await tel.locator('input[name="archivo-foto"]').setInputFiles(archivo("cara"));
  await tel.waitForSelector("img[data-foto-perfil]", { timeout: 10000 });
  await tel.getByRole("button", { name: /Guardar mi perfil/i }).click();
  const conFoto = await esperarHasta(() => db.staff.findUnique({ where: { id: juan.id } }).then((s) => (s.photo?.length ?? 0) > 500));
  ok(Boolean(conFoto), "la foto se guarda");

  console.log("\n7. El administrador");
  const pc = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const jefe = await entrar(pc, cuenta.email);
  await jefe.goto(BASE + "/panel", { waitUntil: "networkidle" });
  const resumen = await jefe.textContent("body");
  ok(!/Ventas del día|Registrar venta/.test(resumen), "su resumen no habla de ventas");
  ok((await jefe.locator("[data-reportes-nuevos]").getByText("Visita obra 80").count()) === 1, "ve el reporte nuevo");
  ok((await jefe.locator("[data-novedades-por-revisar]").getByText("Juan Operario").count()) === 1, "ve la novedad por revisar");
  ok((await jefe.locator('[data-persona] img[src^="/foto-perfil/"]').count()) === 1, "ve la foto de perfil de Juan");
  if (DIR) await jefe.screenshot({ path: DIR + "/gestor-resumen.png", fullPage: true });

  await jefe.goto(BASE + "/panel/informes", { waitUntil: "networkidle" });
  ok((await jefe.getByText("Nuevo", { exact: true }).count()) === 1, "en Reportes sale marcado como nuevo");
  await jefe.goto(BASE + "/panel/informes/" + reporte.id, { waitUntil: "networkidle" });
  ok(Boolean((await db.visitReport.findUnique({ where: { id: reporte.id } })).seenAt), "al abrirlo queda visto");
  await tel.goto(BASE + "/panel/informes", { waitUntil: "networkidle" });
  ok((await tel.getByText("Visto", { exact: true }).count()) === 1, "y Juan ve que ya se lo miraron");

  await jefe.goto(BASE + "/panel/novedades", { waitUntil: "networkidle" });
  await jefe.locator("[data-novedad]").first().getByRole("button", { name: "Aprobar" }).click();
  ok(Boolean(await esperarHasta(() => db.novelty.findUnique({ where: { id: novedad.id } }).then((n) => n.status === "APROBADA"))), "aprueba la novedad");

  await jefe.goto(BASE + "/panel/equipo", { waitUntil: "networkidle" });
  const equipo = await jefe.textContent("body");
  ok(!/Comisi|Vendido este mes|Puede vender/.test(equipo), "Personal no habla de ventas ni comisiones");
  ok(/Marcaron hoy/.test(equipo), "y muestra quien marco hoy");

  const csv = await jefe.request.get(BASE + "/panel/planilla/exportar?r=semana");
  const texto = await csv.text();
  ok(csv.status() === 200 && /text\/csv/.test(csv.headers()["content-type"] ?? ""), "descarga las horas en CSV", String(csv.status()));
  ok(texto.includes("Juan Operario") && texto.includes("TOTAL") && texto.includes("Llegada tarde"), "con Juan, su total y su novedad");

  console.log("\n8. Otro empleado no ve lo de Juan");
  const otro = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const rosa = await entrar(otro, "rosa-" + S + "@test.local");
  const r = await rosa.goto(BASE + "/panel/informes/" + reporte.id, { waitUntil: "networkidle" });
  ok(r.status() === 404, "el reporte de Juan responde que no existe", String(r.status()));
  const foto = await db.visitPhoto.findFirst({ where: { reportId: reporte.id } });
  const f = await rosa.request.get(BASE + "/foto-reporte/" + foto.id);
  ok(f.status() === 404, "ni su foto", String(f.status()));
  await rosa.goto(BASE + "/panel/informes", { waitUntil: "networkidle" });
  ok((await rosa.getByText("Visita obra 80").count()) === 0, "en su lista no aparece");

  console.log("\n9. Errores durante el recorrido");
  ok(errores.length === 0, "ninguna excepcion ni error 500", errores.slice(0, 3).join(" | "));

  await otro.close();
  await pc.close();
  await cel.close();
} finally {
  await browser.close();
  await db.user.delete({ where: { id: cuenta.id } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
