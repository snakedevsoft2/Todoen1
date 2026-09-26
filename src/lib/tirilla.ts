/**
 * Recibos para imprimir: en papel de tirilla (la termica del mostrador) o en
 * hoja normal.
 *
 * El contenido se describe una sola vez como una lista de renglones, y de ahi
 * salen las dos formas de imprimir:
 *
 * - HTML para el dialogo de impresion del sistema (tirillaHtml). No usa
 *   internet ni librerias que haya que bajar, asi que funciona sin senal, y
 *   sirve con cualquier impresora que el equipo tenga instalada: la de
 *   oficina, la termica con su driver, la de Wi-Fi o AirPrint en el iPhone.
 * - Comandos ESC/POS para mandarle directo a una termica sin driver, por
 *   Bluetooth o por cable (ver escpos.ts e impresora-directa.ts).
 *
 * El alto de la tirilla sale del contenido: una tirilla no tiene paginas, sale
 * el papel que haga falta y se corta.
 */

export type AnchoTirilla = 58 | 80;

/** Los tamanos que puede elegir quien imprime. */
export type Formato = "58" | "80" | "a4";

export const FORMATOS: { value: Formato; label: string; hint: string }[] = [
  { value: "58", label: "Tirilla 58 mm", hint: "La impresora térmica pequeña, la más común." },
  { value: "80", label: "Tirilla 80 mm", hint: "Termica ancha, la de los puntos de venta grandes." },
  { value: "a4", label: "Hoja carta / A4", hint: "La impresora normal de oficina." },
];

export function esFormato(v: unknown): v is Formato {
  return v === "58" || v === "80" || v === "a4";
}

/**
 * Un renglon de la tirilla.
 *
 * Es una lista y no HTML a proposito: el mismo contenido tiene que poder
 * armarse igual para el comprobante de abono y para la factura de venta, y
 * salir igual por el dialogo del sistema y directo a la termica.
 */
export type Linea =
  | { t: "titulo"; text: string }
  | { t: "centro"; text: string; fuerte?: boolean; tenue?: boolean }
  | { t: "sep" }
  | { t: "par"; label: string; value: string; fuerte?: boolean }
  | { t: "texto"; text: string; tenue?: boolean }
  | { t: "total"; label: string; value: string }
  | { t: "espacio" };

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function clases(base: string, l: { fuerte?: boolean; tenue?: boolean }): string {
  return base + (l.fuerte ? " ti-fuerte" : "") + (l.tenue ? " ti-tenue" : "");
}

/**
 * El recibo en HTML, del ancho del papel.
 *
 * El logo va arriba de todo, centrado, tambien en la tirilla de 58 y 80mm:
 * es del mismo tamano en los tres formatos, y en la tirilla angosta ocupa
 * buena parte del ancho, como en un recibo de tienda de verdad. Si el logo
 * no carga (sin senal y sin haberlo visto antes), se quita antes de imprimir
 * y el recibo sale igual.
 */
export function tirillaHtml(lineas: Linea[], formato: Formato, logoUrl?: string | null): string {
  const filas = lineas
    .map((l) => {
      switch (l.t) {
        case "titulo":
          return '<p class="ti-titulo">' + esc(l.text) + "</p>";
        case "centro":
          return '<p class="' + clases("ti-centro", l) + '">' + esc(l.text) + "</p>";
        case "sep":
          return '<hr class="ti-sep">';
        case "par":
          return (
            '<p class="' + clases("ti-par", l) + '"><span>' + esc(l.label) + "</span><span>" + esc(l.value) + "</span></p>"
          );
        case "texto":
          return '<p class="' + clases("ti-texto", l) + '">' + esc(l.text) + "</p>";
        case "total":
          return '<p class="ti-total"><span>' + esc(l.label) + "</span><span>" + esc(l.value) + "</span></p>";
        case "espacio":
          return '<p class="ti-espacio"></p>';
      }
    })
    .join("");
  const logo = logoUrl ? '<img class="ti-logo" alt="" src="' + esc(logoUrl) + '">' : "";
  return '<div class="ti ti-' + formato + '">' + logo + filas + "</div>";
}

/**
 * Estilos del recibo impreso.
 *
 * Mientras no se imprime, el recibo queda fuera de la pantalla (se necesita
 * pintado para medir cuanto papel ocupa). Al imprimir se esconde todo lo demas
 * de la pagina. Se imprime desde la misma pagina y no desde un marco aparte
 * porque el celular (Chrome en Android, Safari en iPhone) imprime la pagina
 * entera e ignora el marco.
 *
 * Negro puro: la termica no tiene grises, y un gris claro sale punteado o no
 * sale.
 */
export const TIRILLA_CSS = `
#ten-impresion{position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none}
@media print{
  html,body{background:#fff!important;margin:0!important;padding:0!important;min-height:0!important;height:auto!important}
  body>*:not(#ten-impresion){display:none!important}
  #ten-impresion{position:static;left:auto;visibility:visible}
}
#ten-impresion .ti{box-sizing:border-box;color:#000;background:#fff;font-family:Arial,Helvetica,sans-serif;line-height:1.15;-webkit-print-color-adjust:exact;print-color-adjust:exact}
#ten-impresion .ti *{box-sizing:border-box;margin:0;padding:0}
#ten-impresion .ti-58{width:58mm;padding:1.5mm 3mm 3mm;font-size:8.5pt}
#ten-impresion .ti-80{width:80mm;padding:1.5mm 4mm 3mm;font-size:10pt}
#ten-impresion .ti-a4{width:100%;max-width:150mm;margin:0 auto;font-size:11pt}
#ten-impresion .ti p{overflow-wrap:anywhere}
/* En tirilla (58/80mm) el logo va mas chico: en un recibo de pocos renglones,
   un logo grande es la mitad del papel que se gasta. En hoja normal si vale
   la pena de tamano completo, porque ahi el papel no se corta por largo. */
#ten-impresion .ti-logo{display:block;max-height:22mm;max-width:40mm;margin:0 auto 3mm}
#ten-impresion .ti-58 .ti-logo,#ten-impresion .ti-80 .ti-logo{max-height:12mm;max-width:28mm;margin:0 auto 1.5mm}
#ten-impresion .ti-titulo{text-align:center;font-weight:700;font-size:1.45em;margin-bottom:.5mm}
#ten-impresion .ti-centro{text-align:center}
#ten-impresion .ti-fuerte{font-weight:700}
#ten-impresion .ti-tenue{color:#222}
#ten-impresion .ti-sep{border:0;border-top:1px dashed #000;margin:1mm 0}
#ten-impresion .ti-par,#ten-impresion .ti-total{display:flex;justify-content:space-between;gap:2mm}
#ten-impresion .ti-par span:first-child,#ten-impresion .ti-total span:first-child{flex:1 1 auto}
#ten-impresion .ti-par span:last-child,#ten-impresion .ti-total span:last-child{flex:0 1 auto;text-align:right}
#ten-impresion .ti-total{font-weight:700;font-size:1.3em;border-top:1.5px solid #000;margin-top:1mm;padding-top:.5mm}
#ten-impresion .ti-espacio{height:1mm}
`;
