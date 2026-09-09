import {
  BarcodeFormat,
  EncodeHintType,
  QRCodeWriter,
  QRCodeDecoderErrorCorrectionLevel,
} from "@zxing/library";

/**
 * Codigo QR como SVG.
 *
 * Se arma en el servidor y sale como vector, asi que se puede imprimir del
 * tamano que sea sin que se pixele: pegado en la vitrina, en una tarjeta o en
 * el mostrador. Usamos la libreria que ya estaba para leer codigos de barras,
 * asi que no agrega peso al proyecto.
 */
export function qrSvg(texto: string, opciones: { size?: number; dark?: string } = {}): string {
  const size = opciones.size ?? 320;
  const dark = opciones.dark ?? "#111827";

  const hints = new Map<EncodeHintType, unknown>();
  hints.set(EncodeHintType.MARGIN, 1);
  // Correccion media: aguanta que el papel se ensucie o se doble un poco.
  hints.set(EncodeHintType.ERROR_CORRECTION, QRCodeDecoderErrorCorrectionLevel.M);

  // Pedimos 0x0 a proposito: asi devuelve la matriz en modulos (unos 35x35) y
  // no una imagen ya escalada. Un rectangulo por modulo son ~600 formas; uno
  // por pixel serian cientos de miles y el archivo pesaria megas.
  const matriz = new QRCodeWriter().encode(texto, BarcodeFormat.QR_CODE, 0, 0, hints);
  const ancho = matriz.getWidth();
  const alto = matriz.getHeight();

  // Un rectangulo por cada modulo negro. Los juntamos en un solo path para que
  // el SVG no pese de mas.
  const partes: string[] = [];
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      if (matriz.get(x, y)) partes.push("M" + x + " " + y + "h1v1h-1z");
    }
  }

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + ancho + " " + alto + '"',
    ' width="' + size + '" height="' + size + '" shape-rendering="crispEdges">',
    '<rect width="100%" height="100%" fill="#ffffff"/>',
    '<path fill="' + dark + '" d="' + partes.join("") + '"/>',
    "</svg>",
  ].join("");
}
