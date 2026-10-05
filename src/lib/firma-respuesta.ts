import { NextResponse } from "next/server";

/** Entrega un PDF guardado como data URL, para verlo o para descargarlo. */
export function respuestaPdf(dataUrl: string, nombre: string, descargar: boolean): NextResponse {
  const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  const ascii = (nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\- ()]+/g, "_").trim() || "documento") + ".pdf";
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      // El nombre con tildes va aparte: la cabecera simple solo admite ASCII.
      "Content-Disposition":
        (descargar ? "attachment" : "inline") + '; filename="' + ascii + "\"; filename*=UTF-8''" + encodeURIComponent(nombre + ".pdf"),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
