/**
 * Comprueba la firma de documentos, en un navegador.
 *
 * Lo que se prueba: que el negocio cree la solicitud con un PDF, marque y
 * mueva el lugar de la firma; que el cliente, desde un celular y sin cuenta,
 * dibuje su firma, la arrastre y firme; que los firmados se descarguen de los
 * dos lados; y que otro empleado no vea la solicitud.
 *
 * Antes:   npm run build && npm start
 * Despues: npm run verificar:firmas
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import { PDFDocument, StandardFonts } from "pdf-lib";
import bcrypt from "bcryptjs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const FOTOS = process.env.FOTOS_DIR || os.tmpdir();
const db = new PrismaClient();
let fallos = 0;
const ok = (c, t, extra = "") => {
  if (c) console.log("  OK   " + t);
  else {
    fallos++;
    console.log("  MAL  " + t + (extra ? "  <- " + extra : ""));
  }
};
const esperarHasta = async (fn, ms = 30000) => {
  const fin = Date.now() + ms;
  let v = await fn();
  while (!v && Date.now() < fin) {
    await new Promise((r) => setTimeout(r, 500));
    v = await fn();
  }
  return v;
};

async function pdfDePrueba(paginas, texto) {
  const doc = await PDFDocument.create();
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < paginas; i++) {
    const p = doc.addPage([612, 792]);
    p.drawText(texto + " - pagina " + (i + 1), { x: 60, y: 720, size: 22, font: fuente });
    p.drawText("Firma: ______________________", { x: 330, y: 120, size: 12, font: fuente });
  }
  return Buffer.from(await doc.save());
}

const S = "firm-" + Date.now();
const cuenta = await db.user.create({
  data: {
    email: "firm-" + S + "@test.local",
    passwordHash: bcrypt.hashSync("demo1234", 10),
    ownerName: "Admin Firmas",
    businessName: "Obras " + S,
    businessType: "ASISTENCIA",
    slug: "obras-" + S,
    staff: {
      create: [
        { name: "Admin Firmas", role: "DUENO", onboardingDoneAt: new Date(), tourDoneAt: new Date() },
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
const vigilar = (page) => {
  page.on("pageerror", (e) => errores.push("pageerror: " + e.message));
  page.on("response", (r) => r.status() >= 500 && errores.push(r.status() + " " + r.url()));
  page.on("dialog", (d) => d.accept());
};
async function entrar(ctx, email) {
  const page = await ctx.newPage();
  vigilar(page);
  // La bienvenida del ingreso tapa el formulario la primera vez.
  await page.addInitScript(() => localStorage.setItem("todoen1_onboarding_seen", "true"));
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel/, { timeout: 120000 });
  return page;
}

/** Que el lienzo de la pagina ya tenga algo dibujado (pdf.js termino). */
const paginaDibujada = (page, n = 0) =>
  page.waitForFunction(
    (i) => {
      const c = document.querySelectorAll("canvas")[i];
      if (!c || !c.width) return false;
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      for (let k = 3; k < d.length; k += 4 * 97) if (d[k] > 0) return true;
      return false;
    },
    n,
    { timeout: 40000 }
  );

