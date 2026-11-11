/**
 * Comprueba en un navegador la factura electronica directa con el SRI de
 * Chopo Snacks (ver src/lib/facturacion/sri).
 *
 * El SRI se reemplaza por uno de mentira que levanta este script: recibe el
 * comprobante y lo autoriza. La firma .p12 se fabrica aqui mismo.
 *
 * Lo que se prueba:
 *   - En Ajustes, Chopo escoge "Directo con el SRI", sube su firma y la prueba.
 *   - Otro negocio de Ecuador no ve esa opcion (sigue con Datil).
 *   - Se vende con "Factura autorizada": sale autorizada con su numero
 *     001-001-000000001, baja el PDF (el RIDE) y el XML autorizado.
 *   - Al comprador le llega por correo con el PDF y el XML, y se puede
 *     reenviar a otro correo. El correo tambien es de mentira (puerto 2526).
 *
 * Antes:
 *   npm run db:up
 *   SRI_BASE_URL=http://localhost:3998/sri SMTP_USER=plataforma@test.local SMTP_PASS=x \
 *     SMTP_HOST=127.0.0.1 SMTP_PORT=2526 SMTP_SECURE=false npm run dev
 * Después: npm run verificar:sri
 */
import "dotenv/config";
import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import forge from "node-forge";

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
    await new Promise((r) => setTimeout(r, 400));
    v = await fn();
  }
  return v;
};

// ------------------------------------------------------------ la firma .p12
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const llave = forge.pki.privateKeyFromPem(privateKey.export({ type: "pkcs1", format: "pem" }).toString());
const cert = forge.pki.createCertificate();
cert.publicKey = forge.pki.setRsaPublicKey(llave.n, llave.e);
cert.serialNumber = "0a1b2c3d4e5f";
cert.validity.notBefore = new Date(Date.now() - 86_400_000);
cert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
cert.setSubject([{ shortName: "C", value: "EC" }, { shortName: "CN", value: "JULIANA INTRIAGO" }]);
cert.setIssuer([{ shortName: "C", value: "EC" }, { shortName: "CN", value: "ENTIDAD DE PRUEBA" }]);
cert.sign(llave, forge.md.sha256.create());
const CLAVE_FIRMA = "clave-firma-123";
const p12 = Buffer.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(llave, [cert], CLAVE_FIRMA, { algorithm: "3des" })).getBytes(), "binary");
const archivoFirma = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sri-")), "firma.p12");
fs.writeFileSync(archivoFirma, p12);

// ------------------------------------------------------------ SRI de mentira
const recibidos = new Map();
const sobre = (cuerpo) => '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>' + cuerpo + "</soap:Body></soap:Envelope>";
const falso = http.createServer((req, res) => {
  let crudo = "";
  req.on("data", (c) => (crudo += c));
  req.on("end", () => {
    const responder = (xml) => {
      res.writeHead(200, { "Content-Type": "text/xml; charset=utf-8" });
      res.end(sobre(xml));
    };
    const ruta = req.url ?? "";
    if (ruta.endsWith("/RecepcionComprobantesOffline")) {
      const xml = Buffer.from(/<xml>([^<]+)<\/xml>/.exec(crudo)[1], "base64").toString("utf8");
      const clave = /<claveAcceso>(\d{49})<\/claveAcceso>/.exec(xml)[1];
      recibidos.set(clave, xml);
      return responder("<RespuestaRecepcionComprobante><estado>RECIBIDA</estado><comprobantes></comprobantes></RespuestaRecepcionComprobante>");
    }
    if (ruta.endsWith("/AutorizacionComprobantesOffline")) {
      const clave = /<claveAccesoComprobante>(\d+)<\/claveAccesoComprobante>/.exec(crudo)[1];
      const xml = recibidos.get(clave);
      if (!xml) return responder("<RespuestaAutorizacionComprobante><numeroComprobantes>0</numeroComprobantes><autorizaciones></autorizaciones></RespuestaAutorizacionComprobante>");
      return responder(
        "<RespuestaAutorizacionComprobante><numeroComprobantes>1</numeroComprobantes><autorizaciones><autorizacion>" +
          "<estado>AUTORIZADO</estado><numeroAutorizacion>" + clave + "</numeroAutorizacion><fechaAutorizacion>2026-10-31T17:05:22-05:00</fechaAutorizacion>" +
          "<ambiente>PRUEBAS</ambiente><comprobante><![CDATA[" + xml + "]]></comprobante><mensajes></mensajes></autorizacion></autorizaciones></RespuestaAutorizacionComprobante>"
      );
    }
    res.writeHead(404);
    res.end();
  });
});
await new Promise((r) => falso.listen(3998, r));

