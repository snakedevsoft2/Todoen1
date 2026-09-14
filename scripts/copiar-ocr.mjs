/**
 * Copia los archivos del lector de texto (tesseract) de node_modules a public/ocr.
 *
 * Asi el escaner pasa a texto sin depender de un CDN, y el trabajador de fondo
 * puede guardarlos en el telefono para usarlos sin senal. Corre al instalar y
 * al compilar; public/ocr no va al repositorio.
 *
 * La carpeta de destino lleva las versiones instaladas en el nombre y tiene que
 * ser la misma que usa src/lib/ocr.ts. Si no coincide, falla aqui y no en el
 * telefono de alguien.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(raiz, "package.json"));

function carpetaDe(paquete) {
  try {
    return path.dirname(require.resolve(paquete + "/package.json"));
  } catch {
    return path.join(raiz, "node_modules", paquete);
  }
}

const versionDe = (dir) => JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).version;

const tesseract = carpetaDe("tesseract.js");
const core = carpetaDe("tesseract.js-core");
const espanol = carpetaDe("@tesseract.js-data/spa");
const nombre = versionDe(tesseract) + "-spa-" + versionDe(espanol);

const lib = fs.readFileSync(path.join(raiz, "src/lib/ocr.ts"), "utf8");
if (!lib.includes('"/ocr/' + nombre + '"')) {
  console.error(
    "copiar-ocr: src/lib/ocr.ts no apunta a /ocr/" + nombre + ". Actualiza CARPETA con las versiones instaladas."
  );
  process.exit(1);
}

const archivos = [
  [path.join(tesseract, "dist", "worker.min.js"), "worker.min.js"],
  [path.join(core, "tesseract-core-lstm.wasm.js"), "tesseract-core-lstm.wasm.js"],
  [path.join(core, "tesseract-core-simd-lstm.wasm.js"), "tesseract-core-simd-lstm.wasm.js"],
  // "best_int" es el que usa tesseract con el motor LSTM (el que pide el escaner).
  [path.join(espanol, "4.0.0_best_int", "spa.traineddata.gz"), "spa.traineddata.gz"],
];

const base = path.join(raiz, "public", "ocr");
const destino = path.join(base, nombre);
fs.mkdirSync(destino, { recursive: true });

// Las versiones anteriores ya no las pide nadie.
for (const otra of fs.readdirSync(base)) {
  if (otra !== nombre) fs.rmSync(path.join(base, otra), { recursive: true, force: true });
}

for (const [origen, archivo] of archivos) {
  if (!fs.existsSync(origen)) {
    console.error("copiar-ocr: falta " + origen + ". Corre npm install.");
    process.exit(1);
  }
  const final = path.join(destino, archivo);
  if (fs.existsSync(final) && fs.statSync(final).size === fs.statSync(origen).size) continue;
  fs.copyFileSync(origen, final);
}

console.log("copiar-ocr: lector de texto listo en public/ocr/" + nombre);
