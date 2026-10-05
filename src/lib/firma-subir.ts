/**
 * Subir documentos a una solicitud de firma, desde el navegador.
 *
 * Uno por peticion: varios PDF juntos pasarian el tope de lo que el servidor
 * deja recibir. Las fotos se achican aqui y se mandan en JPG; el servidor las
 * vuelve una pagina de PDF.
 */

export const ACEPTA_FIRMA = "application/pdf,.pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";
const MAX_BYTES_PDF = 3 * 1024 * 1024;

function leer(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^;]*;/, "data:application/pdf;"));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(archivo);
  });
}

async function fotoAJpg(archivo: File): Promise<string> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const escala = Math.min(1, 2000 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * escala);
    c.height = Math.round(img.height * escala);
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("sin lienzo");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function enviar(requestId: string, cuerpo: Record<string, unknown>): Promise<string | null> {
  try {
    const r = await fetch("/api/firmas/" + requestId + "/documentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    if (r.ok) return null;
    return ((await r.json().catch(() => ({}))) as { error?: string }).error ?? "No se pudo subir.";
  } catch {
    return "Sin conexión. Intenta otra vez con señal.";
  }
}

/** Sube un archivo. Devuelve null si quedo, o el motivo si no. */
export async function subirArchivoFirma(requestId: string, archivo: File): Promise<string | null> {
  const esPdf = archivo.type === "application/pdf" || /\.pdf$/i.test(archivo.name);
  if (esPdf) {
    if (archivo.size > MAX_BYTES_PDF) return archivo.name + " pesa más de 3 MB.";
    const error = await enviar(requestId, { name: archivo.name, data: await leer(archivo) });
    return error ? archivo.name + ": " + error : null;
  }
  if (!archivo.type.startsWith("image/")) return archivo.name + ": sube un PDF o una foto.";
  let data: string;
  try {
    data = await fotoAJpg(archivo);
  } catch {
    return archivo.name + ": no se pudo leer la foto.";
  }
  const error = await enviar(requestId, { name: archivo.name, data });
  return error ? archivo.name + ": " + error : null;
}

/** Agrega un documento que ya estaba guardado en el Escaner. */
export async function agregarEscaneado(requestId: string, scanId: string, nombre: string): Promise<string | null> {
  const error = await enviar(requestId, { scanId });
  return error ? nombre + ": " + error : null;
}
