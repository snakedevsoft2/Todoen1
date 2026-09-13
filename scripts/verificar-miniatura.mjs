/**
 * Comprueba la miniatura que sale al compartir el enlace del portafolio.
 *
 * No hace falta navegador: WhatsApp tampoco usa uno. Lee el HTML como lo lee
 * WhatsApp, busca las etiquetas Open Graph y pide la imagen. Lo que se fija:
 *
 *   - que la direccion de la imagen sea ABSOLUTA, que es lo que WhatsApp
 *     necesita y lo que faltaba (no habia metadataBase);
 *   - que la imagen sea un PNG de 1200x630;
 *   - que una portada en WebP, que el generador no sabe leer, no rompa la
 *     miniatura;
 *   - que el enlace de un negocio inexistente responda una imagen y no un 500.
 *
 * Antes:  npm run build && npm start
 * Despues: npm run verificar:miniatura
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

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

// Un PNG de 1x1 valido: basta para que el generador lo pinte de fondo.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
// Un WebP de 1x1: el generador no lo lee, la miniatura tiene que salir igual.
const WEBP = "data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA";

const S = "og-" + Date.now();
const crear = (nombre, portada) =>
  db.user.create({
    data: {
      email: nombre + "-" + S + "@test.local",
      passwordHash: "x",
      ownerName: nombre,
      businessName: "Tienda " + nombre,
      businessType: "ROPA",
      slug: nombre + "-" + S,
      publicHeadline: "Ropa bonita para " + nombre,
      publicCover: portada,
      logo: PNG,
      brandColor: "#0f766e",
      staff: { create: { name: nombre, role: "DUENO" } },
    },
  });

const conPng = await crear("conpng", PNG);
const conWebp = await crear("conwebp", WEBP);

/** Ancho y alto de un PNG, leidos de su encabezado IHDR. */
function medidasPng(buf) {
  if (buf.length < 24 || buf.toString("ascii", 1, 4) !== "PNG") return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function meta(html, prop) {
  const re = new RegExp('<meta[^>]+(?:property|name)="' + prop.replace(":", "\\:") + '"[^>]+content="([^"]*)"', "i");
  return re.exec(html)?.[1]?.replace(/&amp;/g, "&") ?? null;
}

try {
  console.log("\n1. Las etiquetas que lee WhatsApp");
  const html = await (await fetch(BASE + "/catalogo/" + conPng.slug)).text();
  const img = meta(html, "og:image");
  ok(Boolean(img), "trae og:image");
  ok(/^https?:\/\//.test(img ?? ""), "con direccion absoluta, que es la que WhatsApp necesita", String(img));
  ok((img ?? "").includes("/catalogo/" + conPng.slug + "/opengraph-image"), "apuntando a la miniatura de ESE negocio");
  ok((meta(html, "og:title") ?? "").includes("Ropa bonita"), "con el titular del negocio");
  ok(Boolean(meta(html, "og:description")), "con descripcion");
  ok(meta(html, "twitter:card") === "summary_large_image", "tarjeta grande");
  ok(meta(html, "og:image:width") === "1200" && meta(html, "og:image:height") === "630", "y declara el tamano");

  console.log("\n2. La imagen");
  const r = await fetch(img);
  const buf = Buffer.from(await r.arrayBuffer());
  ok(r.status === 200, "responde", String(r.status));
  ok((r.headers.get("content-type") ?? "").includes("image/png"), "es PNG", r.headers.get("content-type"));
  const m = medidasPng(buf);
  ok(m?.w === 1200 && m?.h === 630, "de 1200x630", JSON.stringify(m));
  ok(buf.length < 5 * 1024 * 1024, "y no pesa de mas", Math.round(buf.length / 1024) + " KB");

  console.log("\n3. Una portada en WebP no rompe la miniatura");
  const rw = await fetch(BASE + "/catalogo/" + conWebp.slug + "/opengraph-image");
  const bw = Buffer.from(await rw.arrayBuffer());
  ok(rw.status === 200, "responde", String(rw.status));
  ok(medidasPng(bw)?.w === 1200, "y sale la tarjeta con el color del negocio");

  console.log("\n4. Un negocio que no existe");
  const rn = await fetch(BASE + "/catalogo/no-existe-" + S + "/opengraph-image");
  ok(rn.status === 200 && (rn.headers.get("content-type") ?? "").includes("image/png"), "responde una imagen y no un error", String(rn.status));
} finally {
  await db.user.deleteMany({ where: { id: { in: [conPng.id, conWebp.id] } } });
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
