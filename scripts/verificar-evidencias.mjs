/**
 * Comprueba los reportes en PDF con evidencias, en un navegador.
 *
 * Lo que se prueba: armar un reporte con foto descrita, observaciones y un
 * PDF de evidencia; que el PDF exportado lleve el reporte con el logo y, al
 * final, las paginas del anexo; y que desde la ficha se pueda agregar y quitar
 * evidencias, rechazando un archivo que no es PDF.
 *
 * Antes:   npm run build && TZ=UTC npm start
 * Despues: npm run verificar:evidencias
 */
import "dotenv/config";
import fs from "node:fs";
import { deflateSync, crc32 } from "node:zlib";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import { PDFDocument, StandardFonts } from "pdf-lib";
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
const esperarHasta = async (fn, ms = 25000) => {
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
  for (let i = 0; i < filas.length; i++) if (i % (ancho * 3 + 1) !== 0) filas[i] = (i * 7) % 256;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", cab),
    trozo("IDAT", deflateSync(filas)),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}

async function pdfDePrueba(paginas, texto) {
  const doc = await PDFDocument.create();
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < paginas; i++) {
    doc.addPage([595, 842]).drawText(texto + " " + (i + 1), { x: 60, y: 760, size: 24, font: fuente });
  }
  return Buffer.from(await doc.save());
}

const S = "evid-" + Date.now();
const logo = "data:image/png;base64," + png(80, 80).toString("base64");
const cuenta = await db.user.create({
  data: {
    email: "evid-" + S + "@test.local",
    passwordHash: bcrypt.hashSync("demo1234", 10),
    ownerName: "Admin Evidencias",
    businessName: "Obras " + S,
    businessType: "ASISTENCIA",
    slug: "obras-" + S,
    logo,
    staff: {
      create: [
        { name: "Admin Evidencias", role: "DUENO", onboardingDoneAt: new Date(), tourDoneAt: new Date() },
        {
          name: "Rosa Otra",
          role: "VENDEDOR",
          email: "rosa-" + S + "@test.local",
          passwordHash: bcrypt.hashSync("demo1234", 10),
          onboardingDoneAt: new Date(),
        },
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
  page.on("dialog", (d) => d.accept());
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel/, { timeout: 25000 });
  return page;
}

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 }, acceptDownloads: true });
  const page = await entrar(ctx, cuenta.email);

  console.log("\n1. Armar el reporte con foto, observaciones y un PDF");
  await page.goto(BASE + "/panel/informes", { waitUntil: "networkidle" });
  await page.fill('input[name="title"]', "Informe con anexos");
  await page.fill('textarea[name="body"]', "Se cambio la bajante principal.");
  await page.fill('textarea[name="observations"]', "Revisar la bajante antes de lluvias.");
  await page.locator('input[name="fotos-reporte"]').setInputFiles({ name: "fachada.png", mimeType: "image/png", buffer: png(200, 150) });
  await page.waitForSelector('img[alt="Foto 1"]', { timeout: 15000 });
  await page.getByLabel("Descripción de la foto 1").fill("Fachada norte");
  const acta = await pdfDePrueba(2, "ANEXO DE PRUEBA");
  await page.locator('input[name="evidencias-pdf"]').setInputFiles({ name: "acta.pdf", mimeType: "application/pdf", buffer: acta });
  await page.getByText("acta.pdf").waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: /Guardar reporte/i }).click();

  const informe = await esperarHasta(() =>
    db.visitReport.findFirst({ where: { userId: cuenta.id, sentAt: { not: null } }, include: { photos: true, attachments: true } })
  );
  ok(Boolean(informe), "el reporte llega completo");
  ok(informe?.observations === "Revisar la bajante antes de lluvias.", "con las observaciones");
  ok(informe?.photos[0]?.caption === "Fachada norte", "la foto con su descripción", String(informe?.photos[0]?.caption));
  ok(informe?.attachments.length === 1 && informe.attachments[0].name === "acta.pdf", "y el PDF de evidencia");

  console.log("\n2. La ficha y el PDF exportado");
  await page.goto(BASE + "/panel/informes/" + informe.id, { waitUntil: "networkidle" });
  ok((await page.locator("[data-adjuntos]").getByText("acta.pdf").count()) === 1, "la ficha lista el anexo");
  ok((await page.getByText("Revisar la bajante antes de lluvias.").count()) > 0, "y muestra las observaciones");
  const servido = await page.request.get(BASE + "/adjunto-reporte/" + informe.attachments[0].id);
  ok(
    servido.status() === 200 && (servido.headers()["content-type"] ?? "").includes("application/pdf") && (await servido.body()).subarray(0, 4).toString() === "%PDF",
    "el anexo se abre como PDF"
  );

  const [descarga] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.getByRole("button", { name: /Descargar PDF/i }).click()]);
  const bytes = fs.readFileSync(await descarga.path());
  const final = await PDFDocument.load(bytes);
  const texto = bytes.toString("latin1");
  ok(final.getPageCount() >= 3, "el PDF trae el reporte y las 2 paginas del anexo al final", final.getPageCount() + " paginas");
  ok(texto.includes("Informe con anexos"), "con el titulo");
  ok(texto.includes("Observaciones y recomendaciones"), "con las observaciones");
  // En el PDF los parentesis van escapados: "Anexos (1)" se guarda como "Anexos \(1\)".
  ok(texto.includes("Anexo 1: acta.pdf"), "y la lista de anexos");
  ok(texto.includes("Fachada norte"), "y la descripción de la foto");
  ok(/\/Subtype\s*\/Image/.test(texto), "con imagenes (logo y foto)");

  console.log("\n3. Agregar y quitar evidencias desde la ficha");
  const otro = await pdfDePrueba(1, "SEGUNDO");
  await page.locator('input[name="adjuntar-pdf"]').setInputFiles({ name: "factura.pdf", mimeType: "application/pdf", buffer: otro });
  ok(Boolean(await esperarHasta(() => db.visitAttachment.count({ where: { reportId: informe.id } }).then((n) => n === 2))), "se agrega un segundo PDF");

  await page.reload({ waitUntil: "networkidle" });
  await page.locator('input[name="adjuntar-pdf"]').setInputFiles({ name: "trampa.pdf", mimeType: "application/pdf", buffer: Buffer.from("<html>no soy pdf</html>") });
  await page.getByText(/no es un PDF válido/i).waitFor({ timeout: 10000 }).catch(() => {});
  ok((await page.getByText(/no es un PDF válido/i).count()) > 0, "un archivo que no es PDF se rechaza con aviso");
  ok((await db.visitAttachment.count({ where: { reportId: informe.id } })) === 2, "y no se guarda");

  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Quitar factura.pdf" }).click();
  ok(Boolean(await esperarHasta(() => db.visitAttachment.count({ where: { reportId: informe.id } }).then((n) => n === 1))), "se puede quitar");

  console.log("\n4. Un empleado no abre las evidencias del administrador");
  const ctxRosa = await browser.newContext();
  const rosa = await entrar(ctxRosa, "rosa-" + S + "@test.local");
  const ajeno = await rosa.request.get(BASE + "/adjunto-reporte/" + informe.attachments[0].id);
  ok(ajeno.status() === 404, "responde que no existe", String(ajeno.status()));
  await ctxRosa.close();

  console.log("\n5. Errores durante el recorrido");
  ok(errores.length === 0, "ninguna excepcion ni error 500", errores.slice(0, 3).join(" | "));
  await ctx.close();
} finally {
  await browser.close();
  await db.user.delete({ where: { id: cuenta.id } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
