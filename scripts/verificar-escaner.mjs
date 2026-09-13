/**
 * Comprueba el escaner de documentos en un navegador.
 *
 * Lo que se prueba: subir paginas, girarlas, sacar el PDF con las paginas en
 * orden, guardarlo en la cuenta, pasar a texto una pagina con letras (esto
 * necesita internet para bajar el idioma la primera vez), que otro empleado no
 * abra lo ajeno y que en celular nada se salga.
 *
 * Antes:   npm run build && npm start
 * Despues: npm run verificar:escaner
 */
import "dotenv/config";
import fs from "node:fs";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import { PDFDocument } from "pdf-lib";
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

const S = "esc-" + Date.now();
const clave = bcrypt.hashSync("demo1234", 10);
const listo = { onboardingDoneAt: new Date(), tourDoneAt: new Date() };
const cuenta = await db.user.create({
  data: {
    email: "esc-" + S + "@test.local",
    passwordHash: clave,
    ownerName: "Admin Escaner",
    businessName: "Oficina " + S,
    businessType: "ASISTENCIA",
    slug: "oficina-" + S,
    staff: {
      create: [
        { name: "Admin Escaner", role: "DUENO", ...listo },
        { name: "Rosa Otra", role: "VENDEDOR", email: "rosa-" + S + "@test.local", passwordHash: clave, ...listo },
      ],
    },
  },
});

/** Mete paginas al selector de imagenes: una con letras grandes y otra horizontal. */
async function subirPaginas(page) {
  await page.evaluate(async () => {
    const hoja = (w, h, lineas) =>
      new Promise((resolve) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const x = c.getContext("2d");
        // Papel con luz amarilla, como una foto real.
        x.fillStyle = "#e8dcb8";
        x.fillRect(0, 0, w, h);
        x.fillStyle = "#222";
        x.font = "bold 90px Arial";
        lineas.forEach((t, i) => x.fillText(t, 80, 200 + i * 140));
        c.toBlob((b) => resolve(new File([b], "pagina.png", { type: "image/png" })), "image/png");
      });
    const dt = new DataTransfer();
    dt.items.add(await hoja(1200, 1600, ["FACTURA 2026", "TOTAL PAGADO"]));
    dt.items.add(await hoja(1600, 1000, ["ANEXO"]));
    const input = document.querySelector('input[name="escanear-imagenes"]');
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

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

  console.log("\n1. Subir y preparar las paginas");
  ok((await page.locator('a[href="/panel/escaner"]').count()) > 0, "Escáner está en el menú");
  await page.goto(BASE + "/panel/escaner", { waitUntil: "networkidle" });
  await page.fill('input[maxlength="120"]', "Factura de prueba");
  await subirPaginas(page);
  const listas = await esperarHasta(() => page.locator("[data-paginas] img").count().then((n) => n === 2));
  ok(Boolean(listas), "las dos páginas quedan procesadas en modo documento");
  await page.getByRole("button", { name: "Girar página 2" }).click();
  ok(Boolean(await esperarHasta(() => page.locator("[data-paginas] img").count().then((n) => n === 2))), "girar vuelve a procesar la página");
  if (DIR) await page.screenshot({ path: DIR + "/escaner-paginas.png" });

  console.log("\n2. El PDF");
  const [descarga] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    page.getByRole("button", { name: /Descargar PDF/ }).click(),
  ]);
  const bytes = fs.readFileSync(await descarga.path());
  const pdf = await PDFDocument.load(bytes);
  ok(pdf.getPageCount() === 2, "trae las dos páginas", String(pdf.getPageCount()));
  ok(descarga.suggestedFilename() === "factura-de-prueba.pdf", "con un nombre limpio", descarga.suggestedFilename());
  const [p1, p2] = pdf.getPages();
  ok(p1.getHeight() > p1.getWidth() && p2.getHeight() > p2.getWidth(), "la página girada quedó vertical");

  console.log("\n3. Pasar a texto");
  await page.getByRole("button", { name: "Pasar a texto" }).click();
  const leido = await esperarHasta(
    () => page.locator("[data-texto-escaneado]").inputValue().catch(() => ""),
    180000
  );
  ok(/FACTURA/i.test(leido ?? ""), "lee las letras de la página", JSON.stringify((leido ?? "").slice(0, 80)));

  console.log("\n4. Guardar en mis documentos");
  await page.getByRole("button", { name: /Guardar en mis documentos/ }).click();
  const doc = await esperarHasta(() => db.scanDocument.findFirst({ where: { userId: cuenta.id } }));
  ok(doc?.pages === 2 && doc?.title === "Factura de prueba", "se guarda con su nombre y sus páginas");
  ok(/FACTURA/i.test(doc?.text ?? ""), "y con el texto leído");
  await page.reload({ waitUntil: "networkidle" });
  ok((await page.locator("[data-documentos]").getByText("Factura de prueba").count()) === 1, "aparece en la lista");
  const abierto = await page.request.get(BASE + "/documento/" + doc.id);
  ok(abierto.status() === 200 && (await abierto.body()).subarray(0, 4).toString() === "%PDF", "se abre como PDF");

  console.log("\n5. Otro empleado no lo abre");
  const ctxRosa = await browser.newContext();
  const rosa = await entrar(ctxRosa, "rosa-" + S + "@test.local");
  const ajeno = await rosa.request.get(BASE + "/documento/" + doc.id);
  ok(ajeno.status() === 404, "responde que no existe", String(ajeno.status()));
  await rosa.goto(BASE + "/panel/escaner", { waitUntil: "networkidle" });
  ok(rosa.url().endsWith("/panel/escaner"), "pero sí tiene su propio escáner");
  ok((await rosa.getByText("Factura de prueba").count()) === 0, "sin ver los documentos del administrador");
  await ctxRosa.close();

  console.log("\n6. En celular");
  const cel = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const movil = await entrar(cel, cuenta.email);
  await movil.goto(BASE + "/panel/escaner", { waitUntil: "networkidle" });
  await subirPaginas(movil);
  await esperarHasta(() => movil.locator("[data-paginas] img").count().then((n) => n === 2));
  ok(await movil.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "nada desborda a lo ancho");
  if (DIR) await movil.screenshot({ path: DIR + "/escaner-celular.png", fullPage: true });
  await cel.close();

  console.log("\n7. Errores durante el recorrido");
  ok(errores.length === 0, "ninguna excepción ni error 500", errores.slice(0, 3).join(" | "));
  await ctx.close();
} finally {
  await browser.close();
  await db.user.delete({ where: { id: cuenta.id } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
