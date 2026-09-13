/**
 * Distancias entre coordenadas.
 *
 * Archivo puro: lo usan igual el servidor, cuando guarda un marcaje, y el
 * navegador, cuando quiere avisarle a la persona que esta lejos del sitio
 * antes de que marque.
 */

const RADIO_TIERRA_M = 6371000;

/**
 * Metros en linea recta entre dos coordenadas.
 *
 * Formula del semiverseno. Para las distancias de las que se trata aqui —de
 * unos metros a unos pocos kilometros— sobra: el error es de centimetros, muy
 * por debajo de lo que se equivoca el GPS de un telefono.
 */
export function distanciaM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;

  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Como se le muestra una distancia a una persona. */
export function prettyDistancia(metros: number | null | undefined): string {
  if (metros === null || metros === undefined) return "sin ubicacion";
  if (metros < 1000) return Math.round(metros) + " m";
  return (metros / 1000).toFixed(1).replace(".", ",") + " km";
}

/**
 * Si el marcaje cuenta como hecho en el sitio.
 *
 * Se le suma la imprecision del GPS al radio antes de juzgar: si el telefono
 * dice "estoy aqui, con 80 metros de margen" y el sitio tiene 100 de radio,
 * alguien a 150 metros puede estar perfectamente dentro. Castigar por la
 * imprecision del aparato seria castigar a la persona equivocada.
 */
export function enElSitio(
  distanceM: number | null | undefined,
  radiusM: number,
  accuracyM: number | null | undefined
): boolean | null {
  if (distanceM === null || distanceM === undefined) return null;
  const margen = Math.min(accuracyM ?? 0, 200);
  return distanceM <= radiusM + margen;
}

/** Enlace para abrir la coordenada en el mapa del telefono. */
export function enlaceMapa(lat: number, lng: number): string {
  return "https://www.google.com/maps?q=" + lat + "," + lng;
}
