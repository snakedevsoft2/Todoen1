/**
 * Copia el trabajador de fondo de pdf.js de node_modules a public/pdfjs.
 *
 * Con el se dibujan las paginas del PDF en el telefono de quien va a firmar,
 * sin depender de un CDN. Va la version "legacy": la normal pide funciones que
 * un iPhone con iOS anterior al 17.4 no tiene. Corre al instalar y al
 * compilar; public/pdfjs no va al repositorio.
 *
 * La carpeta lleva la version en el nombre y tiene que ser la misma que usa
 * src/lib/pdf-visor.ts. Si no coincide, falla aqui y no en el telefono de
 * alguien.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(raiz, "package.json"));

const paquete = path.dirname(require.resolve("pdfjs-dist/package.json"));
const version = JSON.parse(fs.readFileSync(path.join(paquete, "package.json"), "utf8")).version;

const lib = fs.readFileSync(path.join(raiz, "src/lib/pdf-visor.ts"), "utf8");
if (!lib.includes('"/pdfjs/' + version + '/')) {
  console.error("copiar-pdfjs: src/lib/pdf-visor.ts no apunta a /pdfjs/" + version + ". Actualiza la ruta con la version instalada.");
  process.exit(1);
}

const base = path.join(raiz, "public", "pdfjs");
const destino = path.join(base, version);
fs.mkdirSync(destino, { recursive: true });
for (const otra of fs.readdirSync(base)) {
  if (otra !== version) fs.rmSync(path.join(base, otra), { recursive: true, force: true });
}

const origen = path.join(paquete, "legacy", "build", "pdf.worker.min.mjs");
if (!fs.existsSync(origen)) {
  console.error("copiar-pdfjs: falta " + origen + ". Corre npm install.");
  process.exit(1);
}
fs.copyFileSync(origen, path.join(destino, "pdf.worker.min.mjs"));
console.log("copiar-pdfjs: visor de PDF listo en public/pdfjs/" + version);