// ---------------------------------------------------------- correo de mentira
const correos = [];
const smtp = net.createServer((sock) => {
  sock.write("220 prueba ESMTP\r\n");
  let buffer = "";
  let enDatos = false;
  let cuerpo = "";
  sock.on("data", (trozo) => {
    buffer += trozo.toString("utf8");
    let fin;
    while ((fin = buffer.indexOf("\r\n")) >= 0) {
      const linea = buffer.slice(0, fin);
      buffer = buffer.slice(fin + 2);
      if (enDatos) {
        if (linea === ".") {
          enDatos = false;
          correos.push(cuerpo);
          cuerpo = "";
          sock.write("250 recibido\r\n");
        } else cuerpo += linea + "\n";
        continue;
      }
      const orden = linea.toUpperCase();
      if (orden.startsWith("EHLO") || orden.startsWith("HELO")) sock.write("250-prueba\r\n250 AUTH PLAIN LOGIN\r\n");
      else if (orden.startsWith("AUTH PLAIN ")) sock.write("235 adentro\r\n");
      else if (orden === "DATA") {
        enDatos = true;
        sock.write("354 escribe\r\n");
      } else if (orden === "QUIT") {
        sock.write("221 chao\r\n");
        sock.end();
      } else sock.write("250 ok\r\n");
    }
  });
});
await new Promise((r) => smtp.listen(2526, "127.0.0.1", r));

// ----------------------------------------------------------------- las cuentas
const S = "sri-" + Date.now();
const CLAVE = bcrypt.hashSync("demo1234", 10);
const nuevaCuenta = (nombre, businessName) =>
  db.user.create({
    data: {
      email: nombre + "-" + S + "@test.local",
      passwordHash: CLAVE,
      ownerName: "Juliana Intriago",
      businessName,
      businessType: "OTRO",
      slug: nombre + "-" + S,
      currency: "USD",
      timezone: "America/Guayaquil",
      staff: { create: { name: "Juliana Intriago", role: "DUENO", onboardingDoneAt: new Date(), tourDoneAt: new Date() } },
      services: { create: [{ name: "Papa grande prueba", price: 115, category: "Snacks", bookable: false }] },
    },
  });
const chopo = await nuevaCuenta("chopo", "Chopo Snacks");
const otro = await nuevaCuenta("otro", "Tienda " + S);

const errores = [];
const browser = await chromium.launch({ channel: "msedge" });
const sinDesborde = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function entrar(cuenta) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errores.push("pageerror: " + e.message));
  page.on("response", (r) => r.status() >= 500 && errores.push(r.status() + " " + r.url()));
  // Sin esto el login muestra primero la bienvenida.
  await page.addInitScript(() => localStorage.setItem("todoen1_onboarding_seen", "true"));
  // Lo que se iba a imprimir por el dialogo, sin abrirlo.
  await page.addInitScript(() => {
    window.__impresiones = [];
    window.print = () => window.__impresiones.push(document.getElementById("ten-impresion")?.innerHTML ?? "");
  });
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', cuenta.email);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel/, { timeout: 25000 });
  return page;
}