async function arrastrar(page, locator, dx, dy) {
  const caja = await locator.boundingBox();
  const x = caja.x + caja.width / 2;
  const y = caja.y + caja.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + (dx * i) / 8, y + (dy * i) / 8);
  await page.mouse.up();
}

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 }, acceptDownloads: true });
  const page = await entrar(ctx, cuenta.email);

  console.log("\n1. El negocio crea la solicitud");
  await page.goto(BASE + "/panel/firmas", { waitUntil: "networkidle" });
  await page.fill('input[name="title"]', "Acta de entrega");
  await page.fill('input[name="signerName"]', "Carlos Cliente");
  await page.fill('input[name="signerPhone"]', "3001234567");
  await page.locator("[data-nueva-firma] input[type=file]").setInputFiles({
    name: "acta.pdf",
    mimeType: "application/pdf",
    buffer: await pdfDePrueba(2, "ACTA DE PRUEBA"),
  });
  await page.getByRole("button", { name: /Crear y seguir/ }).click();
  await page.waitForURL(/\/panel\/firmas\/[a-z0-9]+$/, { timeout: 40000 });
  const sol = await db.signRequest.findFirst({ where: { userId: cuenta.id }, include: { documents: true } });
  ok(sol?.documents.length === 1 && sol.documents[0].pages === 2, "queda con su PDF de 2 páginas");

  console.log("\n2. Marca y mueve dónde se firma");
  await paginaDibujada(page);
  ok(true, "el visor dibuja el PDF");
  await page.getByRole("button", { name: /Firma en esta página/ }).nth(1).click();
  await page.getByText("Guardado.").waitFor({ timeout: 15000 });
  let doc = await db.signDocument.findFirst({ where: { requestId: sol.id } });
  const antes = JSON.parse(doc.spots ?? "[]");
  ok(antes.length === 1 && antes[0].page === 2, "el lugar queda en la página 2", doc.spots);
  await arrastrar(page, page.locator("[data-firma-caja]").first(), 120, 150);
  await esperarHasta(async () => {
    doc = await db.signDocument.findFirst({ where: { requestId: sol.id } });
    return doc.spots !== JSON.stringify(antes);
  });
  const movido = JSON.parse(doc.spots ?? "[]")[0];
  ok(movido && movido.x > antes[0].x && movido.y > antes[0].y, "al arrastrarlo se mueve y se guarda", doc.spots);
  const enlace = (await page.locator("[data-enlace-firma]").textContent()).trim();
  ok(enlace.includes("/firmar/" + sol.token), "muestra el enlace para mandar");
  const wa = await page.getByRole("link", { name: "WhatsApp" }).getAttribute("href");
  ok(wa.startsWith("https://wa.me/573001234567?text="), "el WhatsApp va al número del cliente", wa);
  await page.screenshot({ path: path.join(FOTOS, "firmas-negocio.png"), fullPage: true });

  console.log("\n3. El cliente firma desde el celular, sin cuenta");
  const movil = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    acceptDownloads: true,
  });
  const cli = await movil.newPage();
  vigilar(cli);
  await cli.goto(BASE + "/firmar/" + sol.token, { waitUntil: "networkidle" });
  ok(await cli.getByText("Hola Carlos Cliente").isVisible(), "saluda al cliente");
  ok(Boolean((await db.signRequest.findUnique({ where: { id: sol.id } })).viewedAt), "el negocio sabe que lo abrió");
  const lienzo = cli.locator('canvas[aria-label="Recuadro para dibujar la firma"]');
  const r = await lienzo.boundingBox();
  await cli.mouse.move(r.x + 40, r.y + 100);
  await cli.mouse.down();
  for (let i = 0; i <= 30; i++) await cli.mouse.move(r.x + 40 + i * 9, r.y + 100 + Math.sin(i / 3) * 35);
  await cli.mouse.up();
  await cli.getByRole("button", { name: "Usar esta firma" }).click();
  await cli.locator('[data-firma-caja] img[alt="Tu firma"]').waitFor({ timeout: 10000 });
  ok(true, "la firma aparece donde marcó el negocio");
  await paginaDibujada(cli, 1);
  const cajaCli = cli.locator("[data-firma-caja]").first();
  await cajaCli.scrollIntoViewIfNeeded();
  const antesCli = await cajaCli.boundingBox();
  await arrastrar(cli, cajaCli, -80, -60);
  const despuesCli = await cajaCli.boundingBox();
  ok(despuesCli.x < antesCli.x - 40, "el cliente mueve la firma con el dedo");
  await cli.screenshot({ path: path.join(FOTOS, "firmas-cliente.png"), fullPage: true });

  await cli.getByRole("button", { name: /Firmar documento/ }).click();
  ok(await cli.getByText("Marca la casilla").isVisible(), "no firma sin aceptar");
  await cli.getByLabel(/Documento de identidad/).fill("1020304050");
  await cli.locator('input[type="checkbox"]').check();
  await cli.getByRole("button", { name: /Firmar documento/ }).click();
  await cli.getByText("Documentos firmados").waitFor({ timeout: 40000 });
  const firmada = await db.signRequest.findUnique({ where: { id: sol.id }, include: { documents: true } });
  ok(firmada.status === "FIRMADO" && firmada.signedDocNumber === "1020304050", "queda firmada con su cédula");
  const firmado = await PDFDocument.load(Buffer.from(firmada.documents[0].signedPdf.split(",")[1], "base64"));
  ok(firmado.getPageCount() === 3, "el PDF firmado lleva la hoja de constancia");
  fs.writeFileSync(path.join(FOTOS, "firmado.pdf"), Buffer.from(firmada.documents[0].signedPdf.split(",")[1], "base64"));

  const [descarga] = await Promise.all([cli.waitForEvent("download"), cli.getByRole("link", { name: /Descargar/ }).first().click()]);
  ok(/firmado/.test(descarga.suggestedFilename()), "el cliente descarga su copia", descarga.suggestedFilename());
  await cli.screenshot({ path: path.join(FOTOS, "firmas-cliente-listo.png"), fullPage: true });
  const otraVez = await cli.request.post(BASE + "/api/firmar/" + sol.token, {
    data: { name: "Otro", accept: true, signature: firmada.signature },
  });
  ok(otraVez.status() === 409, "el enlace no firma dos veces", String(otraVez.status()));

  console.log("\n4. El negocio recibe los firmados");
  await page.reload({ waitUntil: "networkidle" });
  ok(await page.getByText("Devolver los firmados").isVisible(), "ve la solicitud firmada");
  const r2 = await page.request.get(BASE + "/api/firmas/documentos/" + firmada.documents[0].id + "?firmado=1");
  ok(r2.status() === 200 && r2.headers()["content-type"] === "application/pdf", "descarga el PDF firmado");

  console.log("\n5. Otro empleado no la ve");
  const ctxRosa = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const rosa = await entrar(ctxRosa, "rosa-" + S + "@test.local");
  const r3 = await rosa.goto(BASE + "/panel/firmas/" + sol.id);
  ok(r3.status() === 404, "la solicitud de otro le responde 404", String(r3.status()));
  const r4 = await rosa.request.get(BASE + "/api/firmas/documentos/" + firmada.documents[0].id);
  ok(r4.status() === 404, "ni el PDF");
  await rosa.goto(BASE + "/panel/firmas", { waitUntil: "networkidle" });
  ok(rosa.url().endsWith("/panel/firmas"), "pero sí puede abrir Firmas para mandar las suyas", rosa.url());
} catch (e) {
  fallos++;
  console.log("  MAL  " + (e?.stack ?? e));
} finally {
  await browser.close();
  await db.user.delete({ where: { id: cuenta.id } }).catch(() => {});
  await db.$disconnect();
}

ok(errores.length === 0, "sin errores en el navegador ni en el servidor", errores.join(" | "));
console.log(fallos ? "\n" + fallos + " fallo(s)." : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
