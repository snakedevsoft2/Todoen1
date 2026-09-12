/**
 * Recibos en papel de tirilla, para la impresora termica del mostrador.
 *
 * La factura y el comprobante que ya existian son hojas A4: se ven bien en
 * pantalla y en la impresora de oficina, pero en una termica de 58mm salen
 * recortados o diminutos. Esto arma el mismo contenido en papel angosto.
 *
 * Se genera un PDF, no comandos ESC/POS, y es a proposito: desde el navegador
 * no se puede hablar directo con una impresora termica, ni por USB ni por
 * Bluetooth. Lo que si funciona en todas partes es mandarle un PDF del ancho
 * exacto al dialogo de impresion del sistema, que es quien tiene el driver.
 *
 * El alto se calcula segun el contenido: una tirilla no tiene paginas, sale el
 * papel que haga falta y se corta.
 */

export type AnchoTirilla = 58 | 80;

/** Los tamanos que puede elegir quien imprime. */
export type Formato = "58" | "80" | "a4";

export const FORMATOS: { value: Formato; label: string; hint: string }[] = [
  { value: "58", label: "Tirilla 58 mm", hint: "La impresora termica pequena, la mas comun." },
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
 * armarse igual para el comprobante de abono y para la factura de venta, sin
 * que cada uno repita como se dibuja.
 */
export type Linea =
  | { t: "titulo"; text: string }
  | { t: "centro"; text: string; fuerte?: boolean; tenue?: boolean }
  | { t: "sep" }
  | { t: "par"; label: string; value: string; fuerte?: boolean }
  | { t: "texto"; text: string; tenue?: boolean }
  | { t: "total"; label: string; value: string }
  | { t: "espacio" };

/** Margen lateral y alto de cada tipo de renglon, en milimetros. */
const MARGEN = 4;
const ALTO = {
  titulo: 6,
  centro: 4.2,
  sep: 3,
  par: 4.4,
  texto: 4,
  total: 8,
  espacio: 2.5,
};

function altoDe(l: Linea): number {
  return ALTO[l.t];
}

/**
 * Parte un texto largo en los renglones que quepan.
 *
 * Sin esto, el nombre de un producto largo se sale del papel y se pierde justo
 * la parte que dice que se vendio.
 */
function partir(doc: { splitTextToSize: (t: string, w: number) => string[] }, text: string, ancho: number): string[] {
  return doc.splitTextToSize(text, ancho);
}

export async function buildTirillaPdf(
  lineas: Linea[],
  ancho: AnchoTirilla,
  fileName: string
): Promise<File> {
  const { jsPDF } = await import("jspdf");

  const util = ancho - MARGEN * 2;

  // Primera pasada con un documento de mentira, solo para medir cuanto papel
  // hace falta: los textos largos ocupan mas de un renglon y hay que saberlo
  // antes de crear la hoja.
  const medidor = new jsPDF({ unit: "mm", format: [ancho, 1000] });
  medidor.setFontSize(9);
  let alto = MARGEN * 2;
  for (const l of lineas) {
    if (l.t === "texto" || l.t === "centro") {
      alto += partir(medidor, l.text, util).length * altoDe(l);
    } else if (l.t === "titulo") {
      medidor.setFontSize(12);
      alto += partir(medidor, l.text, util).length * altoDe(l);
      medidor.setFontSize(9);
    } else {
      alto += altoDe(l);
    }
  }
  // Un poco de papel de sobra al final, para que el corte no muerda el texto.
  alto += 8;

  const doc = new jsPDF({ unit: "mm", format: [ancho, alto] });
  const centro = ancho / 2;
  const derecha = ancho - MARGEN;
  let y = MARGEN + 4;

  for (const l of lineas) {
    switch (l.t) {
      case "titulo": {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        for (const linea of partir(doc, l.text, util)) {
          doc.text(linea, centro, y, { align: "center" });
          y += ALTO.titulo;
        }
        break;
      }
      case "centro": {
        doc.setFont("helvetica", l.fuerte ? "bold" : "normal");
        doc.setFontSize(l.fuerte ? 10 : 8.5);
        doc.setTextColor(l.tenue ? 110 : 0);
        for (const linea of partir(doc, l.text, util)) {
          doc.text(linea, centro, y, { align: "center" });
          y += ALTO.centro;
        }
        doc.setTextColor(0);
        break;
      }
      case "sep": {
        doc.setDrawColor(150);
        doc.setLineWidth(0.2);
        doc.line(MARGEN, y - 1.5, derecha, y - 1.5);
        y += ALTO.sep;
        break;
      }
      case "par": {
        doc.setFont("helvetica", l.fuerte ? "bold" : "normal");
        doc.setFontSize(9);
        doc.text(l.label, MARGEN, y);
        doc.text(l.value, derecha, y, { align: "right" });
        y += ALTO.par;
        break;
      }
      case "texto": {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(l.tenue ? 110 : 0);
        for (const linea of partir(doc, l.text, util)) {
          doc.text(linea, MARGEN, y);
          y += ALTO.texto;
        }
        doc.setTextColor(0);
        break;
      }
      case "total": {
        doc.setDrawColor(0);
        doc.setLineWidth(0.4);
        doc.line(MARGEN, y - 3.5, derecha, y - 3.5);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text(l.label, MARGEN, y + 1.5);
        doc.text(l.value, derecha, y + 1.5, { align: "right" });
        y += ALTO.total;
        break;
      }
      case "espacio":
        y += ALTO.espacio;
        break;
    }
  }

  const blob = doc.output("blob");
  return new File([blob], fileName, { type: "application/pdf" });
}
