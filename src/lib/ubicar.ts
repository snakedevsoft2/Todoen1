/**
 * La ultima ubicacion que ya tiene esta pantalla.
 *
 * Mientras se comparte la ubicacion de la jornada, el GPS ya esta dando
 * lecturas: pedirle otra lectura nueva al mismo tiempo puede quedarse
 * esperando hasta vencer (pasa en celulares y en navegadores de escritorio).
 * Si hay una de hace menos de un minuto, se usa esa y el boton responde de una.
 */
let ultima: GeolocationPosition | null = null;
const VIGENCIA_MS = 60_000;

export function recordarPosicion(p: GeolocationPosition): void {
  ultima = p;
}

/**
 * Pide la ubicacion, pero no se queda colgado esperandola.
 *
 * Un GPS en un sotano puede tardar un minuto o no responder nunca. Si a los
 * ocho segundos no llego, se sigue sin coordenada: es mejor un marcaje o una
 * llegada sin ubicacion que una persona esperando con el telefono en la mano.
 */
export function ubicar(): Promise<GeolocationPosition | null> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return Promise.resolve(null);
  if (ultima && Date.now() - ultima.timestamp < VIGENCIA_MS) return Promise.resolve(ultima);
  return new Promise((resolve) => {
    let resuelto = false;
    const listo = (p: GeolocationPosition | null) => {
      if (!resuelto) {
        resuelto = true;
        if (p) ultima = p;
        resolve(p);
      }
    };
    navigator.geolocation.getCurrentPosition(
      (p) => listo(p),
      () => listo(null),
      // Una lectura de hace unos segundos sirve igual y llega mucho mas rapido.
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 }
    );
    setTimeout(() => listo(null), 8500);
  });
}
