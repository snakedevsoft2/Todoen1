import "server-only";
import sharp from "sharp";
import { editarImagen } from "@/lib/ai";

/** Grados que se gira desde la foto original. La foto de frente es el 0. */
export const ANGULOS = [90, 180, 270] as const;

const DESCRIPCION: Record<number, string> = {
  90: "gire 90 grados hacia la derecha, de modo que se vea su lado derecho",
  180: "gire 180 grados, de modo que se vea su parte de atrás",
  270: "gire 270 grados, de modo que se vea su lado izquierdo",
};

export function esAngulo(n: unknown): n is (typeof ANGULOS)[number] {
  return typeof n === "number" && (ANGULOS as readonly number[]).includes(n);
}

/**
 * Genera la vista de un producto girado, a partir de su foto (data URL).
 * Devuelve un data URL en JPEG achicado, listo para guardar.
 */
export async function generarVista(
  fotoDataUrl: string,
  angulo: number,
  nombre: string
): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> {
  const m = /^data:([^;]+);base64,(.+)$/.exec(fotoDataUrl);
  if (!m) return { ok: false, error: "La foto del producto no se puede leer." };

  const r = await editarImagen(
    "Esta es la foto de un producto (" +
      nombre +
      "). Genera una foto del MISMO producto exacto, con la misma forma, colores, empaque, textos y proporciones, " +
      "pero como si alguien lo " +
      DESCRIPCION[angulo] +
      ". Fondo blanco liso, misma luz y encuadre centrado que la foto original. " +
      "No agregues ni quites nada, ni texto nuevo, ni personas.",
    { mime: m[1], base64: m[2] }
  );
  if (!r.ok) return r;

  try {
    const jpg = await sharp(Buffer.from(r.base64, "base64"))
      .resize({ width: 720, height: 900, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 80 })
      .toBuffer();
    return { ok: true, dataUrl: "data:image/jpeg;base64," + jpg.toString("base64") };
  } catch {
    return { ok: false, error: "La imagen que devolvió la IA no se pudo procesar." };
  }
}
