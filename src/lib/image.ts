/**
 * Achica una foto en el navegador antes de mandarla al servidor.
 *
 * Las fotos de las prendas se guardan como data URL en la base de datos, igual
 * que el logo. Si subieramos la foto original de un celular pesaria varios
 * megas, asi que la reducimos aqui y probamos calidades hasta que quepa.
 */
export type ResizeOptions = {
  /** Lado mas largo de la foto guardada, en pixeles. */
  maxSide?: number;
  /** Peso maximo del data URL resultante, en bytes. */
  maxBytes?: number;
};

export async function fileToDataUrl(
  file: File,
  { maxSide = 900, maxBytes = 380 * 1024 }: ResizeOptions = {}
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Ese archivo no es una imagen.");
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen.");

  // Fondo blanco: las fotos con transparencia no quedan negras al pasar a JPG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  for (const quality of [0.85, 0.75, 0.6, 0.45, 0.3]) {
    const webp = canvas.toDataURL("image/webp", quality);
    const jpeg = canvas.toDataURL("image/jpeg", quality);
    const best = webp.length < jpeg.length && webp.startsWith("data:image/webp") ? webp : jpeg;
    if (best.length <= maxBytes) return best;
  }

  throw new Error("La foto pesa demasiado. Prueba con una mas pequena.");
}