try {
  console.log("\n1. Otro negocio de Ecuador: sigue con Dátil");
  {
    const page = await entrar(otro);
    await page.goto(BASE + "/panel/ajustes", { waitUntil: "networkidle" });
    const caja = page.locator("[data-facturacion]");
    await caja.locator('select[name="country"]').selectOption("EC");
    ok((await caja.locator('select[name="provider"]').count()) === 0, "no ve «Directo con el SRI»");
    ok((await caja.locator('input[name="apiKey"]').count()) === 1, "le pide la clave de Dátil, como siempre");
    await page.context().close();
  }

  console.log("\n2. Chopo sube su firma en Ajustes");
  const page = await entrar(chopo);
  await page.goto(BASE + "/panel/ajustes", { waitUntil: "networkidle" });
  const caja = page.locator("[data-facturacion]");
  await caja.locator('select[name="country"]').selectOption("EC");
  ok((await caja.locator('select[name="provider"]').count()) === 1, "ve cómo conectarse con el SRI");
  await caja.locator('select[name="provider"]').selectOption("sri");
  ok((await caja.locator('input[name="apiKey"]').count()) === 0, "directo no pide nada de Dátil");
  await caja.locator('input[name="enabled"]').check();
  await caja.locator('input[name="p12File"]').setInputFiles(archivoFirma);
  await caja.locator('input[name="p12Password"]').fill(CLAVE_FIRMA);
  await caja.locator('input[name="taxId"]').fill("1790012345001");
  await caja.locator('input[name="legalName"]').fill("CHOPO SNACKS S.A.");
  await caja.locator('input[name="tradeName"]').fill("Chopo Snacks");
  await caja.locator('input[name="fiscalAddress"]').fill("Av. Principal 123");
  await caja.locator('select[name="taxRegime"]').selectOption("RIMPE_EMPRENDEDOR");
  await caja.locator('input[name="artisanNumber"]').fill("247166");
  await caja.getByRole("button", { name: "Guardar", exact: true }).click();
  ok(Boolean(await esperarHasta(() => caja.getByText(/quedó activa/).count())), "se guarda y queda activa", (await caja.innerText()).slice(0, 300));
  const config = await db.billingConfig.findUnique({ where: { userId: chopo.id } });
  ok(config?.provider === "sri" && !String(config?.credentials).includes(p12.toString("base64").slice(50, 120)), "la firma queda guardada y cifrada");
  ok(Boolean(await esperarHasta(() => caja.locator("[data-firma-guardada]").count())), "dice de quién es la firma y cuándo vence");
  await caja.getByRole("button", { name: /Probar la firma y el SRI/ }).click();
  ok(Boolean(await esperarHasta(() => caja.getByText(/El SRI \(pruebas\) responde/).count())), "la prueba abre la firma y llega al SRI");
  ok(await sinDesborde(page), "en celular nada se sale en Ajustes");
  if (DIR) await page.screenshot({ path: DIR + "/sri-ajustes.png", fullPage: true });

  console.log("\n3. Vender con factura autorizada");
  await page.goto(BASE + "/panel/ventas", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Papa grande prueba/ }).click();
  await page.getByRole("button", { name: /Papa grande prueba/ }).click();
  await page.locator('select[name="comprobante"]').selectOption("autorizada");
  await page.getByRole("button", { name: /Guardar venta/ }).click();
  await page.getByRole("button", { name: "Confirmar venta" }).click();
  const comprador = page.locator("[data-comprador]");
  ok(Boolean(await esperarHasta(() => comprador.count())), "pide los datos del comprador");
  await comprador.getByRole("checkbox").first().uncheck();
  await comprador.getByLabel("Tipo de documento").selectOption("05");
  await comprador.getByLabel("Número de documento").fill("1712345678");
  await comprador.getByLabel("Nombre o razón social").fill("María Pérez");
  await comprador.getByLabel("Correo del comprador").fill("maria@test.local");
  await comprador.getByLabel("Dirección del comprador").fill("Restauración Alianza Sur");
  const [descarga] = await Promise.all([
    page.waitForEvent("download", { timeout: 40000 }).catch(() => null),
    comprador.getByRole("button", { name: "Emitir factura autorizada" }).click(),
  ]);
  ok(Boolean(descarga) && /001-001-000000001\.pdf$/.test(descarga?.suggestedFilename() ?? ""), "el PDF autorizado se descarga solo", descarga?.suggestedFilename());
  const ride = descarga ? fs.readFileSync(await descarga.path()).toString("latin1") : "";
  ok(ride.startsWith("%PDF") && ride.includes("Valor Total") && ride.includes("247166") && ride.includes("NUMERO DE AUTORIZACI"), "es el RIDE: con la autorización, la calificación artesanal y el valor total");
  const factura = await db.electronicInvoice.findFirst({ where: { userId: chopo.id } });
  ok(factura?.status === "AUTORIZADA" && factura?.provider === "sri" && factura?.number === "001-001-000000001", "queda autorizada por el SRI con su número", factura?.status + " " + factura?.message);
  const enviado = factura?.authCode ? recibidos.get(factura.authCode) : null;
  ok(Boolean(enviado?.includes("<ds:Signature") && enviado.includes("<importeTotal>2.30</importeTotal>")), "al SRI llegó firmada y con el total de la venta");
  const enlace = page.locator("[data-xml-autorizado]");
  ok(Boolean(await esperarHasta(() => enlace.count())), "aparece «XML autorizado»");
  const xml = await page.request.get(BASE + "/panel/ventas/xml/" + factura?.id);
  const cuerpo = await xml.text();
  ok(xml.status() === 200 && cuerpo.includes("<estado>AUTORIZADO</estado>") && cuerpo.includes(factura?.authCode ?? "-"), "el XML autorizado baja con su clave de acceso");
  if (DIR) await page.screenshot({ path: DIR + "/sri-venta.png", fullPage: true });

  console.log("\n3b. Imprimir: la tirilla sigue igual, la hoja es la factura electrónica");
  const tarjeta = page.locator('[data-factura-autorizada="AUTORIZADA"]').first();
  await tarjeta.getByRole("button", { name: "Elegir tamano de impresion" }).click();
  await page.locator("[data-menu-imprimir] button", { hasText: "Tirilla 58 mm" }).click();
  ok(Boolean(await esperarHasta(() => page.evaluate(() => window.__impresiones.length > 0))), "la tirilla de 58 mm se imprime");
  const tirilla = await page.evaluate(() => window.__impresiones.at(-1) ?? "");
  ok(/class="ti ti-58"/.test(tirilla) && /Clave de acceso/.test(tirilla) && !/Valor Total/.test(tirilla), "y es la tirilla de siempre, no el PDF");

  await tarjeta.getByRole("button", { name: "Elegir tamano de impresion" }).click();
  const [pedido] = await Promise.all([
    page.waitForRequest((q) => q.url().includes("/panel/ventas/ride/" + factura?.id), { timeout: 20000 }).catch(() => null),
    page.locator("[data-menu-imprimir] button", { hasText: "Hoja carta" }).click(),
  ]);
  ok(Boolean(pedido), "en hoja carta trae la factura electrónica (el RIDE)");
  ok(
    Boolean(await esperarHasta(() => page.evaluate(() => Boolean(document.querySelector('iframe[src^="blob:"]'))), 8000)) ||
      (await page.context().pages()).length > 1,
    "y la manda a imprimir como PDF"
  );
  ok((await page.evaluate(() => window.__impresiones.length)) === 1, "sin pasar por la hoja de antes");

  console.log("\n4. Le llega por correo al comprador");
  ok(Boolean(await esperarHasta(() => correos.length >= 1)), "sale un correo apenas se autoriza");
  const correo = correos[0] ?? "";
  ok(/^To: maria@test\.local/m.test(correo), "a maria@test.local");
  ok(/^From: Chopo Snacks <plataforma@test\.local>/m.test(correo), "con el nombre del negocio como remitente");
  ok(correo.includes("filename=factura-001-001-000000001.pdf") && correo.includes("filename=factura-001-001-000000001.xml"), "con el PDF y el XML adjuntos");
  await page.reload({ waitUntil: "networkidle" });
  ok(Boolean(await esperarHasta(() => page.locator("[data-correo-enviado]").filter({ hasText: "maria@test.local" }).count())), "la venta dice a qué correo se mandó");

  await page.locator("[data-enviar-correo]").first().click();
  await page.locator("[data-correo-factura] input").fill("contador@test.local");
  await page.locator("[data-correo-factura]").getByRole("button", { name: "Enviar" }).click();
  ok(Boolean(await esperarHasta(() => page.getByText("Factura enviada a contador@test.local.").count())), "se puede reenviar a otro correo");
  ok(correos.length === 2 && /^To: contador@test\.local/m.test(correos[1] ?? ""), "y le llega a ese otro");
  ok(await sinDesborde(page), "en celular nada se sale en la venta");
  if (DIR) await page.screenshot({ path: DIR + "/sri-correo.png", fullPage: true });

  // El XML y el PDF de una cuenta no se bajan desde otra.
  const ajena = await entrar(otro);
  const r = await ajena.request.get(BASE + "/panel/ventas/xml/" + factura?.id);
  ok(r.status() === 404, "otro negocio no puede bajar ese XML");
  const r2 = await ajena.request.get(BASE + "/panel/ventas/ride/" + factura?.id);
  ok(r2.status() === 404, "ni ese PDF");
} finally {
  await browser.close();
  falso.close();
  smtp.close();
  await db.user.deleteMany({ where: { slug: { contains: S } } }).catch((e) => console.log("No se borraron las cuentas: " + e.message));
  await db.$disconnect();
}

if (errores.length) console.log("\nErrores en el navegador:\n  " + errores.slice(0, 10).join("\n  "));
console.log(fallos === 0 && errores.length === 0 ? "\nTodo bien.\n" : "\n" + (fallos + errores.length) + " fallo(s).\n");
process.exit(fallos === 0 && errores.length === 0 ? 0 : 1);
