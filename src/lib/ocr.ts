/**
 * El lector de texto del escaner (tesseract), servido desde la propia aplicacion.
 *
 * Por defecto tesseract baja su motor y el idioma de un CDN; sin senal no hay
 * CDN. Por eso scripts/copiar-ocr.mjs los copia a public/ al compilar, y el
 * trabajador de fondo los guarda en el telefono la primera vez que se abre el
 * escaner con senal.
 *
 * La carpeta lleva las versiones en el nombre: al actualizar tesseract o el
 * idioma cambia la ruta y el telefono no se queda con archivos viejos. Si no
 * coincide con lo instalado, el script de copia falla y lo dice.
 */
const CARPETA = "/ocr/5.1.1-spa-1.0.0";

export const OCR = {
  carpeta: CARPETA,
  worker: CARPETA + "/worker.min.js",
};

/** El modulo minimo con una instruccion SIMD: la misma prueba que usa tesseract para elegir motor. */
const PRUEBA_SIMD = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

/**
 * Los archivos que este equipo va a pedir al pasar a texto. Tesseract elige el
 * motor segun el procesador admita SIMD; se guarda solo ese, que pesa 4 MB.
 */
export function archivosOcrParaEsteEquipo(): string[] {
  let simd = false;
  try {
    simd = typeof WebAssembly === "object" && WebAssembly.validate(PRUEBA_SIMD);
  } catch {
    simd = false;
  }
  return [
    OCR.worker,
    CARPETA + (simd ? "/tesseract-core-simd-lstm.wasm.js" : "/tesseract-core-lstm.wasm.js"),
    CARPETA + "/spa.traineddata.gz",
  ];
}
